import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Bundle } from "./cache/bundle";
import { mergeStatic, objectFrameAt, objectModel, RigMesh, type Built, type GroundAt } from "./cache/models";
import type { ObjectTimeline, PlacedObject } from "./objects";
import { toThree, type World } from "./world";

/**
 * Draws objects. With a cache bundle they use their game models, turned and scaled as the game does;
 * scenery that stays put for a whole map load is merged into one mesh, and objects that mechanics
 * spawn or that animate get their own, labelled with name, animation and age. Without a bundle, or
 * for objects it lacks, they're boxes on their footprint.
 */

const NAMED_HEIGHT = 0.7;
const MARKER_HEIGHT = 0.06;
const SCENERY_HEIGHT = 0.3;

function colorFor(id: number): THREE.Color {
  // Golden-ratio hues keep neighbouring IDs (like a mushroom's growth stages) far apart in colour
  return new THREE.Color().setHSL(((id * 0.618033988749895) % 1 + 1) % 1, 0.65, 0.55);
}

interface Dynamic {
  object: THREE.Object3D;
  model?: RigMesh;
  anim: number;
  spawnCycle: number;
}

export class ObjectLayer {
  readonly group = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly materials = new Map<number, THREE.MeshLambertMaterial>();
  private readonly merged = new Map<string, THREE.Object3D | null>();
  private readonly dynamic = new Map<PlacedObject, Dynamic>();
  private bundle: Bundle | undefined;
  private shown: { t: number; plane: number; scenery: boolean; timeline?: ObjectTimeline } = { t: -1, plane: -1, scenery: false };

  load(bundle: Bundle | undefined): void {
    this.clear();
    for (const m of this.merged.values()) if (m) disposeTree(m);
    this.merged.clear();
    this.bundle = bundle;
  }

  /** Puts the objects alive at tick t in place; call animate every frame after */
  show(timeline: ObjectTimeline, t: number, plane: number, world: World, scenery: boolean, sceneStart: number, sceneEnd: number): void {
    const s = this.shown;
    if (s.timeline === timeline && s.t === t && s.plane === plane && s.scenery === scenery) return;
    this.shown = { t, plane, scenery, timeline };
    for (const child of [...this.group.children]) this.group.remove(child);

    // Floors below yours show, as in game; floors above are hidden, as the game hides roofs
    const alive = timeline.at(t).filter((o) => o.plane <= plane && o.line.lx != null);
    const lasting = (o: PlacedObject) => !o.spawned && o.until >= sceneEnd && this.animOf(o) < 0;

    if (this.bundle) {
      const key = `${sceneStart}:${plane}`;
      if (!this.merged.has(key)) this.merged.set(key, this.mergeScenery(alive.filter(lasting), world, plane, sceneStart));
      const m = this.merged.get(key);
      if (m && scenery) this.group.add(m);
    } else if (scenery) {
      const map = alive.filter((o) => !o.spawned);
      if (map.length) this.group.add(this.boxes(map, world));
    }

    const keep = new Set<PlacedObject>();
    for (const o of alive) {
      if (this.bundle ? lasting(o) : !o.spawned) continue;
      if (!o.spawned && !scenery) continue;
      keep.add(o);
      let d = this.dynamic.get(o);
      if (!d) {
        d = this.makeDynamic(o, timeline, world);
        this.dynamic.set(o, d);
      }
      this.updateLabel(d, o, timeline, t);
      this.group.add(d.object);
    }
    for (const [o, d] of this.dynamic) {
      if (!keep.has(o)) {
        d.model?.dispose();
        d.object.traverse((c) => { if (c instanceof CSS2DObject) c.element.remove(); });
        this.dynamic.delete(o);
      }
    }
  }

  /** Steps object animations to the current client cycle */
  animate(cycle: number): void {
    if (!this.bundle) return;
    for (const d of this.dynamic.values()) {
      if (d.model && d.anim >= 0) d.model.pose(this.bundle, objectFrameAt(this.bundle, d.anim, cycle - d.spawnCycle));
    }
  }

  clear(): void {
    for (const child of [...this.group.children]) this.group.remove(child);
    for (const d of this.dynamic.values()) {
      d.model?.dispose();
      d.object.traverse((c) => { if (c instanceof CSS2DObject) c.element.remove(); });
    }
    this.dynamic.clear();
    this.shown = { t: -1, plane: -1, scenery: false };
  }

  private animOf(o: PlacedObject): number {
    if (o.line.anim != null) return o.line.anim;
    return this.bundle?.object(o.line.id)?.anim ?? -1;
  }

  private built(o: PlacedObject): Built | undefined {
    return this.bundle ? objectModel(this.bundle, o.line.id, o.line.config ?? 10) : undefined;
  }

  /**
   * One mesh per floor. The game paints lower floors first and upper floors over them, so where two
   * floors put a surface at the same height the upper one wins; pushing lower floors back in depth
   * does the same here instead of the two flickering
   */
  private mergeScenery(objects: PlacedObject[], world: World, plane: number, sceneT: number): THREE.Object3D | null {
    const byFloor = new Map<number, { built: Built; x: number; y: number; z: number; ground: GroundAt }[]>();
    for (const o of objects) {
      const built = this.built(o);
      if (!built) continue;
      const x = o.line.lx / 128;
      const y = o.line.ly / 128;
      const ground: GroundAt = (gx, gy) => world.groundAt(gx, gy, o.plane);
      const list = byFloor.get(o.plane) ?? [];
      list.push({ built, x, y: ground(x, y), z: -y, ground });
      byFloor.set(o.plane, list);
    }
    // Thin floor objects lift whatever stands on their tiles to their top surface (see World.standAt)
    for (const [floor, items] of byFloor) world.setLift(sceneT, floor, floorLift(items));
    const group = new THREE.Group();
    for (const [floor, items] of byFloor) {
      const mesh = mergeStatic(items);
      if (!mesh) continue;
      const below = plane - floor;
      if (below > 0) {
        for (const material of [mesh.material].flat()) {
          material.polygonOffset = true;
          material.polygonOffsetFactor = 2 * below;
          material.polygonOffsetUnits = 4 * below;
        }
      }
      group.add(mesh);
    }
    return group.children.length ? group : null;
  }

  private makeDynamic(o: PlacedObject, timeline: ObjectTimeline, world: World): Dynamic {
    const l = o.line;
    const x = l.lx / 128;
    const y = l.ly / 128;
    const built = this.built(o);
    const anim = this.animOf(o);
    if (built) {
      const model = new RigMesh(built);
      model.placeAt(x, y, (gx, gy) => world.groundAt(gx, gy, o.plane));
      if (o.spawned && timeline.name(l.id)) this.attachLabel(model.mesh, 0.9);
      return { object: model.mesh, model, anim, spawnCycle: l.c };
    }
    const name = timeline.name(l.id);
    if (this.bundle) {
      // No model for this shape: the game draws nothing here either, so neither do we (bar its label)
      const empty = new THREE.Group();
      toThree(x, y, world.groundAt(x, y, o.plane), empty.position);
      if (o.spawned && name) this.attachLabel(empty, 0.5);
      return { object: empty, anim, spawnCycle: l.c };
    }
    const h = !o.spawned ? SCENERY_HEIGHT : name ? NAMED_HEIGHT : MARKER_HEIGHT;
    const mesh = new THREE.Mesh(this.box, this.material(l.id));
    mesh.scale.set((l.w ?? 1) * 0.8, h, (l.l ?? 1) * 0.8);
    toThree(x, y, world.groundAt(x, y, o.plane) + h / 2, mesh.position);
    if (o.spawned && name) this.attachLabel(mesh, h / 2 + 0.15, true);
    return { object: mesh, anim, spawnCycle: l.c };
  }

  private attachLabel(parent: THREE.Object3D, height: number, scaled = false): void {
    const tag = document.createElement("div");
    tag.className = "objtag";
    const label = new CSS2DObject(tag);
    label.position.y = scaled ? height / Math.max(0.01, parent.scale.y) : height;
    label.name = "label";
    parent.add(label);
  }

  private updateLabel(d: Dynamic, o: PlacedObject, timeline: ObjectTimeline, t: number): void {
    const label = d.object.getObjectByName("label") as CSS2DObject | undefined;
    if (!label) return;
    const age = t - o.from;
    label.element.textContent = `${timeline.name(o.line.id)}${o.line.anim != null ? ` · anim ${o.line.anim}` : ""}${age > 0 ? ` · ${age}t` : ""}`;
  }

  private material(id: number): THREE.MeshLambertMaterial {
    let m = this.materials.get(id);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: colorFor(id), transparent: true, opacity: 0.8 });
      this.materials.set(id, m);
    }
    return m;
  }

  private boxes(objects: PlacedObject[], world: World): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.box, new THREE.MeshLambertMaterial({ color: 0x8796a8, transparent: true, opacity: 0.55 }), objects.length);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    objects.forEach((o, i) => {
      const l = o.line;
      const x = l.lx / 128;
      const y = l.ly / 128;
      const height = l.kind === "game" ? SCENERY_HEIGHT : SCENERY_HEIGHT / 3;
      scale.set((l.w ?? 1) * 0.9, height, (l.l ?? 1) * 0.9);
      toThree(x, y, world.groundAt(x, y, o.plane) + height / 2, pos);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
    });
    return mesh;
  }
}

// A floor object is flat: no thicker than this (model units), sitting within this of the ground
const FLOOR_THICKNESS = 24;
const FLOOR_HIGHEST = 96;

/** Per tile, how far the top of a flat floor object stands above the ground */
function floorLift(items: { built: Built; x: number; z: number }[]): Float32Array {
  const lift = new Float32Array(104 * 104);
  for (const it of items) {
    const rig = it.built.rig;
    const p = it.built.placement;
    let lo = Infinity;
    let hi = -Infinity;
    for (let v = 1; v < rig.pos.length; v += 3) {
      const y = (rig.pos[v] * (p?.scale?.[1] ?? 128)) / 128 + (p?.offset?.[1] ?? 0);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    // Model y is negative going up: the top is the lowest value
    if (!(hi - lo <= FLOOR_THICKNESS && -lo > 0 && -lo <= FLOOR_HIGHEST)) continue;
    const top = -lo / 128;
    // The footprint: the model's own extent, which covers the object's tiles
    const sx = Math.floor(it.x);
    const sy = Math.floor(-it.z);
    if (sx >= 0 && sy >= 0 && sx < 104 && sy < 104) lift[sx * 104 + sy] = Math.max(lift[sx * 104 + sy], top);
  }
  return lift;
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    mesh.geometry?.dispose();
    for (const m of [mesh.material ?? []].flat() as THREE.Material[]) m.dispose?.();
  });
}
