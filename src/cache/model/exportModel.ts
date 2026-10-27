// Ported from RuneLite's cache library (net.runelite.cache.definitions.loaders.ModelLoader and ModelDefinition,
// BSD-2-Clause, see LICENSE in src/cache/store), as the exporter's writeModels turns a model into bundle data.
import { ModelDefinition } from "./modelDefinition";
import { ModelLoader } from "./modelLoader";

/**
 * One model's arrays as the exporter base64-encodes them into a bundle's "models" entry. Arrays the exporter
 * takes straight from the model (c, a, rt, t, tg) are the model's own, not copies
 */
export interface ExportedModel {
  /** x y z per vertex */
  v: Int32Array;
  /** Vertex indices, three per face */
  f: Int32Array;
  /** HSL colour per face */
  c: Int16Array;
  /** Transparency per face */
  a?: Int8Array;
  /** Render type per face: 1 for flat shading */
  rt?: Int8Array;
  /** Texture coordinates per face corner, as the client maps them: u0 v0 u1 v1 u2 v2; 0 where a face has none */
  uv?: Float32Array;
  /** Texture id per face, -1 for none */
  t?: Int16Array;
  /** Each vertex's bone label for classic animations, or -1 */
  vg?: Int32Array;
  /** Alpha-animation label per face */
  tg?: Int32Array;
  /** Bone groups per vertex for skeletal animation: a count, then that many bones */
  mg?: Int32Array;
  /** Bone weights per vertex, laid out as mg */
  ms?: Int32Array;
  /** Texture ids the model's faces use, in the order first seen */
  textures: Set<number>;
}

const loader = new ModelLoader();

/** writeModels for one model: a loaded definition, or a model id and its archive (index 7, decompressed) */
export function exportModel(m: ModelDefinition): ExportedModel;
export function exportModel(id: number, data: Uint8Array): ExportedModel;
export function exportModel(model: ModelDefinition | number, data?: Uint8Array): ExportedModel {
  return exportDefinition(typeof model === "number" ? loader.load(model, data!) : model);
}

/** writeModels for one loaded model */
export function exportDefinition(m: ModelDefinition): ExportedModel {
  const v = new Int32Array(m.vertexCount * 3);
  for (let i = 0; i < m.vertexCount; i++) {
    v[i * 3] = m.vertexX[i];
    v[i * 3 + 1] = m.vertexY[i];
    v[i * 3 + 2] = m.vertexZ[i];
  }
  const f = new Int32Array(m.faceCount * 3);
  for (let i = 0; i < m.faceCount; i++) {
    f[i * 3] = m.faceIndices1[i];
    f[i * 3 + 1] = m.faceIndices2[i];
    f[i * 3 + 2] = m.faceIndices3[i];
  }
  const out: ExportedModel = { v, f, c: m.faceColors, textures: new Set() };
  if (m.faceTransparencies) out.a = m.faceTransparencies;
  if (m.faceRenderTypes) out.rt = m.faceRenderTypes;
  const us = m.faceTextureUCoordinates;
  const vs = m.faceTextureVCoordinates;
  if (m.faceTextures && us && vs) {
    const uv = new Float32Array(m.faceCount * 6);
    for (let i = 0; i < m.faceCount; i++) {
      const u = us[i];
      const w = vs[i];
      for (let k = 0; k < 3; k++) {
        uv[i * 6 + k * 2] = u === undefined ? 0 : u[k];
        uv[i * 6 + k * 2 + 1] = w === undefined ? 0 : w[k];
      }
    }
    out.uv = uv;
  }
  if (m.faceTextures) {
    out.t = m.faceTextures;
    for (const t of m.faceTextures) if (t >= 0) out.textures.add(t);
  }
  const vg = vertexLabels(m);
  if (vg) out.vg = vg;
  if (m.packedTransparencyVertexGroups) out.tg = m.packedTransparencyVertexGroups;
  if (m.animayaGroups && m.animayaScales) {
    out.mg = flatten(m.animayaGroups);
    out.ms = flatten(m.animayaScales);
  }
  return out;
}

/**
 * Each vertex's bone label for classic animations, or -1. The loader turns the labels into lists of vertices
 * per label and then drops the per-vertex array, so it's rebuilt here from the lists
 */
export function vertexLabels(m: ModelDefinition): Int32Array | undefined {
  const groups = m.getVertexGroups();
  if (!groups) return m.packedVertexGroups;
  const labels = new Int32Array(m.vertexCount).fill(-1);
  for (let label = 0; label < groups.length; label++) {
    const group = groups[label];
    if (group) for (const v of group) labels[v] = label;
  }
  return labels;
}

/** Per-vertex lists laid end to end, each after its length */
export function flatten(perVertex: (Int32Array | undefined)[]): Int32Array {
  let size = 0;
  for (const v of perVertex) size += 1 + (v ? v.length : 0);
  const out = new Int32Array(size);
  let at = 0;
  for (const v of perVertex) {
    out[at++] = v ? v.length : 0;
    if (v) {
      out.set(v, at);
      at += v.length;
    }
  }
  return out;
}
