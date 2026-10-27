import { SkeletalAnimation, Skeleton } from "./skeletal/skeleton";

/**
 * The cache bundle the exporter writes for a session: definitions, models, animation frames, texture
 * colours and instance ground colours, all from the game cache. Local replays only.
 */

export interface Recolors {
  recolorFind?: number[];
  recolorReplace?: number[];
  retextureFind?: number[];
  retextureReplace?: number[];
}

export interface NpcDef extends Recolors {
  name: string;
  size: number;
  models: number[];
  widthScale: number;
  heightScale: number;
  /** stand, walk, run, turn around, turn left, turn right */
  anims: number[];
}

export interface ObjectDef extends Recolors {
  name: string;
  models: number[];
  types: number[];
  sizeX: number;
  sizeY: number;
  /** x, height, y in 1/128ths */
  scale: [number, number, number];
  offset: [number, number, number];
  mirror: boolean;
  anim: number;
  /** 0 or more: the model bends to follow the ground under each vertex; -1: it doesn't */
  contoured: number;
}

export interface ItemDef extends Recolors {
  name: string;
  /** The item's category: weapons of one category share a weapon type */
  category?: number;
  /** The model it's drawn with on the ground, and its size there (128 = 1) */
  ground: number;
  resize: [number, number, number];
  countObj?: number[];
  countCo?: number[];
  male: number[];
  female: number[];
  maleOffset: number;
  femaleOffset: number;
}

export interface KitDef extends Recolors {
  part: number;
  models: number[];
}

export interface SpotAnimDef extends Recolors {
  model: number;
  anim: number;
  resizeX: number;
  resizeY: number;
  rotation: number;
}

export interface SequenceDef {
  frames?: number[];
  lengths?: number[];
  /** Skeletal animations: the animation file, and the span of cycles it plays */
  skeletal?: { id: number; start: number; end: number };
  frameStep: number;
  loops: number;
}

export interface FrameDef {
  framemap: number;
  index: number[];
  x: number[];
  y: number[];
  z: number[];
}

export interface FramemapDef {
  types: number[];
  maps: number[][];
}

interface RawModel {
  v: string;
  f: string;
  c: string;
  a?: string;
  rt?: string;
  t?: string;
  vg?: string;
  tg?: string;
  mg?: string;
  ms?: string;
  uv?: string;
}

interface RawTerrain {
  t: number;
  planes?: { under: string; over: string; shape: string }[];
  /** Open-world map loads: tile heights per floor, and the objects the cache places there */
  heights?: string[];
  objects?: string;
  /** What's under bridges: ground and heights, drawn below the deck */
  below?: { under: string; over: string; shape: string };
  belowHeights?: string;
}

interface RawBundle {
  format: number;
  npcs: Record<string, NpcDef>;
  objects: Record<string, ObjectDef>;
  items: Record<string, ItemDef>;
  kits: Record<string, KitDef>;
  spotanims: Record<string, SpotAnimDef>;
  sequences: Record<string, SequenceDef>;
  frames: Record<string, FrameDef>;
  framemaps: Record<string, FramemapDef>;
  models: Record<string, RawModel>;
  textures: Record<string, number>;
  terrain: RawTerrain[];
  skeletalAnimations?: Record<string, string>;
  skeletons?: Record<string, string>;
  /** Sprite groups as PNG data URLs, one per frame */
  sprites?: Record<string, string[]>;
  textureImages?: Record<string, TextureImage>;
  /** Interface sprites and item icons, as PNG data URLs */
  uiSprites?: Record<string, string>;
  spells?: SpellDef[];
  /** Per weapon type: [slot, button name, tooltip, icon sprite] for each attack style */
  combatStyles?: Record<string, [number, string, string, number][]>;
  itemIcons?: Record<string, string>;
}

export interface SpellDef {
  name: string;
  level: number;
  /** 0 standard, 1 ancient, 2 lunar, 3 arceuus */
  book: number;
  /** Its button's number in the spellbook interface, which is also its place in the grid */
  slot: number;
  on: number;
  off: number;
  runes: [number, number][];
}

export interface TextureImage {
  png: string;
  /** Scrolling: 0 none, 1 down, 2 left, 3 up, 4 right */
  direction: number;
  speed: number;
}

export interface ModelData {
  id: number;
  /** x, y, z per vertex, 128 units to a tile, y negative going up */
  vertices: Int32Array;
  /** Three vertex indices per face */
  faces: Int32Array;
  colors: Int16Array;
  alphas?: Uint8Array;
  renderTypes?: Int8Array;
  textures?: Int16Array;
  vertexGroups?: Int32Array;
  faceGroups?: Int32Array;
  /** Skeletal bone weights per vertex: a count, then that many bones; weights laid out the same way */
  boneGroups?: Int32Array;
  boneWeights?: Int32Array;
  /** Texture coordinates per face corner: u0 v0 u1 v1 u2 v2 */
  uv?: Float32Array;
}

export interface TerrainPlane {
  under: Int32Array;
  over: Int32Array;
  shape: Int8Array;
}

function bytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// The exporter writes little-endian arrays, which is what every browser runs on
const ints = (b64: string) => new Int32Array(bytes(b64).buffer);
const shorts = (b64: string) => new Int16Array(bytes(b64).buffer);

export class Bundle {
  private readonly models = new Map<number, ModelData | null>();
  private readonly terrains = new Map<string, TerrainPlane | null>();
  private readonly skeletons = new Map<number, Skeleton | null>();
  private readonly skeletalAnimations = new Map<number, SkeletalAnimation | null>();

  constructor(private readonly raw: RawBundle) {}

  static async fetch(url: string): Promise<Bundle | undefined> {
    try {
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const text = await response.text();
      // The dev server answers a missing file with the page itself
      if (!text.trimStart().startsWith("{")) return undefined;
      return new Bundle(JSON.parse(text));
    } catch {
      return undefined;
    }
  }

  npc(id: number): NpcDef | undefined { return this.raw.npcs[id]; }
  object(id: number): ObjectDef | undefined { return this.raw.objects[id]; }
  item(id: number): ItemDef | undefined { return this.raw.items[id]; }
  kit(id: number): KitDef | undefined { return this.raw.kits[id]; }
  spotanim(id: number): SpotAnimDef | undefined { return this.raw.spotanims[id]; }
  sequence(id: number): SequenceDef | undefined { return this.raw.sequences[id]; }
  frame(id: number): FrameDef | undefined { return this.raw.frames[id]; }
  framemap(id: number): FramemapDef | undefined { return this.raw.framemaps[id]; }
  textureColor(id: number): number | undefined { return this.raw.textures[id]; }
  sprite(group: number, frame: number): string | undefined { return this.raw.sprites?.[group]?.[frame] || undefined; }
  textureImage(id: number): TextureImage | undefined { return this.raw.textureImages?.[id]; }
  /** The textures that come with pictures */
  textureImageIds(): number[] { return Object.keys(this.raw.textureImages ?? {}).map(Number); }
  uiSprite(id: number): string | undefined { return this.raw.uiSprites?.[id]; }
  get hasInterface(): boolean { return !!this.raw.uiSprites && Object.keys(this.raw.uiSprites).length > 0; }

  /** The attack styles a weapon type offers */
  combatStyles(weaponType: number): [number, string, string, number][] {
    return this.raw.combatStyles?.[weaponType] ?? [];
  }

  /** A spellbook's spells in grid order, one per button */
  spellbook(book: number): SpellDef[] {
    const bySlot = new Map<number, SpellDef>();
    for (const s of this.raw.spells ?? []) if (s.book === book && !bySlot.has(s.slot)) bySlot.set(s.slot, s);
    return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
  }

  /** An item's icon; items that look different by stack size (coins, arrows) have one per size seen */
  itemIcon(id: number, quantity: number): string | undefined {
    return this.raw.itemIcons?.[`${id}:${quantity}`] ?? this.raw.itemIcons?.[id];
  }

  model(id: number): ModelData | undefined {
    let m = this.models.get(id);
    if (m === undefined) {
      const raw = this.raw.models[id];
      m = raw
        ? {
            id,
            vertices: ints(raw.v),
            faces: ints(raw.f),
            colors: shorts(raw.c),
            alphas: raw.a ? bytes(raw.a) : undefined,
            renderTypes: raw.rt ? new Int8Array(bytes(raw.rt).buffer) : undefined,
            textures: raw.t ? shorts(raw.t) : undefined,
            vertexGroups: raw.vg ? ints(raw.vg) : undefined,
            faceGroups: raw.tg ? ints(raw.tg) : undefined,
            boneGroups: raw.mg ? ints(raw.mg) : undefined,
            boneWeights: raw.ms ? ints(raw.ms) : undefined,
            uv: raw.uv ? new Float32Array(bytes(raw.uv).buffer) : undefined,
          }
        : null;
      this.models.set(id, m);
    }
    return m ?? undefined;
  }

  /** A skeletal animation, decoded on first use along with the skeleton it moves */
  skeletalAnimation(id: number): SkeletalAnimation | undefined {
    let anim = this.skeletalAnimations.get(id);
    if (anim === undefined) {
      anim = null;
      const raw = this.raw.skeletalAnimations?.[id];
      if (raw) {
        const data = bytes(raw);
        const skeleton = this.skeleton((data[1] << 8) | data[2]);
        try {
          if (skeleton) anim = new SkeletalAnimation(data, skeleton);
        } catch (e) {
          console.warn(`Skeletal animation ${id} didn't decode`, e);
        }
      }
      this.skeletalAnimations.set(id, anim);
    }
    return anim ?? undefined;
  }

  private skeleton(id: number): Skeleton | undefined {
    let s = this.skeletons.get(id);
    if (s === undefined) {
      const raw = this.raw.skeletons?.[id];
      s = raw ? new Skeleton(bytes(raw)) : null;
      this.skeletons.set(id, s);
    }
    return s ?? undefined;
  }

  /** Tile heights for an open-world map load, as [floor][sceneX][sceneY] like a scene line's */
  mapHeights(t: number): number[][][] | undefined {
    if (this.heightCache.has(t)) return this.heightCache.get(t);
    const raw = this.raw.terrain.find((e) => e.t === t)?.heights;
    const decoded = raw?.map((plane) => {
      const flat = ints(plane);
      return Array.from({ length: 104 }, (_, x) => Array.from(flat.subarray(x * 104, x * 104 + 104)));
    });
    this.heightCache.set(t, decoded);
    return decoded;
  }
  private readonly heightCache = new Map<number, number[][][] | undefined>();

  /** What's under bridges in an open-world map load: its ground and its heights */
  mapBelow(t: number): { terrain: TerrainPlane; heights: number[][] } | undefined {
    if (this.belowCache.has(t)) return this.belowCache.get(t);
    const e = this.raw.terrain.find((x) => x.t === t);
    let out: { terrain: TerrainPlane; heights: number[][] } | undefined;
    if (e?.below && e.belowHeights) {
      const flat = ints(e.belowHeights);
      out = {
        terrain: { under: ints(e.below.under), over: ints(e.below.over), shape: new Int8Array(bytes(e.below.shape).buffer) },
        heights: Array.from({ length: 104 }, (_, x) => Array.from(flat.subarray(x * 104, x * 104 + 104))),
      };
    }
    this.belowCache.set(t, out);
    return out;
  }
  private readonly belowCache = new Map<number, { terrain: TerrainPlane; heights: number[][] } | undefined>();

  /** The cache's objects for an open-world map load: id, sceneX, sceneY, floor, shape, rotation each */
  mapObjects(t: number): Int32Array | undefined {
    const raw = this.raw.terrain.find((e) => e.t === t)?.objects;
    return raw ? ints(raw) : undefined;
  }

  /** Ground colours for the map load at tick t, if it was an instance */
  terrain(t: number, plane: number): TerrainPlane | undefined {
    const key = `${t}:${plane}`;
    let decoded = this.terrains.get(key);
    if (decoded === undefined) {
      const p = this.raw.terrain.find((e) => e.t === t)?.planes?.[plane];
      decoded = p ? { under: ints(p.under), over: ints(p.over), shape: new Int8Array(bytes(p.shape).buffer) } : null;
      this.terrains.set(key, decoded);
    }
    return decoded ?? undefined;
  }
}

/**
 * The game's 16-bit colours: 6 bits hue, 3 bits saturation, 7 bits lightness. Converted the way the
 * client builds its palette, including its brightness curve
 */
const BRIGHTNESS = 0.7;
const palette = new Uint32Array(65536);
(function buildPalette() {
  for (let hsl = 0; hsl < 65536; hsl++) {
    const hue = ((hsl >> 10) & 63) / 64 + 0.0078125;
    const sat = ((hsl >> 7) & 7) / 8 + 0.0625;
    const lum = (hsl & 127) / 128;
    let r = lum;
    let g = lum;
    let b = lum;
    if (sat !== 0) {
      const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
      const p = 2 * lum - q;
      const channel = (t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (6 * t < 1) return p + (q - p) * 6 * t;
        if (2 * t < 1) return q;
        if (3 * t < 2) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      r = channel(hue + 1 / 3);
      g = channel(hue);
      b = channel(hue - 1 / 3);
    }
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(Math.pow(v, BRIGHTNESS) * 255)));
    palette[hsl] = (c(r) << 16) | (c(g) << 8) | c(b);
  }
})();

export function hslToRgb(hsl: number): number {
  return palette[hsl & 0xffff];
}
