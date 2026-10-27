import { beforeEach, describe, expect, it } from "vitest";
import { Notes } from "./notes";
import { Session } from "./session";

const text = [
  { t: 0, c: 1, e: "header", format: 5, label: "Test" },
  { t: 0, c: 1, e: "scene", baseX: 0, baseY: 0, plane: 0, instance: false },
  { t: 0, c: 1, e: "look", who: { k: "me" }, name: "Mr Gnome" },
  { t: 0, c: 1, e: "player_spawn", who: { k: "player", i: 7 }, name: "Mr Cow" },
  { t: 0, c: 2, e: "tick" },
  { t: 1, c: 30, e: "mark", note: "" },
  { t: 1, c: 32, e: "tick" },
  { t: 2, c: 60, e: "chat", type: "GAMEMESSAGE", text: "Mr Cow wishes to trade with you." },
  { t: 2, c: 62, e: "tick" },
  { t: 3, c: 92, e: "tick" },
  { t: 3, c: 93, e: "end", reason: "stopped by hand" },
].map((l) => JSON.stringify(l)).join("\n");

// Notes keep to the browser per recording: start each test clean
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;

describe("Notes", () => {
  let session: Session;
  let notes: Notes;
  beforeEach(() => {
    store.clear();
    session = Session.parse(text);
    notes = new Notes();
    notes.load(session, text, "test.jsonl");
  });

  const exported = (from: number, to: number, hideNames = false) =>
    notes.exportText({ from, to, hideNames }).trim().split("\n").map((l) => JSON.parse(l));

  it("shows notes on the timeline like markers", () => {
    notes.add(2, 61, "Prayed late here");
    expect(session.events(2).map((l) => l.e)).toEqual(["chat", "mark", "tick"]);
    expect(notes.between(0, 3).map((l) => l.note)).toEqual(["", "Prayed late here"]);
  });

  it("exports notes in place and markers with their edited text", () => {
    notes.add(2, 61, "Prayed late here");
    notes.edit(session.events(1)[0], "Phase 2");
    const lines = exported(0, 3);
    expect(lines.filter((l) => l.e === "mark").map((l) => [l.t, l.note, l.by])).toEqual([[1, "Phase 2", undefined], [2, "Prayed late here", "you"]]);
    const i = lines.findIndex((l) => l.by === "you");
    expect([lines[i - 1].e, lines[i + 1].e]).toEqual(["chat", "tick"]);
  });

  it("cuts a stretch, renumbered from 0, with the map and players carried in", () => {
    notes.add(2, 61, "Prayed late here");
    const lines = exported(2, 3);
    expect(lines[0]).toMatchObject({ e: "header", t: 0, trimmed: { from: 2, to: 3 } });
    expect(lines.some((l) => l.e === "scene")).toBe(true);
    expect(lines.find((l) => l.by === "you")).toMatchObject({ t: 0, note: "Prayed late here" });
    expect(lines.at(-1)).toMatchObject({ e: "end", t: 1, reason: "trimmed" });
  });

  it("hides every player name when asked, wherever it's written", () => {
    const out = notes.exportText({ from: 0, to: 3, hideNames: true });
    expect(out).not.toMatch(/Mr.Cow|Mr.Gnome/i);
    expect(out).toContain("Player 1 wishes to trade with you.");
    expect(out).toContain('"name":"You"');
  });

  it("keeps notes for the recording across page loads, until deleted", () => {
    const line = notes.add(2, 61, "Prayed late here")!;
    const again = Session.parse(text);
    const reloaded = new Notes();
    reloaded.load(again, text, "test.jsonl");
    expect(reloaded.between(0, 3).map((l) => l.note)).toContain("Prayed late here");
    notes.remove(line);
    const third = new Notes();
    third.load(Session.parse(text), text, "test.jsonl");
    expect(third.between(0, 3).map((l) => l.note)).not.toContain("Prayed late here");
  });
});
