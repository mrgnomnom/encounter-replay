import { describe, expect, it } from "vitest";
import { actorsAt, cycleAt, happened, lerpAngle } from "./moment";
import { Session } from "./session";

const npc = (lx: number, o = 0) => ({ who: { k: "npc", i: 1, id: 5 }, lx, ly: 640, o, a: -1, af: -1, pose: 808, x: 0, y: 0, p: 0, sx: 0, sy: 0 });
const session = Session.parse(
  [
    { t: 0, c: 100, e: "npcdef", def: { id: 5, name: "Rat", size: 2 } },
    { t: 0, c: 130, e: "tick", abs: 1, ms: 0, npcs: [npc(640, 0)] },
    { t: 1, c: 160, e: "tick", abs: 2, ms: 600, npcs: [npc(896, 1536)] },
    { t: 2, c: 190, e: "tick", abs: 3, ms: 1200, npcs: [npc(640 * 3)] },
  ].map((l) => JSON.stringify(l)).join("\n"),
);

describe("actorsAt", () => {
  it("glides between tick snapshots", () => {
    const [rat] = actorsAt(session, 0, 0.5);
    expect(rat.x).toBeCloseTo(6);
    expect(rat.size).toBe(2);
  });

  it("jumps instead of gliding across a teleport", () => {
    const [rat] = actorsAt(session, 1, 0.5);
    expect(rat.x).toBeCloseTo(7);
  });
});

describe("lerpAngle", () => {
  it("turns the short way round", () => {
    expect(lerpAngle(0, 1536, 0.5)).toBeCloseTo(1792);
    expect(lerpAngle(1900, 100, 0.5)).toBeCloseTo(2024);
  });
});

describe("happened", () => {
  it("includes the next tick's events up to the moment, since they play out before its snapshot", () => {
    const s = Session.parse(
      [
        { t: 0, c: 100, e: "tick", abs: 0, ms: 0, npcs: [] },
        { t: 1, c: 110, e: "proj", id: 1 },
        { t: 1, c: 125, e: "proj", id: 2 },
        { t: 1, c: 130, e: "tick", abs: 1, ms: 0, npcs: [] },
      ].map((l) => JSON.stringify(l)).join("\n"),
    );
    expect(happened(s, 0, 1, "proj", 115).map((l) => l.id)).toEqual([1]);
    expect(happened(s, 0, 1, "proj", 129).map((l) => l.id)).toEqual([1, 2]);
  });
});

describe("cycleAt", () => {
  it("follows the cycles stamped on tick lines", () => {
    expect(cycleAt(session, 0, 0.5)).toBe(145);
    expect(cycleAt(session, 2, 0.5)).toBe(205);
  });
});
