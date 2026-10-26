import { hslToRgb, type Bundle, type ModelData, type Recolors } from "./bundle";
import { ALPHA_TRANSFORM, type SkeletalAnimation } from "./skeletal/skeleton";

/**
 * One drawable model put together from cache parts (an NPC's body parts, a player's kit and gear,
 * an object's model) with its recolours applied, which classic animation frames can move.
 *
 * The frame transforms are a port of the game client's: the same fixed-point sine table, the same
 * integer maths and the same order, so a frame bends a model exactly as it does in game.
 */

export interface Part {
  model: ModelData;
  recolors?: Recolors;
  /** Moves this part before anything else, in model units: used for gear offsets */
  shiftY?: number;
}

/** Applied after animation, in this order, as the client builds object and NPC models */
export interface Placement {
  mirror?: boolean;
  /** Quarter turns: 1 turns a west-facing wall to face north */
  quarterTurns?: number;
  /** x, height, y in 1/128ths */
  scale?: [number, number, number];
  /** x, height, y in model units */
  offset?: [number, number, number];
}

// The client's angle tables: 2048 steps to a turn, values scaled by 65536
const SINE = new Int32Array(2048);
const COSINE = new Int32Array(2048);
for (let i = 0; i < 2048; i++) {
  SINE[i] = Math.trunc(65536 * Math.sin(i * 0.0030679615757712823));
  COSINE[i] = Math.trunc(65536 * Math.cos(i * 0.0030679615757712823));
}

const HIDDEN = 0x1000000;

export class Rig {
  readonly vertexCount: number;
  /** Visible faces only, as indices into the vertex arrays */
  readonly faces: Int32Array;
  /** Face colour as RGB, per visible face */
  readonly faceRgb: Uint32Array;
  readonly baseAlpha: Uint8Array;
  readonly alpha: Uint8Array;
  readonly translucent: boolean;
  /** Texture per visible face (-1 for none) and its corners' texture coordinates */
  readonly faceTexture: Int16Array;
  readonly faceUv: Float32Array;
  /** Faces are kept in runs of the same texture, untextured first, so each run can be one draw */
  readonly textureRuns: { texture: number; start: number; count: number }[] = [];
  private readonly base: Int32Array;
  readonly pos: Int32Array;
  private readonly groups: number[][] = [];
  private readonly faceGroups: number[][] = [];
  /** Skeletal bone weights: vertex v uses entries boneStart[v] to boneStart[v + 1] */
  private readonly boneStart: Int32Array;
  private readonly bones: Int32Array;
  private readonly weights: Int32Array;
  private offX = 0;
  private offY = 0;
  private offZ = 0;

  constructor(parts: Part[], readonly bundle: Bundle) {
    let vertexCount = 0;
    let faceCount = 0;
    for (const p of parts) {
      vertexCount += p.model.vertices.length / 3;
      faceCount += p.model.faces.length / 3;
    }
    this.vertexCount = vertexCount;
    this.base = new Int32Array(vertexCount * 3);
    const faces: number[] = [];
    const rgb: number[] = [];
    const alphas: number[] = [];
    const textures: number[] = [];
    const uvs: number[] = [];
    const faceLabels: number[] = [];
    const boneStart = new Int32Array(vertexCount + 1);
    const bones: number[] = [];
    const weights: number[] = [];
    let vOffset = 0;
    for (const p of parts) {
      const m = p.model;
      const n = m.vertices.length / 3;
      for (let i = 0; i < n; i++) {
        this.base[(vOffset + i) * 3] = m.vertices[i * 3];
        this.base[(vOffset + i) * 3 + 1] = m.vertices[i * 3 + 1] + (p.shiftY ?? 0);
        this.base[(vOffset + i) * 3 + 2] = m.vertices[i * 3 + 2];
        const label = m.vertexGroups?.[i] ?? -1;
        if (label >= 0) (this.groups[label] ??= []).push(vOffset + i);
      }
      // Bone weights, flattened by the exporter as a count then that many entries per vertex
      let at = 0;
      for (let i = 0; i < n; i++) {
        boneStart[vOffset + i] = bones.length;
        if (!m.boneGroups || !m.boneWeights) continue;
        const count = m.boneGroups[at];
        for (let k = 1; k <= count; k++) {
          bones.push(m.boneGroups[at + k]);
          weights.push(m.boneWeights[at + k]);
        }
        at += count + 1;
      }
      const f = m.faces.length / 3;
      for (let i = 0; i < f; i++) {
        const color = faceColor(m, i, p.recolors, bundle);
        if (color === HIDDEN) continue;
        faceLabels.push(m.faceGroups?.[i] ?? -1);
        faces.push(m.faces[i * 3] + vOffset, m.faces[i * 3 + 1] + vOffset, m.faces[i * 3 + 2] + vOffset);
        rgb.push(color);
        alphas.push(m.alphas ? m.alphas[i] : 0);
        textures.push(faceTexture(m, i, p.recolors));
        for (let k = 0; k < 6; k++) uvs.push(m.uv ? m.uv[i * 6 + k] : 0);
      }
      vOffset += n;
    }
    // Sort faces into runs by texture, keeping each run in model order
    const count = rgb.length;
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => textures[a] - textures[b] || a - b);
    this.faces = new Int32Array(count * 3);
    this.faceRgb = new Uint32Array(count);
    this.baseAlpha = new Uint8Array(count);
    this.faceTexture = new Int16Array(count);
    this.faceUv = new Float32Array(count * 6);
    order.forEach((from, to) => {
      this.faces.set(faces.slice(from * 3, from * 3 + 3), to * 3);
      this.faceRgb[to] = rgb[from];
      this.baseAlpha[to] = alphas[from];
      this.faceTexture[to] = textures[from];
      this.faceUv.set(uvs.slice(from * 6, from * 6 + 6), to * 6);
      if (faceLabels[from] >= 0) (this.faceGroups[faceLabels[from]] ??= []).push(to);
      const run = this.textureRuns[this.textureRuns.length - 1];
      if (run && run.texture === textures[from]) run.count++;
      else this.textureRuns.push({ texture: textures[from], start: to, count: 1 });
    });
    this.alpha = Uint8Array.from(this.baseAlpha);
    this.translucent = alphas.some((a) => a > 0) || this.faceGroups.length > 0;
    boneStart[vertexCount] = bones.length;
    this.boneStart = boneStart;
    this.bones = Int32Array.from(bones);
    this.weights = Int32Array.from(weights);
    this.pos = Int32Array.from(this.base);
  }

  get skeletal(): boolean {
    return this.bones.length > 0;
  }

  /**
   * Poses the model on a frame of a skeletal animation: each vertex moves by the weighted sum of its
   * bones' matrices, worked in the client's flipped y and z axes
   */
  poseSkeletal(anim: SkeletalAnimation, frame: number): void {
    this.reset();
    const skeleton = anim.skeleton;
    skeleton.animate(anim, frame);
    const pose = anim.poseId;
    const v = this.pos;
    const m = new Float64Array(16);
    for (let i = 0; i < this.vertexCount; i++) {
      const start = this.boneStart[i];
      const end = this.boneStart[i + 1];
      if (start === end) continue;
      m.fill(0);
      for (let k = start; k < end; k++) {
        const bone = skeleton.bones[this.bones[k]];
        if (!bone) continue;
        const scale = this.weights[k] / 255;
        const f = bone.final(pose);
        for (let j = 0; j < 16; j++) m[j] += scale * f[j];
      }
      const x = v[i * 3];
      const y = -v[i * 3 + 1];
      const z = -v[i * 3 + 2];
      v[i * 3] = Math.round(m[0] * x + m[4] * y + m[8] * z + m[12]);
      v[i * 3 + 1] = -Math.round(m[1] * x + m[5] * y + m[9] * z + m[13]);
      v[i * 3 + 2] = -Math.round(m[2] * x + m[6] * y + m[10] * z + m[14]);
    }
    if (anim.hasAlpha) {
      skeleton.types.forEach((type, i) => {
        const curve = anim.curves[i]?.[0];
        if (type !== ALPHA_TRANSFORM || !curve) return;
        const delta = curve.getValue(frame) * 255;
        for (const label of skeleton.labels[i]) {
          for (const face of this.faceGroups[label] ?? []) this.alpha[face] = Math.max(0, Math.min(255, this.alpha[face] + delta));
        }
      });
    }
  }

  reset(): void {
    this.pos.set(this.base);
    this.alpha.set(this.baseAlpha);
  }

  /** Poses the model on one frame of a classic animation. Returns false if the frame isn't in the bundle */
  pose(bundle: Bundle, frameId: number): boolean {
    this.reset();
    const frame = bundle.frame(frameId);
    const framemap = frame && bundle.framemap(frame.framemap);
    if (!frame || !framemap) return false;
    for (let i = 0; i < frame.index.length; i++) {
      const slot = frame.index[i];
      this.transform(framemap.types[slot], framemap.maps[slot], frame.x[i], frame.y[i], frame.z[i]);
    }
    return true;
  }

  private transform(type: number, labels: number[], dx: number, dy: number, dz: number): void {
    const v = this.pos;
    if (type === 0) {
      // Origin for the transforms that follow: the centre of the labelled vertices, moved by the frame
      let count = 0;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const label of labels) {
        for (const i of this.groups[label] ?? []) {
          sx += v[i * 3];
          sy += v[i * 3 + 1];
          sz += v[i * 3 + 2];
          count++;
        }
      }
      if (count > 0) {
        this.offX = dx + Math.trunc(sx / count);
        this.offY = dy + Math.trunc(sy / count);
        this.offZ = dz + Math.trunc(sz / count);
      } else {
        this.offX = dx;
        this.offY = dy;
        this.offZ = dz;
      }
    } else if (type === 1) {
      for (const label of labels) {
        for (const i of this.groups[label] ?? []) {
          v[i * 3] += dx;
          v[i * 3 + 1] += dy;
          v[i * 3 + 2] += dz;
        }
      }
    } else if (type === 2) {
      const ax = (dx & 255) * 8;
      const ay = (dy & 255) * 8;
      const az = (dz & 255) * 8;
      for (const label of labels) {
        for (const i of this.groups[label] ?? []) {
          let x = v[i * 3] - this.offX;
          let y = v[i * 3 + 1] - this.offY;
          let z = v[i * 3 + 2] - this.offZ;
          if (az !== 0) {
            const s = SINE[az];
            const c = COSINE[az];
            const t = (s * y + c * x) >> 16;
            y = (c * y - s * x) >> 16;
            x = t;
          }
          if (ax !== 0) {
            const s = SINE[ax];
            const c = COSINE[ax];
            const t = (c * y - s * z) >> 16;
            z = (s * y + c * z) >> 16;
            y = t;
          }
          if (ay !== 0) {
            const s = SINE[ay];
            const c = COSINE[ay];
            const t = (s * z + c * x) >> 16;
            z = (c * z - s * x) >> 16;
            x = t;
          }
          v[i * 3] = x + this.offX;
          v[i * 3 + 1] = y + this.offY;
          v[i * 3 + 2] = z + this.offZ;
        }
      }
    } else if (type === 3) {
      for (const label of labels) {
        for (const i of this.groups[label] ?? []) {
          v[i * 3] = Math.trunc(((v[i * 3] - this.offX) * dx) / 128) + this.offX;
          v[i * 3 + 1] = Math.trunc(((v[i * 3 + 1] - this.offY) * dy) / 128) + this.offY;
          v[i * 3 + 2] = Math.trunc(((v[i * 3 + 2] - this.offZ) * dz) / 128) + this.offZ;
        }
      }
    } else if (type === 5) {
      // Fades faces: the client adds eight steps of transparency per unit
      for (const label of labels) {
        for (const f of this.faceGroups[label] ?? []) {
          this.alpha[f] = Math.max(0, Math.min(255, this.alpha[f] + dx * 8));
        }
      }
    }
  }
}

/** A face's texture after retexturing, or -1 */
function faceTexture(m: ModelData, i: number, recolors: Recolors | undefined): number {
  let texture = m.textures ? m.textures[i] : -1;
  if (texture >= 0 && recolors?.retextureFind) {
    const at = recolors.retextureFind.indexOf(texture);
    if (at >= 0) texture = recolors.retextureReplace![at];
  }
  return texture;
}

/** A face's colour after recolouring, or HIDDEN for faces the client doesn't draw */
function faceColor(m: ModelData, i: number, recolors: Recolors | undefined, bundle: Bundle): number {
  const type = m.renderTypes ? m.renderTypes[i] & 3 : 0;
  let texture = m.textures ? m.textures[i] : -1;
  if (texture >= 0 && recolors?.retextureFind) {
    const at = recolors.retextureFind.indexOf(texture);
    if (at >= 0) texture = recolors.retextureReplace![at];
  }
  if (texture >= 0) {
    if (type >= 2) return HIDDEN;
    return bundle.textureColor(texture) ?? 0x808080;
  }
  if (type === 2) return HIDDEN;
  if (type === 3) return hslToRgb(128);
  let hsl = m.colors[i] & 0xffff;
  if (recolors?.recolorFind) {
    const at = recolors.recolorFind.indexOf((hsl << 16) >> 16);
    if (at >= 0) hsl = recolors.recolorReplace![at] & 0xffff;
  }
  return hslToRgb(hsl);
}

/** Turns a model-space point into three.js space (tiles; y up; north is -z) after placement */
export function place(x: number, y: number, z: number, p: Placement | undefined, out: number[], at: number): void {
  if (p) {
    if (p.mirror) z = -z;
    for (let k = 0; k < (p.quarterTurns ?? 0); k++) {
      const t = x;
      x = z;
      z = -t;
    }
    if (p.scale) {
      x = (x * p.scale[0]) / 128;
      y = (y * p.scale[1]) / 128;
      z = (z * p.scale[2]) / 128;
    }
    if (p.offset) {
      x += p.offset[0];
      y += p.offset[1];
      z += p.offset[2];
    }
  }
  out[at] = x / 128;
  out[at + 1] = -y / 128;
  out[at + 2] = -z / 128;
}
