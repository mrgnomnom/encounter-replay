import { describe, expect, it } from "vitest";
import { isOthersHit, isYourHit, landedProjectile } from "./hits";
import { Session, type Line } from "./session";

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
