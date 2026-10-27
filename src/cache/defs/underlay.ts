// Ported from RuneLite's cache library (net.runelite.cache.definitions.UnderlayDefinition and loaders.UnderlayLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";
import { toInt } from "./casts";

export class UnderlayDefinition {
  id = 0;
  color = 0;
  hue = 0;
  saturation = 0;
  lightness = 0;
  hueMultiplier = 0;

  getId(): number { return this.id; }
  getColor(): number { return this.color; }
  getHue(): number { return this.hue; }
  getSaturation(): number { return this.saturation; }
  getLightness(): number { return this.lightness; }
  getHueMultiplier(): number { return this.hueMultiplier; }

  calculateHsl(): void {
    const var1 = this.color;
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
    const var16 = (var10 + var8) / 2.0;
    if (var8 !== var10) {
      if (var16 < 0.5) var14 = (var10 - var8) / (var8 + var10);
      if (var16 >= 0.5) var14 = (var10 - var8) / (2.0 - var10 - var8);
      if (var2 === var10) var12 = (var4 - var6) / (var10 - var8);
      else if (var10 === var4) var12 = 2.0 + (var6 - var2) / (var10 - var8);
      else if (var10 === var6) var12 = 4.0 + (var2 - var4) / (var10 - var8);
    }
    var12 /= 6.0;
    this.saturation = toInt(var14 * 256.0);
    this.lightness = toInt(var16 * 256.0);
    if (this.saturation < 0) this.saturation = 0;
    else if (this.saturation > 255) this.saturation = 255;
    if (this.lightness < 0) this.lightness = 0;
    else if (this.lightness > 255) this.lightness = 255;
    if (var16 > 0.5) this.hueMultiplier = toInt(var14 * (1.0 - var16) * 512.0);
    else this.hueMultiplier = toInt(var14 * var16 * 512.0);
    if (this.hueMultiplier < 1) this.hueMultiplier = 1;
    this.hue = toInt(this.hueMultiplier * var12);
  }
}

export class UnderlayLoader {
  load(id: number, b: Uint8Array): UnderlayDefinition {
    const def = new UnderlayDefinition();
    const is = new InputStream(b);
    def.id = id;
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      if (opcode === 1) def.color = is.read24BitInt();
    }
    def.calculateHsl();
    return def;
  }
}
