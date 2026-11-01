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
// Most clicks arrive the cycle after their press, at about the same spot
const SAME_CLICK_CYCLES = 3;
// Inventory clicks only arrive when the button comes up, by when the mouse may have moved off the slot
const RELEASE_CYCLES = 50;

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
  const presses = session.lines.filter((l) => l.e === "press" && l.button === 1);
  const pressOf = pairPresses(clicks, presses);
  const points: ClickPoint[] = [];
  for (const c of clicks) {
    if (!c.wb || c.mx == null) continue;
    const button = buttonOf(c);
    const press = pressOf.get(c);
    // Where you pressed, not where the mouse had got to by the time the click arrived
    const at = press && distance(press.mx, press.my, c.wb) === 0 ? press : c;
    if (button) points.push({ button, ...relative(at.mx, at.my, c.wb), hit: true, t: c.t, c: c.c });
  }
  const produced = new Set(pressOf.values());
  for (const p of presses) {
    if (produced.has(p)) continue;
    const layout = latestAtOrBefore(layouts, p.t);
    const near = layout && nearestButton(layout, p.mx, p.my, prayerOf);
    if (near) points.push({ button: near.button, ...relative(p.mx, p.my, near.rect), hit: false, t: p.t, c: p.c });
  }
  return points;
}

/**
 * The press behind each click, each press making one click: the latest free one on the clicked button,
 * or failing that one just before the click. A "Cancel" did nothing, so its press stays free
 */
function pairPresses(clicks: Line[], presses: Line[]): Map<Line, Line> {
  const pressOf = new Map<Line, Line>();
  const taken = new Set<Line>();
  let after = 0;
  for (const c of clicks) {
    while (after < presses.length && presses[after].c <= c.c) after++;
    if (c.option === "Cancel") continue;
    let onButton: Line | undefined;
    let justBefore: Line | undefined;
    for (let i = after - 1; i >= 0 && c.c - presses[i].c <= RELEASE_CYCLES && !onButton; i--) {
      const p = presses[i];
      if (taken.has(p)) continue;
      if (c.wb && distance(p.mx, p.my, c.wb) === 0) onButton = p;
      else if (c.c - p.c <= SAME_CLICK_CYCLES) justBefore ??= p;
    }
    const press = onButton ?? justBefore;
    if (press) {
      taken.add(press);
      pressOf.set(c, press);
    }
  }
  return pressOf;
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
