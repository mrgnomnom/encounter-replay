// Ported from RuneLite's cache library (net.runelite.cache.definitions.providers, BSD-2-Clause, see LICENSE in
// src/cache/store). The providers the item renderer is given, as callbacks.
import type { ItemDefinition } from "../defs/item";
import type { SpriteDefinition } from "../defs/sprite";
import type { TextureDefinition } from "../defs/texture";
import type { ModelDefinition } from "../model/modelDefinition";

/** An item definition by id, as ItemLoader gives it (the exporter doesn't link noted items, nor does this) */
export type ItemProvider = (itemId: number) => ItemDefinition | undefined;
/** A model by id. createSprite changes a copy, so the provider may hand out the same one each time */
export type ModelProvider = (modelId: number) => ModelDefinition | undefined;
/** One frame of a sprite group. Textures are built from copies, so these may be cached too */
export type SpriteProvider = (spriteId: number, frame: number) => SpriteDefinition | undefined;
/** Every texture definition */
export type TextureProvider = () => ArrayLike<TextureDefinition>;
