import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { nodeSource } from "../store/nodeSource";
import { CacheStore } from "../store/store";
import { canonical } from "./canonical";
import { ConfigType, IndexType, configRevision, loadConfigs } from "./configs";
import { DBRowLoader, DBTableLoader } from "./dbrow";
import { FrameLoader, FramemapLoader, type FramemapDefinition } from "./frames";
import { ItemLoader } from "./item";
import { KitLoader } from "./kit";
import { LocationsLoader } from "./locations";
import { MapLoader } from "./map";
import { NpcLoader } from "./npc";
import { ObjectLoader } from "./object";
import { OverlayLoader } from "./overlay";
import { HeightCalc, Region } from "./region";
import { SequenceLoader } from "./sequence";
import { SpotAnimLoader } from "./spotanim";
import { SpriteLoader } from "./sprite";
import { TextureLoader } from "./texture";
import { UnderlayLoader } from "./underlay";

// The exporter's copy of the game cache (Jagex's, never committed), and the Java cache library's view of it
// that exporter/build/DefsProbe.java writes: a hash of each definition's canonical JSON
const cacheDir = resolve(__dirname, "../../../exporter/build/cache-live");
const refDir = resolve(__dirname, "../../../exporter/build/probe-defs/ref");
const run = existsSync(cacheDir) && existsSync(resolve(refDir, "meta.txt")) ? describe : describe.skip;
// Set DEFS_DEBUG=1 to write the port's canonical JSON for the first mismatches next to the reference
const debugDir = process.env.DEFS_DEBUG ? resolve(refDir, "../debug-ts") : undefined;

const sha1 = (s: string) => createHash("sha1").update(s, "utf8").digest("hex");

function reference(kind: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(resolve(refDir, `${kind}.txt`), "utf8").split(/\r?\n/)) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    out.set(line.slice(0, tab), line.slice(tab + 1));
  }
  return out;
}

/** Compares each key's value with the Java's; a thrown error matches a Java exception */
async function compare(kind: string, keys: Iterable<string>, make: (key: string) => unknown | Promise<unknown>) {
  const ref = reference(kind);
  const mismatches: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    seen.add(key);
    let value: string;
    let json = "";
    try {
      json = canonical(await make(key));
      value = sha1(json);
    } catch (e) {
      value = `ERR ${(e as Error).message}`;
    }
    const want = ref.get(key);
    const same = want === value || (want?.startsWith("ERR") && value.startsWith("ERR"));
    if (!same) {
      if (mismatches.length < 10 && debugDir) {
        mkdirSync(debugDir, { recursive: true });
        writeFileSync(resolve(debugDir, `${kind}_${key.replace(":", "_")}.json`), json);
      }
      mismatches.push(`${kind} ${key}: ${value}`);
    }
  }
  for (const key of ref.keys()) if (!seen.has(key)) mismatches.push(`${kind} ${key}: missing from the port`);
  expect(mismatches.slice(0, 10)).toEqual([]);
  expect(seen.size).toBe(ref.size);
  return seen.size;
}

run("definition loaders match RuneLite's Java cache library", () => {
  let store: CacheStore;
  beforeAll(async () => {
    store = await CacheStore.open(nodeSource(cacheDir));
  });
  const group = async (index: number, archive: number) => {
    const data = await store.group(index, archive);
    if (!data) throw new Error(`No archive ${index}/${archive}`);
    return data;
  };
  const config = async (kind: string, type: number, load: (id: number, b: Uint8Array) => unknown) => {
    const files = await loadConfigs(store, type);
    return compare(kind, [...files.keys()].map(String), (key) => load(Number(key), files.get(Number(key))!));
  };
  const T = 300_000;

  it("reads the config archives' revisions", async () => {
    for (const line of readFileSync(resolve(refDir, "meta.txt"), "utf8").trim().split(/\r?\n/)) {
      const [name, rev] = line.split("\t");
      expect(await configRevision(store, ConfigType[name as keyof typeof ConfigType])).toBe(Number(rev));
    }
  });

  it("npcs", async () => {
    const loader = new NpcLoader().configureForRevision(await configRevision(store, ConfigType.NPC));
    expect(await config("npc", ConfigType.NPC, (id, b) => loader.load(id, b))).toBeGreaterThan(10000);
  }, T);

  it("objects", async () => {
    const loader = new ObjectLoader().configureForRevision(await configRevision(store, ConfigType.OBJECT));
    expect(await config("object", ConfigType.OBJECT, (id, b) => loader.load(id, b))).toBeGreaterThan(10000);
  }, T);

  it("items", async () => {
    expect(await config("item", ConfigType.ITEM, (id, b) => new ItemLoader().load(id, b))).toBeGreaterThan(10000);
  }, T);

  it("kits", async () => {
    expect(await config("kit", ConfigType.IDENTKIT, (id, b) => new KitLoader().load(id, b))).toBeGreaterThan(100);
  }, T);

  it("spot animations", async () => {
    expect(await config("spotanim", ConfigType.SPOTANIM, (id, b) => new SpotAnimLoader().load(id, b))).toBeGreaterThan(1000);
  }, T);

  it("sequences", async () => {
    const loader = new SequenceLoader().configureForRevision(await configRevision(store, ConfigType.SEQUENCE));
    expect(await config("sequence", ConfigType.SEQUENCE, (id, b) => loader.load(id, b))).toBeGreaterThan(10000);
  }, T);

  it("underlays and overlays, with their colours worked out", async () => {
    expect(await config("underlay", ConfigType.UNDERLAY, (id, b) => new UnderlayLoader().load(id, b))).toBeGreaterThan(100);
    expect(await config("overlay", ConfigType.OVERLAY, (id, b) => new OverlayLoader().load(id, b))).toBeGreaterThan(100);
  }, T);

  it("database rows and tables", async () => {
    expect(await config("dbrow", ConfigType.DBROW, (id, b) => new DBRowLoader().load(id, b))).toBeGreaterThan(1000);
    expect(await config("dbtable", ConfigType.DBTABLE, (id, b) => new DBTableLoader().load(id, b))).toBeGreaterThan(100);
  }, T);

  it("the older-revision branches, run over today's data, fail or produce nonsense exactly as the Java does", async () => {
    const oldNpc = new NpcLoader().configureForRevision(0);
    await config("npc-old", ConfigType.NPC, (id, b) => oldNpc.load(id, b));
    const oldObject = new ObjectLoader().configureForRevision(0);
    await config("object-old", ConfigType.OBJECT, (id, b) => oldObject.load(id, b));
    const oldSequence = new SequenceLoader().configureForRevision(0);
    await config("sequence-old", ConfigType.SEQUENCE, (id, b) => oldSequence.load(id, b));
    const midSequence = new SequenceLoader().configureForRevision(1200);
    await config("sequence-mid", ConfigType.SEQUENCE, (id, b) => midSequence.load(id, b));
    const files = (await store.files(IndexType.TEXTURES, 0))!;
    await compare("texture-old", [...files.keys()].map(String), (key) => new TextureLoader().setRev233(false).load(Number(key), files.get(Number(key))!));
  }, T);

  it("textures, and their pixels as RSTextureProvider draws them", async () => {
    const files = (await store.files(IndexType.TEXTURES, 0))!;
    const loader = new TextureLoader();
    expect(await compare("texture", [...files.keys()].map(String), (key) => loader.load(Number(key), files.get(Number(key))!))).toBeGreaterThan(100);
    const sprites = new Map<number, Uint8Array>();
    for (const t of [...files].map(([id, b]) => loader.load(id, b))) {
      for (const s of t.fileIds) if (!sprites.has(s)) sprites.set(s, await group(IndexType.SPRITES, s));
    }
    // method2680 recolours the sprite's palette in place, so each call gets a fresh one
    const provider = { provide: (id: number, frame: number) => new SpriteLoader().load(id, sprites.get(id)!)[frame] };
    const keys = [...files.keys()].flatMap((id) => [`${id}:128`, `${id}:64`]);
    await compare("texpix", keys, (key) => {
      const [id, size] = key.split(":").map(Number);
      const t = loader.load(id, files.get(id)!);
      t.method2680(0.8, size, provider);
      return t.pixels;
    });
  }, T);

  it("sprites", async () => {
    const keys = [...reference("sprite").keys()];
    expect(await compare("sprite", keys, async (key) => new SpriteLoader().load(Number(key), await group(IndexType.SPRITES, Number(key))))).toBeGreaterThan(1000);
  }, T);

  it("frames and framemaps", async () => {
    const framemaps = new Map<number, FramemapDefinition>();
    const archives = new Map<number, Map<number, Uint8Array>>();
    const frameKeys = [...reference("frame").keys()];
    expect(frameKeys.length).toBeGreaterThan(1000);
    await compare("frame", frameKeys, async (key) => {
      const archiveId = Number(key) >>> 16;
      let files = archives.get(archiveId);
      if (!files) archives.set(archiveId, (files = (await store.files(IndexType.ANIMATIONS, archiveId))!));
      const contents = files.get(Number(key) & 0xffff)!;
      const framemapId = (contents[0] << 8) | contents[1];
      let framemap = framemaps.get(framemapId);
      if (!framemap) framemaps.set(framemapId, (framemap = new FramemapLoader().load(framemapId, await group(IndexType.SKELETONS, framemapId))));
      return new FrameLoader().load(framemap, Number(key) & 0xffff, contents);
    });
    await compare("framemap", reference("framemap").keys(), async (key) => new FramemapLoader().load(Number(key), await group(IndexType.SKELETONS, Number(key))));
  }, T);

  it("map squares: terrain, locations and regions (Edgeville, the Grand Exchange and a sample)", async () => {
    const keys = [...reference("region").keys()];
    for (const id of ["12342", "12598"]) expect(keys).toContain(id);
    const square = async (id: number) => {
      const files = (await store.files(IndexType.MAPS, id))!;
      return { rx: id >> 8, ry: id & 0xff, terrain: files.get(0)!, locations: files.get(1) };
    };
    await compare("mapdef", keys, async (key) => {
      const s = await square(Number(key));
      return new MapLoader().load(s.rx, s.ry, s.terrain);
    });
    await compare("locdef", reference("locdef").keys(), async (key) => {
      const s = await square(Number(key));
      return new LocationsLoader().load(s.rx, s.ry, s.locations!);
    });
    await compare("region", keys, async (key) => {
      const s = await square(Number(key));
      const region = new Region(s.rx, s.ry);
      region.loadTerrain(new MapLoader().load(s.rx, s.ry, s.terrain));
      if (s.locations) region.loadLocations(new LocationsLoader().load(s.rx, s.ry, s.locations));
      return region;
    });
  }, T);

  it("height noise tables", async () => {
    await compare("heightcalc", ["SIN", "COS"], (key) => (key === "SIN" ? HeightCalc.SIN : HeightCalc.COS));
  });
});
