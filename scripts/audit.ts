/**
 * Checks a session and its cache bundle for the failures recorded in docs/LESSONS.md, so a new location
 * shows its problems as numbers before anyone looks at the replay.
 *
 *   npm run audit -- sessions/<name>.jsonl [assets/cache/<name>.bundle.json]
 *
 * Exits with status 1 if anything fails.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { Bundle } from "../src/cache/bundle";
import { ObjectTimeline } from "../src/objects";
import { clickOutcomes } from "../src/outcomes";
import { EffectLinks } from "../src/links";
import { lengthOf } from "../src/cache/models";
import { Session, type Line } from "../src/session";
import { readRecordingSync } from "./recordingFile";
import { withoutEnding } from "../src/packed";

type Level = "PASS" | "WARN" | "FAIL" | "INFO";
const results: { level: Level; check: string; detail: string }[] = [];
const note = (level: Level, check: string, detail: string) => results.push({ level, check, detail });

const sessionPath = process.argv[2];
if (!sessionPath) {
  console.error("Usage: npm run audit -- sessions/<name>.jsonl [bundle.json]");
  process.exit(2);
}
const bundlePath = process.argv[3] ?? `assets/cache/${withoutEnding(basename(sessionPath))}.bundle.json`;
const session = Session.parse(readRecordingSync(sessionPath));
if (!existsSync(bundlePath)) {
  console.error(`No bundle at ${bundlePath}: export one first (see README, "Game models")`);
  process.exit(2);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw: any = JSON.parse(readFileSync(bundlePath, "utf8"));
const bundle = new Bundle(raw);
const lines = session.lines;
const byEvent = (e: string) => lines.filter((l) => l.e === e);
const sample = (xs: unknown[], n = 6) => xs.slice(0, n).join(", ") + (xs.length > n ? `, … (${xs.length})` : "");

// The bundle belongs to this session's game version
const revision = session.header?.revision;
if (raw.sessionRevision !== revision) note("FAIL", "bundle matches session", `bundle was exported for revision ${raw.sessionRevision}, session is ${revision}`);
else note("PASS", "bundle matches session", `revision ${revision}`);

// #7 Object floors
const format = session.header?.format ?? 0;
if (format < 3) note("WARN", "object floors (#7)", `format ${format}: objects' floors are inferred from the map dump's order; re-record with format 3 for exact floors`);
else note("PASS", "object floors (#7)", `format ${format} records each object's floor`);

// #3 Ground tiles for every instance map load
const emptyLoads: number[] = [];
for (const scene of session.scenes) {
  if (!scene.instance) continue;
  const terrain = bundle.terrain(scene.t, scene.plane ?? 0);
  let tiles = 0;
  if (terrain) for (let i = 0; i < terrain.under.length; i++) if (terrain.under[i] >= 0 || terrain.over[i] !== -1) tiles++;
  if (!tiles) emptyLoads.push(scene.t);
}
const instanceLoads = session.scenes.filter((s) => s.instance).length;
if (emptyLoads.length) note("FAIL", "instance ground (#3)", `map loads with no ground tiles on your floor at ticks ${sample(emptyLoads)}`);
else note("PASS", "instance ground (#3)", `${instanceLoads} instance map loads all have ground`);

// #29 Open-world map loads: ground, heights and objects come from the cache
const openLoads = session.scenes.filter((s) => !s.instance);
const bare = openLoads.filter((s) => !bundle.mapHeights(s.t) || !bundle.mapObjects(s.t)?.length);
if (bare.length) note("FAIL", "open-world maps (#29)", `map loads with no ground or objects from the cache at ticks ${sample(bare.map((s) => s.t))}`);
else if (openLoads.length) note("PASS", "open-world maps (#29)", `${openLoads.length} open-world map loads built from the cache`);

// #30 Instance floors: positions carry the template's floor
const shared = session.scenes.filter((s) => s.instance && s.templates && new Set((s.templates as number[][][]).slice(0, 3).map((z) => z.flat().find((v) => v !== -1)).filter((v) => v !== undefined).map((v) => ((v as number) >> 24) & 3)).size === 1 && (s.templates as number[][][]).filter((z) => z.flat().some((v) => v !== -1)).length > 1);
if (shared.length && format < 5) note("INFO", "instance floors (#30)", `${shared.length} instance(s) copy several floors from one template floor; floors worked out from template chunks (format 5 records them)`);

// #6 Signed object offsets
const unsigned = Object.entries(raw.objects).filter(([, d]) => (d as { offset: number[] }).offset.some((v) => v > 32767));
if (unsigned.length) note("WARN", "object offsets (#6)", `${unsigned.length} objects have offsets read unsigned (old exporter); the replay corrects them, but re-export`);
else note("PASS", "object offsets (#6)", "all signed");

// #4 Bone labels on models that classic animations move
const playerModels = new Set<number>();
for (const item of Object.values(raw.items) as { male: number[]; female: number[] }[]) for (const m of [...item.male, ...item.female]) if (m >= 0) playerModels.add(m);
for (const kit of Object.values(raw.kits) as { models: number[] }[]) for (const m of kit.models) playerModels.add(m);
const labelled = [...playerModels].filter((m) => raw.models[m]?.vg).length;
if (playerModels.size && labelled / playerModels.size < 0.5) note("FAIL", "bone labels (#4)", `only ${labelled} of ${playerModels.size} player models have bone labels: classic animations won't move them`);
else note("PASS", "bone labels (#4)", `${labelled} of ${playerModels.size} player models labelled`);

// #5 Skeletal animations decode; classic ones have their frames
const sequences = Object.entries(raw.sequences) as [string, { skeletal?: { id: number }; frames?: number[] }][];
const undecoded = sequences.filter(([, s]) => s.skeletal && !bundle.skeletalAnimation(s.skeletal.id)).map(([id]) => id);
const skeletalCount = sequences.filter(([, s]) => s.skeletal).length;
if (undecoded.length) note("FAIL", "skeletal animations (#5)", `${undecoded.length} of ${skeletalCount} don't decode: ${sample(undecoded)}`);
else note("PASS", "skeletal animations (#5)", `${skeletalCount} decode`);
const missingFrames = sequences.filter(([, s]) => s.frames?.some((f) => !raw.frames[f])).map(([id]) => id);
if (missingFrames.length) note("WARN", "animation frames", `${missingFrames.length} classic animations miss frames: ${sample(missingFrames)}`);

// #13 Graphics sit at their tile's height
let gfxChecked = 0;
let gfxFar = 0;
for (const g of byEvent("gfx")) {
  const scene = session.sceneAt(g.t);
  const h = scene?.heights?.[scene.plane ?? 0]?.[g.sx]?.[g.sy];
  if (h == null || g.z == null) continue;
  gfxChecked++;
  if (Math.abs(g.z - h) > 512) gfxFar++;
}
if (gfxChecked && gfxFar / gfxChecked > 0.1) note("WARN", "graphic heights (#13)", `${gfxFar} of ${gfxChecked} graphics are over 4 tiles from their tile's height: check how z is meant`);
else note("PASS", "graphic heights (#13)", `${gfxChecked - gfxFar} of ${gfxChecked} sit at their tile's height`);

// #14 Textures have images; textured models have coordinates
const usedTextures = new Set<number>();
let texturedWithoutUv = 0;
for (const id of Object.keys(raw.models)) {
  const m = bundle.model(Number(id));
  if (!m?.textures) continue;
  let any = false;
  for (const t of m.textures) if (t >= 0) { usedTextures.add(t); any = true; }
  if (any && !m.uv) texturedWithoutUv++;
}
const imageless = [...usedTextures].filter((t) => !raw.textureImages?.[t]);
if (imageless.length) note("FAIL", "texture images (#14)", `textures used with no image: ${sample(imageless)}`);
else note("PASS", "texture images (#14)", `${usedTextures.size} textures all have images`);
if (texturedWithoutUv) note("WARN", "texture coordinates (#14)", `${texturedWithoutUv} textured models have no coordinates`);

// #15 Graphics (on tiles, on actors, in flight) have definitions and models
const graphicIds = new Set<number>();
for (const l of lines) {
  if (l.e === "gfx" || l.e === "proj") graphicIds.add(l.id);
  if (l.e === "spot") for (const s of l.spot) graphicIds.add(s.id);
}
const noGraphic = [...graphicIds].filter((id) => !raw.spotanims[id] || (raw.spotanims[id].model >= 0 && !raw.models[raw.spotanims[id].model]));
if (noGraphic.length) note("WARN", "graphics (#15)", `${noGraphic.length} of ${graphicIds.size} graphics have no definition or model: ${sample(noGraphic)}`);
else note("PASS", "graphics (#15)", `${graphicIds.size} graphics all drawable`);

// NPCs have definitions and models
const npcIds = new Set<number>();
for (const tick of session.ticks) for (const n of tick?.npcs ?? []) if (n.who && "id" in n.who) npcIds.add(n.who.id);
const noNpc = [...npcIds].filter((id) => !raw.npcs[id]);
const npcNoModel = [...npcIds].filter((id) => raw.npcs[id]?.models.some((m: number) => !raw.models[m]));
if (noNpc.length || npcNoModel.length) note("WARN", "NPCs", `${noNpc.length} without a definition (${sample(noNpc)}), ${npcNoModel.length} missing models (${sample(npcNoModel)})`);
else note("PASS", "NPCs", `${npcIds.size} NPCs all drawable`);

// #12 Objects: which have no model for their shape (normal for invisible markers, worth a look if many)
const timeline = new ObjectTimeline(session);
const reasons = new Map<string, number>();
for (const o of timeline.objects) {
  const def = raw.objects[o.line.id];
  const shape = (o.line.config ?? 10) & 0x1f;
  let reason = "";
  if (!def) reason = "no definition";
  else if (shape >= 12 && shape <= 21) reason = "roof shape (hidden)";
  else if (!def.models.length) reason = "no models";
  else if (!def.types.length ? shape !== 10 && shape !== 11 : !def.types.includes(shape === 11 ? 10 : shape)) reason = `no model for shape ${shape}`;
  else if (def.models.some((m: number) => m >= 0 && !raw.models[m])) reason = "model missing from bundle";
  if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
}
const broken = (reasons.get("no definition") ?? 0) + (reasons.get("model missing from bundle") ?? 0);
const summary = [...reasons].map(([r, n]) => `${n} ${r}`).join(", ") || "none";
note(broken ? "WARN" : "INFO", "objects without a model (#12)", `${timeline.objects.length} placements; ${summary}`);

// #19 Side panel: interface sprites and an icon for every held item
const held = new Set<number>();
for (const l of byEvent("items")) for (const [id] of l.items as [number, number][]) if (id > 0) held.add(id);
const noIcon = [...held].filter((id) => !raw.itemIcons?.[id] && !Object.keys(raw.itemIcons ?? {}).some((k) => k.startsWith(`${id}:`)));
if (!raw.uiSprites || !Object.keys(raw.uiSprites).length) note("WARN", "side panel sprites (#19)", "no interface sprites: the side panel is drawn plainly");
else if (noIcon.length) note("FAIL", "item icons (#19)", `${noIcon.length} of ${held.size} held items have no icon: ${sample(noIcon)}`);
else note("PASS", "item icons (#19)", `${held.size} held items all have icons`);

// #21 What the server did with clicks
const outcomes = clickOutcomes(session);
const counts = new Map<string, number>();
for (const o of outcomes) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
note("INFO", "click outcomes (#21)", [...counts].map(([s, n]) => `${n} ${s}`).join(", "));
note(format >= 4 ? "PASS" : "INFO", "click accuracy (#22)", format >= 4 ? "button positions and presses recorded" : `format ${format}: no button positions, so no click accuracy`);

// Effects tied to animations, learned from this recording's repetitions
const links = new EffectLinks(session, (anim) => lengthOf(bundle, anim));
const animIds = [...new Set(lines.filter((l) => l.e === "anim" && l.a !== -1).map((l) => l.a as number))];
const tied = animIds.filter((a) => links.linksOf(a).length);
note("INFO", "effects tied to animations", `${tied.length} of ${animIds.length} animations have effects that reliably follow them (${sample(tied.map((a) => `${a}: ${links.linksOf(a).map((x) => `${x.kind} ${x.id}`).join("+")}`), 4)})`);

// #17 Overhead icons
const usesIcons = lines.some((l: Line) => l.e === "tick" && ((l.me?.head ?? null) !== null || (l.players ?? []).some((p: Line) => p.head) || l.npcs.some((n: Line) => n.head)));
if (usesIcons && !raw.sprites?.["440"]) note("WARN", "overhead icons (#17)", "prayers are used but the bundle has no prayer sprites");

// Report
const width = Math.max(...results.map((r) => r.check.length));
for (const r of results) console.log(`${r.level.padEnd(4)}  ${r.check.padEnd(width)}  ${r.detail}`);
const failed = results.filter((r) => r.level === "FAIL").length;
const warned = results.filter((r) => r.level === "WARN").length;
console.log(`\n${failed} failed, ${warned} warnings. See docs/LESSONS.md for what each check guards against.`);
process.exit(failed ? 1 : 0);
