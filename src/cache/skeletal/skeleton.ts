// Ported from rs-map-viewer by dennisdev (BSD-2-Clause, see LICENSE in this folder): SkeletalBone.ts,
// SkeletalBase.ts, SkeletalSeq.ts, SkeletalTransformType.ts, CurveType.ts and the skeletal part of
// SeqBase.ts. A skeleton is a tree of bones with rest poses; a skeletal animation is a set of curves
// that give each bone's rotation, scale and translation per client cycle.

import { mat4, quat, vec3 } from "gl-matrix";
import { Curve } from "./curve";
import { Reader } from "./reader";

/** The classic transform type that fades faces; skeletal animations reuse it for alpha curves */
export const ALPHA_TRANSFORM = 5;

const enum TransformType {
  TYPE_0 = 0,
  BONE = 1,
  TYPE_2 = 2,
  TYPE_3 = 3,
  ALPHA = 4,
  TYPE_5 = 5,
}
const CURVE_COUNTS = [0, 9, 3, 6, 1, 3];
// Which slot of a bone's nine curves (rotation xyz, translation xyz, scale xyz) a curve type fills
const CURVE_INDICES = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 3, 4, 5, 0];

const scratchMatrix = mat4.create();
const scratchRotate = mat4.create();
const scratchScale = mat4.create();
const qx = quat.create();
const qy = quat.create();
const qz = quat.create();
const qAll = quat.create();
const axis = vec3.create();
const scaleVector = vec3.create();

export class Bone {
  parentId: number;
  parent?: Bone;
  readonly localMatrices: mat4[];
  private readonly modelMatrices: (mat4 | undefined)[];
  private readonly invertedModelMatrices: (mat4 | undefined)[];
  readonly rotations: vec3[] = [];
  readonly translations: vec3[] = [];
  readonly scalings: vec3[] = [];
  private readonly animMatrix = mat4.create();
  private readonly animModelMatrix = mat4.create();
  private readonly finalMatrix = mat4.create();
  private updateAnimModelMatrix = false;
  private updateFinalMatrix = false;

  constructor(poseCount: number, buffer: Reader) {
    this.parentId = buffer.readShort();
    this.localMatrices = new Array(poseCount);
    this.modelMatrices = new Array(poseCount);
    this.invertedModelMatrices = new Array(poseCount);
    for (let i = 0; i < poseCount; i++) {
      const m = mat4.create();
      for (let k = 0; k < 16; k++) m[k] = buffer.readFloat();
      this.localMatrices[i] = m;
      // Three more floats per pose that nothing uses
      buffer.readFloat();
      buffer.readFloat();
      buffer.readFloat();
    }
    const inverted = mat4.create();
    for (let i = 0; i < poseCount; i++) {
      mat4.invert(inverted, this.localMatrices[i]);
      this.rotations[i] = rotationOf(vec3.create(), inverted);
      this.translations[i] = mat4.getTranslation(vec3.create(), this.localMatrices[i]);
      this.scalings[i] = mat4.getScaling(vec3.create(), this.localMatrices[i]);
    }
  }

  modelMatrix(pose: number): mat4 {
    let m = this.modelMatrices[pose];
    if (!m) {
      m = mat4.create();
      if (this.parent) mat4.mul(m, this.parent.modelMatrix(pose), this.localMatrices[pose]);
      else mat4.copy(m, this.localMatrices[pose]);
      this.modelMatrices[pose] = m;
    }
    return m;
  }

  invertedModelMatrix(pose: number): mat4 {
    let m = this.invertedModelMatrices[pose];
    if (!m) {
      m = mat4.invert(mat4.create(), this.modelMatrix(pose));
      this.invertedModelMatrices[pose] = m;
    }
    return m;
  }

  setAnimMatrix(m: mat4): void {
    mat4.copy(this.animMatrix, m);
    this.updateAnimModelMatrix = true;
    this.updateFinalMatrix = true;
  }

  private animModel(): mat4 {
    if (this.updateAnimModelMatrix) {
      this.updateAnimModelMatrix = false;
      if (this.parent) mat4.mul(this.animModelMatrix, this.parent.animModel(), this.animMatrix);
      else mat4.copy(this.animModelMatrix, this.animMatrix);
    }
    return this.animModelMatrix;
  }

  /** Takes a vertex from the rest pose to its animated position */
  final(pose: number): mat4 {
    if (this.updateFinalMatrix) {
      this.updateFinalMatrix = false;
      mat4.mul(this.finalMatrix, this.animModel(), this.invertedModelMatrix(pose));
    }
    return this.finalMatrix;
  }
}

function rotationOf(out: vec3, m: mat4): vec3 {
  out[0] = -Math.asin(m[6]);
  out[1] = 0;
  out[2] = 0;
  if (Math.abs(Math.cos(out[0])) > 0.005) {
    out[1] = Math.atan2(m[2], m[10]);
    out[2] = Math.atan2(m[4], m[5]);
  } else {
    out[1] = m[6] < 0 ? Math.atan2(m[1], m[0]) : -Math.atan2(m[1], m[0]);
  }
  return out;
}

/** The skeleton part of a frame map (the cache's "base"), plus the classic labels it also carries */
export class Skeleton {
  readonly types: number[];
  readonly labels: number[][];
  readonly bones: Bone[] = [];
  poseCount = 0;

  constructor(data: Uint8Array) {
    const buf = new Reader(data);
    const count = buf.readUnsignedByte();
    this.types = new Array(count);
    for (let i = 0; i < count; i++) {
      const type = buf.readUnsignedByte();
      // Type 6 is a rotation too
      this.types[i] = type === 6 ? 2 : type;
    }
    this.labels = new Array(count);
    for (let i = 0; i < count; i++) this.labels[i] = new Array(buf.readUnsignedByte());
    for (let i = 0; i < count; i++) for (let l = 0; l < this.labels[i].length; l++) this.labels[i][l] = buf.readUnsignedByte();
    if (buf.remaining > 0) {
      const boneCount = buf.readUnsignedShort();
      if (boneCount > 0) {
        this.poseCount = buf.readUnsignedByte();
        for (let i = 0; i < boneCount; i++) this.bones.push(new Bone(this.poseCount, buf));
        for (const bone of this.bones) if (bone.parentId >= 0) bone.parent = this.bones[bone.parentId];
      }
    }
  }

  /** Sets every bone to its place on a frame of an animation */
  animate(seq: SkeletalAnimation, frame: number): void {
    this.bones.forEach((bone, i) => seq.animate(frame, bone, i));
  }
}

export class SkeletalAnimation {
  readonly poseId: number;
  readonly boneCurves: (Curve | undefined)[][] = [];
  readonly curves: (Curve | undefined)[][] = [];
  hasAlpha = false;

  constructor(data: Uint8Array, readonly skeleton: Skeleton) {
    const buf = new Reader(data);
    buf.readUnsignedByte(); // version
    buf.readUnsignedShort(); // skeleton ID
    buf.readUnsignedShort();
    buf.readUnsignedShort();
    this.poseId = buf.readUnsignedByte();
    const curveCount = buf.readUnsignedShort();
    for (let i = 0; i < curveCount; i++) {
      let transform = buf.readUnsignedByte();
      if (transform > TransformType.TYPE_5) transform = TransformType.TYPE_0;
      const boneIndex = buf.readSmart2();
      let curveType = buf.readUnsignedByte();
      if (curveType > 16) curveType = 0;
      const curve = new Curve();
      curve.decode(buf);
      const into = transform === TransformType.BONE ? this.boneCurves : this.curves;
      into[boneIndex] ??= new Array(CURVE_COUNTS[transform]);
      curve.load();
      into[boneIndex][CURVE_INDICES[curveType]] = curve;
      if (transform === TransformType.ALPHA) this.hasAlpha = true;
    }
  }

  /** Builds a bone's matrix for a frame: rotation, then scale, then translation, from curves or rest pose */
  animate(frame: number, bone: Bone, boneIndex: number): void {
    const m = mat4.identity(scratchMatrix);
    const curves = this.boneCurves[boneIndex];
    const pick = (slot: number, rest: number) => curves?.[slot]?.getValue(frame) ?? rest;

    const r = bone.rotations[this.poseId];
    quat.setAxisAngle(qx, vec3.set(axis, 1, 0, 0), pick(0, r[0]));
    quat.setAxisAngle(qy, vec3.set(axis, 0, 1, 0), pick(1, r[1]));
    quat.setAxisAngle(qz, vec3.set(axis, 0, 0, 1), pick(2, r[2]));
    quat.identity(qAll);
    quat.mul(qAll, qz, qAll);
    quat.mul(qAll, qx, qAll);
    quat.mul(qAll, qy, qAll);
    mat4.fromQuat(scratchRotate, qAll);
    mat4.mul(m, scratchRotate, m);

    const s = bone.scalings[this.poseId];
    mat4.fromScaling(scratchScale, vec3.set(scaleVector, pick(6, s[0]), pick(7, s[1]), pick(8, s[2])));
    mat4.mul(m, scratchScale, m);

    const t = bone.translations[this.poseId];
    m[12] = pick(3, t[0]);
    m[13] = pick(4, t[1]);
    m[14] = pick(5, t[2]);
    bone.setAnimMatrix(m);
  }
}
