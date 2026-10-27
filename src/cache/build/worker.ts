import { cacheSource } from "../../runeliteFolder";
import { CacheStore } from "../store/store";
import { devSource } from "./devSource";
import { buildBundle } from "./buildBundle";

/**
 * Builds a session's bundle off the page's thread: reading the cache and decoding models takes long
 * enough to freeze the replay otherwise. Folder handles can be passed to workers.
 */

export interface BuildRequest {
  /** The game cache folder, or in development the dev server's copy of it */
  cache: FileSystemDirectoryHandle | string;
  session: string;
}

export type BuildMessage = { progress: string } | { bundle: Record<string, unknown> } | { error: string };

self.onmessage = async (e: MessageEvent<BuildRequest>) => {
  const post = (m: BuildMessage) => (self as unknown as Worker).postMessage(m);
  try {
    const { cache } = e.data;
    const store = await CacheStore.open(typeof cache === "string" ? devSource(cache) : cacheSource(cache));
    post({ bundle: await buildBundle(store, e.data.session, (step) => post({ progress: step })) });
  } catch (err) {
    post({ error: err instanceof Error ? err.message : String(err) });
  }
};
