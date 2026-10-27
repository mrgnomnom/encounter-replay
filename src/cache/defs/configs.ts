// Ported from RuneLite's cache library (net.runelite.cache.ConfigType and IndexType, BSD-2-Clause, see LICENSE
// in src/cache/store). Loading config files mirrors the exporter's loadConfig and configRevision.
import type { CacheStore } from "../store/store";

/** Config archives in index 2 (ConfigType) */
export const ConfigType = {
  UNDERLAY: 1,
  IDENTKIT: 3,
  OVERLAY: 4,
  INV: 5,
  OBJECT: 6,
  ENUM: 8,
  NPC: 9,
  ITEM: 10,
  PARAMS: 11,
  SEQUENCE: 12,
  SPOTANIM: 13,
  VARBIT: 14,
  VARCLIENT: 19,
  VARCLIENTSTRING: 15,
  VARPLAYER: 16,
  HITSPLAT: 32,
  HEALTHBAR: 33,
  STRUCT: 34,
  AREA: 35,
  DBROW: 38,
  DBTABLE: 39,
} as const;
export type ConfigType = (typeof ConfigType)[keyof typeof ConfigType];

/** The cache's indexes (IndexType) */
export const IndexType = {
  ANIMATIONS: 0,
  SKELETONS: 1,
  CONFIGS: 2,
  INTERFACES: 3,
  SOUNDEFFECTS: 4,
  MAPS: 5,
  MUSIC_TRACKS: 6,
  MODELS: 7,
  SPRITES: 8,
  TEXTURES: 9,
  BINARY: 10,
  MUSIC_JINGLES: 11,
  CLIENTSCRIPT: 12,
  FONTS: 13,
  MUSIC_SAMPLES: 14,
  MUSIC_PATCHES: 15,
  WORLDMAP_GEOGRAPHY: 18,
  WORLDMAP: 19,
  WORLDMAP_GROUND: 20,
  DBTABLEINDEX: 21,
  ANIMAYAS: 22,
  GAMEVALS: 24,
} as const;
export type IndexType = (typeof IndexType)[keyof typeof IndexType];

/** A config archive's files by id, in the order the archive packs them; only the wanted ones when given */
export async function loadConfigs(store: CacheStore, configType: number, wanted?: Set<number>): Promise<Map<number, Uint8Array>> {
  const files = await store.files(IndexType.CONFIGS, configType);
  const out = new Map<number, Uint8Array>();
  if (!files) return out;
  for (const [id, data] of files) {
    if (!wanted || wanted.has(id)) out.set(id, data);
  }
  return out;
}

/** The config archive's revision, which the loaders' configureForRevision takes */
export async function configRevision(store: CacheStore, configType: number): Promise<number> {
  const archive = (await store.index(IndexType.CONFIGS))?.archives.get(configType);
  if (!archive) throw new Error(`No config archive ${configType}`);
  return archive.revision;
}
