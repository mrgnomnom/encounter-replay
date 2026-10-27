// Ported from RuneLite's cache library (net.runelite.cache.item.SpritePixels, BSD-2-Clause, see LICENSE in
// src/cache/store). An icon's pixels while it's drawn: RGB, 0 for transparent; names match the Java.
import type { Rasterizer2D } from "./rasterizer2d";

/** A finished icon: ARGB pixels as a Java BufferedImage of TYPE_INT_ARGB holds them, row by row */
export interface IconImage {
  width: number;
  height: number;
  pixels: Int32Array;
}

/** An icon as RGBA bytes, row by row, for ImageData or any PNG encoder */
export function iconToRgba(image: IconImage): Uint8ClampedArray {
  const out = new Uint8ClampedArray(image.pixels.length * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const p = image.pixels[i];
    out[i * 4] = (p >> 16) & 255;
    out[i * 4 + 1] = (p >> 8) & 255;
    out[i * 4 + 2] = p & 255;
    out[i * 4 + 3] = p >>> 24;
  }
  return out;
}

export class SpritePixels {
  pixels: Int32Array;
  width: number;
  height: number;
  offsetX = 0;
  offsetY = 0;

  constructor(width: number, height: number, pixels: Int32Array = new Int32Array(Math.imul(height, width))) {
    this.pixels = pixels;
    this.width = width;
    this.height = height;
  }

  drawBorder(color: number): void {
    const newPixels = new Int32Array(Math.imul(this.width, this.height));
    let pixelIndex = 0;
    for (let y = 0; y < this.height; ++y) {
      for (let x = 0; x < this.width; ++x) {
        let pixel = this.pixels[pixelIndex];
        if (pixel === 0) {
          if (x > 0 && this.pixels[pixelIndex - 1 | 0] !== 0) {
            pixel = color;
          } else if (y > 0 && this.pixels[pixelIndex - this.width | 0] !== 0) {
            pixel = color;
          } else if (x < (this.width - 1 | 0) && this.pixels[pixelIndex + 1 | 0] !== 0) {
            pixel = color;
          } else if (y < (this.height - 1 | 0) && this.pixels[pixelIndex + this.width | 0] !== 0) {
            pixel = color;
          }
        }
        newPixels[pixelIndex++] = pixel;
      }
    }
    this.pixels = newPixels;
  }

  drawShadow(color: number): void {
    for (let y = this.height - 1 | 0; y > 0; --y) {
      const rowOffset = Math.imul(y, this.width);
      for (let x = this.width - 1 | 0; x > 0; --x) {
        if (this.pixels[x + rowOffset | 0] === 0 && this.pixels[x + rowOffset - 1 - this.width | 0] !== 0) {
          this.pixels[x + rowOffset | 0] = color;
        }
      }
    }
  }

  drawAtOn(graphics: Rasterizer2D, x: number, y: number): void {
    x = x + this.offsetX | 0;
    y = y + this.offsetY | 0;
    let pixelIndex = x + Math.imul(y, graphics.graphicsPixelsWidth) | 0;
    let deltaIndex = 0;
    let height = this.height;
    let width = this.width;
    let var7 = graphics.graphicsPixelsWidth - width | 0;
    let var8 = 0;
    if (y < graphics.drawingAreaTop) {
      const deltaY = graphics.drawingAreaTop - y | 0;
      height = height - deltaY | 0;
      y = graphics.drawingAreaTop;
      deltaIndex = deltaIndex + Math.imul(deltaY, width) | 0;
      pixelIndex = pixelIndex + Math.imul(deltaY, graphics.graphicsPixelsWidth) | 0;
    }
    if ((height + y | 0) > graphics.drawingAreaBottom) {
      height = height - (height + y - graphics.drawingAreaBottom) | 0;
    }
    if (x < graphics.draw_region_x) {
      const deltaX = graphics.draw_region_x - x | 0;
      width = width - deltaX | 0;
      x = graphics.draw_region_x;
      deltaIndex = deltaIndex + deltaX | 0;
      pixelIndex = pixelIndex + deltaX | 0;
      var8 = var8 + deltaX | 0;
      var7 = var7 + deltaX | 0;
    }
    if ((width + x | 0) > graphics.drawingAreaRight) {
      const deltaX = width + x - graphics.drawingAreaRight | 0;
      width = width - deltaX | 0;
      var8 = var8 + deltaX | 0;
      var7 = var7 + deltaX | 0;
    }
    if (width > 0 && height > 0) {
      method5843(graphics.graphicsPixels, this.pixels, 0, deltaIndex, pixelIndex, width, height, var7, var8);
    }
  }

  /** toBufferedImage: every drawn pixel made opaque, the rest left fully transparent */
  toImage(): IconImage {
    const transPixels = new Int32Array(this.pixels.length);
    for (let i = 0; i < this.pixels.length; i++) {
      if (this.pixels[i] !== 0) {
        transPixels[i] = this.pixels[i] | 0xff000000;
      }
    }
    return { width: this.width, height: this.height, pixels: transPixels };
  }
}

function method5843(rasterizerPixels: Int32Array, spritePixels: Int32Array, var2: number, var3: number, pixelIndex: number, width: number, height: number, var7: number, var8: number): void {
  const var9 = -(width >> 2) | 0;
  width = -(width & 3) | 0;
  for (let var10 = -height | 0; var10 < 0; ++var10) {
    for (let i = Math.imul(var9, 4); i < 0; ++i) {
      var2 = spritePixels[var3++];
      if (var2 !== 0) {
        rasterizerPixels[pixelIndex++] = var2;
      } else {
        ++pixelIndex;
      }
    }
    for (let i = width; i < 0; ++i) {
      var2 = spritePixels[var3++];
      if (var2 !== 0) {
        rasterizerPixels[pixelIndex++] = var2;
      } else {
        ++pixelIndex;
      }
    }
    pixelIndex = pixelIndex + var7 | 0;
    var3 = var3 + var8 | 0;
  }
}
