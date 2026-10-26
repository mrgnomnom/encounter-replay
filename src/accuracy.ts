import { latestAtOrBefore, type Line, type Session } from "./session";

/**
 * Where on each button your clicks landed, and how far off your misses were. Needs a format 4
 * recording: clicks carry the clicked button's rectangle ("wb"), every mouse press is a "press" line,
 * and "ui_layout" lines say where the prayer and inventory buttons were.
 *
 * Positions are fractions of the button: (0, 0) its top left, (1, 1) its bottom right, (0.5, 0.5) dead
 * centre. Misses can land outside 0-1.
 */

export interface ClickPoint {
  /** "prayer:PROTECT_FROM_MAGIC" or "inv:12" */
  button: string;
  x: number;
  y: number;
  hit: boolean;
  t: number;
  c: number;
}

const PRAYER_INTERFACE = 541;
const INVENTORY_INTERFACE = 149;
// A press this close to a button is a miss aimed at it; further away it was meant for something else
const MISS_RADIUS_PX = 12;
// A press and the click it produced arrive within a few cycles of each other
const SAME_CLICK_CYCLES = 3;

type Rect = [number, number, number, number];

export function hasAccuracyData(session: Session): boolean {
  return session.lines.some((l) => l.e === "click" && l.wb);
}

export function clickPoints(session: Session): ClickPoint[] {
  const clicks = session.lines.filter((l) => l.e === "click");
  const layouts = session.lines.filter((l) => l.e === "ui_layout");
  // Which prayer each prayer-book component is, learned from clicks on them
  const prayerOf = new Map<number, string>();
  for (const c of clicks) {
    if (c.widget?.[0] === PRAYER_INTERFACE && c.target) prayerOf.set(c.widget[1], String(c.target).toUpperCase().replace(/ /g, "_"));
  }
  const points: ClickPoint[] = [];
  for (const c of clicks) {
    if (!c.wb || c.mx == null) continue;
    const button = buttonOf(c);
    if (button) points.push({ button, ...relative(c.mx, c.my, c.wb), hit: true, t: c.t, c: c.c });
  }
  for (const p of session.lines) {
    if (p.e !== "press" || p.button !== 1) continue;
    const produced = clicks.some((c) => Math.abs(c.c - p.c) <= SAME_CLICK_CYCLES && c.mx === p.mx && c.my === p.my && c.option !== "Cancel");
    if (produced) continue;
    const layout = latestAtOrBefore(layouts, p.t);
    const near = layout && nearestButton(layout, p.mx, p.my, prayerOf);
    if (near) points.push({ button: near.button, ...relative(p.mx, p.my, near.rect), hit: false, t: p.t, c: p.c });
  }
  return points;
}

function buttonOf(c: Line): string | undefined {
  if (c.widget?.[0] === PRAYER_INTERFACE && c.target) return `prayer:${String(c.target).toUpperCase().replace(/ /g, "_")}`;
  if (c.widget?.[0] === INVENTORY_INTERFACE && c.p0 >= 0) return `inv:${c.p0}`;
  return undefined;
}

function relative(mx: number, my: number, r: Rect): { x: number; y: number } {
  return { x: (mx - r[0]) / Math.max(1, r[2]), y: (my - r[1]) / Math.max(1, r[3]) };
}

/** Distance in pixels from a point to a rectangle, 0 if inside */
function distance(mx: number, my: number, r: Rect): number {
  const dx = Math.max(r[0] - mx, 0, mx - (r[0] + r[2]));
  const dy = Math.max(r[1] - my, 0, my - (r[1] + r[3]));
  return Math.hypot(dx, dy);
}

function nearestButton(layout: Line, mx: number, my: number, prayerOf: Map<number, string>): { button: string; rect: Rect } | undefined {
  let best: { button: string; rect: Rect; d: number } | undefined;
  const consider = (button: string | undefined, rect: Rect) => {
    if (!button) return;
    const d = distance(mx, my, rect);
    if (d <= MISS_RADIUS_PX && (!best || d < best.d)) best = { button, rect, d };
  };
  for (const [x, y, w, h, component] of layout.prayer ?? []) consider(prayerOf.has(component) ? `prayer:${prayerOf.get(component)}` : undefined, [x, y, w, h]);
  for (const [x, y, w, h, slot] of layout.inv ?? []) consider(`inv:${slot}`, [x, y, w, h]);
  return best;
}

/** How far from dead centre a set of clicks landed, as a fraction of the button's half-size */
export function spread(points: ClickPoint[]): { hits: number; misses: number; meanOffCentre: number } {
  const hits = points.filter((p) => p.hit);
  const off = hits.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5) / 0.5);
  return { hits: hits.length, misses: points.length - hits.length, meanOffCentre: off.length ? off.reduce((a, b) => a + b, 0) / off.length : 0 };
}
