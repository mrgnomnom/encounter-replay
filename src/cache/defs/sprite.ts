// Ported from RuneLite's cache library (net.runelite.cache.definitions.SpriteDefinition and loaders.SpriteLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";

export class SpriteDefinition {
  id = 0;
  frame = 0;
  offsetX = 0;
  offsetY = 0;
  width = 0;
  height = 0;
  /** ARGB, as Java's int[]: alpha 0xFF where the palette index is non-zero, else the sprite's alpha bytes (or 0) */
  pixels!: Int32Array;
  maxWidth = 0;
  maxHeight = 0;
  /** Palette index per pixel, Java's byte[] */
  pixelIdx!: Int8Array;
  /** Shared by all frames of a sprite group; entry 0 is transparent */
  palette!: number[];

  getId(): number { return this.id; }
  getFrame(): number { return this.frame; }
  getOffsetX(): number { return this.offsetX; }
  getOffsetY(): number { return this.offsetY; }
  getWidth(): number { return this.width; }
  getHeight(): number { return this.height; }
  getPixels(): Int32Array { return this.pixels; }
  getMaxWidth(): number { return this.maxWidth; }
  getMaxHeight(): number { return this.maxHeight; }

  normalize(): void {
    if (this.width !== this.maxWidth || this.height !== this.maxHeight) {
      const var1 = new Int8Array(this.maxWidth * this.maxHeight);
      const src = this.pixelIdx;
      let var2 = 0;
      for (let var3 = 0; var3 < this.height; ++var3) {
        for (let var4 = 0; var4 < this.width; ++var4) {
          const at = var4 + (var3 + this.offsetY) * this.maxWidth + this.offsetX;
          if (at < 0 || at >= var1.length) throw new RangeError("Sprite doesn't fit its max size");
          var1[at] = src[var2++];
        }
      }
      this.pixelIdx = var1;
      this.width = this.maxWidth;
      this.height = this.maxHeight;
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }
}

export class SpriteLoader {
  static readonly FLAG_VERTICAL = 0b01;
  static readonly FLAG_ALPHA = 0b10;

  load(id: number, b: Uint8Array): SpriteDefinition[] {
    const is = new InputStream(b);
    is.setOffset(is.getLength() - 2);
    const spriteCount = is.readUnsignedShort();
    const sprites: SpriteDefinition[] = new Array(spriteCount);
    // 2 for size, 5 for width, height, palette length, + 8 bytes per sprite for offset x/y, width, and height
    is.setOffset(is.getLength() - 7 - spriteCount * 8);
    // max width and height
    const width = is.readUnsignedShort();
    const height = is.readUnsignedShort();
    const paletteLength = is.readUnsignedByte() + 1;
    for (let i = 0; i < spriteCount; ++i) {
      const s = (sprites[i] = new SpriteDefinition());
      s.id = id;
      s.frame = i;
      s.maxWidth = width;
      s.maxHeight = height;
    }
    for (let i = 0; i < spriteCount; ++i) sprites[i].offsetX = is.readUnsignedShort();
    for (let i = 0; i < spriteCount; ++i) sprites[i].offsetY = is.readUnsignedShort();
    for (let i = 0; i < spriteCount; ++i) sprites[i].width = is.readUnsignedShort();
    for (let i = 0; i < spriteCount; ++i) sprites[i].height = is.readUnsignedShort();
    // same as above + 3 bytes for each palette entry, except for the first one (which is transparent)
    is.setOffset(is.getLength() - 7 - spriteCount * 8 - (paletteLength - 1) * 3);
    const palette: number[] = new Array(paletteLength).fill(0);
    for (let i = 1; i < paletteLength; ++i) {
      palette[i] = is.read24BitInt();
      if (palette[i] === 0) palette[i] = 1;
    }
    is.setOffset(0);
    for (let i = 0; i < spriteCount; ++i) {
      const def = sprites[i];
      const spriteWidth = def.width;
      const spriteHeight = def.height;
      const dimension = spriteWidth * spriteHeight;
      const pixelPaletteIndicies = new Int8Array(dimension);
      const pixelAlphas = new Int8Array(dimension);
      def.pixelIdx = pixelPaletteIndicies;
      def.palette = palette;
      const flags = is.readUnsignedByte();
      if ((flags & SpriteLoader.FLAG_VERTICAL) === 0) {
        for (let j = 0; j < dimension; ++j) pixelPaletteIndicies[j] = is.readByte();
      } else {
        for (let j = 0; j < spriteWidth; ++j) {
          for (let k = 0; k < spriteHeight; ++k) pixelPaletteIndicies[spriteWidth * k + j] = is.readByte();
        }
      }
      if ((flags & SpriteLoader.FLAG_ALPHA) !== 0) {
        if ((flags & SpriteLoader.FLAG_VERTICAL) === 0) {
          for (let j = 0; j < dimension; ++j) pixelAlphas[j] = is.readByte();
        } else {
          for (let j = 0; j < spriteWidth; ++j) {
            for (let k = 0; k < spriteHeight; ++k) pixelAlphas[spriteWidth * k + j] = is.readByte();
          }
        }
      }
      // everything non-zero is opaque
      for (let j = 0; j < dimension; ++j) {
        if (pixelPaletteIndicies[j] !== 0) pixelAlphas[j] = -1;
      }
      const pixels = new Int32Array(dimension);
      // build argb pixels from palette/alphas
      for (let j = 0; j < dimension; ++j) {
        const index = pixelPaletteIndicies[j] & 0xff;
        if (index >= paletteLength) throw new RangeError(`Sprite ${id} pixel uses palette entry ${index} of ${paletteLength}`);
        pixels[j] = palette[index] | (pixelAlphas[j] << 24);
      }
      def.pixels = pixels;
    }
    return sprites;
  }
}
