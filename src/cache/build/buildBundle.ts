import { CacheStore } from "../store/store";
import { ConfigType, IndexType, configRevision, loadConfigs } from "../defs/configs";
import { DBRowLoader } from "../defs/dbrow";
import { FrameLoader, FramemapLoader, type FramemapDefinition } from "../defs/frames";
import { ItemLoader, type ItemDefinition } from "../defs/item";
import { KitLoader } from "../defs/kit";
import { LocationsLoader } from "../defs/locations";
import { MapLoader } from "../defs/map";
import { NpcLoader } from "../defs/npc";
import { ObjectLoader } from "../defs/object";
import { OverlayLoader, type OverlayDefinition } from "../defs/overlay";
import { Region } from "../defs/region";
import { SequenceLoader } from "../defs/sequence";
import { SpotAnimLoader } from "../defs/spotanim";
import { SpriteLoader, type SpriteDefinition } from "../defs/sprite";
import { TextureLoader, type TextureDefinition } from "../defs/texture";
import { UnderlayLoader, type UnderlayDefinition } from "../defs/underlay";
import { createSprite, iconNeeds } from "../icons/itemSpriteFactory";
import { exportModel } from "../model/exportModel";
import { ModelLoader } from "../model/modelLoader";
import type { ModelDefinition } from "../model/modelDefinition";
import { base64, pngDataUrl } from "./png";

/**
 * Builds a session's cache bundle in the browser, from the player's own game cache: what the Java
 * exporter (exporter/.../Exporter.java) writes, made the same way. Every NPC, object, item, body part,
 * graphic and animation the recording uses, with their models, animation frames, textures, terrain,
 * interface sprites and item icons.
 */

type Json = Record<string, unknown>;
type Line = Json & { e?: string };

/**
 * Interface sprites for drawing the side panel as in game, by their names in RuneLite's gameval SpriteID:
 * the tab icons, prayers lit and dim plus the active glow, equipment slots, orbs and the panel's stone
 */
const UI_SPRITES = [
  // SideiconsInterface: combat, stats, quests, inventory, equipment, prayer, magic, chat channel,
  // friends, ignores, logout, options, emotes, music, clan, character summary
  774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 2307, 2309,
  // SideiconsInterface magic tab for the ancient, lunar and arceuus spellbooks
  1583, 1584, 1711,
  // Prayeron, Prayeroff and Prayerglow.ACTIVATED
  115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134,
  502, 503, 504, 505, 945, 946, 947, 1420, 1421, 1422, 1423,
  135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154,
  506, 507, 508, 509, 949, 950, 951, 1424, 1425, 1426, 1427, 4892,
  // Wornicons, and Miscgraphics EQUIPMENT_SLOT_TILE and EQUIPMENT_SLOT_SELECTED
  156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 170, 179,
  // SIDE_BACKGROUND and its edges, SideStoneHighlights, Tabs
  1031, 1032, 1033, 1034, 1035, 1036, 1026, 1027, 1028, 1029, 1030, 952, 953,
  // OrbFrame, OrbFiller, OrbIcon
  1071, 1072, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1102, 1607, 1608,
  1058, 1067, 1068, 1069, 1070, 1610,
];

/** Little-endian bytes of typed arrays as base64, as the exporter writes them */
const b64 = (a: Int32Array | Int16Array | Int8Array | Uint8Array | Float32Array) =>
  base64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const ints = (values: ArrayLike<number> | undefined) => Array.from(values ?? []);

export interface BuildProgress {
  (step: string): void;
}

export async function buildBundle(store: CacheStore, sessionText: string, progress: BuildProgress = () => {}): Promise<Json> {
  return new BundleBuilder(store, progress).build(sessionText);
}

class BundleBuilder {
  private readonly npcIds = new Set<number>();
  private readonly objectIds = new Set<number>();
  private readonly itemIds = new Set<number>();
  private readonly kitIds = new Set<number>();
  private readonly spotIds = new Set<number>();
  private readonly sequenceIds = new Set<number>();
  private readonly modelIds = new Set<number>();
  private readonly textureIds = new Set<number>();
  private readonly skeletalIds = new Set<number>();
  // Overhead icons: prayers (440) and skulls (439), plus any other group an NPC's head icon names
  private readonly spriteGroups = new Set<number>([439, 440]);
  // Items seen in your inventory and equipment, with the stack sizes seen (some items look different by stack)
  private readonly heldItems = new Map<number, Set<number>>();
  private readonly widgetSprites = new Set<number>();
  private readonly scenes: Line[] = [];
  private revision = -1;
  /** Open-world map loads by tick: their scene's objects from the cache */
  private readonly openWorld = new Map<number, { baseX: number; baseY: number; objects: string }>();
  private readonly regions = new Map<number, Region | null>();

  constructor(private readonly store: CacheStore, private readonly progress: BuildProgress) {}

  async build(sessionText: string): Promise<Json> {
    for (const raw of sessionText.split("\n")) {
      if (!raw.trim()) continue;
      let line: Line;
      try {
        line = JSON.parse(raw);
      } catch {
        continue;
      }
      if (line && typeof line === "object") this.collect(line);
    }

    const bundle: Json = { format: 1, sessionRevision: this.revision, note: "Made from the game cache for local replays only. Do not publish." };

    // Open-world map loads get their ground, heights and objects from the cache; their objects need
    // definitions and models like any other, so this runs first
    this.progress("map squares");
    await this.prepareOpenWorld();

    this.progress("definitions");
    const npcLoader = new NpcLoader().configureForRevision(await configRevision(this.store, ConfigType.NPC));
    const npcs = await this.loadConfig(ConfigType.NPC, this.npcIds, (id, data) => npcLoader.load(id, data));
    const objectLoader = new ObjectLoader().configureForRevision(await configRevision(this.store, ConfigType.OBJECT));
    const objects = await this.loadConfig(ConfigType.OBJECT, this.objectIds, (id, data) => objectLoader.load(id, data));
    const itemLoader = new ItemLoader();
    const items = await this.loadConfig(ConfigType.ITEM, this.itemIds, (id, data) => itemLoader.load(id, data));
    // Items that look different by stack size (coins, arrows) point at other items for each size
    const variants = new Set<number>();
    for (const d of items.values()) for (const v of d.countObj ?? []) if (v > 0 && !items.has(v)) variants.add(v);
    if (variants.size) for (const [id, d] of await this.loadConfig(ConfigType.ITEM, variants, (i, data) => itemLoader.load(i, data))) items.set(id, d);
    const kitLoader = new KitLoader();
    const kits = await this.loadConfig(ConfigType.IDENTKIT, this.kitIds, (id, data) => kitLoader.load(id, data));
    const spotLoader = new SpotAnimLoader();
    const spots = await this.loadConfig(ConfigType.SPOTANIM, this.spotIds, (id, data) => spotLoader.load(id, data));

    const npcJson: Json = {};
    for (const [id, n] of npcs) {
      const o: Json = { name: n.name, size: n.size, models: ints(n.models) };
      this.addModels(n.models);
      recolors(o, n.recolorToFind, n.recolorToReplace, n.retextureToFind, n.retextureToReplace);
      o.widthScale = n.widthScale;
      o.heightScale = n.heightScale;
      o.anims = [n.standingAnimation, n.walkingAnimation, n.runAnimation, n.rotate180Animation, n.rotateLeftAnimation, n.rotateRightAnimation];
      for (const a of [n.standingAnimation, n.walkingAnimation, n.runAnimation]) this.sequenceIds.add(a);
      npcJson[id] = o;
    }
    bundle.npcs = npcJson;

    const objectJson: Json = {};
    for (const [id, d] of objects) {
      const o: Json = { name: d.name, models: ints(d.objectModels), types: ints(d.objectTypes) };
      this.addModels(d.objectModels);
      o.sizeX = d.sizeX;
      o.sizeY = d.sizeY;
      o.scale = [d.modelSizeX, d.modelSizeHeight, d.modelSizeY];
      // Offsets are signed 16-bit values that the cache library reads as unsigned
      o.offset = [short(d.offsetX), short(d.offsetHeight), short(d.offsetY)];
      o.mirror = d.isRotated;
      o.contoured = d.contouredGround;
      o.decorDisplacement = d.decorDisplacement;
      o.anim = d.animationID;
      if (d.animationID !== -1) this.sequenceIds.add(d.animationID);
      recolors(o, d.recolorToFind, d.recolorToReplace, d.retextureToFind, d.textureToReplace);
      objectJson[id] = o;
    }
    bundle.objects = objectJson;

    const itemJson: Json = {};
    for (const [id, d] of items) {
      const o: Json = {
        name: d.name,
        category: d.category,
        male: [d.maleModel0, d.maleModel1, d.maleModel2],
        female: [d.femaleModel0, d.femaleModel1, d.femaleModel2],
        maleOffset: d.maleOffset,
        femaleOffset: d.femaleOffset,
        // On the ground an item is its inventory model, resized
        ground: d.inventoryModel,
        resize: [d.resizeX, d.resizeY, d.resizeZ],
      };
      this.addModels([d.inventoryModel]);
      if (d.countObj && d.countCo) {
        o.countObj = ints(d.countObj);
        o.countCo = ints(d.countCo);
      }
      this.addModels([d.maleModel0, d.maleModel1, d.maleModel2, d.femaleModel0, d.femaleModel1, d.femaleModel2]);
      recolors(o, d.colorFind, d.colorReplace, d.textureFind, d.textureReplace);
      itemJson[id] = o;
    }
    bundle.items = itemJson;

    const kitJson: Json = {};
    for (const [id, d] of kits) {
      const o: Json = { part: d.bodyPartId, models: ints(d.models) };
      this.addModels(d.models);
      recolors(o, d.recolorToFind, d.recolorToReplace, d.retextureToFind, d.retextureToReplace);
      kitJson[id] = o;
    }
    bundle.kits = kitJson;

    const spotJson: Json = {};
    for (const [id, d] of spots) {
      const o: Json = { model: d.modelId };
      this.addModels([d.modelId]);
      o.anim = d.animationId;
      this.sequenceIds.add(d.animationId);
      o.resizeX = d.resizeX;
      o.resizeY = d.resizeY;
      o.rotation = d.rotaton;
      recolors(o, d.recolorToFind, d.recolorToReplace, d.textureToFind, d.textureToReplace);
      spotJson[id] = o;
    }
    bundle.spotanims = spotJson;

    this.progress("animations");
    await this.writeAnimations(bundle);
    this.progress("models");
    await this.writeModels(bundle);
    this.progress("terrain");
    await this.writeTerrain(bundle);
    this.progress("textures");
    await this.writeTextures(bundle);
    await this.writeSprites(bundle);
    this.progress("interface");
    await this.writeInterface(bundle);
    return bundle;
  }

  // ---------- what the session uses ----------

  private collect(line: Line): void {
    switch (line.e) {
      case "header":
        this.revision = num(line.revision, -1);
        break;
      case "npcdef": {
        const def = (line.def ?? {}) as Json;
        this.npcIds.add(num(def.id, -1));
        if ("baseId" in def) this.npcIds.add(num(def.baseId, -1));
        break;
      }
      case "npc_spawn":
      case "npc_changed":
        this.npcIds.add(refId(line.who));
        if ("from" in line) this.npcIds.add(num(line.from, -1));
        if (line.overrides && typeof line.overrides === "object") addAll((line.overrides as Json).models, this.modelIds);
        break;
      case "tick":
        for (const group of ["npcs", "players"]) if (Array.isArray(line[group])) for (const a of line[group] as Json[]) this.actor(a);
        if (line.me && typeof line.me === "object") this.actor(line.me as Json);
        break;
      case "anim":
        this.sequenceIds.add(num(line.a, -1));
        break;
      case "moves":
        addAll(line.anims, this.sequenceIds);
        break;
      case "spot":
        for (const s of (line.spot as Json[]) ?? []) this.spotIds.add(num(s.id, -1));
        break;
      case "gfx":
      case "proj":
        this.spotIds.add(num(line.id, -1));
        break;
      case "obj":
        this.objectIds.add(num(line.id, -1));
        if ("anim" in line) this.sequenceIds.add(num(line.anim, -1));
        break;
      case "look": {
        const itemOffset = num(line.itemOffset, 2048);
        const kitOffset = num(line.kitOffset, 256);
        for (const v of (line.equip as number[]) ?? []) {
          if (v >= itemOffset) this.itemIds.add(v - itemOffset);
          else if (v >= kitOffset) this.kitIds.add(v - kitOffset);
        }
        if ("npc" in line) this.npcIds.add(num(line.npc, -1));
        break;
      }
      case "ui_widgets":
        // Interface snapshots: their sprites and item icons
        for (const w of (line.widgets as number[][]) ?? []) {
          if (w[5] > 0) this.widgetSprites.add(w[5]);
          if (w[9] > 0) this.held(w[9], Math.max(1, w[10]));
        }
        break;
      case "item":
        // Ground items: drawn with their inventory model
        this.itemIds.add(num(line.id, -1));
        break;
      case "items":
        for (const [id, qty] of (line.items as number[][]) ?? []) {
          if (id > 0) {
            this.itemIds.add(id);
            this.held(id, qty);
          }
        }
        break;
      case "scene":
        this.scenes.push(line);
        break;
    }
  }

  private held(id: number, quantity: number): void {
    let sizes = this.heldItems.get(id);
    if (!sizes) this.heldItems.set(id, (sizes = new Set()));
    sizes.add(quantity);
  }

  private actor(a: Json): void {
    if ("who" in a) {
      const id = refId(a.who);
      if (id >= 0) this.npcIds.add(id);
    }
    this.sequenceIds.add(num(a.a, -1));
    this.sequenceIds.add(num(a.pose, -1));
    for (const s of (a.spot as Json[]) ?? []) this.spotIds.add(num(s.id, -1));
    if (Array.isArray(a.head)) for (const icon of a.head as number[][]) this.spriteGroups.add(icon[0]);
  }

  // ---------- cache access ----------

  private async loadConfig<T>(type: number, wanted: Set<number> | null, load: (id: number, data: Uint8Array) => T): Promise<Map<number, T>> {
    const out = new Map<number, T>();
    for (const [id, data] of await loadConfigs(this.store, type, wanted ?? undefined)) out.set(id, load(id, data));
    return out;
  }

  private group(index: number, id: number): Promise<Uint8Array | undefined> {
    return this.store.group(index, id);
  }

  // ---------- writing ----------

  private async writeAnimations(bundle: Json): Promise<void> {
    const loader = new SequenceLoader().configureForRevision(await configRevision(this.store, ConfigType.SEQUENCE));
    this.sequenceIds.delete(-1);
    const sequences = await this.loadConfig(ConfigType.SEQUENCE, this.sequenceIds, (id, data) => loader.load(id, data));
    const seqJson: Json = {};
    const framesByArchive = new Map<number, Set<number>>();
    for (const [id, s] of sequences) {
      const o: Json = {};
      if (s.animMayaID !== -1) {
        // Newer skeletal animations: the replay decodes these itself from the raw files below
        o.skeletal = { id: s.animMayaID, start: s.animMayaStart, end: s.animMayaEnd };
        this.skeletalIds.add(s.animMayaID);
      } else if (s.frameIDs) {
        o.frames = ints(s.frameIDs);
        o.lengths = ints(s.frameLengths);
        for (const f of s.frameIDs) {
          let set = framesByArchive.get(f >>> 16);
          if (!set) framesByArchive.set(f >>> 16, (set = new Set()));
          set.add(f & 0xffff);
        }
      }
      o.frameStep = s.frameStep;
      o.loops = s.maxLoops;
      seqJson[id] = o;
    }
    bundle.sequences = seqJson;

    const frameJson: Json = {};
    const framemapJson: Json = {};
    const framemaps = new Map<number, FramemapDefinition>();
    for (const [archiveId, wanted] of framesByArchive) {
      const files = await this.store.files(IndexType.ANIMATIONS, archiveId);
      if (!files) continue;
      for (const [fileId, contents] of files) {
        if (!wanted.has(fileId)) continue;
        const framemapId = (contents[0] << 8) | contents[1];
        let framemap = framemaps.get(framemapId);
        if (!framemap) {
          const data = await this.group(IndexType.SKELETONS, framemapId);
          if (!data) continue;
          framemap = new FramemapLoader().load(framemapId, data);
          framemaps.set(framemapId, framemap);
          framemapJson[framemapId] = { types: ints(framemap.types), maps: framemap.frameMaps.map((m) => ints(m)) };
        }
        const frame = new FrameLoader().load(framemap, fileId, contents);
        const n = frame.translatorCount;
        frameJson[(archiveId << 16) | fileId] = {
          framemap: framemapId,
          index: ints(frame.indexFrameIds).slice(0, n),
          x: ints(frame.translator_x).slice(0, n),
          y: ints(frame.translator_y).slice(0, n),
          z: ints(frame.translator_z).slice(0, n),
        };
      }
    }
    bundle.frames = frameJson;
    bundle.framemaps = framemapJson;
    await this.writeSkeletal(bundle);
  }

  /**
   * Skeletal animations and the skeletons they move, as the raw cache files: the replay decodes them.
   * Each animation names its skeleton in its first bytes
   */
  private async writeSkeletal(bundle: Json): Promise<void> {
    const animations: Json = {};
    const skeletons: Json = {};
    const archives = new Map<number, Map<number, Uint8Array> | undefined>();
    for (const id of [...this.skeletalIds].sort((a, b) => a - b)) {
      const archiveId = id >>> 16;
      if (!archives.has(archiveId)) archives.set(archiveId, await this.store.files(IndexType.ANIMAYAS, archiveId));
      const data = archives.get(archiveId)?.get(id & 0xffff);
      if (!data) continue;
      animations[id] = base64(data);
      const baseId = (data[1] << 8) | data[2];
      if (!(baseId in skeletons)) {
        const base = await this.group(IndexType.SKELETONS, baseId);
        if (base) skeletons[baseId] = base64(base);
      }
    }
    bundle.skeletalAnimations = animations;
    bundle.skeletons = skeletons;
  }

  private async writeModels(bundle: Json): Promise<void> {
    this.modelIds.delete(-1);
    const models: Json = {};
    const loader = new ModelLoader();
    for (const id of [...this.modelIds].sort((a, b) => a - b)) {
      const data = await this.group(IndexType.MODELS, id);
      if (!data) continue;
      const m = exportModel(loader.load(id, data));
      const o: Json = { v: b64(m.v), f: b64(m.f), c: b64(m.c) };
      if (m.a) o.a = b64(m.a);
      if (m.rt) o.rt = b64(m.rt);
      if (m.uv) o.uv = b64(m.uv);
      if (m.t) {
        o.t = b64(m.t);
        for (const t of m.t) if (t >= 0) this.textureIds.add(t);
      }
      if (m.vg) o.vg = b64(m.vg);
      if (m.tg) o.tg = b64(m.tg);
      if (m.mg && m.ms) {
        o.mg = b64(m.mg);
        o.ms = b64(m.ms);
      }
      models[id] = o;
    }
    bundle.models = models;
  }

  /**
   * Ground colours for instance map loads, worked out from the map squares each instance chunk was
   * copied from: each scene tile's underlay colour and its overlay colour, shape and rotation
   */
  private async writeTerrain(bundle: Json): Promise<void> {
    const underlayLoader = new UnderlayLoader();
    const underlays = await this.loadConfig(ConfigType.UNDERLAY, null, (id, data) => underlayLoader.load(id, data));
    const overlayLoader = new OverlayLoader();
    const overlays = await this.loadConfig(ConfigType.OVERLAY, null, (id, data) => overlayLoader.load(id, data));
    const terrain: Json[] = [];
    for (const scene of this.scenes) {
      const t: Json = { t: num(scene.t, 0) };
      if (!("templates" in scene) || !scene.instance) {
        const open = this.openWorld.get(num(scene.t, 0));
        if (open) await this.terrainPlanes(t, open, underlays, overlays);
        terrain.push(t);
        continue;
      }
      const templates = scene.templates as number[][][];
      const planes: Json[] = [];
      for (let plane = 0; plane < templates.length; plane++) {
        const under = new Int32Array(104 * 104).fill(-1);
        const over = new Int32Array(104 * 104).fill(-1);
        const shape = new Int8Array(104 * 104);
        const chunks = templates[plane];
        for (let cx = 0; cx < chunks.length; cx++) {
          const column = chunks[cx];
          for (let cy = 0; cy < column.length; cy++) {
            const packed = column[cy];
            if (packed === -1) continue;
            const rotation = (packed >> 1) & 3;
            const srcY = ((packed >> 3) & 0x7ff) * 8;
            const srcX = ((packed >> 14) & 0x3ff) * 8;
            const srcPlane = (packed >> 24) & 3;
            const region = await this.region(((srcX >> 6) << 8) | (srcY >> 6));
            if (!region) continue;
            for (let lx = 0; lx < 8; lx++) {
              for (let ly = 0; ly < 8; ly++) {
                const sceneX = cx * 8 + lx;
                const sceneY = cy * 8 + ly;
                if (sceneX >= 104 || sceneY >= 104) continue;
                // Undo the chunk's rotation to find the tile it was copied from
                const [ux, uy] = unrotate(lx, ly, rotation);
                const x = (srcX & 63) + ux;
                const y = (srcY & 63) + uy;
                const i = sceneX * 104 + sceneY;
                const underlay = region.getUnderlayId(srcPlane, x, y);
                if (underlay > 0) under[i] = underlays.get(underlay - 1)?.getColor() ?? -1;
                const overlay = region.getOverlayId(srcPlane, x, y);
                if (overlay > 0) {
                  over[i] = this.overlayColour(overlays.get(overlay - 1), over[i]);
                  shape[i] = (region.getOverlayPath(srcPlane, x, y) << 2) | ((region.getOverlayRotation(srcPlane, x, y) + rotation) & 3);
                }
              }
            }
          }
        }
        planes.push({ under: b64(under), over: b64(over), shape: b64(shape) });
      }
      t.planes = planes;
      terrain.push(t);
    }
    bundle.terrain = terrain;
  }

  /** An overlay's colour; negative marks a texture, decoded with the texture colours */
  private overlayColour(o: OverlayDefinition | undefined, fallback: number): number {
    if (o && o.texture >= 0) {
      this.textureIds.add(o.texture);
      return -2 - o.texture;
    }
    if (o && o.rgbColor !== 0xff00ff) return o.rgbColor;
    return fallback;
  }

  /**
   * For each open-world map load, the objects the cache places in its 104 x 104 scene: the recorder
   * leaves these out there, since the cache has them
   */
  private async prepareOpenWorld(): Promise<void> {
    for (const scene of this.scenes) {
      if (scene.instance) continue;
      const baseX = num(scene.baseX, 0);
      const baseY = num(scene.baseY, 0);
      const objects: number[] = [];
      const seen = new Set<number>();
      for (let sx = 0; sx < 104; sx += 64 - ((baseX + sx) & 63)) {
        for (let sy = 0; sy < 104; sy += 64 - ((baseY + sy) & 63)) {
          const regionId = (((baseX + sx) >> 6) << 8) | ((baseY + sy) >> 6);
          if (seen.has(regionId)) continue;
          seen.add(regionId);
          const region = await this.region(regionId);
          if (!region) continue;
          for (const loc of region.getLocations()) {
            const p = loc.getPosition();
            // Positions are world coordinates once the region has loaded them
            const wx = p.getX() < 64 ? region.getBaseX() + p.getX() : p.getX();
            const wy = p.getY() < 64 ? region.getBaseY() + p.getY() : p.getY();
            const lx = wx - baseX;
            const ly = wy - baseY;
            if (lx < 0 || ly < 0 || lx >= 104 || ly >= 104) continue;
            let plane = p.getZ();
            // Bridges: everything on a bridge tile moves down a floor, and what was on the ground floor
            // goes underneath (floor -1)
            if ((region.getTileSetting(1, wx & 63, wy & 63) & 2) !== 0) plane--;
            objects.push(loc.getId(), lx, ly, plane, loc.getType(), loc.getOrientation());
            this.objectIds.add(loc.getId());
          }
        }
      }
      this.openWorld.set(num(scene.t, 0), { baseX, baseY, objects: b64(Int32Array.from(objects)) });
    }
  }

  /** A map square's terrain and objects, loaded once */
  private async region(regionId: number): Promise<Region | undefined> {
    if (this.regions.has(regionId)) return this.regions.get(regionId) ?? undefined;
    let region: Region | null = null;
    const rx = regionId >> 8;
    const ry = regionId & 0xff;
    const files = await this.store.files(IndexType.MAPS, regionId);
    // Like the exporter, a map square needs its terrain and objects files
    const terrain = files && files.size >= 2 ? files.get(0) : undefined;
    if (terrain) {
      region = new Region(rx, ry);
      region.loadTerrain(new MapLoader().load(rx, ry, terrain));
      const locations = files!.get(1);
      if (locations) region.loadLocations(new LocationsLoader().load(rx, ry, locations));
    }
    this.regions.set(regionId, region);
    return region ?? undefined;
  }

  /** Ground colours, overlay shapes and tile heights for an open-world scene, floor by floor */
  private async terrainPlanes(
    t: Json,
    open: { baseX: number; baseY: number; objects: string },
    underlays: Map<number, UnderlayDefinition>,
    overlays: Map<number, OverlayDefinition>,
  ): Promise<void> {
    const { baseX, baseY } = open;
    const planes: Json[] = [];
    const heights: string[] = [];
    // Floor -1: what's under bridges, drawn below the deck; then floors 0-3
    for (let plane = -1; plane < 4; plane++) {
      const under = new Int32Array(104 * 104).fill(-1);
      const over = new Int32Array(104 * 104).fill(-1);
      const shape = new Int8Array(104 * 104);
      const height = new Int32Array(104 * 104);
      for (let sx = 0; sx < 104; sx++) {
        for (let sy = 0; sy < 104; sy++) {
          const wx = baseX + sx;
          const wy = baseY + sy;
          const region = await this.region(((wx >> 6) << 8) | (wy >> 6));
          if (!region) continue;
          const i = sx * 104 + sy;
          const x = wx & 63;
          const y = wy & 63;
          // A bridge tile shows the floor above it: the deck on the ground floor, and so on up
          const bridge = (region.getTileSetting(1, x, y) & 2) !== 0;
          const src = bridge ? plane + 1 : plane;
          if (src > 3 || src < 0 || (plane === -1 && !bridge)) {
            if (plane === -1) height[i] = region.getTileHeight(0, x, y);
            continue;
          }
          height[i] = region.getTileHeight(src, x, y);
          const underlay = region.getUnderlayId(src, x, y);
          if (underlay > 0) under[i] = underlays.get(underlay - 1)?.getColor() ?? -1;
          const overlay = region.getOverlayId(src, x, y);
          if (overlay > 0) {
            over[i] = this.overlayColour(overlays.get(overlay - 1), over[i]);
            shape[i] = (region.getOverlayPath(src, x, y) << 2) | (region.getOverlayRotation(src, x, y) & 3);
          }
        }
      }
      const p = { under: b64(under), over: b64(over), shape: b64(shape) };
      if (plane === -1) {
        t.below = p;
        t.belowHeights = b64(height);
        continue;
      }
      planes.push(p);
      heights.push(b64(height));
    }
    t.planes = planes;
    t.heights = heights;
    t.objects = open.objects;
  }

  /** Each texture's average colour, which is what textured faces look like at a distance, and its picture */
  private async writeTextures(bundle: Json): Promise<void> {
    const files = (await this.store.files(IndexType.TEXTURES, 0)) ?? new Map<number, Uint8Array>();
    const textures: Json = {};
    const images: Json = {};
    const loader = new TextureLoader();
    for (const [id, data] of files) {
      if (!this.textureIds.has(id)) continue;
      const t = loader.load(id, data);
      textures[id] = await this.averageSpriteColor(t.fileIds);
      const image = await this.textureImage(t);
      if (image) images[id] = image;
    }
    bundle.textures = textures;
    bundle.textureImages = images;
  }

  private async sprites(group: number): Promise<SpriteDefinition[] | undefined> {
    const data = await this.group(IndexType.SPRITES, group);
    return data ? new SpriteLoader().load(group, data) : undefined;
  }

  /** A texture's picture from its first sprite, with how it scrolls if it's animated */
  private async textureImage(t: TextureDefinition): Promise<Json | undefined> {
    const ids = t.fileIds;
    if (!ids || ids.length === 0) return undefined;
    const sprite = (await this.sprites(ids[0]))?.[0];
    if (!sprite || sprite.width <= 0 || sprite.height <= 0) return undefined;
    return {
      png: pngDataUrl(sprite.width, sprite.height, opaque(sprite.pixels)),
      direction: t.animationDirection,
      speed: t.animationSpeed,
      sprites: ids.length,
    };
  }

  private async averageSpriteColor(ids: ArrayLike<number> | undefined): Promise<number> {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const id of Array.from(ids ?? [])) {
      for (const sprite of (await this.sprites(id)) ?? []) {
        for (const px of sprite.pixels) {
          if ((px & 0xffffff) === 0) continue;
          r += (px >> 16) & 0xff;
          g += (px >> 8) & 0xff;
          b += px & 0xff;
          n++;
        }
      }
    }
    return n === 0 ? 0x808080 : (Math.floor(r / n) << 16) | (Math.floor(g / n) << 8) | Math.floor(b / n);
  }

  /** Overhead icon sprites as PNG data URLs, one list of frames per sprite group */
  private async writeSprites(bundle: Json): Promise<void> {
    const out: Json = {};
    for (const group of [...this.spriteGroups].sort((a, b) => a - b)) {
      const frames = await this.sprites(group);
      if (!frames) continue;
      out[group] = frames.map((s) => (s.width <= 0 || s.height <= 0 ? "" : pngDataUrl(s.width, s.height, opaque(s.pixels))));
    }
    bundle.sprites = out;
  }

  /** A sprite at its full size with its offset, so pieces line up as the client places them */
  private async spritePng(group: number, frame: number): Promise<string | undefined> {
    const s = (await this.sprites(group))?.[frame];
    if (!s || s.width <= 0 || s.height <= 0) return undefined;
    const fullW = Math.max(s.width + s.offsetX, s.maxWidth);
    const fullH = Math.max(s.height + s.offsetY, s.maxHeight);
    const pixels = new Int32Array(fullW * fullH);
    for (let i = 0; i < s.pixels.length; i++) {
      const px = s.pixels[i] & 0xffffff;
      pixels[(s.offsetY + Math.floor(i / s.width)) * fullW + s.offsetX + (i % s.width)] = px === 0 ? 0 : 0xff000000 | px;
    }
    return pngDataUrl(fullW, fullH, pixels);
  }

  /** The side panel's sprites, spells, combat styles, and an icon for every item you held */
  private async writeInterface(bundle: Json): Promise<void> {
    const spriteIds = new Set<number>([...this.widgetSprites, ...UI_SPRITES]);
    const itemLoader = new ItemLoader();
    const allItems = await this.loadConfig(ConfigType.ITEM, null, (id, data) => itemLoader.load(id, data));
    writeSpells(bundle, allItems, spriteIds);
    await this.writeCombatStyles(bundle, spriteIds);
    const ui: Json = {};
    for (const id of [...spriteIds].sort((a, b) => a - b)) {
      const png = await this.spritePng(id, 0);
      if (png) ui[id] = png;
    }
    bundle.uiSprites = ui;
    bundle.itemIcons = await this.itemIcons(allItems);
  }

  /** Item icons, drawn by a port of the client's own item icon renderer, with the outline and shadow */
  private async itemIcons(allItems: Map<number, ItemDefinition>): Promise<Json> {
    const textureFiles = (await this.store.files(IndexType.TEXTURES, 0)) ?? new Map<number, Uint8Array>();
    const textureLoader = new TextureLoader();
    // The renderer finds textures by their own ids and can't take gaps in the list
    const textures = [...textureFiles].map(([id, data]) => textureLoader.load(id, data));
    const modelLoader = new ModelLoader();
    const models = new Map<number, ModelDefinition | null>();
    const sprites = new Map<number, SpriteDefinition[] | null>();
    const icons: Json = {};
    for (const [id, held] of this.heldItems) {
      const def = allItems.get(id);
      // Most items look the same at any stack size: only those with stack variants need each size
      const sizes = def?.countObj ? [...held] : [1];
      for (const quantity of sizes) {
        try {
          // The renderer is synchronous: load what it'll ask for first, until nothing more turns up
          for (;;) {
            const needs = iconNeeds((i) => allItems.get(i), id, quantity, textures, (m) => models.get(m) ?? undefined);
            let loaded = false;
            for (const m of needs.models) {
              if (models.has(m)) continue;
              const data = await this.group(IndexType.MODELS, m);
              models.set(m, data ? modelLoader.load(m, data) : null);
              loaded = true;
            }
            for (const s of needs.sprites) if (!sprites.has(s)) sprites.set(s, (await this.sprites(s)) ?? null);
            if (needs.complete || !loaded) break;
          }
          const image = createSprite(
            (i) => allItems.get(i),
            (m) => models.get(m) ?? undefined,
            (s, frame) => sprites.get(s)?.[frame],
            () => textures,
            id, quantity, 1, 0x302020, false,
          );
          if (!image) continue;
          icons[def?.countObj ? `${id}:${quantity}` : id] = pngDataUrl(image.width, image.height, image.pixels);
        } catch (e) {
          console.warn(`Item icon ${id} failed`, e);
        }
      }
    }
    return icons;
  }

  /** The combat tab's buttons for each weapon type, from the cache's combat styles table (78) */
  private async writeCombatStyles(bundle: Json, spriteIds: Set<number>): Promise<void> {
    const styles: Json = {};
    const loader = new DBRowLoader();
    for (const [id, data] of await loadConfigs(this.store, ConfigType.DBROW)) {
      const row = loader.load(id, data);
      const cols = row.columnValues;
      if (row.tableId !== 78 || !cols || cols.length < 2 || !cols[0] || !cols[1]) continue;
      const list: unknown[] = [];
      for (let i = 0; i + 3 < cols[1].length; i += 4) {
        list.push([cols[1][i], String(cols[1][i + 1]), String(cols[1][i + 2]).replace(/<br>/g, "\n"), cols[1][i + 3]]);
        spriteIds.add(cols[1][i + 3] as number);
      }
      styles[String(cols[0][0])] = list;
    }
    bundle.combatStyles = styles;
  }

  private addModels(ids: ArrayLike<number> | undefined): void {
    for (const id of Array.from(ids ?? [])) this.modelIds.add(id);
  }
}

/**
 * Every spell, from the items the game defines them as: name (param 601), level (604), spellbook (336),
 * its button in the spellbook interface (596), lit and dim icons (597, 598) and runes (365-370 as item
 * and amount pairs)
 */
function writeSpells(bundle: Json, items: Map<number, ItemDefinition>, spriteIds: Set<number>): void {
  const spells: Json[] = [];
  const int = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
  for (const d of items.values()) {
    const p = d.params;
    if (!p || typeof p.get(601) !== "string" || typeof p.get(596) !== "number" || (p.get(596) as number) >>> 16 !== 218) continue;
    const on = int(p.get(597), -1);
    const off = int(p.get(598), -1);
    if (on > 0) spriteIds.add(on);
    if (off > 0) spriteIds.add(off);
    const runes: number[][] = [];
    for (let k = 365; k <= 369; k += 2) {
      if (typeof p.get(k) === "number" && typeof p.get(k + 1) === "number") runes.push([p.get(k) as number, p.get(k + 1) as number]);
    }
    spells.push({
      name: p.get(601),
      level: int(p.get(604), 1),
      book: int(p.get(336), 0),
      slot: (p.get(596) as number) & 0xffff,
      on,
      off,
      runes,
    });
  }
  bundle.spells = spells;
}

function recolors(o: Json, find?: ArrayLike<number>, replace?: ArrayLike<number>, tfind?: ArrayLike<number>, treplace?: ArrayLike<number>): void {
  if (find && replace) {
    o.recolorFind = ints(find);
    o.recolorReplace = ints(replace);
  }
  if (tfind && treplace) {
    o.retextureFind = ints(tfind);
    o.retextureReplace = ints(treplace);
  }
}

/** Black is the transparent colour in sprites */
function opaque(pixels: ArrayLike<number>): Int32Array {
  const out = new Int32Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    const px = pixels[i] & 0xffffff;
    out[i] = px === 0 ? 0 : 0xff000000 | px;
  }
  return out;
}

/** Chunk rotation, as the client's instance code applies it, undone */
export function unrotate(x: number, y: number, rotation: number): [number, number] {
  switch ((4 - rotation) & 3) {
    case 1: return [y, 7 - x];
    case 2: return [7 - x, 7 - y];
    case 3: return [7 - y, x];
    default: return [x, y];
  }
}

const short = (v: number) => (v << 16) >> 16;

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function refId(ref: unknown): number {
  if (!ref || typeof ref !== "object") return -1;
  const o = ref as Json;
  return o.k === "npc" && typeof o.id === "number" ? o.id : -1;
}

function addAll(values: unknown, into: Set<number>): void {
  if (Array.isArray(values)) for (const v of values) if (typeof v === "number") into.add(v);
}
