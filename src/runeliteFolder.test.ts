import { describe, expect, it } from "vitest";
import { cacheSource } from "./runeliteFolder";

const handle = (name: string, text: string) => ({ name, kind: "file", getFile: async () => new File([text], name) }) as unknown as FileSystemFileHandle;

describe("cacheSource", () => {
  it("reads the game cache's own files, and nothing else it was handed", async () => {
    const read: string[] = [];
    const source = cacheSource([
      handle("main_file_cache.dat2", "0123456789"),
      handle("main_file_cache.idx255", "abcdef"),
      handle("preferences.dat", "secret"),
    ], (name) => read.push(name));
    expect(new TextDecoder().decode(await source.read("main_file_cache.dat2", 2, 3))).toBe("234");
    expect(new TextDecoder().decode(await source.readAll("main_file_cache.idx255"))).toBe("abcdef");
    expect(await source.readAll("preferences.dat")).toBeUndefined();
    await expect(source.read("preferences.dat", 0, 6)).rejects.toThrow();
    expect(read).toEqual(["main_file_cache.dat2", "main_file_cache.idx255"]);
  });
});
