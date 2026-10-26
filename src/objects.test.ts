import { describe, expect, it } from "vitest";
import { ObjectTimeline } from "./objects";
import { Session } from "./session";

const at = (x: number) => ({ x, y: 5600, p: 0, sx: x - 4080, sy: 40, lx: (x - 4080) * 128 + 64, ly: 40 * 128 + 64 });
const session = Session.parse(
  [
    { t: 0, c: 1, e: "scene", instance: true },
    { t: 0, c: 1, e: "objdef", def: { id: 1, name: "Pillar" } },
    { t: 0, c: 1, e: "obj", id: 1, kind: "game", init: true, ...at(4100) },
    { t: 5, c: 2, e: "objdef", def: { id: 62578, name: "Mushroom" } },
    { t: 5, c: 2, e: "obj", id: 62578, kind: "game", init: false, ...at(4110) },
    { t: 8, c: 3, e: "obj_gone", id: 62578, ...at(4110) },
    { t: 8, c: 3, e: "obj", id: 62579, kind: "game", init: false, ...at(4110) },
    { t: 12, c: 4, e: "scene", instance: true },
    { t: 12, c: 4, e: "obj", id: 1, kind: "game", init: true, ...at(4100) },
  ].map((l) => JSON.stringify(l)).join("\n"),
);
const timeline = new ObjectTimeline(session);
const ids = (t: number) => timeline.at(t).map((o) => o.line.id).sort((a, b) => a - b);

describe("ObjectTimeline", () => {
  it("follows spawns and removals", () => {
    expect(ids(4)).toEqual([1]);
    expect(ids(5)).toEqual([1, 62578]);
    expect(ids(8)).toEqual([1, 62579]);
  });

  it("starts over on a map load", () => {
    expect(ids(12)).toEqual([1]);
    expect(timeline.at(12)[0].from).toBe(12);
  });

  it("tells map objects from ones mechanics spawned", () => {
    expect(timeline.at(5).find((o) => o.line.id === 62578)?.spawned).toBe(true);
    expect(timeline.at(5).find((o) => o.line.id === 1)?.spawned).toBe(false);
  });

  it("names objects, hiding the game's placeholder name", () => {
    expect(timeline.name(62578)).toBe("Mushroom");
    expect(timeline.name(999)).toBe("");
  });

  it("works out each object's floor from the order a map dump lists them in", () => {
    const dump = Session.parse(
      [
        { t: 0, c: 1, e: "scene", plane: 1 },
        { t: 0, c: 1, e: "obj", id: 7, init: true, ...at(4100), sx: 20 },
        { t: 0, c: 1, e: "obj", id: 7, init: true, ...at(4180), sx: 90 },
        { t: 0, c: 1, e: "obj", id: 8, init: true, ...at(4090), sx: 10 },
        { t: 0, c: 1, e: "obj", id: 8, init: true, ...at(4185), sx: 95 },
        { t: 0, c: 1, e: "obj", id: 9, init: true, ...at(4085), sx: 5 },
        { t: 3, c: 2, e: "obj", id: 10, init: false, ...at(4110) },
        { t: 4, c: 3, e: "obj", id: 11, init: false, pl: 0, ...at(4111) },
      ].map((l) => JSON.stringify(l)).join("\n"),
    );
    const floors = new ObjectTimeline(dump).objects.map((o) => o.plane);
    // Two jumps back west: floors 0, 1, 2; a spawn without a floor goes on yours; a recorded floor wins
    expect(floors).toEqual([0, 0, 1, 1, 2, 1, 0]);
  });
});

