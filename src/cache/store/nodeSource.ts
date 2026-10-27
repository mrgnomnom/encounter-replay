import { open, readFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { CacheSource } from "./store";

/** A cache folder on disk, for tests and scripts in Node. Files stay open while the process runs */
export function nodeSource(folder: string): CacheSource {
  const handles = new Map<string, Promise<FileHandle>>();
  const handle = (name: string) => {
    let h = handles.get(name);
    if (!h) {
      h = open(join(folder, name), "r");
      handles.set(name, h);
    }
    return h;
  };
  return {
    async read(name, offset, length) {
      const out = new Uint8Array(length);
      const { bytesRead } = await (await handle(name)).read(out, 0, length, offset);
      return out.subarray(0, bytesRead);
    },
    async readAll(name) {
      try {
        return new Uint8Array(await readFile(join(folder, name)));
      } catch {
        return undefined;
      }
    },
  };
}
