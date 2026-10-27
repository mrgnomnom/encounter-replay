// Ported from RuneLite's cache library (net.runelite.cache.definitions.TextureDefinition, providers.SpriteProvider and loaders.TextureLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";
import type { SpriteDefinition } from "./sprite";

/** net.runelite.cache.definitions.providers.SpriteProvider: should hand out a freshly loaded sprite, as method2680 recolours its palette in place */
export interface SpriteProvider {
  provide(spriteId: number, frameId: number): SpriteDefinition;
}

export class TextureDefinition {
  missingColor = 0;
  field1778 = false;
  id = 0;
  fileIds!: number[];
  field1780?: number[];
  field1781?: number[];
  field1786?: number[];
  animationSpeed = 0;
  animationDirection = 0;
  pixels?: number[];

  getId(): number { return this.id; }
  getFileIds(): number[] { return this.fileIds; }
  getMissingColor(): number { return this.missingColor; }
  isField1778(): boolean { return this.field1778; }
  getField1780(): number[] | undefined { return this.field1780; }
  getField1781(): number[] | undefined { return this.field1781; }
  getField1786(): number[] | undefined { return this.field1786; }
  getAnimationSpeed(): number { return this.animationSpeed; }
  getAnimationDirection(): number { return this.animationDirection; }
  getPixels(): number[] | undefined { return this.pixels; }

  /** Renders the texture's var3 x var3 pixels at brightness var1 */
  method2680(var1: number, var3: number, spriteProvider: SpriteProvider): boolean {
    const var5 = var3 * var3;
    const pixels: number[] = new Array(var5).fill(0);
    this.pixels = pixels;
    const fileIds = this.fileIds;
    for (let var6 = 0; var6 < fileIds.length; ++var6) {
      const var7 = spriteProvider.provide(fileIds[var6], 0);
      var7.normalize();
      const var8 = var7.pixelIdx;
      const var9 = var7.palette;
      let var11: number;
      let var12: number;
      let var13: number;
      let var14: number;
      if (this.field1786 !== undefined) {
        const var10 = this.field1786[var6];
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
      for (var11 = 0; var11 < var9.length; ++var11) var9[var11] = TextureDefinition.adjustRGB(var9[var11], var1);
      var11 = var6 === 0 ? 0 : this.field1780![var6 - 1];
      if (var11 === 0) {
        const pixel = (i: number) => {
          const p = var9[var8[i] & 255];
          if (p === undefined) throw new RangeError("Texture sprite pixel outside its palette");
          return p;
        };
        if (var3 === var7.maxWidth) {
          for (var12 = 0; var12 < var5; ++var12) pixels[var12] = pixel(var12);
        } else if (var7.maxWidth === 64 && var3 === 128) {
          var12 = 0;
          for (var13 = 0; var13 < var3; ++var13) {
            for (var14 = 0; var14 < var3; ++var14) pixels[var12++] = pixel(((var13 >> 1) << 6) + (var14 >> 1));
          }
        } else {
          if (var7.maxWidth !== 128 || var3 !== 64) throw new Error("Texture sprite size unsupported");
          var12 = 0;
          for (var13 = 0; var13 < var3; ++var13) {
            for (var14 = 0; var14 < var3; ++var14) pixels[var12++] = pixel((var14 << 1) + ((var13 << 1) << 7));
          }
        }
      }
    }
    return true;
  }

  static adjustRGB(var0: number, var1: number): number {
    let var3 = (var0 >> 16) / 256.0;
    let var5 = ((var0 >> 8) & 255) / 256.0;
    let var7 = (var0 & 255) / 256.0;
    var3 = Math.pow(var3, var1);
    var5 = Math.pow(var5, var1);
    var7 = Math.pow(var7, var1);
    const var9 = Math.trunc(var3 * 256.0);
    const var10 = Math.trunc(var5 * 256.0);
    const var11 = Math.trunc(var7 * 256.0);
    return (var11 + (var10 << 8) + (var9 << 16)) | 0;
  }
}

export class TextureLoader {
  private rev233 = true;

  isRev233(): boolean { return this.rev233; }
  setRev233(v: boolean): this { this.rev233 = v; return this; }

  load(id: number, b: Uint8Array): TextureDefinition {
    const is = new InputStream(b);
    const def = new TextureDefinition();
    def.id = id;
    if (this.rev233) {
      def.fileIds = [is.readUnsignedShort()];
      def.missingColor = is.readUnsignedShort();
      def.field1778 = is.readUnsignedByte() === 1;
      def.animationDirection = is.readUnsignedByte();
      def.animationSpeed = is.readUnsignedByte();
    } else {
      def.missingColor = is.readUnsignedShort();
      def.field1778 = is.readByte() !== 0;
      const count = is.readUnsignedByte();
      const files: number[] = new Array(count);
      for (let i = 0; i < count; ++i) files[i] = is.readUnsignedShort();
      def.fileIds = files;
      if (count > 1) {
        def.field1780 = new Array(count - 1);
        for (let var3 = 0; var3 < count - 1; ++var3) def.field1780[var3] = is.readUnsignedByte();
      }
      if (count > 1) {
        def.field1781 = new Array(count - 1);
        for (let var3 = 0; var3 < count - 1; ++var3) def.field1781[var3] = is.readUnsignedByte();
      }
      def.field1786 = new Array(count);
      for (let var3 = 0; var3 < count; ++var3) def.field1786[var3] = is.readInt();
      def.animationDirection = is.readUnsignedByte();
      def.animationSpeed = is.readUnsignedByte();
    }
    return def;
  }
}
