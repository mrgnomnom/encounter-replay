import { describe, expect, it } from "vitest";
import { targetsOf, walkTile } from "./highlight";
import { Session, type Line } from "./session";

const session = Session.parse(
  [{ t: 0, c: 1, e: "items", which: "worn", items: [[-1, 0], [-1, 0], [-1, 0], [20997, 1]] }].map((l) => JSON.stringify(l)).join("\n"),
);
const line = (l: { e: string; [k: string]: unknown }): Line => ({ t: 1, c: 2, ...l });

describe("targetsOf", () => {
  it("points clicks at the button they hit", () => {
    expect(targetsOf(line({ e: "click", widget: [149, 0], p0: 12, option: "Eat" }), session)).toEqual([{ kind: "slot", tab: 3, inv: 12 }]);
    expect(targetsOf(line({ e: "click", widget: [541, 20], target: "Protect from Magic", option: "Activate" }), session))
      .toEqual([{ kind: "slot", tab: 5, prayer: "PROTECT_FROM_MAGIC" }]);
    expect(targetsOf(line({ e: "click", widget: [387, 18], item: 20997, option: "Remove" }), session)).toEqual([{ kind: "slot", tab: 4, worn: 3 }]);
  });

  it("points clicks in the world at the NPC, player or tile", () => {
    expect(targetsOf(line({ e: "click", action: "NPC_SECOND_OPTION", id: 37416, option: "Attack" }), session)).toEqual([{ kind: "actor", key: "n37416" }]);
    // From format 4 the clicked tile is recorded; a walk click's p0/p1 are only the mouse position
    expect(targetsOf(line({ e: "click", action: "WALK", p0: 656, p1: 429, tile: { sx: 55, sy: 41 }, option: "Walk here" }), session))
      .toEqual([{ kind: "tile", sx: 55, sy: 41, walk: true }]);
  });

  it("links who targets whom, and a projectile's ends", () => {
    expect(targetsOf(line({ e: "target", who: { k: "npc", i: 3, id: 9 }, at: { k: "me" } }), session)).toEqual([{ kind: "link", from: "n3", to: "me" }]);
    expect(targetsOf(line({ e: "target", who: { k: "me" } }), session)).toEqual([{ kind: "actor", key: "me" }]);
    expect(targetsOf(line({ e: "proj", from: { k: "npc", i: 3, id: 9 }, to: { k: "player", i: 5 } }), session)).toEqual([{ kind: "link", from: "n3", to: "p5" }]);
  });

  it("finds where an older walk click took you from your server tile", () => {
    const me = (t: number, sx: number) => ({ t, c: 100 + t * 30, e: "tick", abs: t, ms: 0, npcs: [], me: { tile: { sx, sy: 40 } } });
    const walk = Session.parse(
      [
        me(0, 50),
        { t: 1, c: 120, e: "click", action: "WALK", option: "Walk here", p0: 600, p1: 300 },
        me(1, 50), me(2, 52), me(3, 54), me(4, 55), me(5, 55), me(6, 55),
      ].map((l) => JSON.stringify(l)).join("\n"),
    );
    const click = walk.lines.find((l) => l.e === "click")!;
    expect(walkTile(walk, click)).toEqual({ sx: 55, sy: 40 });
  });

  it("loops an animation and pulses a hitsplat", () => {
    const anim = line({ e: "anim", who: { k: "npc", i: 3, id: 9 }, a: 14752 });
    expect(targetsOf(anim, session)).toEqual([{ kind: "anim", key: "n3", anim: 14752, line: anim }]);
    const hit = line({ e: "hit", who: { k: "me" }, amount: 41 });
    expect(targetsOf(hit, session)[0]).toEqual({ kind: "hit", line: hit });
  });
});
