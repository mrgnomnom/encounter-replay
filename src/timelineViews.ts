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
  /** Where the plot starts and ends across the canvas, inside any axis */
  left: number;
  right: number;
  /** Whose hits count: a key like "me", "n123", "p45" */
  followKey: string;
  outcomesByTick: Map<number, Outcome[]>;
}

export interface TimelineView {
  id: string;
  name: string;
  help: string;
  /** Room kept at the left for an axis, in CSS pixels */
  axisWidth?: number;
  legend(followKey: string): LegendItem[];
  draw(ctx: CanvasRenderingContext2D, a: TimelineArea): void;
  /** The lines a point at tick t stands for, f being how far down the timeline it is (0 at the top) */
  linesAt(a: TimelineArea, t: number, f: number): Line[];
  /** A line about tick t for the hover tooltip; a view with notes shows the tooltip on every tick */
  note?(a: TimelineArea, t: number): string | undefined;
  /** Picks out tick t while the pointer is over it, drawn over the view */
  drawHover?(ctx: CanvasRenderingContext2D, a: TimelineArea, t: number): void;
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

// ---------- Shared by the views that plot values: a scale from 0, an axis, and the hover guide ----------

/** A vertical scale from 0 at the bottom to max at the top, on the canvas */
interface Scale {
  top: number;
  bottom: number;
  max: number;
  y(v: number): number;
}

/** A scale from 0 to max, leaving room below the plot (for a strip of marks) */
function scaleFor(a: TimelineArea, max: number, below = 0): Scale {
  const top = 7 * a.dpr;
  const bottom = a.H - below - 2 * a.dpr;
  return { top, bottom, max, y: (v) => bottom - (Math.min(v, max) / max) * (bottom - top) };
}

/** The axis at the left: 0 at the bottom, the top of the scale, and halfway when there's room */
function drawAxis(ctx: CanvasRenderingContext2D, a: TimelineArea, s: Scale, label: (v: number) => string): void {
  const { dpr, left, right } = a;
  ctx.font = `${10 * dpr}px sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const v of a.H / dpr >= 60 ? [0, s.max / 2, s.max] : [0, s.max]) {
    ctx.fillStyle = v === 0 ? "#4a463f" : "#2f2c28";
    ctx.fillRect(left, Math.round(s.y(v)), right - left, dpr);
    ctx.fillStyle = "#c9c3b8";
    ctx.fillText(label(v), left - 6 * dpr, Math.min(s.bottom, Math.max(s.top, s.y(v))));
  }
  ctx.fillStyle = "#4a463f";
  ctx.fillRect(left - 2 * dpr, s.top, dpr, s.bottom - s.top);
  ctx.textAlign = "left";
}

/**
 * A line through value(t), sampled every other pixel; filled lightly underneath when fill is given.
 * Ticks with no value break the line
 */
function drawSeries(ctx: CanvasRenderingContext2D, a: TimelineArea, s: Scale, value: (t: number) => number | undefined, color: string, fill = 0): void {
  const { from, to, dpr, x } = a;
  const spacing = (a.right - a.left) / Math.max(1, to - from);
  const runs: [number, number][][] = [[]];
  for (let px = x(from); px <= x(to) + 0.5; px += 2 * dpr) {
    const v = value(from + (px - x(from)) / spacing);
    if (v === undefined) runs.push([]);
    else runs[runs.length - 1].push([px, s.y(v)]);
  }
  for (const points of runs) {
    if (points.length < 2 || points.every((p) => p[1] >= s.bottom)) continue;
    if (fill) {
      ctx.fillStyle = withAlpha(color, fill);
      ctx.beginPath();
      ctx.moveTo(points[0][0], s.bottom);
      for (const [px, py] of points) ctx.lineTo(px, py);
      ctx.lineTo(points[points.length - 1][0], s.bottom);
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    points.forEach(([px, py], n) => (n ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
}

/** The hover guide: a line down tick t and a dot on each value there */
function drawGuide(ctx: CanvasRenderingContext2D, a: TimelineArea, t: number, s: Scale, points: [number | undefined, string][]): void {
  const { dpr } = a;
  const cx = a.x(t) + a.tickW / 2;
  ctx.fillStyle = "rgba(236, 232, 225, 0.55)";
  ctx.fillRect(Math.round(cx), s.top, dpr, s.bottom - s.top);
  for (const [v, color] of points) {
    if (v === undefined) continue;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#171614";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(cx, s.y(v), 3.5 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** The damage view's scale: the highest rate in the stretch shown, with room for the strip of hits */
function damageScale(a: TimelineArea, s: DamageSeries): { scale: Scale; strip: number } {
  let peak = 0;
  for (let t = a.from; t <= a.to; t++) peak = Math.max(peak, rateAt(s.dealtSum, t), rateAt(s.takenSum, t));
  const strip = Math.min(8 * a.dpr, Math.round(a.H * 0.18));
  return { scale: scaleFor(a, niceCeiling(Math.max(1, peak)), strip), strip };
}

const damage: TimelineView = {
  id: "damage",
  name: "Damage",
  help: "Damage per second over the last 6 seconds: dealt by whoever you follow against damage they took, from 0 at the bottom. Each hit is a mark in the strip along the bottom",
  axisWidth: 42,
  legend: (followKey) => [
    {
      label: "dealt", color: DEALT_COLOR, line: true,
      help: followKey === "me"
        ? "Damage you dealt per second over the last 6 seconds: hitsplats the game marks as yours"
        : "Damage they dealt per second over the last 6 seconds, from projectiles that landed. Other players' melee can't be told apart from anyone else's, so it isn't counted",
    },
    { label: "taken", color: TAKEN_COLOR, line: true, help: "Damage they took per second over the last 6 seconds: their hitsplats, heals left out" },
    { label: "hits", color: "#8d877d", top: true, help: "Along the bottom: each hit dealt (upper row) and taken (lower row)" },
  ],
  draw(ctx, a) {
    const { from, to, dpr, x } = a;
    const s = damageSeries(a.session, a.followKey);
    const { scale, strip } = damageScale(a, s);
    drawAxis(ctx, a, scale, (v) => (v === 0 ? "0" : `${formatRate(v)}/s`));
    drawSeries(ctx, a, scale, (t) => rateAt(s.takenSum, t), TAKEN_COLOR, 0.16);
    drawSeries(ctx, a, scale, (t) => rateAt(s.dealtSum, t), DEALT_COLOR, 0.16);
    // Each hit: dealt in the upper row of the strip, taken in the lower
    const row = Math.max(dpr, Math.floor(strip / 2));
    const markW = Math.max(dpr, a.tickW);
    for (let t = from; t <= to; t++) {
      if (s.dealt[t]) { ctx.fillStyle = DEALT_COLOR; ctx.fillRect(x(t), a.H - 2 * row, markW, row - (row > 2 * dpr ? dpr : 0)); }
      if (s.taken[t]) { ctx.fillStyle = TAKEN_COLOR; ctx.fillRect(x(t), a.H - row, markW, row); }
    }
  },
  linesAt(a, t) {
    const hits = a.session.events(t).filter((l) => l.e === "hit");
    return [...hits.filter((l) => dealtBy(a.session, l, a.followKey)), ...hits.filter((l) => takenBy(l, a.followKey))];
  },
  note(a, t) {
    const s = damageSeries(a.session, a.followKey);
    return `last 6 s: dealt ${formatRate(rateAt(s.dealtSum, t))}/s · taken ${formatRate(rateAt(s.takenSum, t))}/s\nthis tick: dealt ${s.dealt[t] ?? 0} · taken ${s.taken[t] ?? 0}`;
  },
  drawHover(ctx, a, t) {
    const s = damageSeries(a.session, a.followKey);
    drawGuide(ctx, a, t, damageScale(a, s).scale, [[rateAt(s.takenSum, t), TAKEN_COLOR], [rateAt(s.dealtSum, t), DEALT_COLOR]]);
  },
};

// ---------- Stats: your hitpoints, prayer, run energy and special attack, as shares of their maximum ----------

interface Stat {
  label: string;
  color: string;
  /** Now and the most it goes to normally, from a tick's snapshot of you */
  read(me: TickMe): [number, number];
  /** How the value reads in the tooltip */
  show(now: number, max: number): string;
}

type TickMe = { hpNow: number; hpMax: number; prayNow: number; prayMax: number; run: number; spec: number };

// The colours of the game's orbs
const STATS: Stat[] = [
  { label: "HP", color: "#e5534b", read: (m) => [m.hpNow, m.hpMax], show: (n, m) => `${n}/${m}` },
  { label: "prayer", color: "#a77ce8", read: (m) => [m.prayNow, m.prayMax], show: (n, m) => `${n}/${m}` },
  { label: "run", color: "#e2b23a", read: (m) => [m.run / 100, 100], show: (n) => `${Math.floor(n)}%` },
  { label: "spec", color: "#4aa3e8", read: (m) => [m.spec / 10, 100], show: (n) => `${Math.floor(n)}%` },
];

/** A stat at tick t as a percentage of its maximum (boosts go over 100), or undefined if not recorded */
function statAt(session: Session, stat: Stat, t: number): number | undefined {
  const me = session.tickAt(Math.floor(t))?.me as TickMe | undefined;
  if (!me) return undefined;
  const [now, max] = stat.read(me);
  return max > 0 ? (100 * now) / max : undefined;
}

/** The stats view's scale: 100%, or more when a boost (a brew, say) takes a stat over its maximum */
function statsScale(a: TimelineArea): Scale {
  let peak = 100;
  for (let t = a.from; t <= a.to; t++) for (const stat of STATS) peak = Math.max(peak, statAt(a.session, stat, t) ?? 0);
  return scaleFor(a, Math.ceil(peak / 10) * 10);
}

const stats: TimelineView = {
  id: "stats",
  name: "Stats",
  help: "Your hitpoints, prayer, run energy and special attack over time, as a share of each one's maximum. The recording has these for you only",
  axisWidth: 42,
  legend: (followKey) => STATS.map((s) => ({
    label: s.label, color: s.color, line: true,
    help: `Your ${s.label === "HP" ? "hitpoints" : s.label === "spec" ? "special attack energy" : s.label === "run" ? "run energy" : s.label} as a share of its maximum${followKey === "me" ? "" : ", whoever you follow: the recording has stats for you only"}`,
  })),
  draw(ctx, a) {
    const scale = statsScale(a);
    drawAxis(ctx, a, scale, (v) => `${Math.round(v)}%`);
    for (const stat of STATS) drawSeries(ctx, a, scale, (t) => statAt(a.session, stat, t), stat.color);
  },
  linesAt: () => [],
  note(a, t) {
    const me = a.session.tickAt(t)?.me as TickMe | undefined;
    if (!me) return "no stats recorded on this tick";
    return STATS.map((s) => `${s.label} ${s.show(...s.read(me))}`).join(" · ");
  },
  drawHover(ctx, a, t) {
    drawGuide(ctx, a, t, statsScale(a), STATS.map((s) => [statAt(a.session, s, t), s.color]));
  },
};

/** The smallest of 1, 2, 2.5, 5 and 10 times a power of ten at or above v, for a readable axis */
export function niceCeiling(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v - 1e-9) ?? 10) * p;
}

export function formatRate(v: number): string {
  return v >= 10 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
}

export const VIEWS: TimelineView[] = [tickEvents, damage, stats];

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
