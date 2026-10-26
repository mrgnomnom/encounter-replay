import { refKey, stoppedTargeting, type Line, type Ref, type Session } from "./session";

/**
 * What a log line or a click refers to, so hovering it can point at the thing in the scene or the side
 * panel: an actor, a tile, a hitsplat, an animation to loop, or a button in the side panel.
 */

export type Target =
  | { kind: "actor"; key: string }
  /** Play this animation on the actor, from the start, on loop, with the effects that come with it */
  | { kind: "anim"; key: string; anim: number; line: Line }
  | { kind: "hit"; line: Line }
  /** A dotted line from one actor to another: who targets whom, a projectile's path */
  | { kind: "link"; from: string; to: string }
  /** Scene tile, as the menu entries and graphics give it; for a walk click, its marker pulses instead */
  | { kind: "tile"; sx: number; sy: number; walk?: boolean; item?: boolean }
  /** A side panel button: an inventory slot, a prayer, or a worn item slot */
  | { kind: "slot"; tab: 3 | 4 | 5; inv?: number; prayer?: string; worn?: number };

const INVENTORY_INTERFACE = 149;
const PRAYER_INTERFACE = 541;
const WORN_INTERFACE = 387;

const actor = (ref: Ref | undefined): Target[] => (ref && ref.k !== "other" ? [{ kind: "actor", key: refKey(ref) }] : []);

export function targetsOf(line: Line, session: Session): Target[] {
  switch (line.e) {
    case "click":
      return clickTargets(line, session);
    case "anim":
      return line.a !== -1 ? [{ kind: "anim", key: refKey(line.who), anim: line.a, line }] : actor(line.who);
    case "hit":
      // The hitsplat pulses and a line runs to it from whoever dealt it: no ring
      return [{ kind: "hit", line }];
    case "proj":
      return line.from && line.to ? [{ kind: "link", from: refKey(line.from), to: refKey(line.to) }] : [...actor(line.from), ...actor(line.to)];
    case "item":
    case "item_gone":
      return line.sx != null ? [{ kind: "tile", sx: line.sx, sy: line.sy, item: true }] : [];
    case "gfx":
    case "area_sound":
      return line.sx != null ? [{ kind: "tile", sx: line.sx, sy: line.sy }] : [];
    case "target":
      // Who targets whom is a line between them; with no target, just who stopped
      if (line.at) return [{ kind: "link", from: refKey(line.who), to: refKey(line.at) }];
      {
        // Stopped targeting: point from them to what they let go of
        const was = stoppedTargeting(session, line);
        return was ? [{ kind: "link", from: refKey(line.who), to: refKey(was) }] : actor(line.who);
      }
    case "sound":
      return actor(line.from);
    case "items":
      return [{ kind: "slot", tab: line.which === "worn" ? 4 : 3 }];
    default:
      return actor(line.who);
  }
}

// Clicks that send you somewhere: a new one of these ends the walk before it
const MOVES = /^(WALK|NPC_|PLAYER_|GAME_OBJECT_|GROUND_ITEM_)/;
const walkTiles = new WeakMap<Line, { sx: number; sy: number } | null>();

/**
 * Where a walk click sends you. Recordings from format 4 note the clicked tile (a walk click's menu
 * params are only the mouse position). For older ones it's where your server tile settled after the
 * click, before your next click that moved you elsewhere: where you walked, which can fall short of
 * where you clicked if the path was blocked
 */
export function walkTile(session: Session, click: Line): { sx: number; sy: number } | undefined {
  if (click.tile?.sx != null) return { sx: click.tile.sx, sy: click.tile.sy };
  let cached = walkTiles.get(click);
  if (cached === undefined) {
    cached = null;
    const clicks = session.lines.filter((l) => l.e === "click" && MOVES.test(String(l.action ?? "")));
    const next = clicks.find((l) => l.c > click.c);
    // A later move in the same tick reaches the server with this one, and wins
    if (!next || next.t > click.t) {
      const stop = next ? next.t - 1 : click.t + 40;
      let last: { sx: number; sy: number } | undefined;
      let moved = false;
      for (let t = click.t; t <= Math.min(stop, click.t + 40); t++) {
        const tile = session.ticks[t]?.me?.tile;
        if (!tile) continue;
        const still = last && tile.sx === last.sx && tile.sy === last.sy;
        if (last && !still) moved = true;
        last = { sx: tile.sx, sy: tile.sy };
        // Arrived: moving, then a tick standing on the same tile
        if (moved && still) break;
      }
      cached = last ?? null;
    }
    walkTiles.set(click, cached);
  }
  return cached ?? undefined;
}

function clickTargets(c: Line, session: Session): Target[] {
  const iface = c.widget?.[0];
  if (iface === INVENTORY_INTERFACE && c.p0 >= 0) return [{ kind: "slot", tab: 3, inv: c.p0 }];
  if (iface === PRAYER_INTERFACE && c.target) return [{ kind: "slot", tab: 5, prayer: String(c.target).toUpperCase().replace(/ /g, "_") }];
  if (iface === WORN_INTERFACE && c.item > 0) {
    // The worn slot holding the clicked item at the time
    const worn = session.itemsAt("worn", c.t);
    const slot = worn.findIndex(([id]) => id === c.item);
    return [{ kind: "slot", tab: 4, worn: slot >= 0 ? slot : undefined }];
  }
  const action = String(c.action ?? "");
  // NPC and player menu entries carry the actor's index; scene entries carry the tile
  if (action.startsWith("NPC_") && c.id >= 0) return [{ kind: "actor", key: refKey({ k: "npc", i: c.id, id: 0 }) }];
  if (action.startsWith("PLAYER_") && c.id >= 0) return [{ kind: "actor", key: refKey({ k: "player", i: c.id }) }];
  if (action === "WALK") {
    const to = walkTile(session, c);
    return to ? [{ kind: "tile", sx: to.sx, sy: to.sy, walk: true }] : [];
  }
  // Ground items pulse themselves rather than getting a square
  if (action.startsWith("GROUND_ITEM_")) return [{ kind: "tile", sx: c.p0, sy: c.p1, item: true }];
  if (action.startsWith("GAME_OBJECT_") || action === "EXAMINE_OBJECT") {
    return [{ kind: "tile", sx: c.p0, sy: c.p1 }];
  }
  return [];
}
