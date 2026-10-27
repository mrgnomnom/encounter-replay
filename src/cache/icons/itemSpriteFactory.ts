// Ported from RuneLite's cache library (net.runelite.cache.item.ItemSpriteFactory, BSD-2-Clause, see LICENSE
// in src/cache/store). Draws an item's inventory icon from the game cache the way the client does: its model
// posed and lit at 36x32, stack and note variants, outline and shadow.
import type { ItemDefinition } from "../defs/item";
import type { ModelDefinition } from "../model/modelDefinition";
import type { FaceNormal, VertexNormal } from "../model/models";
import { COSINE, Graphics3D, SINE } from "./graphics3d";
import { d2i, idiv } from "./intMath";
import { BRIGHTNESS_MAX } from "./jagexColor";
import { Model } from "./model";
import { RSTextureProvider } from "./rsTextureProvider";
import { SpritePixels, type IconImage } from "./spritePixels";
import type { ItemProvider, ModelProvider, SpriteProvider, TextureProvider } from "./types";

export { iconNeeds, type IconNeeds } from "./iconNeeds";
export { iconToRgba, type IconImage } from "./spritePixels";
export type { ItemProvider, ModelProvider, SpriteProvider, TextureProvider } from "./types";

/**
 * An item's inventory icon, as RuneLite's ItemSpriteFactory.createSprite draws it, or undefined when its
 * model is missing. Providers are synchronous: preload what iconNeeds lists first. Java resizes, recolours
 * and lights the provider's model in place (the exporter decodes it afresh each time); this works on a copy,
 * so providers may cache. Throws where the Java would.
 */
export function createSprite(itemProvider: ItemProvider, modelProvider: ModelProvider,
  spriteProvider: SpriteProvider, textureProvider: TextureProvider,
  itemId: number, quantity: number, border: number, shadowColor: number,
  noted: boolean): IconImage | undefined {
  const spritePixels = createSpritePixels(itemProvider, modelProvider, spriteProvider, textureProvider,
    itemId, quantity, border, shadowColor, noted);
  return spritePixels === undefined ? undefined : spritePixels.toImage();
}

function createSpritePixels(itemProvider: ItemProvider, modelProvider: ModelProvider,
  spriteProvider: SpriteProvider, textureProvider: TextureProvider,
  itemId: number, quantity: number, border: number, shadowColor: number,
  noted: boolean): SpritePixels | undefined {
  let item = provideItem(itemProvider, itemId);

  if (quantity > 1 && item.countObj !== undefined) {
    let stackItemID = -1;

    for (let i = 0; i < 10; ++i) {
      if (quantity >= item.countCo![i] && item.countCo![i] !== 0) {
        stackItemID = item.countObj[i];
      }
    }

    if (stackItemID !== -1) {
      item = provideItem(itemProvider, stackItemID);
    }
  }

  const itemModel = getModel(modelProvider, item);
  if (itemModel === undefined) {
    return undefined;
  }

  let auxSpritePixels: SpritePixels | undefined;
  if (item.notedTemplate !== -1) {
    auxSpritePixels = createSpritePixels(itemProvider, modelProvider, spriteProvider, textureProvider,
      item.notedID, 10, 1, 0, true);
    if (auxSpritePixels === undefined) {
      return undefined;
    }
  } else if (item.boughtTemplateId !== -1) {
    auxSpritePixels = createSpritePixels(itemProvider, modelProvider, spriteProvider, textureProvider,
      item.boughtId, quantity, border, 0, false);
    if (auxSpritePixels === undefined) {
      return undefined;
    }
  } else if (item.placeholderTemplateId !== -1) {
    auxSpritePixels = createSpritePixels(itemProvider, modelProvider, spriteProvider, textureProvider,
      item.placeholderId, quantity, 0, 0, false);
    if (auxSpritePixels === undefined) {
      return undefined;
    }
  }

  const rsTextureProvider = new RSTextureProvider(textureProvider, spriteProvider);
  rsTextureProvider.brightness = BRIGHTNESS_MAX;

  const spritePixels = new SpritePixels(36, 32);
  const graphics = new Graphics3D(rsTextureProvider);
  graphics.setBrightness(BRIGHTNESS_MAX);
  graphics.setRasterBuffer(spritePixels.pixels, 36, 32);
  graphics.reset();
  graphics.setRasterClipping();
  graphics.setOffset(16, 16);
  graphics.rasterGouraudLowRes = false;
  if (item.placeholderTemplateId !== -1) {
    auxSpritePixels!.drawAtOn(graphics, 0, 0);
  }

  let zoom2d = item.zoom2d;
  if (noted) {
    zoom2d = d2i(zoom2d * 1.5);
  } else if (border === 2) {
    zoom2d = d2i(zoom2d * 1.04);
  }

  const var17 = Math.imul(zoom2d, angle(SINE, item.xan2d)) >> 16;
  const var18 = Math.imul(zoom2d, angle(COSINE, item.xan2d)) >> 16;

  itemModel.calculateBoundsCylinder();
  itemModel.projectAndDraw(graphics, 0,
    item.yan2d,
    item.zan2d,
    item.xan2d,
    item.xOffset2d,
    idiv(itemModel.modelHeight, 2) + var17 + item.yOffset2d | 0,
    var18 + item.yOffset2d | 0);
  if (item.boughtTemplateId !== -1) {
    auxSpritePixels!.drawAtOn(graphics, 0, 0);
  }

  if (border >= 1) {
    spritePixels.drawBorder(1);
  }

  if (border >= 2) {
    spritePixels.drawBorder(0xffffff);
  }

  if (shadowColor !== 0) {
    spritePixels.drawShadow(shadowColor);
  }

  graphics.setRasterBuffer(spritePixels.pixels, 36, 32);
  if (item.notedTemplate !== -1) {
    auxSpritePixels!.drawAtOn(graphics, 0, 0);
  }

  graphics.setRasterBuffer(graphics.graphicsPixels,
    graphics.graphicsPixelsWidth,
    graphics.graphicsPixelsHeight);

  graphics.setRasterClipping();
  graphics.rasterGouraudLowRes = true;
  return spritePixels;
}

/** Java dereferences whatever the provider gives, so a missing item fails the icon */
function provideItem(itemProvider: ItemProvider, itemId: number): ItemDefinition {
  const item = itemProvider(itemId);
  if (item === undefined) throw new Error(`No item definition ${itemId}`);
  return item;
}

/** SINE[i] or COSINE[i], failing as Java's array bounds check does */
function angle(table: Int32Array, i: number): number {
  if (i < 0 || i >= table.length) throw new RangeError(`Angle ${i} out of bounds`);
  return table[i];
}

/** A short as Java holds it: the item loader casts colours and textures to short before recolouring */
const toShort = (value: number) => (value << 16) >> 16;

/**
 * A copy of a model to change: its own arrays, the same class, and no normals carried over (as a freshly
 * decoded model has none)
 */
function freshCopy(model: ModelDefinition): ModelDefinition {
  const copy = Object.create(Object.getPrototypeOf(model) as object) as Record<string, unknown>;
  for (const [key, value] of Object.entries(model)) {
    copy[key] = ArrayBuffer.isView(value) ? (value as Int32Array).slice() : Array.isArray(value) ? value.slice() : value;
  }
  copy.vertexNormals = undefined;
  copy.faceNormals = undefined;
  return copy as unknown as ModelDefinition;
}

function getModel(modelProvider: ModelProvider, item: ItemDefinition): Model | undefined {
  const provided = modelProvider(item.inventoryModel);
  if (provided === undefined) {
    return undefined;
  }
  const inventoryModel = freshCopy(provided);

  if (item.resizeX !== 128 || item.resizeY !== 128 || item.resizeZ !== 128) {
    inventoryModel.resize(item.resizeX, item.resizeY, item.resizeZ);
  }

  if (item.colorFind !== undefined) {
    for (let i = 0; i < item.colorFind.length; ++i) {
      inventoryModel.recolor(toShort(item.colorFind[i]), toShort(item.colorReplace![i]));
    }
  }

  if (item.textureFind !== undefined) {
    for (let i = 0; i < item.textureFind.length; ++i) {
      inventoryModel.retexture(toShort(item.textureFind[i]), toShort(item.textureReplace![i]));
    }
  }

  return light(inventoryModel, item.ambient + 64 | 0, item.contrast + 768 | 0, -50, -10, -50);
}

function light(def: ModelDefinition, ambient: number, contrast: number, x: number, y: number, z: number): Model {
  def.computeNormals();
  const somethingMagnitude = d2i(Math.sqrt(Math.imul(z, z) + Math.imul(x, x) + Math.imul(y, y) | 0));
  const var7 = Math.imul(somethingMagnitude, contrast) >> 8;
  const litModel = new Model();
  litModel.faceColors1 = new Int32Array(def.faceCount);
  litModel.faceColors2 = new Int32Array(def.faceCount);
  litModel.faceColors3 = new Int32Array(def.faceCount);
  if (def.numTextureFaces > 0 && def.textureCoords !== undefined) {
    const var9 = new Int32Array(def.numTextureFaces);
    let var10 = 0;
    for (var10 = 0; var10 < def.faceCount; ++var10) {
      if (def.textureCoords[var10] !== -1) {
        ++var9[def.textureCoords[var10] & 255];
      }
    }
    litModel.numTextureFaces = 0;
    for (var10 = 0; var10 < def.numTextureFaces; ++var10) {
      if (var9[var10] > 0 && def.textureRenderTypes![var10] === 0) {
        ++litModel.numTextureFaces;
      }
    }
    litModel.texIndices1 = new Int32Array(litModel.numTextureFaces);
    litModel.texIndices2 = new Int32Array(litModel.numTextureFaces);
    litModel.texIndices3 = new Int32Array(litModel.numTextureFaces);
    var10 = 0;
    for (let i = 0; i < def.numTextureFaces; ++i) {
      if (var9[i] > 0 && def.textureRenderTypes![i] === 0) {
        litModel.texIndices1[var10] = def.texIndices1![i] & 65535;
        litModel.texIndices2[var10] = def.texIndices2![i] & 65535;
        litModel.texIndices3[var10] = def.texIndices3![i] & 65535;
        var9[i] = var10++;
      } else {
        var9[i] = -1;
      }
    }
    litModel.textureCoords = new Int8Array(def.faceCount);
    for (let i = 0; i < def.faceCount; ++i) {
      if (def.textureCoords[i] !== -1) {
        litModel.textureCoords[i] = var9[def.textureCoords[i] & 255] << 24 >> 24;
      } else {
        litModel.textureCoords[i] = -1;
      }
    }
  }
  for (let faceIdx = 0; faceIdx < def.faceCount; ++faceIdx) {
    let faceType = 0;
    if (def.faceRenderTypes === undefined) {
      faceType = 0;
    } else {
      faceType = def.faceRenderTypes[faceIdx];
    }
    let faceAlpha = 0;
    if (def.faceTransparencies === undefined) {
      faceAlpha = 0;
    } else {
      faceAlpha = def.faceTransparencies[faceIdx];
    }
    let faceTexture = 0;
    if (def.faceTextures === undefined) {
      faceTexture = -1;
    } else {
      faceTexture = def.faceTextures[faceIdx];
    }
    if (faceAlpha === -2) {
      faceType = 3;
    }
    if (faceAlpha === -1) {
      faceType = 2;
    }
    let vertexNormal: VertexNormal;
    let tmp = 0;
    let faceNormal: FaceNormal;
    if (faceTexture === -1) {
      if (faceType !== 0) {
        if (faceType === 1) {
          faceNormal = def.faceNormals![faceIdx]!;
          tmp = idiv(Math.imul(y, faceNormal.y) + Math.imul(z, faceNormal.z) + Math.imul(x, faceNormal.x) | 0, idiv(var7, 2) + var7 | 0) + ambient | 0;
          litModel.faceColors1[faceIdx] = method2608(def.faceColors[faceIdx] & 65535, tmp);
          litModel.faceColors3[faceIdx] = -1;
        } else if (faceType === 3) {
          litModel.faceColors1[faceIdx] = 128;
          litModel.faceColors3[faceIdx] = -1;
        } else {
          litModel.faceColors3[faceIdx] = -2;
        }
      } else {
        const var15 = def.faceColors[faceIdx] & 65535;
        vertexNormal = def.vertexNormals![def.faceIndices1[faceIdx]];
        tmp = idiv(Math.imul(y, vertexNormal.y) + Math.imul(z, vertexNormal.z) + Math.imul(x, vertexNormal.x) | 0, Math.imul(var7, vertexNormal.magnitude)) + ambient | 0;
        litModel.faceColors1[faceIdx] = method2608(var15, tmp);
        vertexNormal = def.vertexNormals![def.faceIndices2[faceIdx]];
        tmp = idiv(Math.imul(y, vertexNormal.y) + Math.imul(z, vertexNormal.z) + Math.imul(x, vertexNormal.x) | 0, Math.imul(var7, vertexNormal.magnitude)) + ambient | 0;
        litModel.faceColors2[faceIdx] = method2608(var15, tmp);
        vertexNormal = def.vertexNormals![def.faceIndices3[faceIdx]];
        tmp = idiv(Math.imul(y, vertexNormal.y) + Math.imul(z, vertexNormal.z) + Math.imul(x, vertexNormal.x) | 0, Math.imul(var7, vertexNormal.magnitude)) + ambient | 0;
        litModel.faceColors3[faceIdx] = method2608(var15, tmp);
      }
    } else if (faceType !== 0) {
      if (faceType === 1) {
        faceNormal = def.faceNormals![faceIdx]!;
        tmp = idiv(Math.imul(y, faceNormal.y) + Math.imul(z, faceNormal.z) + Math.imul(x, faceNormal.x) | 0, idiv(var7, 2) + var7 | 0) + ambient | 0;
        litModel.faceColors1[faceIdx] = bound2to126(tmp);
        litModel.faceColors3[faceIdx] = -1;
      } else {
        litModel.faceColors3[faceIdx] = -2;
      }
    } else {
      vertexNormal = def.vertexNormals![def.faceIndices1[faceIdx]];
      tmp = idiv(Math.imul(y, vertexNormal.y) + Math.imul(z, vertexNormal.z) + Math.imul(x, vertexNormal.x) | 0, Math.imul(var7, vertexNormal.magnitude)) + ambient | 0;
      litModel.faceColors1[faceIdx] = bound2to126(tmp);
      vertexNormal = def.vertexNormals![def.faceIndices2[faceIdx]];
      tmp = idiv(Math.imul(y, vertexNormal.y) + Math.imul(z, vertexNormal.z) + Math.imul(x, vertexNormal.x) | 0, Math.imul(var7, vertexNormal.magnitude)) + ambient | 0;
      litModel.faceColors2[faceIdx] = bound2to126(tmp);
      vertexNormal = def.vertexNormals![def.faceIndices3[faceIdx]];
      tmp = idiv(Math.imul(y, vertexNormal.y) + Math.imul(z, vertexNormal.z) + Math.imul(x, vertexNormal.x) | 0, Math.imul(var7, vertexNormal.magnitude)) + ambient | 0;
      litModel.faceColors3[faceIdx] = bound2to126(tmp);
    }
  }
  litModel.verticesCount = def.vertexCount;
  litModel.verticesX = def.vertexX;
  litModel.verticesY = def.vertexY;
  litModel.verticesZ = def.vertexZ;
  litModel.indicesCount = def.faceCount;
  litModel.indices1 = def.faceIndices1;
  litModel.indices2 = def.faceIndices2;
  litModel.indices3 = def.faceIndices3;
  litModel.facePriorities = def.faceRenderPriorities;
  litModel.faceTransparencies = def.faceTransparencies;
  litModel.faceTextures = def.faceTextures;
  return litModel;
}

export function method2608(var0: number, var1: number): number {
  var1 = Math.imul(var0 & 127, var1) >> 7;
  var1 = bound2to126(var1);
  return (var0 & 65408) + var1 | 0;
}

export function bound2to126(var0: number): number {
  if (var0 < 2) {
    var0 = 2;
  } else if (var0 > 126) {
    var0 = 126;
  }
  return var0;
}
