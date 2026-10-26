import * as THREE from "three";
import type { Bundle, Recolors } from "./bundle";
import { textureFor } from "./textures";
import { place, Rig, type Part, type Placement } from "./rig";

/**
 * Builds rigs for NPCs, players, objects and graphics from their cache definitions, works out which
 * animation frame is showing at a moment, and keeps a three.js mesh in step with a rig.
 */

export interface Built {
  rig: Rig;
  placement?: Placement;
  /** Bends to follow the ground under each vertex, as the client does for objects marked so */
  contoured?: boolean;
}

/** Ground height in tiles at a point in tiles (x east, y north) */
export type GroundAt = (tileX: number, tileY: number) => number;

function parts(bundle: Bundle, ids: number[], recolors?: Recolors, shiftY?: number): Part[] {
  const out: Part[] = [];
  for (const id of ids) {
    const model = id >= 0 ? bundle.model(id) : undefined;
    if (model) out.push({ model, recolors, shiftY });
  }
  return out;
}

export function npcModel(bundle: Bundle, id: number, overrides?: { models?: number[]; colors?: number[] }): Built | undefined {
  const def = bundle.npc(id);
  if (!def) return undefined;
  const models = overrides?.models?.length ? overrides.models : def.models;
  const recolors: Recolors = { ...def };
  if (overrides?.colors?.length && def.recolorFind) recolors.recolorReplace = overrides.colors;
  const p = parts(bundle, models, recolors);
  if (!p.length) return undefined;
  const scaled = def.widthScale !== 128 || def.heightScale !== 128;
  return { rig: new Rig(p, bundle), placement: scaled ? { scale: [def.widthScale, def.heightScale, def.widthScale] } : undefined };
}

/**
 * A player from their recorded look: twelve slots in the game's body order, each a worn item, a body
 * kit or empty. Body colours aren't applied yet, so skin, hair and clothes show their default colours
 */
export function playerModel(bundle: Bundle, look: { equip: number[]; gender: number; itemOffset: number; kitOffset: number; npc?: number }): Built | undefined {
  if (look.npc != null && look.npc >= 0) return npcModel(bundle, look.npc);
  const female = look.gender === 1;
  const all: Part[] = [];
  for (const v of look.equip) {
    if (v >= look.itemOffset) {
      const item = bundle.item(v - look.itemOffset);
      if (!item) continue;
      const ids = female ? item.female : item.male;
      all.push(...parts(bundle, ids, item, female ? item.femaleOffset : item.maleOffset));
    } else if (v >= look.kitOffset) {
      const kit = bundle.kit(v - look.kitOffset);
      if (kit) all.push(...parts(bundle, kit.models, kit));
    }
  }
  return all.length ? { rig: new Rig(all, bundle) } : undefined;
}

// Roofs are hidden, as the game hides them when you're under one
const ROOF_TYPES = new Set([12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);

/**
 * An object from its ID and the shape and rotation packed into the recorded config: bits 0-4 are the
 * shape (0-3 walls, 4-8 wall decorations, 9 diagonal wall, 10-11 scenery, 12-21 roofs, 22 floor
 * decoration) and bits 6-7 the rotation
 */
export function objectModel(bundle: Bundle, id: number, config: number): Built | undefined {
  const def = bundle.object(id);
  if (!def) return undefined;
  const shape = config & 0x1f;
  const rotation = (config >> 6) & 3;
  if (ROOF_TYPES.has(shape)) return undefined;
  let ids: number[];
  if (!def.types.length) {
    // Without a shape list the models are for scenery only
    if (shape !== 10 && shape !== 11) return undefined;
    ids = def.models;
  } else {
    const wanted = shape === 11 ? 10 : shape;
    const at = def.types.indexOf(wanted);
    if (at < 0) return undefined;
    ids = [def.models[at]];
  }
  const p = parts(bundle, ids, def);
  if (!p.length) return undefined;
  // Signed 16-bit in the cache; bundles made before the exporter fixed this hold them unsigned
  const offset = def.offset.map((v) => (v > 32767 ? v - 65536 : v)) as [number, number, number];
  return {
    rig: new Rig(p, bundle),
    placement: { mirror: def.mirror, quarterTurns: rotation, scale: def.scale, offset },
    contoured: def.contoured >= 0,
  };
}

export function spotModel(bundle: Bundle, id: number): Built | undefined {
  const def = bundle.spotanim(id);
  if (!def || def.model < 0) return undefined;
  const p = parts(bundle, [def.model], def);
  if (!p.length) return undefined;
  return { rig: new Rig(p, bundle), placement: { scale: [def.resizeX, def.resizeY, def.resizeX] } };
}

/** A frame of a classic animation, or a frame of a skeletal one */
export type Pose = { frame: number } | { skeletal: number; tick: number };

/**
 * The pose an animation is in a number of client cycles after it started. Animations past their end
 * loop, which is how stand and walk poses play
 */
export function frameAt(bundle: Bundle, sequence: number, cycles: number): Pose | undefined {
  const seq = bundle.sequence(sequence);
  if (seq?.skeletal) {
    // Skeletal frames are client cycles: the counter wraps at the animation's length
    const length = Math.max(1, seq.skeletal.end - seq.skeletal.start);
    return { skeletal: seq.skeletal.id, tick: ((Math.floor(cycles) % length) + length) % length };
  }
  if (!seq?.frames?.length || !seq.lengths) return undefined;
  const lengths = seq.lengths.map((l) => Math.max(1, l));
  const total = lengths.reduce((a, b) => a + b, 0);
  let c = ((Math.floor(cycles) % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (c < lengths[i]) return { frame: seq.frames[i] };
    c -= lengths[i];
  }
  return { frame: seq.frames[seq.frames.length - 1] };
}

/**
 * The pose an object's animation is in, following the game's rule for what happens at the end: the
 * animation steps back by its frame step and carries on, up to its loop limit, then holds its last
 * frame. A frame step of 1 repeats the last frame (a collapse that stays collapsed); a frame step equal
 * to the frame count loops the whole animation (a portal swirling); none plays once
 */
export function objectFrameAt(bundle: Bundle, sequence: number, cycles: number): Pose | undefined {
  const seq = bundle.sequence(sequence);
  if (!seq) return undefined;
  if (seq.skeletal) {
    const length = Math.max(1, seq.skeletal.end - seq.skeletal.start);
    return { skeletal: seq.skeletal.id, tick: steppedIndex(Array(length).fill(1), seq, cycles) };
  }
  if (!seq.frames?.length || !seq.lengths) return undefined;
  return { frame: seq.frames[steppedIndex(seq.lengths.map((l) => Math.max(1, l)), seq, cycles)] };
}

/** Which frame shows after a number of cycles, with the game's frame-step looping */
export function steppedIndex(lengths: number[], seq: { frameStep: number; loops: number }, cycles: number): number {
  const n = lengths.length;
  let c = Math.max(0, Math.floor(cycles));
  for (let i = 0; i < n; i++) {
    if (c < lengths[i]) return i;
    c -= lengths[i];
  }
  const step = seq.frameStep;
  if (step <= 0 || step > n) return n - 1;
  const loopStart = n - step;
  let loopLength = 0;
  for (let i = loopStart; i < n; i++) loopLength += lengths[i];
  if (Math.floor(c / loopLength) >= Math.max(1, seq.loops)) return n - 1;
  c %= loopLength;
  for (let i = loopStart; i < n; i++) {
    if (c < lengths[i]) return i;
    c -= lengths[i];
  }
  return n - 1;
}

/** How many client cycles an animation runs for */
export function lengthOf(bundle: Bundle, sequence: number): number | undefined {
  const seq = bundle.sequence(sequence);
  if (seq?.skeletal) return seq.skeletal.end - seq.skeletal.start;
  return seq?.lengths?.reduce((a, b) => a + Math.max(1, b), 0);
}

/** The pose a recorded frame index stands for, a number of cycles later */
export function frameFrom(bundle: Bundle, sequence: number, index: number, cycles: number): Pose | undefined {
  const seq = bundle.sequence(sequence);
  // A skeletal animation's frame index is already a count of cycles
  if (seq?.skeletal) return frameAt(bundle, sequence, index + cycles);
  if (!seq?.frames?.length || !seq.lengths) return undefined;
  let start = 0;
  for (let i = 0; i < Math.min(index, seq.lengths.length); i++) start += Math.max(1, seq.lengths[i]);
  return frameAt(bundle, sequence, start + cycles);
}

/** A three.js mesh drawing a rig, redrawn whenever its pose changes */
export class RigMesh {
  readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private posed: string | null = null;
  private readonly scratch = [0, 0, 0];
  private contour: { ground: GroundAt; x: number; y: number } | undefined;

  /** Faces drawn with a texture image rather than their colour */
  private readonly textured: Uint8Array;

  constructor(readonly built: Built) {
    const rig = built.rig;
    const faceCount = rig.faces.length / 3;
    this.positions = new Float32Array(faceCount * 9);
    this.colors = new Float32Array(faceCount * 12);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));
    geometry.setAttribute("uv", new THREE.BufferAttribute(cornerUvs(rig.faceUv), 2));
    // One material for coloured faces, one per texture; each run of faces draws with its own
    const materials: THREE.Material[] = [new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: rig.translucent,
      flatShading: true,
    })];
    this.textured = new Uint8Array(faceCount);
    for (const run of rig.textureRuns) {
      const map = run.texture >= 0 ? textureFor(rig.bundle, run.texture) : undefined;
      let index = 0;
      if (map) {
        materials.push(texturedMaterial(map, rig.translucent));
        index = materials.length - 1;
        this.textured.fill(1, run.start, run.start + run.count);
      }
      geometry.addGroup(run.start * 3, run.count * 3, index);
    }
    this.mesh = new THREE.Mesh(geometry, materials);
    this.mesh.castShadow = true;
    this.writeColors();
    this.writePositions();
  }

  /** Poses the model, or rests it for undefined; does nothing if it's already in that pose */
  pose(bundle: Bundle, pose: Pose | undefined): void {
    const key = !pose ? "rest" : "frame" in pose ? `f${pose.frame}` : `s${pose.skeletal}:${pose.tick}`;
    if (key === this.posed) return;
    this.posed = key;
    const rig = this.built.rig;
    if (!pose) {
      rig.reset();
    } else if ("frame" in pose) {
      if (!rig.pose(bundle, pose.frame)) rig.reset();
    } else {
      const anim = bundle.skeletalAnimation(pose.skeletal);
      if (anim && rig.skeletal) rig.poseSkeletal(anim, pose.tick);
      else rig.reset();
    }
    this.writePositions();
    if (this.built.rig.translucent) this.writeColors();
  }

  /**
   * Stands the mesh at a tile position and, for contoured models, bends it to the ground there. The
   * mesh's own position is set to the ground under its origin
   */
  placeAt(x: number, y: number, ground: GroundAt): void {
    this.mesh.position.set(x, ground(x, y), -y);
    if (this.built.contoured) {
      this.contour = { ground, x, y };
      this.writePositions();
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const m of this.mesh.material as THREE.Material[]) m.dispose();
  }

  private writePositions(): void {
    const rig = this.built.rig;
    const p = rig.pos;
    const s = this.scratch;
    for (let f = 0; f < rig.faces.length; f++) {
      const v = rig.faces[f];
      place(p[v * 3], p[v * 3 + 1], p[v * 3 + 2], this.built.placement, s, 0);
      this.positions[f * 3] = s[0];
      this.positions[f * 3 + 1] = s[1];
      this.positions[f * 3 + 2] = s[2];
      if (this.contour) {
        const c = this.contour;
        this.positions[f * 3 + 1] += c.ground(c.x + s[0], c.y - s[2]) - c.ground(c.x, c.y);
      }
    }
    const geometry = this.mesh.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  private writeColors(): void {
    const rig = this.built.rig;
    for (let f = 0; f < rig.faceRgb.length; f++) {
      // Textured faces take their colour from the texture, lit as everything else is
      const rgb = this.textured[f] ? 0xffffff : rig.faceRgb[f];
      const r = ((rgb >> 16) & 255) / 255;
      const g = ((rgb >> 8) & 255) / 255;
      const b = (rgb & 255) / 255;
      const a = 1 - rig.alpha[f] / 255;
      for (let k = 0; k < 3; k++) {
        const at = (f * 3 + k) * 4;
        this.colors[at] = r;
        this.colors[at + 1] = g;
        this.colors[at + 2] = b;
        this.colors[at + 3] = a;
      }
    }
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

function texturedMaterial(map: THREE.Texture, translucent: boolean): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map, vertexColors: true, side: THREE.DoubleSide, flatShading: true, transparent: translucent, alphaTest: 0.05 });
}

/** Per-face texture coordinates (u0 v0 u1 v1 u2 v2) as the per-corner attribute three.js wants */
function cornerUvs(faceUv: Float32Array): Float32Array {
  return Float32Array.from(faceUv);
}

/** Static objects merged into one mesh: thousands of separate meshes would be thousands of draw calls */
export function mergeStatic(items: { built: Built; x: number; y: number; z: number; ground?: GroundAt }[]): THREE.Mesh | undefined {
  // Faces bucketed by texture so each texture is one draw: [item, face] pairs per bucket
  const buckets = new Map<number, [number, number][]>();
  let bundle: Bundle | undefined;
  items.forEach((it, i) => {
    const rig = it.built.rig;
    bundle ??= rig.bundle;
    for (let face = 0; face < rig.faceRgb.length; face++) {
      const texture = rig.faceTexture[face] >= 0 && textureFor(rig.bundle, rig.faceTexture[face]) ? rig.faceTexture[face] : -1;
      const list = buckets.get(texture);
      if (list) list.push([i, face]);
      else buckets.set(texture, [[i, face]]);
    }
  });
  let faceCount = 0;
  for (const list of buckets.values()) faceCount += list.length;
  if (!faceCount || !bundle) return undefined;
  const positions = new Float32Array(faceCount * 9);
  const colors = new Float32Array(faceCount * 12);
  const uvs = new Float32Array(faceCount * 6);
  const geometry = new THREE.BufferGeometry();
  const materials: THREE.Material[] = [new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, transparent: true, alphaTest: 0.02 })];
  const s = [0, 0, 0];
  let at = 0;
  for (const texture of [...buckets.keys()].sort((a, b) => a - b)) {
    const start = at;
    for (const [i, face] of buckets.get(texture)!) {
      const it = items[i];
      const rig = it.built.rig;
      const rgb = texture >= 0 ? 0xffffff : rig.faceRgb[face];
      for (let k = 0; k < 3; k++) {
        const v = rig.faces[face * 3 + k];
        place(rig.pos[v * 3], rig.pos[v * 3 + 1], rig.pos[v * 3 + 2], it.built.placement, s, 0);
        positions[at * 3] = s[0] + it.x;
        // Contoured models take the ground height under each vertex rather than under their origin
        positions[at * 3 + 1] = s[1] + (it.built.contoured && it.ground ? it.ground(it.x + s[0], -(it.z + s[2])) : it.y);
        positions[at * 3 + 2] = s[2] + it.z;
        colors[at * 4] = ((rgb >> 16) & 255) / 255;
        colors[at * 4 + 1] = ((rgb >> 8) & 255) / 255;
        colors[at * 4 + 2] = (rgb & 255) / 255;
        colors[at * 4 + 3] = 1 - rig.alpha[face] / 255;
        uvs[at * 2] = rig.faceUv[face * 6 + k * 2];
        uvs[at * 2 + 1] = rig.faceUv[face * 6 + k * 2 + 1];
        at++;
      }
    }
    let index = 0;
    if (texture >= 0) {
      materials.push(texturedMaterial(textureFor(bundle, texture)!, true));
      index = materials.length - 1;
    }
    geometry.addGroup(start, at - start, index);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
