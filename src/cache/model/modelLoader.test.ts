import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nodeSource } from "../store/nodeSource";
import { CacheStore } from "../store/store";
import { exportDefinition } from "./exportModel";
import { ModelDefinition } from "./modelDefinition";
import { ModelLoader } from "./modelLoader";
import { CircularAngle } from "./models";

// Compares against dumps that exporter/build/ModelProbe.java makes with RuneLite's cache library: per-model
// hashes of the exporter's arrays for every model, and every field of a sample after loading and method calls.
// Both the game cache and the dumps are local-only, so this skips without them
const cacheDir = path.resolve(__dirname, "../../../exporter/build/cache-live");
const dumpDir = path.resolve(__dirname, "../../../exporter/build/probe-model");
const run = existsSync(cacheDir) && existsSync(path.join(dumpDir, "hashes.txt")) ? describe : describe.skip;

const MODELS = 7;

function readDump(name: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of readFileSync(path.join(dumpDir, name), "utf8").split(/\r?\n/)) {
    const space = line.indexOf(" ");
    if (space > 0) out.set(Number(line.slice(0, space)), line.slice(space + 1).trim());
  }
  return out;
}

function bytesOf(a: ArrayBufferView): Uint8Array {
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}

function put(sha: Hash, a: ArrayBufferView | undefined): void {
  if (a === undefined) {
    sha.update(Uint8Array.of(0));
    return;
  }
  const length = new Uint8Array(4);
  new DataView(length.buffer).setInt32(0, a.byteLength, true);
  sha.update(Uint8Array.of(1));
  sha.update(length);
  sha.update(bytesOf(a));
}

/** The probe's hash: each array the exporter writes, in order, then the texture ids used */
function hash(m: ModelDefinition): string {
  const e = exportDefinition(m);
  const sha = createHash("sha1");
  put(sha, e.v);
  put(sha, e.f);
  put(sha, e.c);
  put(sha, e.a);
  put(sha, e.rt);
  put(sha, e.uv);
  put(sha, e.t);
  put(sha, e.vg);
  put(sha, e.tg);
  put(sha, e.mg);
  put(sha, e.ms);
  put(sha, Int32Array.from([...e.textures].sort((a, b) => a - b)));
  return sha.digest("hex");
}

function tryHash(loader: ModelLoader, id: number, data: Uint8Array): string {
  try {
    return hash(loader.load(id, data));
  } catch {
    return "ERR";
  }
}

const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];

/** ModelProbe.convert: a type 2 model as the old format, or a type 3 model as type 1 */
function convert(b: Uint8Array): Uint8Array | undefined {
  const n = b.length;
  if (n < 26 || b[n - 2] !== 0xff) return undefined;
  let trailer: Uint8Array;
  let cut: number;
  if (b[n - 1] === 0xfe) {
    const t = n - 23;
    if (b[t + 10] !== 0 || u16(b, t + 19) !== (b[t + 9] === 1 ? u16(b, t) : 0)) return undefined;
    trailer = new Uint8Array(18);
    trailer.set(b.subarray(t, t + 10), 0);
    trailer.set(b.subarray(t + 11, t + 19), 10);
    cut = t;
  } else if (b[n - 1] === 0xfd) {
    const t = n - 26;
    if (b[t + 11] !== 0 || u16(b, t + 22) !== (b[t + 10] === 1 ? u16(b, t) : 0)) return undefined;
    trailer = new Uint8Array(23);
    trailer.set(b.subarray(t, t + 11), 0);
    trailer.set(b.subarray(t + 12, t + 22), 11);
    trailer[21] = 0xff;
    trailer[22] = 0xff;
    cut = t;
  } else {
    return undefined;
  }
  const out = new Uint8Array(cut + trailer.length);
  out.set(b.subarray(0, cut));
  out.set(trailer, cut);
  if (b[n - 1] === 0xfe && out[out.length - 2] === 0xff) return undefined;
  return out;
}

/** ModelProbe.fuzz */
function fuzz(id: number, b: Uint8Array): Uint8Array {
  const out = b.slice();
  let x = (Math.imul(id, 7919) + 1) | 0;
  const count = 1 + (id % 4);
  for (let i = 0; i < count; i++) {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    const at = x % out.length;
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    out[at] = x >> 8;
  }
  return out;
}

// ---------- field dumps, formatted as ModelProbe.dump does ----------

const floatBits = (v: number) => {
  const f = new Float32Array(1);
  f[0] = v;
  return new Int32Array(f.buffer)[0];
};
const list = (a: ArrayLike<number> | undefined) => (a === undefined ? "null" : Array.from(a).join(","));
const list2 = (a: (ArrayLike<number> | undefined)[] | undefined) => (a === undefined ? "null" : a.map(list).join(";"));
const floats2 = (a: (Float32Array | undefined)[] | undefined) =>
  a === undefined ? "null" : a.map((x) => (x === undefined ? "null" : Array.from(x, floatBits).join(","))).join(";");

function dump(tag: string, m: ModelDefinition): string[] {
  const p = tag + ".";
  const out = [
    `${p}counts=${m.id},${m.vertexCount},${m.faceCount},${m.numTextureFaces},${m.priority},${m.maxPriority}`,
    `${p}vertexX=${list(m.vertexX)}`,
    `${p}vertexY=${list(m.vertexY)}`,
    `${p}vertexZ=${list(m.vertexZ)}`,
    `${p}faceIndices1=${list(m.faceIndices1)}`,
    `${p}faceIndices2=${list(m.faceIndices2)}`,
    `${p}faceIndices3=${list(m.faceIndices3)}`,
    `${p}faceTransparencies=${list(m.faceTransparencies)}`,
    `${p}faceColors=${list(m.faceColors)}`,
    `${p}faceRenderPriorities=${list(m.faceRenderPriorities)}`,
    `${p}faceRenderTypes=${list(m.faceRenderTypes)}`,
    `${p}texIndices1=${list(m.texIndices1)}`,
    `${p}texIndices2=${list(m.texIndices2)}`,
    `${p}texIndices3=${list(m.texIndices3)}`,
    `${p}texturePrimaryColors=${list(m.texturePrimaryColors)}`,
    `${p}faceTextures=${list(m.faceTextures)}`,
    `${p}faceZOffsets=${list(m.faceZOffsets)}`,
    `${p}textureCoords=${list(m.textureCoords)}`,
    `${p}textureRenderTypes=${list(m.textureRenderTypes)}`,
    `${p}packedVertexGroups=${list(m.packedVertexGroups)}`,
    `${p}packedTransparencyVertexGroups=${list(m.packedTransparencyVertexGroups)}`,
    `${p}vertexGroups=${list2(m.getVertexGroups())}`,
    `${p}animayaGroups=${list2(m.animayaGroups)}`,
    `${p}animayaScales=${list2(m.animayaScales)}`,
    `${p}faceTextureUCoordinates=${floats2(m.faceTextureUCoordinates)}`,
    `${p}faceTextureVCoordinates=${floats2(m.faceTextureVCoordinates)}`,
  ];
  const normals = m.vertexNormals;
  out.push(`${p}vertexNormals=${normals === undefined ? "null" : normals.map((n) => `${n.x},${n.y},${n.z},${n.magnitude}`).join(";")}`);
  out.push(
    `${p}normalized=${
      normals === undefined
        ? "null"
        : normals.map((n) => {
            const v = n.normalize();
            return `${floatBits(v.x)},${floatBits(v.y)},${floatBits(v.z)}`;
          }).join(";")
    }`,
  );
  const faceNormals = m.faceNormals;
  out.push(`${p}faceNormals=${faceNormals === undefined ? "null" : faceNormals.map((n) => (n ? `${n.x},${n.y},${n.z}` : "null")).join(";")}`);
  return out;
}

/** What ModelProbe writes for one sampled model, after "model <id>" */
function sampleLines(loader: ModelLoader, id: number, data: Uint8Array): string[] {
  const out: string[] = [];
  let m = loader.load(id, data);
  m.computeMaxPriority();
  out.push(...dump("load", m));

  m = loader.load(id, data);
  m.resize(150, 90, 128);
  if (m.faceCount > 0) m.recolor(m.faceColors[0], 1234);
  if (m.faceTextures) {
    const t = m.faceTextures.find((t) => t !== -1);
    if (t !== undefined) m.retexture(t, 7);
  }
  m.rotate(37);
  m.rotate(1500);
  m.computeNormals();
  m.computeTextureUVCoordinates();
  out.push(...dump("xform", m));

  m = loader.load(id, data);
  m.rotate1();
  m.computeNormals();
  m.rotate2();
  m.rotate3();
  m.method1493();
  m.move(10, -20, 30);
  m.computeNormals();
  m.computeTextureUVCoordinates();
  out.push(...dump("turns", m));

  m = loader.load(id, data);
  try {
    m.animate(0, [0, 1, 2, 3], 5, -3, 7);
    m.animate(2, [0, 1], 12, 200, 77);
    m.animate(3, [1, 2], 150, 100, 64);
    m.animate(1, [0, 1, 2, 3, 300], 10, 20, 30);
    m.animate(0, [], 1, 2, 3);
    m.animate(2, [2, 3], 0, 64, 255);
    m.animate(5, [0], 1, 1, 1);
    const anim = [
      `anim.verts=${list(m.vertexX)}|${list(m.vertexY)}|${list(m.vertexZ)}`,
      `anim.offset=${ModelDefinition.animOffsetX},${ModelDefinition.animOffsetY},${ModelDefinition.animOffsetZ}`,
      `anim.orig=${list(m.getOrigVX())}|${list(m.getOrigVY())}|${list(m.getOrigVZ())}`,
    ];
    m.resetAnim();
    anim.push(`anim.reset=${list(m.vertexX)}|${list(m.vertexY)}|${list(m.vertexZ)}`);
    out.push(...anim);
  } catch {
    out.push("anim=ERR");
  }
  return out;
}

run("ModelLoader against RuneLite's cache library", () => {
  const loader = new ModelLoader();

  /** Every model's decompressed archive */
  const raw = new Map<number, Uint8Array>();
  let reading: Promise<void> | undefined;
  const readAll = () =>
    (reading ??= (async () => {
      const store = await CacheStore.open(nodeSource(cacheDir));
      const index = (await store.index(MODELS))!;
      for (const id of [...index.archives.keys()].sort((a, b) => a - b)) {
        const data = await store.group(MODELS, id);
        if (data) raw.set(id, data);
      }
    })());

  it("decodes every model to the exporter's arrays, byte for byte", async () => {
    await readAll();
    const expected = readDump("hashes.txt");
    expect(raw.size).toBe(expected.size);
    const mismatched: number[] = [];
    const started = performance.now();
    for (const [id, data] of raw) {
      if (tryHash(loader, id, data) !== expected.get(id)) mismatched.push(id);
    }
    const seconds = (performance.now() - started) / 1000;
    console.log(`${raw.size} models decoded, exported and hashed in ${seconds.toFixed(1)}s; ${mismatched.length} mismatched`);

    const decodeStarted = performance.now();
    for (const [id, data] of raw) loader.load(id, data);
    console.log(`decoding alone: ${((performance.now() - decodeStarted) / 1000).toFixed(1)}s`);
    expect(mismatched.slice(0, 20)).toEqual([]);
  }, 600_000);

  it("decodes the old format and type 1 as Java does (type 2 and 3 models rewritten in them)", async () => {
    await readAll();
    const expected = readDump("convert.txt");
    let compared = 0;
    const mismatched: number[] = [];
    for (const [id, data] of raw) {
      const c = convert(data);
      if (!c) continue;
      compared++;
      if (tryHash(loader, id, c) !== expected.get(id)) mismatched.push(id);
    }
    expect(compared).toBe(expected.size);
    expect(mismatched.slice(0, 20)).toEqual([]);
  }, 600_000);

  it("fails on the same corrupted models as Java, and decodes the rest the same", async () => {
    await readAll();
    const expected = readDump("fuzz.txt");
    const mismatched: string[] = [];
    for (const [id, want] of expected) {
      const got = tryHash(loader, id, fuzz(id, raw.get(id)!));
      if (got !== want) mismatched.push(`${id}: ${got} vs ${want}`);
    }
    expect(expected.size).toBeGreaterThan(1000);
    expect(mismatched.slice(0, 20)).toEqual([]);
  }, 600_000);

  it("matches every field, and the results of ModelDefinition's methods, on a sample of models", async () => {
    await readAll();
    const lines = readFileSync(path.join(dumpDir, "fields.txt"), "utf8").split(/\r?\n/).filter((l) => l.length > 0);
    // Java's Math.sin and V8's agree after truncation for every angle
    expect(lines[0] === `SINE=${list(CircularAngle.SINE)}`).toBe(true);
    expect(lines[1] === `COSINE=${list(CircularAngle.COSINE)}`).toBe(true);
    let models = 0;
    const mismatched: string[] = [];
    for (let i = 2; i < lines.length; ) {
      const id = Number(lines[i].slice("model ".length));
      i++;
      const want: string[] = [];
      while (i < lines.length && !lines[i].startsWith("model ")) want.push(lines[i++]);
      const got = sampleLines(loader, id, raw.get(id)!);
      models++;
      if (got.length !== want.length) {
        mismatched.push(`${id}: ${got.length} lines vs ${want.length}`);
        continue;
      }
      for (let k = 0; k < got.length; k++) {
        if (got[k] !== want[k]) mismatched.push(`${id} ${want[k].slice(0, want[k].indexOf("="))}`);
      }
    }
    expect(models).toBeGreaterThan(100);
    expect(mismatched.slice(0, 40)).toEqual([]);
  }, 600_000);
});
