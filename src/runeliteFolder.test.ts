import { describe, expect, it } from "vitest";
import { cacheSource, reconnect } from "./runeliteFolder";

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

describe("reconnect", () => {
  // Handles whose permission a prompt can restore: restoresAll is a browser whose one prompt brings back every handle
  const handles = (n: number, restoresAll: boolean) => {
    const state = { granted: new Set<number>(), prompts: 0 };
    const list = Array.from({ length: n }, (_, i) => ({
      name: `main_file_cache.idx${i}`,
      queryPermission: async () => (state.granted.has(i) ? "granted" : "prompt"),
      requestPermission: async () => {
        state.prompts++;
        if (restoresAll) for (let k = 0; k < n; k++) state.granted.add(k);
        else state.granted.add(i);
        return "granted";
      },
    })) as unknown as FileSystemFileHandle[];
    return { list, state };
  };

  it("needs one prompt when the browser restores every file with it", async () => {
    const { list, state } = handles(27, true);
    expect(await reconnect(list)).toBe(true);
    expect(state.prompts).toBe(1);
  });

  it("asks once, never file by file, and gives up when that isn't enough", async () => {
    const { list, state } = handles(27, false);
    expect(await reconnect(list)).toBe(false);
    expect(state.prompts).toBe(1);
  });
});
