import { describe, expect, it } from "vitest";
import { trimLines, type RawLine } from "./trim";

const lines: RawLine[] = [
  { t: 0, c: 1, e: "header", format: 5 },
  { t: 0, c: 1, e: "scene", baseX: 0, baseY: 0, plane: 0, instance: true },
  { t: 0, c: 1, e: "obj", init: true, id: 9, x: 5, y: 5, pl: 0 },
  { t: 0, c: 1, e: "objdef", def: { id: 1, name: "Pillar" } },
  { t: 0, c: 1, e: "obj", init: true, id: 1, x: 1, y: 1, pl: 0 },
  { t: 0, c: 1, e: "obj", init: true, id: 2, x: 2, y: 2, pl: 1 },
  { t: 1, c: 30, e: "obj", id: 3, x: 3, y: 3, pl: 0 },
  { t: 2, c: 60, e: "obj_gone", id: 2, x: 2, y: 2, pl: 1 },
  { t: 3, c: 90, e: "tick" },
  { t: 4, c: 120, e: "obj_gone", id: 1, x: 1, y: 1, pl: 0 },
  { t: 5, c: 150, e: "end" },
];

describe("trimLines", () => {
  it("carries in the objects still standing when the span starts, in the order they were listed", () => {
    const out = trimLines(lines, 3, 5);
    expect(out.filter((l) => l.e === "obj").map((l) => [l.id, l.t])).toEqual([[9, 0], [1, 0], [3, 0]]);
    expect(out.find((l) => l.e === "objdef")).toMatchObject({ t: 0, def: { name: "Pillar" } });
    expect(out.find((l) => l.e === "obj_gone")).toMatchObject({ id: 1, t: 1 });
  });

  it("forgets objects from before a new map load", () => {
    const reloaded = [...lines.slice(0, 7), { t: 2, c: 60, e: "scene", baseX: 64, baseY: 0, plane: 0, instance: true }, ...lines.slice(8)];
    expect(trimLines(reloaded, 3, 5).filter((l) => l.e === "obj")).toEqual([]);
  });
});
