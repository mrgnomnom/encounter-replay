/**
 * Cutting a recording down to a span of ticks for sharing: renumbered to start at 0, with whatever the
 * replay needs from before the span carried in at its start (the map, definitions, who's present and how
 * they look, your inventory, stats, varbits and open interfaces, and items on the ground). Players can be
 * renamed on the way. Used by the page's Export and by scripts/trim-session.ts.
 */

export type RawLine = Record<string, unknown> & { t: number; c: number; e: string };

export interface TrimOptions {
  /** Old name to new name, matched however the game spaced the name */
  renames?: [string, string][];
}

const key = (ref: unknown) => JSON.stringify(ref ?? null);

export function trimLines(lines: RawLine[], from: number, to: number, options: TrimOptions = {}): RawLine[] {
  const last = lines.reduce((m, l) => Math.max(m, l.t ?? 0), 0);
  let out: RawLine[];
  if (from <= 0) {
    // From the start nothing needs carrying in: everything up to the end of the span, as it was
    out = lines.filter((l) => (l.t ?? 0) <= to && (to >= last || l.e !== "end"));
    if (to < last) out.push(endLine(out, to, from));
  } else {
    out = cut(lines, from, to);
  }
  return options.renames?.length ? out.map((l) => rename(l, options.renames!) as RawLine) : out;
}

function endLine(lines: RawLine[], to: number, from: number): RawLine {
  return { t: to - Math.max(0, from), c: lines[lines.length - 1]?.c ?? 0, e: "end", reason: "trimmed", ticks: to - Math.max(0, from) };
}

function cut(lines: RawLine[], from: number, to: number): RawLine[] {
  const before = lines.filter((l) => l.t < from);
  const inside = lines.filter((l) => l.t >= from && l.t <= to);
  // State as it stands when the span starts
  const latest = new Map<string, RawLine>();
  const defs: RawLine[] = [];
  const present = new Map<string, RawLine>();
  const openWidgets = new Map<unknown, RawLine>();
  const groundItems: RawLine[] = [];
  let header: RawLine | undefined;
  let scene: RawLine | undefined;
  const itemKey = (l: RawLine) => `${l.id}@${l.x},${l.y},${l.p}`;
  for (const l of before) {
    switch (l.e) {
      case "header": header = l; break;
      case "scene": scene = l; groundItems.length = 0; break;
      case "npcdef": case "itemdef": defs.push(l); break;
      case "npc_spawn": case "player_spawn": present.set(key(l.who), l); break;
      case "npc_gone": case "player_gone": present.delete(key(l.who)); break;
      case "look": case "moves": case "target": case "npc_changed": latest.set(`${l.e}:${key(l.who)}`, l); break;
      case "items": latest.set(`items:${l.which}`, l); break;
      case "stat": latest.set(`stat:${l.skill}`, l); break;
      case "var": latest.set(`var:${l.varp}:${l.varbit}`, l); break;
      case "ui_tab": case "ui_layout": latest.set(l.e, l); break;
      case "ui_widgets": latest.set(`ui_widgets:${l.group}`, l); break;
      case "widget_open": openWidgets.set(l.group, l); break;
      case "widget_close": openWidgets.delete(l.group); break;
      case "item": groundItems.push(l); break;
      case "item_gone": {
        const i = groundItems.findIndex((g) => itemKey(g) === itemKey(l));
        if (i >= 0) groundItems.splice(i, 1);
        break;
      }
      // Moments that are over by the time the span starts
      default: break;
    }
  }
  if (!header || !scene) throw new Error("The recording has no header or map load before the span");
  // Whoever's present at the start: their spawn, and the state lines that only make sense once they exist
  const stillHere = (l: RawLine) => !l.who || (l.who as { k?: string }).k === "me" || present.has(key(l.who));
  const carried: RawLine[] = [
    { ...header, trimmed: { from, to, ticks: to - from } },
    scene,
    ...defs,
    ...present.values(),
    ...[...latest.values()].filter(stillHere),
    ...openWidgets.values(),
    ...groundItems,
  ].map((l) => ({ ...l, t: 0 }));
  const kept = inside.filter((l) => l.e !== "header" && l.e !== "end").map((l) => ({ ...l, t: l.t - from }));
  return [...carried, ...kept, endLine(inside, to, from)];
}

/** Renames in every string anywhere in a line */
function rename(v: unknown, renames: [string, string][]): unknown {
  if (typeof v === "string") return renames.reduce((s, [old, now]) => s.replace(namePattern(old), now), v);
  if (Array.isArray(v)) return v.map((x) => rename(x, renames));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x, renames)]));
  return v;
}

export function namePattern(name: string): RegExp {
  const words = name.replace(/ /g, " ").trim().split(/[ _-]+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![A-Za-z0-9])${words.join("[ _\\u00A0-]")}(?![A-Za-z0-9])`, "gi");
}

/** Every player name a recording mentions: yours, and everyone else's, in the order they appear */
export function playerNames(lines: RawLine[]): { own: string | undefined; others: string[] } {
  let own: string | undefined;
  const others: string[] = [];
  for (const l of lines) {
    if ((l.e !== "look" && l.e !== "player_spawn") || typeof l.name !== "string" || !l.name) continue;
    const who = l.who as { k?: string } | undefined;
    if (who?.k === "me") own ??= l.name;
    else if (!others.includes(l.name)) others.push(l.name);
  }
  return { own, others };
}

export function toJsonl(lines: RawLine[]): string {
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}
