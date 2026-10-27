// Ported from RuneLite's cache library (net.runelite.cache.definitions.OverlayDefinition and loaders.OverlayLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";
import { toInt } from "./casts";

export class OverlayDefinition {
  id = 0;
  rgbColor = 0;
  texture = -1;
  secondaryRgbColor = -1;
  hideUnderlay = true;
  hue = 0;
  saturation = 0;
  lightness = 0;
  otherHue = 0;
  otherSaturation = 0;
  otherLightness = 0;

  getId(): number { return this.id; }
  getRgbColor(): number { return this.rgbColor; }
  getTexture(): number { return this.texture; }
  getSecondaryRgbColor(): number { return this.secondaryRgbColor; }
  isHideUnderlay(): boolean { return this.hideUnderlay; }
  getHue(): number { return this.hue; }
  getSaturation(): number { return this.saturation; }
  getLightness(): number { return this.lightness; }
  getOtherHue(): number { return this.otherHue; }
  getOtherSaturation(): number { return this.otherSaturation; }
  getOtherLightness(): number { return this.otherLightness; }

  calculateHsl(): void {
    if (this.secondaryRgbColor !== -1) {
      this.calculateHslOf(this.secondaryRgbColor);
      this.otherHue = this.hue;
      this.otherSaturation = this.saturation;
      this.otherLightness = this.lightness;
    }
    this.calculateHslOf(this.rgbColor);
  }

  /** The Java's private calculateHsl(int) overload */
  private calculateHslOf(var1: number): void {
    const var2 = ((var1 >> 16) & 255) / 256.0;
    const var4 = ((var1 >> 8) & 255) / 256.0;
    const var6 = (var1 & 255) / 256.0;
    let var8 = var2;
    if (var4 < var2) var8 = var4;
    if (var6 < var8) var8 = var6;
    let var10 = var2;
    if (var4 > var2) var10 = var4;
    if (var6 > var10) var10 = var6;
    let var12 = 0.0;
    let var14 = 0.0;
    const var16 = (var8 + var10) / 2.0;
    if (var10 !== var8) {
      if (var16 < 0.5) var14 = (var10 - var8) / (var10 + var8);
      if (var16 >= 0.5) var14 = (var10 - var8) / (2.0 - var10 - var8);
      if (var2 === var10) var12 = (var4 - var6) / (var10 - var8);
      else if (var4 === var10) var12 = 2.0 + (var6 - var2) / (var10 - var8);
      else if (var10 === var6) var12 = 4.0 + (var2 - var4) / (var10 - var8);
    }
    var12 /= 6.0;
    this.hue = toInt(256.0 * var12);
    this.saturation = toInt(var14 * 256.0);
    this.lightness = toInt(var16 * 256.0);
    if (this.saturation < 0) this.saturation = 0;
    else if (this.saturation > 255) this.saturation = 255;
    if (this.lightness < 0) this.lightness = 0;
    else if (this.lightness > 255) this.lightness = 255;
  }
}

export class OverlayLoader {
  load(id: number, b: Uint8Array): OverlayDefinition {
    const def = new OverlayDefinition();
    const is = new InputStream(b);
    def.id = id;
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      if (opcode === 1) def.rgbColor = is.read24BitInt();
      else if (opcode === 2) def.texture = is.readUnsignedByte();
      else if (opcode === 5) def.hideUnderlay = false;
      else if (opcode === 7) def.secondaryRgbColor = is.read24BitInt();
    }
    def.calculateHsl();
    return def;
  }
}
