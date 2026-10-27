import { cacheSource } from "../../runeliteFolder";
import { CacheStore } from "../store/store";
import { buildBundle } from "./buildBundle";
import { devSource } from "./devSource";

/**
 * Builds a session's bundle off the page's thread: reading the cache and decoding models takes long
 * enough to freeze the replay otherwise. File handles can be passed to workers. Which cache files were
 * read, and how much of each, goes back with every message for the page to show.
 */

export interface BuildRequest {
  /** The game cache's files, or in development the dev server's copy of the cache */
  cache: FileSystemFileHandle[] | string;
  session: string;
}

type FilesRead = [string, number][];
export type BuildMessage =
  | { progress: string; files: FilesRead }
  | { bundle: Record<string, unknown>; files: FilesRead }
  | { error: string; files: FilesRead };

self.onmessage = async (e: MessageEvent<BuildRequest>) => {
  const read = new Map<string, number>();
  const post = (m: Omit<BuildMessage, "files">) => {
    (self as unknown as Worker).postMessage({ ...m, files: [...read] } as BuildMessage);
    read.clear();
  };
  try {
    const { cache } = e.data;
    const source = typeof cache === "string" ? devSource(cache) : cacheSource(cache, (name, bytes) => read.set(name, (read.get(name) ?? 0) + bytes));
    const store = await CacheStore.open(source);
    post({ bundle: await buildBundle(store, e.data.session, (step) => post({ progress: step })) });
  } catch (err) {
    post({ error: err instanceof Error ? err.message : String(err) });
  }
};
