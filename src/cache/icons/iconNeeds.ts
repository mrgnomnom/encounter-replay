// Ported from RuneLite's cache library (net.runelite.cache.item.ItemSpriteFactory, BSD-2-Clause, see LICENSE in
// src/cache/store). What createSprite will ask its providers for, so a caller can load it all beforehand.
import type { TextureDefinition } from "../defs/texture";
import type { ItemProvider, ModelProvider } from "./types";

export interface IconNeeds {
  /** Item definitions createSprite looks up, in the order it does */
  items: number[];
  /** Models, by id */
  models: number[];
  /** Texture ids the models draw with (every texture when a model isn't at hand to look at) */
  textures: number[];
  /** Sprite groups those textures are built from (frame 0 of each) */
  sprites: number[];
  /**
   * Whether every item, and every model when a model provider was given, was there to follow. If not, load
   * what's listed and ask again: the rest depends on definitions not yet loaded
   */
  complete: boolean;
}

/**
 * Everything createSprite(itemId, quantity, ...) will want, following the same path through stack
 * variants and noted, bought and placeholder templates. Providers may return undefined for what isn't
 * loaded yet. Without a model provider every texture's sprites are listed, as any could be needed
 */
export function iconNeeds(itemProvider: ItemProvider, itemId: number, quantity: number,
  textures: ArrayLike<TextureDefinition>, modelProvider?: ModelProvider): IconNeeds {
  const items = new Set<number>();
  const models = new Set<number>();
  const textureIds = new Set<number>();
  let complete = true;
  let allTextures = modelProvider === undefined;

  const visit = (id: number, count: number, depth: number) => {
    items.add(id);
    let item = itemProvider(id);
    if (item === undefined) {
      complete = false;
      return;
    }
    if (count > 1 && item.countObj !== undefined) {
      let stackItemID = -1;
      for (let i = 0; i < 10; ++i) {
        if (count >= item.countCo![i] && item.countCo![i] !== 0) stackItemID = item.countObj[i];
      }
      if (stackItemID !== -1) {
        items.add(stackItemID);
        item = itemProvider(stackItemID);
        if (item === undefined) {
          complete = false;
          return;
        }
      }
    }
    models.add(item.inventoryModel);
    if (modelProvider !== undefined) {
      const model = modelProvider(item.inventoryModel);
      if (model === undefined) {
        complete = false;
        allTextures = true;
      } else if (model.faceTextures !== undefined) {
        for (const texture of new Set(model.faceTextures)) {
          // The item's retextures apply one after another, as ModelDefinition.retexture does
          let t = texture;
          for (let i = 0; item.textureFind !== undefined && i < item.textureFind.length; i++) {
            if (t === (item.textureFind[i] << 16) >> 16) t = (item.textureReplace![i] << 16) >> 16;
          }
          if (t !== -1) textureIds.add(t);
        }
      }
    }
    // A template chain can't loop in a sane cache; the depth only stops a broken one
    if (depth > 4) return;
    if (item.notedTemplate !== -1) visit(item.notedID, 10, depth + 1);
    else if (item.boughtTemplateId !== -1) visit(item.boughtId, count, depth + 1);
    else if (item.placeholderTemplateId !== -1) visit(item.placeholderId, count, depth + 1);
  };
  visit(itemId, quantity, 0);

  const sprites = new Set<number>();
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    if (!allTextures && !textureIds.has(texture.id)) continue;
    if (allTextures) textureIds.add(texture.id);
    const fileIds = texture.fileIds;
    for (let f = 0; f < fileIds.length; f++) sprites.add(fileIds[f]);
  }
  return { items: [...items], models: [...models], textures: [...textureIds], sprites: [...sprites], complete };
}
