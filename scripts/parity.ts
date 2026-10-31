/**
 * Checks the in-browser bundle builder against the Java exporter: for each session, exports a fresh
 * bundle with the exporter and builds one with buildBundle from the same cache copy, then compares them
 * field by field. Pictures are compared by their pixels, since the two PNG encoders differ.
 *
 *   npx vite-node scripts/parity.ts sessions/tfa.jsonl [more sessions...]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { unzlibSync } from "fflate";
import { forJava, java } from "../exportServer";
import { buildBundle } from "../src/cache/build/buildBundle";
import { nodeSource } from "../src/cache/store/nodeSource";
import { CacheStore } from "../src/cache/store/store";
import { readRecordingSync } from "./recordingFile";
import { withoutEnding } from "../src/packed";

const ROOT = resolve(__dirname, "..");
const BUILD = join(ROOT, "exporter", "build");
const CACHE = join(BUILD, "cache-live");
const OUT = join(BUILD, "parity");
const JAVA = java();

function javaExport(session: string): string {
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, `${withoutEnding(basename(session))}.bundle.json`);
  if (existsSync(out) && statSync(out).mtimeMs > statSync(join(CACHE, "main_file_cache.dat2")).mtimeMs && statSync(out).mtimeMs > statSync(session).mtimeMs) return out;
  if (!JAVA) throw new Error("No Java found: set ENCOUNTER_JAVA");
  const win = (p: string) => forJava(p, JAVA);
  const cp = [join(BUILD, "classes", "java", "main"), join(BUILD, "deps", "*")].map(win).join(JAVA.endsWith(".exe") ? ";" : ":");
  // The exporter reads plain JSON lines: a packed recording is unpacked next to its bundle first
  const plain = session.endsWith(".gz") ? join(OUT, `${withoutEnding(basename(session))}.jsonl`) : session;
  if (plain !== session) writeFileSync(plain, readRecordingSync(session));
  execFileSync(JAVA, ["-Xmx3g", "-cp", cp, "encounterreplay.Exporter", win(CACHE), win(plain), win(out)], { stdio: "inherit" });
  return out;
}

/** RGBA pixels of a PNG data URL (8-bit, non-interlaced, as both encoders write them) */
function pixels(url: string): { w: number; h: number; rgba: Uint8Array } {
  const bytes = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  let at = 8;
  let w = 0;
  let h = 0;
  let type = 6;
  let palette: Uint8Array | undefined;
  let alpha: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  while (at < bytes.length) {
    const len = view.getUint32(at);
    const kind = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (kind === "IHDR") {
      w = view.getUint32(at + 8);
      h = view.getUint32(at + 12);
      if (data[8] !== 8 || data[12] !== 0) throw new Error(`Unsupported PNG: depth ${data[8]}, interlace ${data[12]}`);
      type = data[9];
    } else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") alpha = data;
    else if (kind === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  idat.reduce((o, d) => (joined.set(d, o), o + d.length), 0);
  const raw = unzlibSync(joined);
  const channels = type === 6 ? 4 : type === 2 ? 3 : type === 3 ? 1 : type === 4 ? 2 : 1;
  const stride = w * channels;
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (type === 6) rgba.set(cur.subarray(x * 4, x * 4 + 4), o);
      else if (type === 2) rgba.set([cur[x * 3], cur[x * 3 + 1], cur[x * 3 + 2], 255], o);
      else if (type === 3) {
        const i = cur[x];
        rgba.set([palette![i * 3], palette![i * 3 + 1], palette![i * 3 + 2], alpha && i < alpha.length ? alpha[i] : 255], o);
      } else if (type === 4) rgba.set([cur[x * 2], cur[x * 2], cur[x * 2], cur[x * 2 + 1]], o);
      else rgba.set([cur[x], cur[x], cur[x], 255], o);
    }
    prev.set(cur);
  }
  // Fully transparent pixels can hold any colour: compare them as one
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] === 0) rgba.fill(0, i, i + 4);
  return { w, h, rgba };
}

function samePicture(a: string, b: string): boolean {
  const x = pixels(a);
  const y = pixels(b);
  return x.w === y.w && x.h === y.h && x.rgba.every((v, i) => v === y.rgba[i]);
}

const diffs = new Map<string, string[]>();
function differ(path: string, why: string): void {
  const top = path.split(".").slice(0, 2).join(".");
  const list = diffs.get(top) ?? [];
  list.push(`${path}: ${why}`);
  diffs.set(top, list);
}

function compare(path: string, java: unknown, ts: unknown): void {
  if (typeof java === "string" && typeof ts === "string" && java.startsWith("data:image/png") && ts.startsWith("data:image/png")) {
    if (!samePicture(java, ts)) differ(path, "picture differs");
    return;
  }
  if (Array.isArray(java) && Array.isArray(ts)) {
    if (java.length !== ts.length) differ(path, `length ${java.length} vs ${ts.length}`);
    for (let i = 0; i < Math.min(java.length, ts.length); i++) compare(`${path}[${i}]`, java[i], ts[i]);
    return;
  }
  if (java && ts && typeof java === "object" && typeof ts === "object") {
    const j = java as Record<string, unknown>;
    const t = ts as Record<string, unknown>;
    for (const k of new Set([...Object.keys(j), ...Object.keys(t)])) {
      if (!(k in t)) differ(`${path}.${k}`, "missing from the TS bundle");
      else if (!(k in j)) differ(`${path}.${k}`, "only in the TS bundle");
      else compare(`${path}.${k}`, j[k], t[k]);
    }
    return;
  }
  if (java !== ts) differ(path, `${JSON.stringify(java)?.slice(0, 80)} vs ${JSON.stringify(ts)?.slice(0, 80)}`);
}

const store = await CacheStore.open(nodeSource(CACHE));
let failed = false;
for (const session of process.argv.slice(2).map((s) => resolve(s))) {
  diffs.clear();
  const reference = JSON.parse(readFileSync(javaExport(session), "utf8"));
  const started = Date.now();
  const built = await buildBundle(store, readRecordingSync(session));
  const took = Date.now() - started;
  // Built from the same cache, the TS bundle should match except for its notes
  compare("bundle", reference, JSON.parse(JSON.stringify(built)));
  const total = [...diffs.values()].reduce((n, l) => n + l.length, 0);
  console.log(`${basename(session)}: built in ${(took / 1000).toFixed(1)}s, ${total} differences`);
  for (const [top, list] of diffs) {
    console.log(`  ${top}: ${list.length}`);
    for (const d of list.slice(0, 5)) console.log(`    ${d}`);
  }
  if (total) failed = true;
}
process.exit(failed ? 1 : 0);
