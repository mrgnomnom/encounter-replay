import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigType, IndexType, loadConfigs } from "../defs/configs";
import { ItemLoader, type ItemDefinition } from "../defs/item";
import { SpriteLoader, type SpriteDefinition } from "../defs/sprite";
import { TextureLoader } from "../defs/texture";
import { ModelLoader } from "../model/modelLoader";
import type { ModelDefinition } from "../model/modelDefinition";
import { nodeSource } from "../store/nodeSource";
import { CacheStore } from "../store/store";
import { createSprite, iconNeeds, iconToRgba } from "./itemSpriteFactory";
import { BRIGHTNESS_MAX, createPalette } from "./jagexColor";

// Compares against icons RuneLite's Java renderer drew from the same cache (exporter/build/IconProbe.java, which
// calls ItemSpriteFactory.createSprite as the exporter does). Both are local-only; skipped when missing
const cacheDir = path.resolve(__dirname, "../../../exporter/build/cache-live");
const probeDir = path.resolve(__dirname, "../../../exporter/build/probe-icons");
const run = existsSync(cacheDir) && existsSync(path.join(probeDir, "icons-sample.bin")) ? describe : describe.skip;

interface Reference {
  itemId: number;
  quantity: number;
  /** 0 drawn, 1 null, 2 threw */
  status: number;
  pixels?: Int32Array;
}

function readReferences(file: string): Reference[] {
  const bytes = readFileSync(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Reference[] = [];
  let at = 0;
  while (at < bytes.length) {
    const itemId = view.getInt32(at);
    const quantity = view.getInt32(at + 4);
    const status = view.getInt32(at + 8);
    at += 12;
    let pixels: Int32Array | undefined;
    if (status === 0) {
      pixels = new Int32Array(36 * 32);
      for (let i = 0; i < pixels.length; i++, at += 4) pixels[i] = view.getInt32(at);
    }
    out.push({ itemId, quantity, status, pixels });
  }
  return out;
}

/** The cache's items, textures, models and sprites, loaded as icons ask for them; opened once for every test */
let opened: ReturnType<typeof openCache> | undefined;
const cache = () => (opened ??= openCache());

async function openCache() {
  const store = await CacheStore.open(nodeSource(cacheDir));
  const itemLoader = new ItemLoader();
  const items = new Map<number, ItemDefinition>();
  for (const [id, data] of await loadConfigs(store, ConfigType.ITEM)) items.set(id, itemLoader.load(id, data));
  const textureLoader = new TextureLoader();
  const textures = [...((await store.files(IndexType.TEXTURES, 0)) ?? new Map<number, Uint8Array>())].map(([id, data]) => textureLoader.load(id, data));
  const modelLoader = new ModelLoader();
  const spriteLoader = new SpriteLoader();
  const models = new Map<number, ModelDefinition | undefined>();
  const sprites = new Map<number, SpriteDefinition[] | undefined>();

  const draw = async (itemId: number, quantity: number) => {
    // Load what the icon needs, then draw it; models stay cached, as createSprite works on a copy
    for (;;) {
      const needs = iconNeeds((i) => items.get(i), itemId, quantity, textures, (m) => models.get(m));
      let loaded = false;
      for (const m of needs.models) {
        if (models.has(m)) continue;
        const data = await store.group(IndexType.MODELS, m);
        models.set(m, data ? modelLoader.load(m, data) : undefined);
        loaded = true;
      }
      for (const s of needs.sprites) {
        if (sprites.has(s)) continue;
        const data = await store.group(IndexType.SPRITES, s);
        sprites.set(s, data ? spriteLoader.load(s, data) : undefined);
        loaded = true;
      }
      if (!loaded) break;
    }
    return createSprite(
      (i) => items.get(i),
      (m) => models.get(m),
      (s, frame) => sprites.get(s)?.[frame],
      () => textures,
      itemId, quantity, 1, 0x302020, false,
    );
  };
  return { draw };
}

async function compare(references: Reference[]) {
  const { draw } = await cache();
  const mismatches: string[] = [];
  for (const ref of references) {
    let status = 0;
    let pixels: Int32Array | undefined;
    try {
      const image = await draw(ref.itemId, ref.quantity);
      if (image) {
        pixels = image.pixels;
        expect([image.width, image.height]).toEqual([36, 32]);
      } else {
        status = 1;
      }
    } catch (e) {
      status = 2;
      if (ref.status !== 2) mismatches.push(`${ref.itemId} x${ref.quantity}: threw ${String(e)}`);
      continue;
    }
    if (status !== ref.status) {
      mismatches.push(`${ref.itemId} x${ref.quantity}: status ${status}, Java ${ref.status}`);
      continue;
    }
    if (pixels && ref.pixels) {
      let differing = 0;
      for (let i = 0; i < pixels.length; i++) if (pixels[i] !== ref.pixels[i]) differing++;
      if (differing) mismatches.push(`${ref.itemId} x${ref.quantity}: ${differing} pixels differ`);
    }
  }
  return mismatches;
}

run("item icons match RuneLite's renderer", () => {
  it("builds the same colour palette", () => {
    const bytes = readFileSync(path.join(probeDir, "palette.bin"));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const palette = createPalette(BRIGHTNESS_MAX);
    let differing = 0;
    for (let i = 0; i < 65536; i++) if (palette[i] !== view.getInt32(i * 4)) differing++;
    expect(differing).toBe(0);
  });

  it("draws the sample icons pixel for pixel", async () => {
    const references = readReferences(path.join(probeDir, "icons-sample.bin"));
    expect(references.length).toBeGreaterThan(100);
    expect(await compare(references)).toEqual([]);
  }, 120_000);

  it("gives RGBA bytes", async () => {
    const image = await (await cache()).draw(995, 1000);
    const rgba = iconToRgba(image!);
    expect(rgba.length).toBe(36 * 32 * 4);
    // Coins have a drawn, opaque pixel somewhere and transparent corners
    expect(rgba[3]).toBe(0);
    expect(rgba.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
  }, 60_000);

  // Every item in the cache: run with ICONS_ALL=1 after `IconProbe cache-live probe-icons all`
  const all = path.join(probeDir, "icons-all.bin");
  it.runIf(process.env.ICONS_ALL && existsSync(all))("draws every item's icon pixel for pixel", async () => {
    const mismatches = await compare(readReferences(all));
    expect(mismatches.slice(0, 50)).toEqual([]);
  }, 3_600_000);
});
