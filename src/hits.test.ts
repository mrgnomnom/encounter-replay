import { describe, expect, it } from "vitest";
import { isOthersHit, isYourHit, landedProjectile } from "./hits";
import { Session, type Line } from "./session";
import { damageSeries, dealtBy } from "./timelineViews";

const hit = (who: object, mine: boolean): Line => ({ t: 1, c: 2, e: "hit", who, amount: 10, type: 16, mine, others: !mine });

describe("hit ownership", () => {
  it("knows your hits on others", () => {
    expect(isYourHit(hit({ k: "npc", i: 1, id: 2 }, true))).toBe(true);
    expect(isOthersHit(hit({ k: "npc", i: 1, id: 2 }, true))).toBe(false);
  });

  it("knows someone else's hits on others", () => {
    expect(isYourHit(hit({ k: "npc", i: 1, id: 2 }, false))).toBe(false);
    expect(isOthersHit(hit({ k: "npc", i: 1, id: 2 }, false))).toBe(true);
  });

  it("names a projectile that landed on the target on the hit's cycle, and nothing else", () => {
    const s = Session.parse(
      [
        { t: 1, c: 100, e: "proj", id: 4304, from: { k: "npc", i: 7, id: 16677 }, to: { k: "me" }, startCycle: 110, endCycle: 160 },
        { t: 2, c: 160, e: "hit", who: { k: "me" }, amount: 30, type: 16, mine: true },
        { t: 3, c: 200, e: "hit", who: { k: "me" }, amount: 12, type: 16, mine: true },
      ].map((l) => JSON.stringify(l)).join("\n"),
    );
    const [onCue, melee] = s.lines.filter((l) => l.e === "hit");
    expect(landedProjectile(s, onCue)?.id).toBe(4304);
    expect(landedProjectile(s, melee)).toBeUndefined();
  });

  it("treats hits on you as neither: the game marks them yours", () => {
    expect(isYourHit(hit({ k: "me" }, true))).toBe(false);
    expect(isOthersHit(hit({ k: "me" }, true))).toBe(false);
  });
});

describe("Ocellus's scripted hit", () => {
  const changingPhase = { k: "npc", i: 9, id: 16675 };
  const ally = { k: "player", i: 4 };
  const lines = (amount: number) => [
    { t: 1, c: 100, e: "proj", id: 1, from: ally, to: changingPhase, startCycle: 110, endCycle: 200 },
    { t: 2, c: 200, e: "hit", who: changingPhase, amount, type: 44, mine: true, others: false },
  ];
  const parsed = (amount: number) => {
    const s = Session.parse(lines(amount).map((l) => JSON.stringify(l)).join("\n"));
    return { s, line: s.lines.find((l) => l.e === "hit")! };
  };

  it("isn't yours, though the game marks it so", () => {
    const { line } = parsed(12020);
    expect(isYourHit(line)).toBe(false);
    expect(isOthersHit(line)).toBe(true);
  });

  it("isn't anyone's, even with a projectile landing beside it", () => {
    const { s, line } = parsed(5250);
    expect(landedProjectile(s, line)).toBeUndefined();
    expect(dealtBy(s, line, "me")).toBe(false);
    expect(dealtBy(s, line, "p4")).toBe(false);
  });

  it("stays out of your damage dealt", () => {
    const { s } = parsed(12020);
    expect(damageSeries(s, "me").dealt[2]).toBe(0);
  });

  it("leaves your real hits alone, on that form and at any size elsewhere", () => {
    const { s, line } = parsed(31);
    expect(isYourHit(line)).toBe(true);
    expect(damageSeries(s, "me").dealt[2]).toBe(31);
    expect(isYourHit({ ...line, who: { k: "npc", i: 9, id: 16674 }, amount: 12020 })).toBe(true);
  });
});
