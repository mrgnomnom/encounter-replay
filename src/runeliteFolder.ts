import type { CacheSource } from "./cache/store/store";

/**
 * The player's RuneLite folder (.runelite), connected once with the browser's folder picker: recordings
 * come from the recorder's sessions folder and models from the game cache beside them, so nothing is
 * uploaded or downloaded. The browser remembers the folder; it may ask again for permission to read it.
 */

const CACHE_PATH = ["jagexcache", "oldschool", "LIVE"];
const SESSIONS_PATH = ["plugin-data", "encounter-recorder", "sessions"];
const DB = "encounter-replay";
const STORE = "handles";
const KEY = "runelite";

export interface RuneliteFolder {
  root: FileSystemDirectoryHandle;
  cache: FileSystemDirectoryHandle;
  sessions: FileSystemDirectoryHandle | undefined;
}

export const folderPickerSupported = (): boolean => "showDirectoryPicker" in window;

/** Asks for the folder; the player may pick .runelite itself or any folder above or inside it */
export async function pickRuneliteFolder(): Promise<RuneliteFolder> {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  const root = await picker({ id: "runelite-folder", mode: "read" });
  const folder = await resolveFolder(root);
  if (!folder) throw new Error(`"${root.name}" isn't a RuneLite folder: pick the .runelite folder in your user folder`);
  await remember(root);
  return folder;
}

/** The folder connected before, if the browser still lets this page read it without asking */
export async function rememberedFolder(): Promise<{ folder?: RuneliteFolder; needsPermission?: FileSystemDirectoryHandle }> {
  const root = await recall();
  if (!root) return {};
  const state = await (root as unknown as { queryPermission: (o: object) => Promise<PermissionState> }).queryPermission({ mode: "read" });
  if (state !== "granted") return { needsPermission: root };
  const folder = await resolveFolder(root);
  return folder ? { folder } : {};
}

/** Asks again for permission to read a remembered folder: needs a click */
export async function reconnect(root: FileSystemDirectoryHandle): Promise<RuneliteFolder | undefined> {
  const state = await (root as unknown as { requestPermission: (o: object) => Promise<PermissionState> }).requestPermission({ mode: "read" });
  return state === "granted" ? resolveFolder(root) : undefined;
}

export async function forgetFolder(): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, "readwrite").objectStore(STORE).delete(KEY));
}

async function resolveFolder(root: FileSystemDirectoryHandle): Promise<RuneliteFolder | undefined> {
  // .runelite itself, the user folder above it, or the cache folder inside it
  for (const prefix of [[], [".runelite"]]) {
    const cache = await walk(root, [...prefix, ...CACHE_PATH]);
    if (cache) return { root, cache, sessions: await walk(root, [...prefix, ...SESSIONS_PATH]) };
  }
  if (await hasFile(root, "main_file_cache.dat2")) return { root, cache: root, sessions: undefined };
  return undefined;
}

async function walk(dir: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemDirectoryHandle | undefined> {
  let d = dir;
  for (const name of path) {
    try {
      d = await d.getDirectoryHandle(name);
    } catch {
      return undefined;
    }
  }
  return d;
}

async function hasFile(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** Recordings in the sessions folder, newest first */
export async function listSessions(folder: RuneliteFolder): Promise<{ name: string; size: number; modified: number }[]> {
  if (!folder.sessions) return [];
  const out: { name: string; size: number; modified: number }[] = [];
  for await (const entry of (folder.sessions as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind !== "file" || !entry.name.endsWith(".jsonl")) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    out.push({ name: entry.name, size: file.size, modified: file.lastModified });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

export async function readSession(folder: RuneliteFolder, name: string): Promise<string> {
  if (!folder.sessions) throw new Error("No recordings folder");
  return (await (await folder.sessions.getFileHandle(name)).getFile()).text();
}

/**
 * The game cache as a CacheSource. RuneLite may update the cache while it runs, which makes a file the
 * browser opened earlier unreadable: it's opened again then
 */
export function cacheSource(cache: FileSystemDirectoryHandle): CacheSource {
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
    try {
      return new Uint8Array(await (await file(name)).slice(offset, offset + length).arrayBuffer());
    } catch {
      return new Uint8Array(await (await file(name, true)).slice(offset, offset + length).arrayBuffer());
    }
  };
  return {
    read: slice,
    async readAll(name) {
      try {
        return new Uint8Array(await (await file(name, true)).arrayBuffer());
      } catch {
        return undefined;
      }
    },
  };
}

async function remember(root: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(root, KEY));
}

async function recall(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const db = await openDb();
    return (await request(db.transaction(STORE).objectStore(STORE).get(KEY))) as FileSystemDirectoryHandle | undefined;
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
