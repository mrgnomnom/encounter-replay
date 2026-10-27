import type { CacheSource } from "./cache/store/store";

/**
 * The two folders the page reads, each connected once with the browser's folder picker, read-only:
 * the recorder's sessions folder (your recordings) and the game cache (Jagex's game files, the same for
 * every player). Never .runelite itself, which also holds your logins. The browser remembers both; it
 * may ask again for permission to read them. Every file read is noted, for the page to show.
 */

export type FolderKind = "sessions" | "cache";

export interface Folders {
  sessions?: FileSystemDirectoryHandle;
  cache?: FileSystemDirectoryHandle;
}

const DB = "encounter-replay";
const STORE = "handles";

/** Where each folder is, for pasting into the picker's address bar */
export const FOLDER_PATHS: Record<FolderKind, { windows: string; other: string }> = {
  sessions: {
    windows: "%USERPROFILE%\\.runelite\\plugin-data\\encounter-recorder\\sessions",
    other: "~/.runelite/plugin-data/encounter-recorder/sessions",
  },
  cache: {
    windows: "%USERPROFILE%\\.runelite\\jagexcache\\oldschool\\LIVE",
    other: "~/.runelite/jagexcache/oldschool/LIVE",
  },
};

export const folderPickerSupported = (): boolean => "showDirectoryPicker" in window;

/** Files the page has read this visit, by name, with how many bytes */
export const filesRead = new Map<string, number>();
const listeners = new Set<() => void>();
export function noteRead(name: string, bytes: number): void {
  filesRead.set(name, (filesRead.get(name) ?? 0) + bytes);
  for (const l of listeners) l();
}
export function onRead(listener: () => void): void {
  listeners.add(listener);
}

/** Asks for one of the folders, and turns away any other folder, .runelite above all */
export async function pickFolder(kind: FolderKind): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  const dir = await picker({ id: `runelite-${kind}`, mode: "read" });
  const problem = await checkFolder(kind, dir);
  if (problem) throw new Error(problem);
  await store(kind, dir);
  return dir;
}

async function checkFolder(kind: FolderKind, dir: FileSystemDirectoryHandle): Promise<string | undefined> {
  const where = FOLDER_PATHS[kind].windows.replace("%USERPROFILE%\\", "");
  if (await hasEntry(dir, "credentials.properties") || await hasEntry(dir, "profiles2") || dir.name === ".runelite") {
    return `That's your whole .runelite folder, which also holds your logins: this page doesn't want it. Pick ${where} inside it instead.`;
  }
  if (kind === "cache" && !(await hasEntry(dir, "main_file_cache.dat2"))) {
    return `"${dir.name}" isn't the game cache: pick ${where}.`;
  }
  if (kind === "sessions" && dir.name !== "sessions") {
    return `"${dir.name}" isn't Encounter Recorder's recordings folder: pick ${where}.`;
  }
  return undefined;
}

async function hasEntry(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  for (const get of [() => dir.getFileHandle(name), () => dir.getDirectoryHandle(name)]) {
    try {
      await get();
      return true;
    } catch {
      // Not that kind of entry, or not there
    }
  }
  return false;
}

/** The folders connected before: those readable now, and those the browser wants to ask about again */
export async function rememberedFolders(): Promise<{ ready: Folders; needPermission: Folders }> {
  const ready: Folders = {};
  const needPermission: Folders = {};
  for (const kind of ["sessions", "cache"] as const) {
    const dir = await recall(kind);
    if (!dir) continue;
    const state = await (dir as unknown as { queryPermission: (o: object) => Promise<PermissionState> }).queryPermission({ mode: "read" });
    (state === "granted" ? ready : needPermission)[kind] = dir;
  }
  return { ready, needPermission };
}

/** Asks again for permission to read a remembered folder: needs a click */
export async function reconnect(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const state = await (dir as unknown as { requestPermission: (o: object) => Promise<PermissionState> }).requestPermission({ mode: "read" });
  return state === "granted";
}

/** Forgets both folders: the browser no longer lets the page read them */
export async function forgetFolders(): Promise<void> {
  const db = await openDb();
  for (const kind of ["sessions", "cache"]) await request(db.transaction(STORE, "readwrite").objectStore(STORE).delete(kind));
}

/** Recordings in the sessions folder, newest first */
export async function listSessions(sessions: FileSystemDirectoryHandle): Promise<{ name: string; size: number; modified: number }[]> {
  const out: { name: string; size: number; modified: number }[] = [];
  for await (const entry of (sessions as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind !== "file" || !entry.name.endsWith(".jsonl")) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    out.push({ name: entry.name, size: file.size, modified: file.lastModified });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

export async function readSession(sessions: FileSystemDirectoryHandle, name: string): Promise<string> {
  const text = await (await (await sessions.getFileHandle(name)).getFile()).text();
  noteRead(name, text.length);
  return text;
}

/**
 * The game cache as a CacheSource, reporting each read. RuneLite may update the cache while it runs,
 * which makes a file the browser opened earlier unreadable: it's opened again then
 */
export function cacheSource(cache: FileSystemDirectoryHandle, onRead: (name: string, bytes: number) => void): CacheSource {
  const files = new Map<string, File>();
  const file = async (name: string, fresh = false) => {
    let f = fresh ? undefined : files.get(name);
    if (!f) {
      f = await (await cache.getFileHandle(name)).getFile();
      files.set(name, f);
    }
    return f;
  };
  const slice = async (name: string, offset: number, length: number) => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await (await file(name)).slice(offset, offset + length).arrayBuffer());
    } catch {
      bytes = new Uint8Array(await (await file(name, true)).slice(offset, offset + length).arrayBuffer());
    }
    onRead(name, bytes.length);
    return bytes;
  };
  return {
    read: slice,
    async readAll(name) {
      try {
        const bytes = new Uint8Array(await (await file(name, true)).arrayBuffer());
        onRead(name, bytes.length);
        return bytes;
      } catch {
        return undefined;
      }
    },
  };
}

async function store(kind: FolderKind, dir: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(dir, kind));
}

async function recall(kind: FolderKind): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const db = await openDb();
    return (await request(db.transaction(STORE).objectStore(STORE).get(kind))) as FileSystemDirectoryHandle | undefined;
  } catch {
    return undefined;
  }
}

function openDb(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  return request(open);
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
