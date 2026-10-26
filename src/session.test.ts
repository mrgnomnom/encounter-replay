import { describe, expect, it } from "vitest";
import { latestAtOrBefore, refKey, Session, stoppedTargeting } from "./session";

const file = [
  { t: 0, c: 10, e: "header", format: 2, label: "test" },
  { t: 0, c: 10, e: "npcdef", def: { id: 16677, name: "Ocellus", size: 5 } },
  { t: 0, c: 10, e: "items", which: "inv", items: [[4151, 1]] },
  { t: 0, c: 10, e: "ui_tab", tab: 3 },
  { t: 0, c: 40, e: "tick", abs: 1, ms: 0, npcs: [], ui: { tab: 3 } },
  { t: 1, c: 55, e: "ui_tab", tab: 5 },
  { t: 1, c: 70, e: "tick", abs: 2, ms: 600, npcs: [], ui: { tab: 5 } },
  { t: 3, c: 100, e: "items", which: "inv", items: [[4151, 1], [385, 1]] },
  { t: 3, c: 130, e: "tick", abs: 4, ms: 1800, npcs: [] },
].map((l) => JSON.stringify(l)).join("\n") + "\n{\"t\":4,\"c\":"; // cut off mid-line, as after a crash

describe("Session", () => {
  const s = Session.parse(file);

  it("skips a cut-off last line", () => {
    expect(s.unreadable).toBe(1);
    expect(s.header?.label).toBe("test");
  });

  it("falls back to the last snapshot for a tick without one", () => {
    expect(s.tickAt(2)?.abs).toBe(2);
    expect(s.tickAt(3)?.abs).toBe(4);
  });

  it("knows the inventory at any tick", () => {
    expect(s.itemsAt("inv", 2)).toEqual([[4151, 1]]);
    expect(s.itemsAt("inv", 3)).toHaveLength(2);
  });

  it("knows which tab was open", () => {
    expect(s.tabAt(0)).toBe(3);
    expect(s.tabAt(1)).toBe(5);
    expect(s.tabAt(3)).toBe(5);
  });

  it("names and sizes NPCs from their definitions", () => {
    expect(s.label({ k: "npc", i: 3, id: 16677 })).toBe("Ocellus#3");
    expect(s.sizeOf({ k: "npc", i: 3, id: 16677 })).toBe(5);
    expect(s.sizeOf({ k: "me" })).toBe(1);
  });

  it("names players from their appearance lines, falling back to their index", () => {
    const named = Session.parse(
      [
        { t: 0, c: 1, e: "look", who: { k: "me" }, name: "Mr Gnome" },
        { t: 0, c: 1, e: "player_spawn", who: { k: "player", i: 7 }, name: "Zezima" },
        { t: 9, c: 2, e: "player_spawn", who: { k: "player", i: 7 }, name: "Woox" },
      ].map((l) => JSON.stringify(l)).join("\n"),
    );
    expect(named.label({ k: "me" })).toBe("Mr Gnome (you)");
    expect(named.label({ k: "player", i: 7 }, 3)).toBe("Zezima");
    expect(named.label({ k: "player", i: 7 }, 9)).toBe("Woox");
    expect(named.label({ k: "player", i: 8 })).toBe("Player 8");
  });

  it("puts instance positions on their scene floor, not their template's", () => {
    // Scene floor 1's chunk at (4, 7) was copied from a template chunk on floor 2
    const packed = (2 << 24) | (400 << 14) | (300 << 3);
    const templates = [0, 1, 2, 3].map((z) => Array.from({ length: 13 }, () => Array.from({ length: 13 }, () => (z === 1 ? packed : -1))));
    const s = Session.parse(
      [
        { t: 0, c: 1, e: "scene", instance: true, plane: 1, templates },
        { t: 1, c: 2, e: "tick", abs: 1, ms: 0, npcs: [], me: { who: { k: "me" }, sx: 38, sy: 57, p: 2, tile: { sx: 38, sy: 57, p: 2 } } },
        { t: 1, c: 3, e: "gfx", id: 1, sx: 38, sy: 57, p: 2 },
      ].map((l) => JSON.stringify(l)).join("\n"),
    );
    expect(s.tickAt(1)?.me?.p).toBe(1);
    expect(s.tickAt(1)?.me?.tile?.p).toBe(1);
    expect(s.events(1).find((l) => l.e === "gfx")?.p).toBe(1);
  });

  it("tells apart scene floors copied from the same template floor by their template chunk", () => {
    // All three floors come from template floor 2, from chunks (243, 880), (243, 884) and (243, 882)
    const pack = (cy: number) => (2 << 24) | (243 << 14) | (cy << 3);
    const templates = [880, 884, 882, -1].map((cy) => Array.from({ length: 13 }, () => Array.from({ length: 13 }, () => (cy < 0 ? -1 : pack(cy)))));
    const s = Session.parse(
      [
        { t: 0, c: 1, e: "scene", instance: true, plane: 1, templates },
        // Recorded at template position (243 * 8 + 3, 884 * 8 + 5) on template floor 2: scene floor 1
        { t: 1, c: 2, e: "gfx", id: 1, sx: 38, sy: 57, p: 2, x: 243 * 8 + 3, y: 884 * 8 + 5 },
      ].map((l) => JSON.stringify(l)).join("\n"),
    );
    expect(s.events(1)[0].p).toBe(1);
  });

  it("knows what a cleared target had been", () => {
    const t = Session.parse(
      [
        { t: 1, c: 1, e: "target", who: { k: "me" }, at: { k: "npc", i: 4, id: 9 } },
        { t: 2, c: 2, e: "target", who: { k: "me" } },
        { t: 3, c: 3, e: "target", who: { k: "me" } },
      ].map((l) => JSON.stringify(l)).join("\n"),
    );
    const [, cleared, again] = t.lines;
    expect(stoppedTargeting(t, cleared)).toEqual({ k: "npc", i: 4, id: 9 });
    expect(stoppedTargeting(t, again)).toBeUndefined();
  });

  it("keys actors by kind and index", () => {
    expect(refKey({ k: "npc", i: 7, id: 1 })).toBe("n7");
    expect(refKey({ k: "player", i: 7 })).toBe("p7");
    expect(refKey({ k: "me" })).toBe("me");
    expect(refKey(null)).toBe("");
  });

  it("finds the latest entry with a binary search", () => {
    const list = [0, 2, 2, 5].map((t, i) => ({ t, c: i, e: "x" }));
    expect(latestAtOrBefore(list, 1)?.c).toBe(0);
    expect(latestAtOrBefore(list, 2)?.c).toBe(2);
    expect(latestAtOrBefore(list, 9)?.c).toBe(3);
    expect(latestAtOrBefore(list, -1)).toBeUndefined();
  });
});
