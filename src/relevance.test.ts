import { describe, expect, it } from "vitest";
import { relatesTo } from "./relevance";
import { Session } from "./session";

const boss = { k: "npc", i: 7, id: 1 };
const session = Session.parse(
  [
    { t: 1, c: 1, e: "anim", who: boss, a: 10 },
    { t: 1, c: 2, e: "proj", id: 5, from: boss, to: { k: "me" } },
    { t: 1, c: 3, e: "hit", who: { k: "player", i: 3 }, amount: 4 },
    { t: 1, c: 4, e: "click", option: "Eat" },
    { t: 1, c: 5, e: "chat", type: "GAMEMESSAGE", text: "You eat." },
    { t: 1, c: 6, e: "target", who: { k: "me" }, at: boss },
    { t: 2, c: 7, e: "target", who: { k: "me" } },
    { t: 2, c: 8, e: "gfx", id: 9, sx: 1, sy: 1 },
  ].map((l) => JSON.stringify(l)).join("\n"),
);
const [anim, proj, hit, click, chat, target, untarget, gfx] = session.lines;
const about = (key: string, tied = new Set<typeof gfx>()) => session.lines.filter((l) => relatesTo(session, l, key, tied));

describe("relatesTo", () => {
  it("gives you your own clicks, messages and everything aimed at you", () => {
    expect(about("me")).toEqual([proj, click, chat, target, untarget]);
  });

  it("gives an NPC what it did, what was aimed at it, and what it was let go by", () => {
    expect(about("n7")).toEqual([anim, proj, target, untarget]);
  });

  it("gives another player only what's about them", () => {
    expect(about("p3")).toEqual([hit]);
  });

  it("counts floor effects tied to someone's animation as theirs", () => {
    expect(about("n7", new Set([gfx]))).toContain(gfx);
  });
});
