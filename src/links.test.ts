import { describe, expect, it } from "vitest";
import { EffectLinks } from "./links";
import { Session } from "./session";

const boss = { k: "npc", i: 1, id: 9 };
const lines: object[] = [];
// Animation 500 plays four times; graphic 70 lands 30 cycles later every time, at a different tile each
// time; graphic 80 shows up once by coincidence; a single play of animation 600 proves nothing
for (let n = 0; n < 4; n++) {
  const c = 1000 + n * 500;
  lines.push({ t: n * 10, c, e: "anim", who: boss, a: 500 });
  lines.push({ t: n * 10 + 1, c: c + 30 + (n % 2), e: "gfx", id: 70, sx: 10 + n, sy: 20 });
  if (n === 2) lines.push({ t: n * 10 + 1, c: c + 40, e: "gfx", id: 80, sx: 5, sy: 5 });
}
lines.push({ t: 50, c: 4000, e: "anim", who: boss, a: 600 });
lines.push({ t: 50, c: 4010, e: "gfx", id: 90, sx: 1, sy: 1 });
const session = Session.parse(lines.map((l) => JSON.stringify(l)).join("\n"));
const links = new EffectLinks(session, () => 60);

describe("EffectLinks", () => {
  it("ties an effect that follows every play at the same delay", () => {
    expect(links.linksOf(500)).toEqual([{ kind: "gfx", id: 70, minDelay: 30, maxDelay: 31, rate: 1 }]);
  });

  it("leaves out coincidences and animations seen too few times", () => {
    expect(links.linksOf(500).some((l) => l.id === 80)).toBe(false);
    expect(links.linksOf(600)).toEqual([]);
  });

  it("finds the delay most plays agree on, despite outliers", () => {
    // Graphic 55 lands 90 cycles in on three plays out of four; once it turns up at the start instead
    const mixed = Session.parse(
      [0, 1, 2, 3].flatMap((n) => [
        { t: n, c: 100 + n * 400, e: "anim", who: boss, a: 800 },
        { t: n, c: 100 + n * 400 + (n === 3 ? 0 : 90), e: "gfx", id: 55, sx: 1, sy: 1 },
      ]).map((l) => JSON.stringify(l)).join("\n"),
    );
    expect(new EffectLinks(mixed, () => 60).linksOf(800)).toEqual([{ kind: "gfx", id: 55, minDelay: 90, maxDelay: 90, rate: 0.75 }]);
  });

  it("only ties projectiles the animating actor launched", () => {
    const other = Session.parse(
      [0, 1, 2].flatMap((n) => [
        { t: n, c: 100 + n * 300, e: "anim", who: { k: "player", i: 5 }, a: 700 },
        { t: n, c: 110 + n * 300, e: "proj", id: 77, from: boss, to: { k: "player", i: 5 } },
      ]).map((l) => JSON.stringify(l)).join("\n"),
    );
    expect(new EffectLinks(other, () => 60).linksOf(700)).toEqual([]);
  });

  it("finds the actual effects of one play, at their own tiles", () => {
    const third = session.lines.filter((l) => l.e === "anim" && l.a === 500)[2];
    expect(links.effectsOf(third).map((e) => [e.id, e.sx])).toEqual([[70, 12]]);
  });
});
