import { refKey, type Line, type Session } from "./session";

/**
 * Which floor effects come with an animation. The game sends an attack's animation and its graphics,
 * projectiles and spawned objects as separate messages, with nothing tying them together, so the tie is
 * learned from repetition: an effect counts as part of an animation only if it follows most plays of it,
 * at the same delay each time. Animations seen too few times establish nothing.
 */

export interface EffectLink {
  kind: "gfx" | "proj" | "obj";
  id: number;
  /** Client cycles after the animation starts, as seen across plays */
  minDelay: number;
  maxDelay: number;
  /** Share of plays it followed */
  rate: number;
}

// Thresholds for calling something part of an animation rather than a coincidence: seen in at least
// three quarters of at least three plays, at a delay they agree on to within a few cycles
const MIN_PLAYS = 3;
const MIN_RATE = 0.75;
const AGREE_CYCLES = 5;
// Effects can land a few ticks after the animation itself has finished
const TRAIL_CYCLES = 120;
const SLACK_CYCLES = 3;

const effectKey = (l: Line) => `${l.e}:${l.id}`;
// A projectile can only belong to an animation of the actor that launched it: someone else's projectile
// arriving on cue (a boss answering your attack) is a pattern, not a part of your animation
const canBelong = (effect: Line, play: Line) => effect.e !== "proj" || refKey(effect.from) === refKey(play.who);
const isEffect = (l: Line) => l.e === "gfx" || l.e === "proj" || (l.e === "obj" && !l.init);

export class EffectLinks {
  private readonly links = new Map<number, EffectLink[]>();
  private readonly effects: Line[];

  /** lengthOf gives an animation's length in client cycles, when known */
  constructor(session: Session, lengthOf: (anim: number) => number | undefined) {
    this.effects = session.lines.filter(isEffect);
    const plays = new Map<number, Line[]>();
    for (const l of session.lines) {
      if (l.e !== "anim" || l.a === -1) continue;
      const list = plays.get(l.a) ?? [];
      list.push(l);
      plays.set(l.a, list);
    }
    for (const [anim, list] of plays) {
      if (list.length < MIN_PLAYS) continue;
      const window = (lengthOf(anim) ?? 60) + TRAIL_CYCLES;
      // Every delay at which each effect followed each play
      const delays = new Map<string, number[][]>();
      list.forEach((play, n) => {
        for (const e of this.within(play.c, window)) {
          if (!canBelong(e, play)) continue;
          const key = effectKey(e);
          const perPlay = delays.get(key) ?? list.map(() => []);
          perPlay[n].push(e.c - play.c);
          delays.set(key, perPlay);
        }
      });
      const found: EffectLink[] = [];
      for (const [key, perPlay] of delays) {
        // The delay most plays agree on, and how many plays have the effect there
        let best = { count: 0, min: 0, max: 0 };
        for (const centre of new Set(perPlay.flat())) {
          let count = 0;
          let min = Infinity;
          let max = -Infinity;
          for (const ds of perPlay) {
            const near = ds.filter((d) => Math.abs(d - centre) <= AGREE_CYCLES);
            if (!near.length) continue;
            count++;
            min = Math.min(min, ...near);
            max = Math.max(max, ...near);
          }
          if (count > best.count || (count === best.count && max - min < best.max - best.min)) best = { count, min, max };
        }
        const rate = best.count / list.length;
        if (rate < MIN_RATE) continue;
        const [kind, id] = key.split(":");
        found.push({ kind: kind as EffectLink["kind"], id: Number(id), minDelay: best.min, maxDelay: best.max, rate });
      }
      if (found.length) this.links.set(anim, found.sort((a, b) => a.minDelay - b.minDelay));
    }
  }

  /** The effects learned to come with an animation */
  linksOf(anim: number): EffectLink[] {
    return this.links.get(anim) ?? [];
  }

  /** The actual effect lines from one play of an animation: its graphics, projectiles and objects */
  effectsOf(play: Line): Line[] {
    const links = this.linksOf(play.a);
    if (!links.length) return [];
    const last = Math.max(...links.map((l) => l.maxDelay)) + SLACK_CYCLES;
    return this.within(play.c, last).filter((e) => canBelong(e, play) &&
      links.some((l) => effectKey(e) === `${l.kind}:${l.id}` && e.c - play.c >= l.minDelay - SLACK_CYCLES && e.c - play.c <= l.maxDelay + SLACK_CYCLES));
  }

  private within(start: number, span: number): Line[] {
    // Effects are in file order, which is cycle order: binary search to the start
    let lo = 0;
    let hi = this.effects.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.effects[mid].c < start - 2) lo = mid + 1;
      else hi = mid;
    }
    const out: Line[] = [];
    for (let i = lo; i < this.effects.length && this.effects[i].c <= start + span; i++) out.push(this.effects[i]);
    return out;
  }
}
