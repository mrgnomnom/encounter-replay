import * as THREE from "three";
import type { Bundle } from "./cache/bundle";
import { RigMesh } from "./cache/models";
import { Rig } from "./cache/rig";
import type { Line, Session } from "./session";
import { toThree, type World } from "./world";

/**
 * Items lying on the ground, from "item" and "item_gone" lines: when each appeared and left, drawn with
 * its inventory model as the game draws ground items. Items sharing a tile all lie on the floor.
 */

export interface GroundItem {
  line: Line;
  from: number;
  /** First tick it's gone on, or Infinity */
  until: number;
}

export function groundItems(session: Session): GroundItem[] {
  const items: GroundItem[] = [];
  const open = new Map<string, GroundItem[]>();
  const key = (l: Line) => `${l.id}@${l.sx},${l.sy},${l.p}`;
  for (const l of session.lines) {
    if (l.e === "scene") {
      // A map load replaces everything; items still there arrive again as spawns
      for (const list of open.values()) for (const i of list) i.until = Math.min(i.until, l.t);
      open.clear();
    } else if (l.e === "item") {
      const i: GroundItem = { line: l, from: l.t, until: Infinity };
      items.push(i);
      const list = open.get(key(l)) ?? [];
      list.push(i);
      open.set(key(l), list);
    } else if (l.e === "item_gone") {
      const i = open.get(key(l))?.shift();
      if (i) i.until = l.t;
    }
  }
  return items;
}

/** The item a stack of this size looks like: coins and arrows change model with the stack */
function lookOf(bundle: Bundle, id: number, qty: number): number {
  const def = bundle.item(id);
  if (!def?.countObj || !def.countCo) return id;
  let look = id;
  def.countCo.forEach((count, i) => {
    if (count > 0 && qty >= count && def.countObj![i] > 0) look = def.countObj![i];
  });
  return look;
}

export class GroundItemLayer {
  readonly group = new THREE.Group();
  private items: GroundItem[] = [];
  private bundle: Bundle | undefined;
  private readonly meshes = new Map<GroundItem, { object: THREE.Object3D; model?: RigMesh }>();
  private shown = "";
  /** The tile of a hovered "Take" click: its items pulse */
  pulseTile: { sx: number; sy: number } | undefined;

  load(session: Session, bundle: Bundle | undefined): void {
    this.clear();
    this.items = groundItems(session);
    this.bundle = bundle;
  }

  show(t: number, plane: number, world: World): void {
    const alive = this.items.filter((i) => i.from <= t && t < i.until && i.line.p <= plane);
    const key = `${plane}:${alive.length}:${alive.map((i) => i.line.c).join(",")}`;
    if (key !== this.shown) {
      this.shown = key;
      const keep = new Set(alive);
      for (const [i, m] of this.meshes) {
        if (keep.has(i)) continue;
        m.object.removeFromParent();
        m.model?.dispose();
        this.meshes.delete(i);
      }
      // Every item lies on the floor, overlapping others on its tile, as the game draws them
      for (const i of alive) {
        const l = i.line;
        let m = this.meshes.get(i);
        if (!m) {
          m = this.make(l);
          this.meshes.set(i, m);
          this.group.add(m.object);
        }
        const x = l.lx / 128;
        const y = l.ly / 128;
        toThree(x, y, world.standAt(x, y, l.p), m.object.position);
      }
    }
    const pulse = 1 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 140));
    for (const [i, m] of this.meshes) {
      const hit = this.pulseTile && i.line.sx === this.pulseTile.sx && i.line.sy === this.pulseTile.sy;
      m.object.scale.setScalar(hit ? pulse : 1);
    }
  }

  clear(): void {
    for (const m of this.meshes.values()) {
      m.object.removeFromParent();
      m.model?.dispose();
    }
    this.meshes.clear();
    this.shown = "";
  }

  private make(l: Line): { object: THREE.Object3D; model?: RigMesh } {
    const bundle = this.bundle;
    const def = bundle?.item(lookOf(bundle, l.id, l.qty ?? 1));
    const model = def && def.ground >= 0 ? bundle!.model(def.ground) : undefined;
    if (bundle && def && model) {
      const rig = new RigMesh({ rig: new Rig([{ model, recolors: def }], bundle), placement: { scale: def.resize } });
      return { object: rig.mesh, model: rig };
    }
    // Without a model: a small marker so the item isn't lost
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0xe8c547 }));
    box.position.y = 0.06;
    const group = new THREE.Group();
    group.add(box);
    return { object: group };
  }
}
