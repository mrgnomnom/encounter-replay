import { describe, expect, it } from "vitest";
import { Session } from "./session";
import { damageSeries, rateAt } from "./timelineViews";

const boss = { k: "npc", i: 5, id: 100 };
const friend = { k: "player", i: 7 };
const text = [
  { t: 0, c: 1, e: "header", format: 5, label: "Test" },
  { t: 0, c: 1, e: "scene", baseX: 0, baseY: 0, plane: 0, instance: false },
  { t: 0, c: 2, e: "tick" },
  // Yours: the game marks it
  { t: 1, c: 31, e: "hit", who: boss, amount: 30, mine: true, type: 1 },
  // Your friend's ranged hit: their projectile lands on the boss on the same cycle
  { t: 1, c: 20, e: "proj", id: 9, from: friend, to: boss, startCycle: 20, endCycle: 33 },
  { t: 1, c: 33, e: "hit", who: boss, amount: 12, type: 1 },
  { t: 1, c: 34, e: "tick" },
  // Someone's melee: no projectile, so nobody's as far as the replay can tell
  { t: 2, c: 60, e: "hit", who: boss, amount: 8, type: 1 },
  // On you: one hit, one heal
  { t: 2, c: 61, e: "hit", who: { k: "me" }, amount: 15, type: 1 },
  { t: 2, c: 62, e: "hit", who: { k: "me" }, amount: 20, type: 6 },
  { t: 2, c: 64, e: "tick" },
  { t: 3, c: 94, e: "end", reason: "stopped by hand" },
].map((l) => JSON.stringify(l)).join("\n");

describe("damage view", () => {
  const session = Session.parse(text);

  it("counts your hits as dealt and your hitsplats, but not heals, as taken", () => {
    const s = damageSeries(session, "me");
    expect([...s.dealt]).toEqual([0, 30, 0, 0]);
    expect([...s.taken]).toEqual([0, 0, 15, 0]);
  });

  it("credits someone else only with hits their projectiles landed", () => {
    const s = damageSeries(session, "p7");
    expect([...s.dealt]).toEqual([0, 12, 0, 0]);
  });

  it("gives damage per second over the last 6 seconds", () => {
    const s = damageSeries(session, "me");
    expect(rateAt(s.dealtSum, 3)).toBeCloseTo(30 / 6);
    expect(rateAt(s.takenSum, 1)).toBe(0);
  });
});

describe("hit sources", () => {
  it("never names someone else's projectile as the source of your hit", async () => {
    const { describe: describeLine } = await import("./hud");
    const session = Session.parse(text);
    const yours = session.events(1).find((l) => l.e === "hit" && l.mine)!;
    expect(describeLine(session, yours)).toContain("(yours)");
  });
});

describe("stats view", () => {
  it("reads your hitpoints, prayer, run and spec off each tick", async () => {
    const { VIEWS } = await import("./timelineViews");
    const stats = VIEWS.find((v) => v.id === "stats")!;
    const session = Session.parse([
      { t: 0, c: 1, e: "header", format: 5, label: "Test" },
      { t: 0, c: 2, e: "tick", me: { who: { k: "me" }, hpNow: 80, hpMax: 99, prayNow: 45, prayMax: 91, run: 9406, spec: 500 } },
    ].map((l) => JSON.stringify(l)).join("\n"));
    expect(stats.note!({ session } as never, 0)).toBe("HP 80/99 · prayer 45/91 · run 94% · spec 50%");
  });
});
