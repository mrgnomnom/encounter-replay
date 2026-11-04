import { describe, expect, it } from "vitest";
import { ObjectLoader } from "./object";

const bytes = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
const load = (hex: string, rev = 2000) => new ObjectLoader().configureForRevision(rev).load(1, bytes(hex));

// The cache of 2026-11-04 moved every object's transforms from opcodes 77 and 92 to 97 and 98, with
// 24-bit object ids; reading them as unknown lost the stream and failed every bundle build
describe("object transforms", () => {
  it("reads 77 and 92 with 16-bit ids, 0xffff for none", () => {
    // varbit 5, no varp, ids [-1, 300]
    expect(load("4d0005ffff01ffff012c00").configChangeDest).toEqual([-1, 300, -1]);
    // 92 adds a default after the varp
    expect(load("5c0005ffff019001ffff012c00").configChangeDest).toEqual([-1, 300, 400]);
  });

  it("reads 97 and 98 with 24-bit ids, 0xffffff for none", () => {
    // varbit 5, varp 0, ids [-1, 70000] (above 65535)
    const t = load("610005000001ffffff01117000");
    expect([t.varbitID, t.varpID]).toEqual([5, 0]);
    expect(t.configChangeDest).toEqual([-1, 70000, -1]);
    // 98's default is 24-bit too, and the definition goes on cleanly after it (14: size 2)
    const d = load("620005ffff01117101ffffff0111700e0200");
    expect(d.configChangeDest).toEqual([-1, 70000, 70001]);
    expect(d.sizeX).toBe(2);
  });

  it("leaves 97 and 98 unknown for archives too old to hold them, as RuneLite's library does", () => {
    expect(load("610005000001ffffff01117000", 0).configChangeDest).toBeUndefined();
  });
});
