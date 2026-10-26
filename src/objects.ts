import type { Line, Session } from "./session";

/**
 * Which objects exist at each tick. Instance recordings list every object when the map loads
 * ("obj" with init) and every spawn and removal after it; those are how many mechanics show up,
 * like mushrooms growing through stages or markers swapping in under a boss.
 */

export interface PlacedObject {
  line: Line;
  /** The scene floor it stands on */
  plane: number;
  /** True for objects that appeared after the map loaded: the ones mechanics create */
  spawned: boolean;
  from: number;
  /** First tick it's gone on, or Infinity if it never left */
  until: number;
}

const placeKey = (l: Line) => `${l.id}@${l.x},${l.y},${l.pl ?? l.p}`;
// A map dump lists floor 0's objects west to east, then floor 1's, and so on: a jump back west by more
// than this starts the next floor. Recordings before format 3 only have this to go on
const FLOOR_JUMP_TILES = 20;

export class ObjectTimeline {
  readonly objects: PlacedObject[] = [];
  readonly names = new Map<number, string>();

  constructor(session: Session) {
    const open = new Map<string, PlacedObject[]>();
    const close = (o: PlacedObject, t: number) => { o.until = t; };
    let yourFloor = 0;
    let dumpFloor = 0;
    let lastX: number | undefined;
    for (const l of session.lines) {
      switch (l.e) {
        case "objdef":
          this.names.set(l.def.id, l.def.name);
          break;
        case "scene":
          // A map load replaces everything; the objects that are still there are listed again after it
          for (const list of open.values()) list.forEach((o) => close(o, l.t));
          open.clear();
          yourFloor = l.plane ?? 0;
          dumpFloor = 0;
          lastX = undefined;
          break;
        case "obj": {
          let plane: number;
          if (l.pl != null) {
            plane = l.pl;
          } else if (l.init) {
            if (lastX !== undefined && l.sx < lastX - FLOOR_JUMP_TILES) dumpFloor++;
            lastX = l.sx;
            plane = dumpFloor;
          } else {
            // Spawned objects in older recordings: most mechanics spawn on the floor you're on
            plane = yourFloor;
          }
          const o: PlacedObject = { line: l, plane, spawned: !l.init, from: l.t, until: Infinity };
          this.objects.push(o);
          const key = placeKey(l);
          const list = open.get(key);
          if (list) list.push(o);
          else open.set(key, [o]);
          break;
        }
        case "obj_gone": {
          const list = open.get(placeKey(l));
          const o = list?.shift();
          if (o) close(o, l.t);
          break;
        }
      }
    }
  }

  /**
   * Adds the cache's objects for an open-world map load (the recorder doesn't list them there): each
   * as id, sceneX, sceneY, floor, shape, rotation. sizeOf gives an object's footprint
   */
  addMapObjects(scene: Line, until: number, placed: Int32Array, sizeOf: (id: number) => [number, number]): void {
    const base = { x: scene.baseX ?? 0, y: scene.baseY ?? 0 };
    for (let i = 0; i + 5 < placed.length; i += 6) {
      const [id, sx, sy, plane, type, rotation] = placed.subarray(i, i + 6);
      // Scenery and roofs cover their footprint, turned with the object; walls and decorations one tile
      let [w, l] = type >= 10 && type <= 21 ? sizeOf(id) : [1, 1];
      if (rotation % 2 === 1) [w, l] = [l, w];
      const kind = type >= 10 && type <= 21 ? "game" : type === 22 ? "ground" : type >= 4 && type <= 8 ? "decor" : "wall";
      const line: Line = {
        t: scene.t, c: scene.c, e: "obj", init: true, id, kind, config: type | (rotation << 6), w, l,
        x: base.x + sx, y: base.y + sy, p: plane, pl: plane, sx, sy, lx: Math.round((sx + w / 2) * 128), ly: Math.round((sy + l / 2) * 128),
      };
      this.objects.push({ line, plane, spawned: false, from: scene.t, until });
    }
  }

  at(t: number): PlacedObject[] {
    return this.objects.filter((o) => o.from <= t && t < o.until);
  }

  name(id: number): string {
    const name = this.names.get(id);
    return name && name !== "null" ? name : "";
  }
}
