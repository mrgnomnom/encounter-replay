import type { CacheSource } from "../store/store";

/** The dev server's copy of the cache (see devCache in vite.config.ts) */
export function devSource(base: string): CacheSource {
  return {
    async read(name, offset, length) {
      return new Uint8Array(await (await fetch(`${base}${name}?o=${offset}&n=${length}`)).arrayBuffer());
    },
    async readAll(name) {
      const r = await fetch(`${base}${name}`);
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : undefined;
    },
  };
}
