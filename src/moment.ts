import { refKey, type ActorState, type Line, type Session } from "./session";

/**
 * What the scene looks like at a moment between two ticks. Tick lines snapshot each actor's drawn
 * position at the end of a tick; between snapshots actors glide in a straight line, as the client
 * moves them a step at a time.
 */

export interface ActorFrame {
  key: string;
  kind: "me" | "npc" | "player";
  state: ActorState;
  size: number;
  /** Drawn centre, in tiles */
  x: number;
  y: number;
  /** Facing, in the client's 2048-step circle: 0 south, 512 west, 1024 north, 1536 east */
  orientation: number;
}

// Further than this between ticks is a teleport, not a walk
const MAX_GLIDE_TILES = 4;

export function lerpAngle(from: number, to: number, f: number): number {
  let d = (to - from) % 2048;
  if (d > 1024) d -= 2048;
  if (d < -1024) d += 2048;
  return (from + d * f + 2048) % 2048;
}

export function actorsAt(session: Session, t: number, frac: number): ActorFrame[] {
  const now = session.tickAt(t);
  if (!now) return [];
  const later = frac > 0 ? session.ticks[t + 1] : undefined;
  const next = new Map<string, ActorState>();
  if (later) {
    for (const a of [later.me, ...later.npcs, ...(later.players ?? [])]) if (a) next.set(refKey(a.who), a);
  }
  const frames: ActorFrame[] = [];
  for (const a of [...now.npcs, ...(now.players ?? []), now.me]) {
    if (!a || a.lx == null || a.ly == null || !a.who) continue;
    const key = refKey(a.who);
    const n = next.get(key);
    let x = a.lx / 128;
    let y = a.ly / 128;
    let orientation = a.o;
    if (n && n.lx != null && n.ly != null) {
      const nx = n.lx / 128;
      const ny = n.ly / 128;
      if (Math.abs(nx - x) <= MAX_GLIDE_TILES && Math.abs(ny - y) <= MAX_GLIDE_TILES) {
        x += (nx - x) * frac;
        y += (ny - y) * frac;
      }
      orientation = lerpAngle(a.o, n.o, frac);
    }
    frames.push({
      key,
      kind: a.who.k === "npc" ? "npc" : a.who.k === "player" ? "player" : "me",
      state: a,
      size: session.sizeOf(a.who),
      x,
      y,
      orientation,
    });
  }
  return frames;
}

/** The client cycle (20 ms steps) at a moment, from the cycles stamped on the tick lines */
export function cycleAt(session: Session, t: number, frac: number): number {
  const now = session.tickAt(t);
  if (!now) return 0;
  const later = session.ticks[t + 1];
  return later ? now.c + (later.c - now.c) * frac : now.c + 30 * frac;
}

/**
 * Events of a kind that have happened by a moment between tick t and t + 1. Lines carry the label of the
 * tick that ends their window, so the events playing out between snapshot t and t + 1 are labelled
 * t + 1: they're included up to the moment's client cycle
 */
export function happened(session: Session, t: number, ticks: number, event: string, cycle: number): Line[] {
  return recent(session, t + 1, ticks + 1, event).filter((l) => l.c <= cycle);
}

/** Events of a kind from the last few ticks, for things that stay on screen a while */
export function recent(session: Session, t: number, ticks: number, event: string): Line[] {
  const out: Line[] = [];
  for (let i = Math.max(0, t - ticks + 1); i <= t; i++) {
    for (const l of session.events(i)) if (l.e === event) out.push(l);
  }
  return out;
}
