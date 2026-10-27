// Ported from RuneLite's cache library (net.runelite.cache.item.RSTextureProvider, with
// net.runelite.cache.definitions.TextureDefinition.method2680 and SpriteDefinition.normalize, BSD-2-Clause,
// see LICENSE in src/cache/store). Textures by id for the rasterizer, their pixels built from sprites.
import { d2i } from "./intMath";
import type { SpriteDefinition } from "../defs/sprite";
import type { TextureDefinition } from "../defs/texture";
import type { SpriteProvider, TextureProvider } from "./types";

/**
 * Java keeps a texture's pixels on its TextureDefinition once built and reuses them from then on, whatever
 * brightness asks later; this does the same without writing to the definition
 */
const texturePixels = new WeakMap<TextureDefinition, Int32Array>();

export class RSTextureProvider {
  textures: (TextureDefinition | undefined)[];
  maxSize: number;
  size: number;
  brightness: number;
  width: number;

  constructor(textureProvider: TextureProvider, private readonly spriteProvider: SpriteProvider) {
    this.size = 0;
    this.brightness = 1.0;
    this.width = 128;
    this.maxSize = 20;
    this.size = this.maxSize;
    this.brightness = 0.8;
    this.width = 128;

    let max = -1;
    const all = textureProvider();
    for (let i = 0; i < all.length; i++) {
      if (all[i].id > max) {
        max = all[i].id;
      }
    }

    this.textures = new Array<TextureDefinition | undefined>(max + 1).fill(undefined);
    for (let i = 0; i < all.length; i++) {
      this.textures[all[i].id] = all[i];
    }
  }

  load(var1: number): Int32Array | undefined {
    const var2 = this.texture(var1);
    if (var2 !== undefined) {
      let pixels = texturePixels.get(var2);
      if (pixels === undefined) {
        pixels = method2680(var2, this.brightness, this.width, this.spriteProvider);
        texturePixels.set(var2, pixels);
      }
      return pixels;
    }

    return undefined;
  }

  getAverageTextureRGB(var1: number): number {
    const texture = this.texture(var1);
    return texture !== undefined ? texture.missingColor : 0;
  }

  vmethod3057(var1: number): boolean {
    const texture = this.texture(var1);
    if (texture === undefined) throw new TypeError(`No texture ${var1}`);
    return texture.field1778;
  }

  vmethod3066(_var1: number): boolean {
    return this.width === 64;
  }

  /** textures[id], failing as Java's array bounds check does */
  private texture(id: number): TextureDefinition | undefined {
    if (id < 0 || id >= this.textures.length) throw new RangeError(`Texture ${id} out of bounds`);
    return this.textures[id];
  }
}

/**
 * TextureDefinition.method2680: a width x width texture from its sprites at the given brightness. Java
 * normalizes each sprite and recolours its palette in place; the exporter hands out a fresh sprite each time,
 * so here they're copied instead and the provider may cache its sprites
 */
function method2680(texture: TextureDefinition, var1: number, var3: number, spriteProvider: SpriteProvider): Int32Array {
  const var5 = Math.imul(var3, var3);
  const pixels = new Int32Array(var5);

  const fileIds = texture.fileIds;
  for (let var6 = 0; var6 < fileIds.length; ++var6) {
    const var7 = spriteProvider(fileIds[var6], 0);
    if (var7 === undefined) throw new Error(`No sprite ${fileIds[var6]} for texture ${texture.id}`);
    const var8 = normalize(var7);
    const var9 = Int32Array.from(var7.palette);
    const maxWidth = var7.maxWidth;

    let var11: number;
    let var12: number;
    let var13: number;
    let var14: number;

    if (texture.field1786 !== undefined) {
      const var10 = texture.field1786[var6];

      if ((var10 & -16777216) === 50331648) {
        var11 = var10 & 16711935;
        var12 = (var10 >> 8) & 255;

        for (var13 = 0; var13 < var9.length; ++var13) {
          var14 = var9[var13];
          if (var14 >> 8 === (var14 & 65535)) {
            var14 &= 255;
            var9[var13] = ((Math.imul(var11, var14) >> 8) & 16711935) | (Math.imul(var12, var14) & 65280);
          }
        }
      }
    }

    for (var11 = 0; var11 < var9.length; ++var11) {
      var9[var11] = adjustRGB(var9[var11], var1);
    }

    if (var6 === 0) {
      var11 = 0;
    } else {
      var11 = texture.field1780![var6 - 1];
    }

    if (var11 === 0) {
      if (var3 === maxWidth) {
        for (var12 = 0; var12 < var5; ++var12) {
          pixels[var12] = var9[var8[var12] & 255];
        }
      } else if (maxWidth === 64 && var3 === 128) {
        var12 = 0;

        for (var13 = 0; var13 < var3; ++var13) {
          for (var14 = 0; var14 < var3; ++var14) {
            pixels[var12++] = var9[var8[((var13 >> 1) << 6) + (var14 >> 1)] & 255];
          }
        }
      } else {
        if (maxWidth !== 128 || var3 !== 64) {
          throw new Error(`Texture ${texture.id}: can't scale a ${maxWidth} wide sprite to ${var3}`);
        }

        var12 = 0;

        for (var13 = 0; var13 < var3; ++var13) {
          for (var14 = 0; var14 < var3; ++var14) {
            pixels[var12++] = var9[var8[(var14 << 1) + ((var13 << 1) << 7)] & 255];
          }
        }
      }
    }
  }

  return pixels;
}

/** SpriteDefinition.normalize: the sprite's palette indices placed on its full maxWidth x maxHeight canvas */
function normalize(sprite: SpriteDefinition): ArrayLike<number> {
  const pixelIdx = sprite.pixelIdx;
  if (sprite.width !== sprite.maxWidth || sprite.height !== sprite.maxHeight) {
    const var1 = new Int8Array(Math.imul(sprite.maxWidth, sprite.maxHeight));
    let var2 = 0;

    for (let var3 = 0; var3 < sprite.height; ++var3) {
      for (let var4 = 0; var4 < sprite.width; ++var4) {
        var1[var4 + Math.imul(var3 + sprite.offsetY, sprite.maxWidth) + sprite.offsetX] = pixelIdx[var2++];
      }
    }

    return var1;
  }
  return pixelIdx;
}

/** TextureDefinition.adjustRGB */
function adjustRGB(var0: number, var1: number): number {
  let var3 = (var0 >> 16) / 256.0;
  let var5 = ((var0 >> 8) & 255) / 256.0;
  let var7 = (var0 & 255) / 256.0;
  var3 = Math.pow(var3, var1);
  var5 = Math.pow(var5, var1);
  var7 = Math.pow(var7, var1);
  const var9 = d2i(var3 * 256.0);
  const var10 = d2i(var5 * 256.0);
  const var11 = d2i(var7 * 256.0);
  return (var11 + (var10 << 8) + (var9 << 16)) | 0;
}
