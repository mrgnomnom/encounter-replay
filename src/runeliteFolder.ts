import type { CacheSource } from "./cache/store/store";
import { recordingText, RECORDING_NAME, ticksFromHeader } from "./packed";
import { sortRecordings, TAIL_BYTES, ticksFromTail, type RecordingFile } from "./recordingList";

/**
 * What the page reads, each connected once, read-only: the recorder's sessions folder (your recordings),
 * with the browser's folder picker, and the game cache (Jagex's game files, the same for every player),
 * as its own files only. The cache's folder also holds the client's preferences, which can include a
 * remembered username, so the page asks for the main_file_cache files with a file picker that shows
 * nothing else, rather than the folder. Never .runelite itself, which also holds your logins. The browser
 * remembers both; it may ask again for permission to read them. Every file read is noted, for the page
 * to show.
 */

export type FolderKind = "sessions" | "cache";

export interface Folders {
  sessions?: FileSystemDirectoryHandle;
  /** The game cache's own files, main_file_cache.dat2 and its .idx files, and nothing else */
  cache?: FileSystemFileHandle[];
}

/** The game cache's own files; the folder's other files, like the client's preferences, never are */
const CACHE_FILE = /^main_file_cache\.(dat2|idx\d+)$/;
// Extensions for the file picker's filter, which then lists no other file and offers no "All files"
const CACHE_EXTENSIONS = [".dat2", ".idx255", ...Array.from({ length: 64 }, (_, i) => `.idx${i}`)];

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

export const folderPickerSupported = (): boolean => "showDirectoryPicker" in window && "showOpenFilePicker" in window;

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

/** Asks for the recordings folder, and turns away any other folder, .runelite above all */
export async function pickSessionsFolder(startIn?: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  const options = { id: "runelite-sessions", mode: "read" };
  // Choosing it again: the dialog opens in the folder itself, so it's just Select Folder
  const dir = await picker(startIn ? { ...options, startIn } : options).catch((e: unknown) => {
    if (!startIn || (e instanceof DOMException && e.name === "AbortError")) throw e;
    return picker(options);
  });
  const where = FOLDER_PATHS.sessions.windows.replace("%USERPROFILE%\\", "");
  if (await hasEntry(dir, "credentials.properties") || await hasEntry(dir, "profiles2") || dir.name === ".runelite") {
    throw new Error(`That's your whole .runelite folder, which also holds your logins: this page doesn't want it. Pick ${where} inside it instead.`);
  }
  if (dir.name !== "sessions") throw new Error(`"${dir.name}" isn't Encounter Recorder's recordings folder: pick ${where}.`);
  await store("sessions", dir);
  return dir;
}

/**
 * Asks for the game cache's files: the picker lists only main_file_cache files, and any other file is
 * dropped. All of them are needed: the data file, and every index the master index (idx255) lists
 */
export async function pickCacheFiles(startIn?: FileSystemFileHandle): Promise<FileSystemFileHandle[]> {
  const picker = (window as unknown as { showOpenFilePicker: (o: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
  const options = {
    id: "runelite-cache",
    multiple: true,
    excludeAcceptAllOption: true,
    types: [{ description: "Game cache files (main_file_cache)", accept: { "application/octet-stream": CACHE_EXTENSIONS } }],
  };
  // Choosing them again: the dialog opens in the folder of a file chosen before, so it's just select all and Open
  const chosen = await picker(startIn ? { ...options, startIn } : options).catch((e: unknown) => {
    if (!startIn || (e instanceof DOMException && e.name === "AbortError")) throw e;
    // A browser that won't start there: wherever it last was instead
    return picker(options);
  });
  const files = chosen.filter((f) => CACHE_FILE.test(f.name));
  const names = new Set(files.map((f) => f.name));
  if (!names.has("main_file_cache.dat2") || !names.has("main_file_cache.idx255")) {
    throw new Error(files.length
      ? "That's not all of the game cache: select every file in the folder (Ctrl+A, or Cmd+A on a Mac), then click Open."
      : "Those aren't the game cache's files: open the location above, select every file (Ctrl+A), then click Open.");
  }
  // The master index has 6 bytes for each index
  const meta = files.find((f) => f.name === "main_file_cache.idx255")!;
  const indexes = Math.floor((await meta.getFile()).size / 6);
  const missing = Array.from({ length: indexes }, (_, i) => `main_file_cache.idx${i}`).filter((n) => !names.has(n));
  if (missing.length) {
    throw new Error(`Some of the game cache is missing (${missing.length} file${missing.length === 1 ? "" : "s"}, like ${missing[0]}): select every file in the folder (Ctrl+A), then click Open.`);
  }
  await store("cache", files);
  return files;
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

type Permissioned = { queryPermission(o: object): Promise<PermissionState>; requestPermission(o: object): Promise<PermissionState> };
const permission = (h: FileSystemHandle) => (h as unknown as Permissioned).queryPermission({ mode: "read" });

/**
 * What was connected before: readable now, or wanting the browser to ask again. upgraded is set when the
 * cache was connected as a whole folder, as the page once asked: that access is dropped, to be replaced
 * by the cache's own files
 */
export async function rememberedFolders(): Promise<{ ready: Folders; needPermission: Folders; upgraded: boolean }> {
  const ready: Folders = {};
  const needPermission: Folders = {};
  const sessions = await recall("sessions") as FileSystemDirectoryHandle | undefined;
  if (sessions) ((await permission(sessions)) === "granted" ? ready : needPermission).sessions = sessions;
  const cache = await recall("cache");
  let upgraded = false;
  if (Array.isArray(cache)) {
    const states = await Promise.all(cache.map(permission));
    (states.every((s) => s === "granted") ? ready : needPermission).cache = cache;
  } else if (cache) {
    upgraded = true;
    await forget("cache");
  }
  return { ready, needPermission, upgraded };
}

/** The file a browser's prompt names when it asks about the game cache file by file */
export const FIRST_ASKED = "main_file_cache.dat2";

/**
 * Asks again for permission to read what was connected before, which needs a click. Asks once: Chrome's
 * prompt for a returning site lists everything it had before and restores it all (and offers "Allow on
 * every visit"), but its plain prompt, and other browsers', ask file by file, each needing a click of its
 * own, so if one prompt doesn't bring everything back this gives up rather than asking again
 */

export async function reconnect(what: FileSystemDirectoryHandle | FileSystemFileHandle[]): Promise<boolean> {
  const handles = Array.isArray(what) ? what : [what];
  try {
    const waiting: FileSystemHandle[] = [];
    for (const h of handles) if ((await permission(h)) !== "granted") waiting.push(h);
    // A prompt that names a single file names the data file, as the welcome back screen says it will
    waiting.sort((a, b) => Number(b.name === FIRST_ASKED) - Number(a.name === FIRST_ASKED));
    if (waiting.length && (await (waiting[0] as unknown as Permissioned).requestPermission({ mode: "read" })) !== "granted") return false;
    for (const h of handles) if ((await permission(h)) !== "granted") return false;
    return true;
  } catch {
    return false;
  }
}

/** Forgets both: the browser no longer lets the page read them */
export async function forgetFolders(): Promise<void> {
  for (const kind of ["sessions", "cache"] as const) await forget(kind);
}

async function forget(kind: FolderKind): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, "readwrite").objectStore(STORE).delete(kind));
}

/** Each recording's length in ticks, by name, size and time: read once from the end of its file */
const knownTicks = new Map<string, number | undefined>();

/** Recordings in the sessions folder, newest first as the recorder lists them, each with its length in ticks */
export async function listSessions(sessions: FileSystemDirectoryHandle): Promise<RecordingFile[]> {
  const out: RecordingFile[] = [];
  for await (const entry of (sessions as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind !== "file" || !RECORDING_NAME.test(entry.name)) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    const key = `${entry.name}:${file.size}:${file.lastModified}`;
    if (!knownTicks.has(key)) {
      if (entry.name.endsWith(".gz")) {
        // Packed: its length is in the gzip header
        const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
        noteRead(entry.name, head.length);
        knownTicks.set(key, ticksFromHeader(head));
      } else {
        // Only the end of the file, for its last tick: recordings run to tens of megabytes
        const tail = await file.slice(Math.max(0, file.size - TAIL_BYTES)).text();
        noteRead(entry.name, tail.length);
        knownTicks.set(key, ticksFromTail(tail));
      }
    }
    out.push({ name: entry.name, size: file.size, modified: file.lastModified, ticks: knownTicks.get(key) });
  }
  return sortRecordings(out);
}

/**
 * A recording's text, unpacked if it's gzipped. A plain one asked for by name may have been packed since
 * (the plugin packs a recording moments after it stops), so its .gz is tried next
 */
export async function readSession(sessions: FileSystemDirectoryHandle, name: string): Promise<string> {
  let handle: FileSystemFileHandle;
  try {
    handle = await sessions.getFileHandle(name);
  } catch (e) {
    if (!name.endsWith(".jsonl")) throw e;
    handle = await sessions.getFileHandle(`${name}.gz`);
  }
  const file = await handle.getFile();
  noteRead(handle.name, file.size);
  return recordingText(file);
}

/**
 * The game cache as a CacheSource, reporting each read. RuneLite may update the cache while it runs,
 * which makes a file the browser opened earlier unreadable: it's opened again then
 */
export function cacheSource(cache: FileSystemFileHandle[], onRead: (name: string, bytes: number) => void): CacheSource {
  const handles = new Map(cache.filter((h) => CACHE_FILE.test(h.name)).map((h) => [h.name, h]));
  const files = new Map<string, File>();
  const file = async (name: string, fresh = false) => {
    let f = fresh ? undefined : files.get(name);
    if (!f) {
      const handle = handles.get(name);
      if (!handle) throw new Error(`${name} wasn't among the game cache files chosen`);
      f = await handle.getFile();
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

async function store(kind: FolderKind, what: FileSystemDirectoryHandle | FileSystemFileHandle[]): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(what, kind));
}

async function recall(kind: FolderKind): Promise<FileSystemDirectoryHandle | FileSystemFileHandle[] | undefined> {
  try {
    const db = await openDb();
    return (await request(db.transaction(STORE).objectStore(STORE).get(kind))) as FileSystemDirectoryHandle | FileSystemFileHandle[] | undefined;
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
