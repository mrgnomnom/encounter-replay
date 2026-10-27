import { HEAL_HITSPLAT, isYourHit, landedProjectile } from "./hits";
import type { Outcome } from "./outcomes";
import { refKey, type Line, type Session } from "./session";

/**
 * What the timeline can show, one view at a time, each with its own legend: what happened on each tick,
 * or damage dealt against damage taken. Markers and notes are drawn over every view by the timeline
 * itself, so they stay put when the view changes. A new view is one more entry in VIEWS.
 */

export interface LegendItem {
  label: string;
  color: string;
  help: string;
  /** Drawn as a short bar along the top, like the marks it stands for */
  top?: boolean;
  /** Drawn as a line, like the marks it stands for */
  line?: boolean;
}

/** The stretch being drawn and how it maps onto the canvas, whose sizes are in canvas pixels */
export interface TimelineArea {
  session: Session;
  from: number;
  to: number;
  W: number;
  H: number;
  dpr: number;
  /** Where a tick starts */
  x(t: number): number;
  /** How wide one tick's marks are */
  tickW: number;
  /** Whose hits count: a key like "me", "n123", "p45" */
  followKey: string;
  outcomesByTick: Map<number, Outcome[]>;
}

export interface TimelineView {
  id: string;
  name: string;
  help: string;
  legend(followKey: string): LegendItem[];
  draw(ctx: CanvasRenderingContext2D, a: TimelineArea): void;
  /** The lines a point at tick t stands for, f being how far down the timeline it is (0 at the top) */
  linesAt(a: TimelineArea, t: number, f: number): Line[];
  /** A line about tick t for the hover tooltip */
  note?(a: TimelineArea, t: number): string | undefined;
}

// ---------- Tick events: clicks the server took late, hits on whoever you follow, NPC animations ----------

// NPC animations: teal, well clear of the yellow "late" marks
const ANIM_COLOR = "#3cc0a8";
const HIT_COLOR = "#f0604f";
const OUTCOME_COLORS: Partial<Record<Outcome["status"], string>> = { late: "#f1c40f", delayed: "#6fa0ea", ignored: "#ffffff", cancelled: "#ffffff" };

const tickEvents: TimelineView = {
  id: "events",
  name: "Tick events",
  help: "What happened on each tick: clicks the server took late, hits on whoever you follow, and NPC animations",
  legend: () => [
    { label: "hit", color: HIT_COLOR, help: "Hits on whoever you follow" },
    { label: "NPC anim", color: ANIM_COLOR, help: "NPC animations" },
    { label: "late", color: "#f1c40f", top: true, help: "Along the top: clicks that missed the server's cut-off and landed a tick late" },
    { label: "held", color: "#6fa0ea", top: true, help: "Along the top: clicks the game held for several ticks" },
    { label: "ignored", color: "#ffffff", top: true, help: "Along the top: clicks the server never acted on" },
  ],
  draw(ctx, a) {
    const { session, from, to, x, tickW, H, dpr } = a;
    session.byTick.forEach((events, t) => {
      if (t < from || t > to) return;
      let anim = false;
      let hit = false;
      for (const l of events) {
        if (l.e === "anim" && l.who?.k === "npc" && l.a !== -1) anim = true;
        if (l.e === "hit" && l.who && refKey(l.who) === a.followKey) hit = true;
      }
      if (anim) { ctx.fillStyle = ANIM_COLOR; ctx.fillRect(x(t), H * 0.62, tickW, H * 0.3); }
      if (hit) { ctx.fillStyle = HIT_COLOR; ctx.fillRect(x(t), H * 0.3, Math.max(1.5 * dpr, tickW), H * 0.3); }
      // Clicks the server took late or never acted on, along the top edge
      for (const o of a.outcomesByTick.get(t) ?? []) {
        const color = OUTCOME_COLORS[o.status];
        if (color) { ctx.fillStyle = color; ctx.fillRect(x(t), 0, Math.max(1.5 * dpr, tickW), H * 0.22); }
      }
    });
  },
  linesAt(a, t, f) {
    const events = a.session.events(t);
    if (f < 0.26) return (a.outcomesByTick.get(t) ?? []).filter((o) => OUTCOME_COLORS[o.status]).map((o) => o.click);
    if (f < 0.61) return events.filter((l) => l.e === "hit" && l.who && refKey(l.who) === a.followKey);
    return events.filter((l) => l.e === "anim" && l.who?.k === "npc" && l.a !== -1);
  },
};

// ---------- Damage: dealt above the middle, taken below, with how much per second over the last 6 s ----------

const DEALT_COLOR = "#62d394";
const TAKEN_COLOR = HIT_COLOR;
/** The rolling rate covers this many ticks: 6 seconds */
const RATE_TICKS = 10;
const TICK_SECONDS = 0.6;

/** Damage per tick, and running totals for rates over any stretch */
interface DamageSeries {
  dealt: Float64Array;
  taken: Float64Array;
  /** Running totals: sum[t + 1] - sum[f] is the damage on ticks f to t */
  dealtSum: Float64Array;
  takenSum: Float64Array;
}

/**
 * Damage dealt by whoever you follow. Only your own hitsplats are marked as yours by the game; for anyone
 * else, a hit counts when one of their projectiles landed on that target on the same cycle. Their melee
 * can't be told apart from anyone else's, so it isn't counted rather than guessed at
 */
export function dealtBy(session: Session, hit: Line, followKey: string): boolean {
  if (hit.e !== "hit" || !hit.who || hit.type === HEAL_HITSPLAT || refKey(hit.who) === followKey) return false;
  if (followKey === "me") return isYourHit(hit);
  const proj = landedProjectile(session, hit);
  return !!proj?.from && refKey(proj.from) === followKey;
}

/** Damage taken by whoever you follow: their hitsplats, heals left out */
export function takenBy(hit: Line, followKey: string): boolean {
  return hit.e === "hit" && !!hit.who && hit.type !== HEAL_HITSPLAT && refKey(hit.who) === followKey;
}

const seriesCache = new WeakMap<Session, Map<string, DamageSeries>>();

export function damageSeries(session: Session, followKey: string): DamageSeries {
  let bySession = seriesCache.get(session);
  if (!bySession) seriesCache.set(session, (bySession = new Map()));
  let s = bySession.get(followKey);
  if (s) return s;
  const n = session.lastTick + 1;
  const dealt = new Float64Array(n);
  const taken = new Float64Array(n);
  session.byTick.forEach((events, t) => {
    if (t < 0 || t >= n) return;
    for (const l of events) {
      if (l.e !== "hit") continue;
      if (dealtBy(session, l, followKey)) dealt[t] += l.amount ?? 0;
      else if (takenBy(l, followKey)) taken[t] += l.amount ?? 0;
    }
  });
  const sums = (v: Float64Array) => {
    const out = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) out[i + 1] = out[i] + v[i];
    return out;
  };
  s = { dealt, taken, dealtSum: sums(dealt), takenSum: sums(taken) };
  bySession.set(followKey, s);
  return s;
}

/** Damage per second over the RATE_TICKS ticks up to and including t */
export function rateAt(sum: Float64Array, t: number): number {
  const end = Math.max(0, Math.min(sum.length - 1, Math.floor(t) + 1));
  const start = Math.max(0, end - RATE_TICKS);
  return (sum[end] - sum[start]) / (RATE_TICKS * TICK_SECONDS);
}

const damage: TimelineView = {
  id: "damage",
  name: "Damage",
  help: "Damage dealt by whoever you follow (above the middle) against damage they took (below), with how much per second over the last 6 seconds",
  legend: (followKey) => [
    {
      label: "dealt", color: DEALT_COLOR,
      help: followKey === "me"
        ? "Damage you dealt: hitsplats the game marks as yours"
        : "Damage they dealt with projectiles that landed. Other players' melee can't be told apart from anyone else's, so it isn't counted",
    },
    { label: "taken", color: TAKEN_COLOR, help: "Damage on their hitsplats; heals left out" },
    { label: "per second, last 6 s", color: "#ece8e1", line: true, help: "Lines: damage per second over the 6 seconds before each moment" },
  ],
  draw(ctx, a) {
    const { from, to, W, H, dpr, x } = a;
    const s = damageSeries(a.session, a.followKey);
    const mid = Math.round(H / 2);
    const room = mid - 2 * dpr;
    const span = Math.max(1, to - from);
    const spacing = (W - 8 * dpr) / span;
    // Ticks thinner than two pixels are added up in buckets that wide
    const bucketW = Math.max(spacing, 2 * dpr);
    const perBucket = bucketW / spacing;
    const buckets = Math.ceil((span + 1) / perBucket);
    const dealt = new Float64Array(buckets);
    const taken = new Float64Array(buckets);
    for (let t = from; t <= to; t++) {
      const b = Math.floor((t - from) / perBucket);
      dealt[b] += s.dealt[t] ?? 0;
      taken[b] += s.taken[t] ?? 0;
    }
    let most = 1;
    for (let b = 0; b < buckets; b++) most = Math.max(most, dealt[b], taken[b]);
    const barW = Math.max(dpr, bucketW * 0.8);
    for (let b = 0; b < buckets; b++) {
      const bx = x(from + b * perBucket);
      if (dealt[b]) { ctx.fillStyle = withAlpha(DEALT_COLOR, 0.55); const h = Math.max(dpr, (dealt[b] / most) * room); ctx.fillRect(bx, mid - h, barW, h); }
      if (taken[b]) { ctx.fillStyle = withAlpha(TAKEN_COLOR, 0.55); const h = Math.max(dpr, (taken[b] / most) * room); ctx.fillRect(bx, mid + dpr, barW, h); }
    }
    ctx.fillStyle = "#3a3732";
    ctx.fillRect(0, mid, W, dpr);

    // The rates, sampled every other pixel, on their own scale
    const step = 2 * dpr;
    const samples: [number, number, number][] = [];
    let peak = 0;
    for (let px = x(from); px <= x(to) + 0.5; px += step) {
      const t = from + (px - x(from)) / spacing;
      const d = rateAt(s.dealtSum, t);
      const k = rateAt(s.takenSum, t);
      peak = Math.max(peak, d, k);
      samples.push([px, d, k]);
    }
    if (peak > 0) {
      ctx.lineWidth = 1.5 * dpr;
      for (const [i, color, sign] of [[1, DEALT_COLOR, -1], [2, TAKEN_COLOR, 1]] as const) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        // Nothing on either side: no line, so it doesn't paint over the middle
        samples.forEach((p, n) => {
          const y = mid + sign * (p[i] / peak) * room;
          if (n === 0 || (p[i] === 0 && samples[n - 1][i] === 0)) ctx.moveTo(p[0], y);
          else ctx.lineTo(p[0], y);
        });
        ctx.stroke();
      }
    }
    // Tall enough to read: what each half is, and the scale of the lines
    if (H / dpr >= 70) {
      ctx.font = `${10 * dpr}px sans-serif`;
      ctx.fillStyle = "#8d877d";
      ctx.textBaseline = "top";
      ctx.fillText("dealt", 8 * dpr, 4 * dpr);
      ctx.textBaseline = "bottom";
      ctx.fillText("taken", 8 * dpr, H - 4 * dpr);
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(`line peak ${peak.toFixed(1)}/s · tallest bar ${most}`, W - 8 * dpr, 4 * dpr);
      ctx.textAlign = "left";
    }
  },
  linesAt(a, t, f) {
    const hits = a.session.events(t).filter((l) => l.e === "hit");
    const dealt = hits.filter((l) => dealtBy(a.session, l, a.followKey));
    const taken = hits.filter((l) => takenBy(l, a.followKey));
    return f < 0.5 ? [...dealt, ...taken] : [...taken, ...dealt];
  },
  note(a, t) {
    const s = damageSeries(a.session, a.followKey);
    return `dealt ${s.dealt[t] ?? 0} · taken ${s.taken[t] ?? 0}\nlast 6 s: ${rateAt(s.dealtSum, t).toFixed(1)}/s dealt · ${rateAt(s.takenSum, t).toFixed(1)}/s taken`;
  },
};

export const VIEWS: TimelineView[] = [tickEvents, damage];

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
