import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bunzip2 } from "./bzip2";
import { nodeSource } from "./nodeSource";
import { CacheStore, splitArchive } from "./store";

describe("bunzip2", () => {
  // "hello hello hello\n" from Python's bz2.compress(level 1), with the "BZh1" header the cache leaves out
  const stream = "QlpoMTFBWSZTWeW18wkAAARRAAAQQAACRKAAIbUYDAKQacKjC7kinChIctr5hIA=";
  it("decompresses a stream stored without its header", () => {
    const raw = Uint8Array.from(atob(stream), (c) => c.charCodeAt(0));
    const out = bunzip2(raw.subarray(4), 18);
    expect(new TextDecoder().decode(out)).toBe("hello hello hello\n");
  });
});

describe("splitArchive", () => {
  it("rebuilds files packed in chunks", () => {
    // Two files over one chunk: "ab" and "cde", then each file's size delta and the chunk count
    const data = Uint8Array.from([0x61, 0x62, 0x63, 0x64, 0x65, 0, 0, 0, 2, 0, 0, 0, 1, 1]);
    const files = splitArchive(data, [3, 7]);
    expect(new TextDecoder().decode(files.get(3))).toBe("ab");
    expect(new TextDecoder().decode(files.get(7))).toBe("cde");
  });
});

// The exporter's copy of the game cache, when present: it's Jagex's and never committed
const cache = resolve(__dirname, "../../../exporter/build/cache-live");
const run = existsSync(cache) ? describe : describe.skip;

run("CacheStore on a real cache", () => {
  it("reads reference tables, configs, models and map squares", async () => {
    const store = await CacheStore.open(nodeSource(cache));
    expect((await store.index(7))!.archives.size).toBeGreaterThan(50000);
    // Config index 2, archive 10: items
    expect((await store.files(2, 10))!.size).toBeGreaterThan(30000);
    expect((await store.group(7, 1))!.length).toBeGreaterThan(0);
    // Edgeville's map square: terrain and objects
    const map = (await store.files(5, (48 << 8) | 54))!;
    expect(map.get(0)!.length).toBeGreaterThan(0);
    expect(map.get(1)!.length).toBeGreaterThan(0);
  });
});
