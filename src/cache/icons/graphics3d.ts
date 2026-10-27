// Ported from RuneLite's cache library (net.runelite.cache.item.Graphics3D, BSD-2-Clause, see LICENSE in
// src/cache/store). The client's software triangle rasterizer: flat, Gouraud and affine-textured faces into
// a Rasterizer2D buffer. Translated line for line with Java int semantics (Math.imul, `| 0` where a sum
// can leave the int range, division that throws on zero) so every pixel comes out as the Java's does.
import { d2i, idiv } from "./intMath";
import { createPalette } from "./jagexColor";
import { Rasterizer2D } from "./rasterizer2d";
import type { RSTextureProvider } from "./rsTextureProvider";

/** How much of the circle each unit of SINE/COSINE is */
const UNIT = Math.PI / 1024.0;

/** sine of each of the 2048 angle units, * 65536 and kept as an int */
export const SINE = new Int32Array(2048);
/** cosine, likewise */
export const COSINE = new Int32Array(2048);

for (let i = 0; i < 2048; ++i) {
  SINE[i] = d2i(65536.0 * Math.sin(i * UNIT));
  COSINE[i] = d2i(65536.0 * Math.cos(i * UNIT));
}

/** createPalette's result depends only on the brightness, and nothing writes to it, so it's made once each */
const palettes = new Map<number, Int32Array>();

export class Graphics3D extends Rasterizer2D {
  rasterClipEnable = false;
  field1909 = false;
  lowMem = false;
  rasterGouraudLowRes = true;
  rasterAlpha = 0;
  Rasterizer3D_zoom = 512;
  centerX = 0;
  centerY = 0;
  rasterClipX = 0;
  Rasterizer3D_clipHeight = 0;
  Rasterizer3D_clipNegativeMidX = 0;
  Rasterizer3D_clipMidX2 = 0;
  Rasterizer3D_clipNegativeMidY = 0;
  Rasterizer3D_clipMidY2 = 0;
  rasterClipY = new Int32Array(1024);
  colorPalette: Int32Array = new Int32Array(0);

  constructor(private readonly textureProvider: RSTextureProvider) {
    super();
  }

  /** Java overloads this with no arguments, meaning the current draw region */
  setRasterClipping(var0: number = this.draw_region_x, var1: number = this.drawingAreaTop, var2: number = this.drawingAreaRight, var3: number = this.drawingAreaBottom): void {
    this.rasterClipX = var2 - var0 | 0;
    this.Rasterizer3D_clipHeight = var3 - var1 | 0;
    this.Rasterizer3D_method3();
    if (this.rasterClipY.length < this.Rasterizer3D_clipHeight) {
      let v = this.Rasterizer3D_clipHeight - 1 | 0;
      v |= v >>> 1;
      v |= v >>> 2;
      v |= v >>> 4;
      v |= v >>> 8;
      v |= v >>> 16;
      this.rasterClipY = new Int32Array(v + 1 | 0);
    }
    let var4 = var0 + Math.imul(this.graphicsPixelsWidth, var1) | 0;
    for (let i = 0; i < this.Rasterizer3D_clipHeight; ++i) {
      this.rasterClipY[i] = var4;
      var4 = var4 + this.graphicsPixelsWidth | 0;
    }
  }

  Rasterizer3D_method3(): void {
    this.centerX = idiv(this.rasterClipX, 2);
    this.centerY = idiv(this.Rasterizer3D_clipHeight, 2);
    this.Rasterizer3D_clipNegativeMidX = -this.centerX | 0;
    this.Rasterizer3D_clipMidX2 = this.rasterClipX - this.centerX | 0;
    this.Rasterizer3D_clipNegativeMidY = -this.centerY | 0;
    this.Rasterizer3D_clipMidY2 = this.Rasterizer3D_clipHeight - this.centerY | 0;
  }

  setOffset(x: number, y: number): void {
    const var2 = this.rasterClipY[0];
    const var3 = idiv(var2, this.graphicsPixelsWidth);
    const var4 = var2 - Math.imul(var3, this.graphicsPixelsWidth) | 0;
    this.centerX = x - var4 | 0;
    this.centerY = y - var3 | 0;
    this.Rasterizer3D_clipNegativeMidX = -this.centerX | 0;
    this.Rasterizer3D_clipMidX2 = this.rasterClipX - this.centerX | 0;
    this.Rasterizer3D_clipNegativeMidY = -this.centerY | 0;
    this.Rasterizer3D_clipMidY2 = this.Rasterizer3D_clipHeight - this.centerY | 0;
  }

  setBrightness(brightness: number): void {
    let palette = palettes.get(brightness);
    if (!palette) {
      palette = createPalette(brightness);
      palettes.set(brightness, palette);
    }
    this.colorPalette = palette;
  }

  rasterGouraud(var0: number, var1: number, var2: number, var3: number, var4: number, var5: number, var6: number, var7: number, var8: number): void {
    const var9 = var4 - var3 | 0;
    const var10 = var1 - var0 | 0;
    const var11 = var5 - var3 | 0;
    const var12 = var2 - var0 | 0;
    const var13 = var7 - var6 | 0;
    const var14 = var8 - var6 | 0;
    let var15 = 0;
    if (var2 !== var1) {
      var15 = idiv(var5 - var4 << 14, var2 - var1 | 0);
    } else {
      var15 = 0;
    }
    let var16 = 0;
    if (var0 !== var1) {
      var16 = idiv(var9 << 14, var10);
    } else {
      var16 = 0;
    }
    let var17 = 0;
    if (var0 !== var2) {
      var17 = idiv(var11 << 14, var12);
    } else {
      var17 = 0;
    }
    const var18 = Math.imul(var9, var12) - Math.imul(var11, var10) | 0;
    if (var18 !== 0) {
      const var19 = idiv(Math.imul(var13, var12) - Math.imul(var14, var10) << 8, var18);
      const var20 = idiv(Math.imul(var14, var9) - Math.imul(var13, var11) << 8, var18);
      if (var0 <= var1 && var0 <= var2) {
        if (var0 < this.Rasterizer3D_clipHeight) {
          if (var1 > this.Rasterizer3D_clipHeight) {
            var1 = this.Rasterizer3D_clipHeight;
          }
          if (var2 > this.Rasterizer3D_clipHeight) {
            var2 = this.Rasterizer3D_clipHeight;
          }
          var6 = var19 + ((var6 << 8) - Math.imul(var3, var19)) | 0;
          if (var1 < var2) {
            var5 = var3 <<= 14;
            if (var0 < 0) {
              var5 = var5 - Math.imul(var0, var17) | 0;
              var3 = var3 - Math.imul(var0, var16) | 0;
              var6 = var6 - Math.imul(var0, var20) | 0;
              var0 = 0;
            }
            var4 <<= 14;
            if (var1 < 0) {
              var4 = var4 - Math.imul(var15, var1) | 0;
              var1 = 0;
            }
            if (var0 !== var1 && var17 < var16 || var0 === var1 && var17 > var15) {
              var2 = var2 - var1 | 0;
              var1 = var1 - var0 | 0;
              var0 = this.rasterClipY[var0];
              while (true) {
                --var1;
                if (var1 < 0) {
                  while (true) {
                    --var2;
                    if (var2 < 0) {
                      return;
                    }
                    this.method2778(this.graphicsPixels, var0, 0, 0, var5 >> 14, var4 >> 14, var6, var19);
                    var5 = var5 + var17 | 0;
                    var4 = var4 + var15 | 0;
                    var6 = var6 + var20 | 0;
                    var0 = var0 + this.graphicsPixelsWidth | 0;
                  }
                }
                this.method2778(this.graphicsPixels, var0, 0, 0, var5 >> 14, var3 >> 14, var6, var19);
                var5 = var5 + var17 | 0;
                var3 = var3 + var16 | 0;
                var6 = var6 + var20 | 0;
                var0 = var0 + this.graphicsPixelsWidth | 0;
              }
            } else {
              var2 = var2 - var1 | 0;
              var1 = var1 - var0 | 0;
              var0 = this.rasterClipY[var0];
              while (true) {
                --var1;
                if (var1 < 0) {
                  while (true) {
                    --var2;
                    if (var2 < 0) {
                      return;
                    }
                    this.method2778(this.graphicsPixels, var0, 0, 0, var4 >> 14, var5 >> 14, var6, var19);
                    var5 = var5 + var17 | 0;
                    var4 = var4 + var15 | 0;
                    var6 = var6 + var20 | 0;
                    var0 = var0 + this.graphicsPixelsWidth | 0;
                  }
                }
                this.method2778(this.graphicsPixels, var0, 0, 0, var3 >> 14, var5 >> 14, var6, var19);
                var5 = var5 + var17 | 0;
                var3 = var3 + var16 | 0;
                var6 = var6 + var20 | 0;
                var0 = var0 + this.graphicsPixelsWidth | 0;
              }
            }
          } else {
            var4 = var3 <<= 14;
            if (var0 < 0) {
              var4 = var4 - Math.imul(var0, var17) | 0;
              var3 = var3 - Math.imul(var0, var16) | 0;
              var6 = var6 - Math.imul(var0, var20) | 0;
              var0 = 0;
            }
            var5 <<= 14;
            if (var2 < 0) {
              var5 = var5 - Math.imul(var15, var2) | 0;
              var2 = 0;
            }
            if (var0 !== var2 && var17 < var16 || var0 === var2 && var15 > var16) {
              var1 = var1 - var2 | 0;
              var2 = var2 - var0 | 0;
              var0 = this.rasterClipY[var0];
              while (true) {
                --var2;
                if (var2 < 0) {
                  while (true) {
                    --var1;
                    if (var1 < 0) {
                      return;
                    }
                    this.method2778(this.graphicsPixels, var0, 0, 0, var5 >> 14, var3 >> 14, var6, var19);
                    var5 = var5 + var15 | 0;
                    var3 = var3 + var16 | 0;
                    var6 = var6 + var20 | 0;
                    var0 = var0 + this.graphicsPixelsWidth | 0;
                  }
                }
                this.method2778(this.graphicsPixels, var0, 0, 0, var4 >> 14, var3 >> 14, var6, var19);
                var4 = var4 + var17 | 0;
                var3 = var3 + var16 | 0;
                var6 = var6 + var20 | 0;
                var0 = var0 + this.graphicsPixelsWidth | 0;
              }
            } else {
              var1 = var1 - var2 | 0;
              var2 = var2 - var0 | 0;
              var0 = this.rasterClipY[var0];
              while (true) {
                --var2;
                if (var2 < 0) {
                  while (true) {
                    --var1;
                    if (var1 < 0) {
                      return;
                    }
                    this.method2778(this.graphicsPixels, var0, 0, 0, var3 >> 14, var5 >> 14, var6, var19);
                    var5 = var5 + var15 | 0;
                    var3 = var3 + var16 | 0;
                    var6 = var6 + var20 | 0;
                    var0 = var0 + this.graphicsPixelsWidth | 0;
                  }
                }
                this.method2778(this.graphicsPixels, var0, 0, 0, var3 >> 14, var4 >> 14, var6, var19);
                var4 = var4 + var17 | 0;
                var3 = var3 + var16 | 0;
                var6 = var6 + var20 | 0;
                var0 = var0 + this.graphicsPixelsWidth | 0;
              }
            }
          }
        }
      } else if (var1 <= var2) {
        if (var1 < this.Rasterizer3D_clipHeight) {
          if (var2 > this.Rasterizer3D_clipHeight) {
            var2 = this.Rasterizer3D_clipHeight;
          }
          if (var0 > this.Rasterizer3D_clipHeight) {
            var0 = this.Rasterizer3D_clipHeight;
          }
          var7 = var19 + ((var7 << 8) - Math.imul(var19, var4)) | 0;
          if (var2 < var0) {
            var3 = var4 <<= 14;
            if (var1 < 0) {
              var3 = var3 - Math.imul(var16, var1) | 0;
              var4 = var4 - Math.imul(var15, var1) | 0;
              var7 = var7 - Math.imul(var20, var1) | 0;
              var1 = 0;
            }
            var5 <<= 14;
            if (var2 < 0) {
              var5 = var5 - Math.imul(var17, var2) | 0;
              var2 = 0;
            }
            if (var2 !== var1 && var16 < var15 || var2 === var1 && var16 > var17) {
              var0 = var0 - var2 | 0;
              var2 = var2 - var1 | 0;
              var1 = this.rasterClipY[var1];
              while (true) {
                --var2;
                if (var2 < 0) {
                  while (true) {
                    --var0;
                    if (var0 < 0) {
                      return;
                    }
                    this.method2778(this.graphicsPixels, var1, 0, 0, var3 >> 14, var5 >> 14, var7, var19);
                    var3 = var3 + var16 | 0;
                    var5 = var5 + var17 | 0;
                    var7 = var7 + var20 | 0;
                    var1 = var1 + this.graphicsPixelsWidth | 0;
                  }
                }
                this.method2778(this.graphicsPixels, var1, 0, 0, var3 >> 14, var4 >> 14, var7, var19);
                var3 = var3 + var16 | 0;
                var4 = var4 + var15 | 0;
                var7 = var7 + var20 | 0;
                var1 = var1 + this.graphicsPixelsWidth | 0;
              }
            } else {
              var0 = var0 - var2 | 0;
              var2 = var2 - var1 | 0;
              var1 = this.rasterClipY[var1];
              while (true) {
                --var2;
                if (var2 < 0) {
                  while (true) {
                    --var0;
                    if (var0 < 0) {
                      return;
                    }
                    this.method2778(this.graphicsPixels, var1, 0, 0, var5 >> 14, var3 >> 14, var7, var19);
                    var3 = var3 + var16 | 0;
                    var5 = var5 + var17 | 0;
                    var7 = var7 + var20 | 0;
                    var1 = var1 + this.graphicsPixelsWidth | 0;
                  }
                }
                this.method2778(this.graphicsPixels, var1, 0, 0, var4 >> 14, var3 >> 14, var7, var19);
                var3 = var3 + var16 | 0;
                var4 = var4 + var15 | 0;
                var7 = var7 + var20 | 0;
                var1 = var1 + this.graphicsPixelsWidth | 0;
              }
            }
          } else {
            var5 = var4 <<= 14;
            if (var1 < 0) {
              var5 = var5 - Math.imul(var16, var1) | 0;
              var4 = var4 - Math.imul(var15, var1) | 0;
              var7 = var7 - Math.imul(var20, var1) | 0;
              var1 = 0;
            }
            var3 <<= 14;
            if (var0 < 0) {
              var3 = var3 - Math.imul(var0, var17) | 0;
              var0 = 0;
            }
            if (var16 < var15) {
              var2 = var2 - var0 | 0;
              var0 = var0 - var1 | 0;
              var1 = this.rasterClipY[var1];
              while (true) {
                --var0;
                if (var0 < 0) {
                  while (true) {
                    --var2;
                    if (var2 < 0) {
                      return;
                    }
                    this.method2778(this.graphicsPixels, var1, 0, 0, var3 >> 14, var4 >> 14, var7, var19);
                    var3 = var3 + var17 | 0;
                    var4 = var4 + var15 | 0;
                    var7 = var7 + var20 | 0;
                    var1 = var1 + this.graphicsPixelsWidth | 0;
                  }
                }
                this.method2778(this.graphicsPixels, var1, 0, 0, var5 >> 14, var4 >> 14, var7, var19);
                var5 = var5 + var16 | 0;
                var4 = var4 + var15 | 0;
                var7 = var7 + var20 | 0;
                var1 = var1 + this.graphicsPixelsWidth | 0;
              }
            } else {
              var2 = var2 - var0 | 0;
              var0 = var0 - var1 | 0;
              var1 = this.rasterClipY[var1];
              while (true) {
                --var0;
                if (var0 < 0) {
                  while (true) {
                    --var2;
                    if (var2 < 0) {
                      return;
                    }
                    this.method2778(this.graphicsPixels, var1, 0, 0, var4 >> 14, var3 >> 14, var7, var19);
                    var3 = var3 + var17 | 0;
                    var4 = var4 + var15 | 0;
                    var7 = var7 + var20 | 0;
                    var1 = var1 + this.graphicsPixelsWidth | 0;
                  }
                }
                this.method2778(this.graphicsPixels, var1, 0, 0, var4 >> 14, var5 >> 14, var7, var19);
                var5 = var5 + var16 | 0;
                var4 = var4 + var15 | 0;
                var7 = var7 + var20 | 0;
                var1 = var1 + this.graphicsPixelsWidth | 0;
              }
            }
          }
        }
      } else if (var2 < this.Rasterizer3D_clipHeight) {
        if (var0 > this.Rasterizer3D_clipHeight) {
          var0 = this.Rasterizer3D_clipHeight;
        }
        if (var1 > this.Rasterizer3D_clipHeight) {
          var1 = this.Rasterizer3D_clipHeight;
        }
        var8 = var19 + ((var8 << 8) - Math.imul(var5, var19)) | 0;
        if (var0 < var1) {
          var4 = var5 <<= 14;
          if (var2 < 0) {
            var4 = var4 - Math.imul(var15, var2) | 0;
            var5 = var5 - Math.imul(var17, var2) | 0;
            var8 = var8 - Math.imul(var20, var2) | 0;
            var2 = 0;
          }
          var3 <<= 14;
          if (var0 < 0) {
            var3 = var3 - Math.imul(var0, var16) | 0;
            var0 = 0;
          }
          if (var15 < var17) {
            var1 = var1 - var0 | 0;
            var0 = var0 - var2 | 0;
            var2 = this.rasterClipY[var2];
            while (true) {
              --var0;
              if (var0 < 0) {
                while (true) {
                  --var1;
                  if (var1 < 0) {
                    return;
                  }
                  this.method2778(this.graphicsPixels, var2, 0, 0, var4 >> 14, var3 >> 14, var8, var19);
                  var4 = var4 + var15 | 0;
                  var3 = var3 + var16 | 0;
                  var8 = var8 + var20 | 0;
                  var2 = var2 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2778(this.graphicsPixels, var2, 0, 0, var4 >> 14, var5 >> 14, var8, var19);
              var4 = var4 + var15 | 0;
              var5 = var5 + var17 | 0;
              var8 = var8 + var20 | 0;
              var2 = var2 + this.graphicsPixelsWidth | 0;
            }
          } else {
            var1 = var1 - var0 | 0;
            var0 = var0 - var2 | 0;
            var2 = this.rasterClipY[var2];
            while (true) {
              --var0;
              if (var0 < 0) {
                while (true) {
                  --var1;
                  if (var1 < 0) {
                    return;
                  }
                  this.method2778(this.graphicsPixels, var2, 0, 0, var3 >> 14, var4 >> 14, var8, var19);
                  var4 = var4 + var15 | 0;
                  var3 = var3 + var16 | 0;
                  var8 = var8 + var20 | 0;
                  var2 = var2 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2778(this.graphicsPixels, var2, 0, 0, var5 >> 14, var4 >> 14, var8, var19);
              var4 = var4 + var15 | 0;
              var5 = var5 + var17 | 0;
              var8 = var8 + var20 | 0;
              var2 = var2 + this.graphicsPixelsWidth | 0;
            }
          }
        } else {
          var3 = var5 <<= 14;
          if (var2 < 0) {
            var3 = var3 - Math.imul(var15, var2) | 0;
            var5 = var5 - Math.imul(var17, var2) | 0;
            var8 = var8 - Math.imul(var20, var2) | 0;
            var2 = 0;
          }
          var4 <<= 14;
          if (var1 < 0) {
            var4 = var4 - Math.imul(var16, var1) | 0;
            var1 = 0;
          }
          if (var15 < var17) {
            var0 = var0 - var1 | 0;
            var1 = var1 - var2 | 0;
            var2 = this.rasterClipY[var2];
            while (true) {
              --var1;
              if (var1 < 0) {
                while (true) {
                  --var0;
                  if (var0 < 0) {
                    return;
                  }
                  this.method2778(this.graphicsPixels, var2, 0, 0, var4 >> 14, var5 >> 14, var8, var19);
                  var4 = var4 + var16 | 0;
                  var5 = var5 + var17 | 0;
                  var8 = var8 + var20 | 0;
                  var2 = var2 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2778(this.graphicsPixels, var2, 0, 0, var3 >> 14, var5 >> 14, var8, var19);
              var3 = var3 + var15 | 0;
              var5 = var5 + var17 | 0;
              var8 = var8 + var20 | 0;
              var2 = var2 + this.graphicsPixelsWidth | 0;
            }
          } else {
            var0 = var0 - var1 | 0;
            var1 = var1 - var2 | 0;
            var2 = this.rasterClipY[var2];
            while (true) {
              --var1;
              if (var1 < 0) {
                while (true) {
                  --var0;
                  if (var0 < 0) {
                    return;
                  }
                  this.method2778(this.graphicsPixels, var2, 0, 0, var5 >> 14, var4 >> 14, var8, var19);
                  var4 = var4 + var16 | 0;
                  var5 = var5 + var17 | 0;
                  var8 = var8 + var20 | 0;
                  var2 = var2 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2778(this.graphicsPixels, var2, 0, 0, var5 >> 14, var3 >> 14, var8, var19);
              var3 = var3 + var15 | 0;
              var5 = var5 + var17 | 0;
              var8 = var8 + var20 | 0;
              var2 = var2 + this.graphicsPixelsWidth | 0;
            }
          }
        }
      }
    }
  }

  method2778(var0: Int32Array, var1: number, var2: number, var3: number, var4: number, var5: number, var6: number, var7: number): void {
    if (this.rasterClipEnable) {
      if (var5 > this.rasterClipX) {
        var5 = this.rasterClipX;
      }
      if (var4 < 0) {
        var4 = 0;
      }
    }
    if (var4 < var5) {
      var1 = var1 + var4 | 0;
      var6 = var6 + Math.imul(var4, var7) | 0;
      let var8 = 0;
      let var9 = 0;
      let var10 = 0;
      if (this.rasterGouraudLowRes) {
        var3 = var5 - var4 >> 2;
        var7 <<= 2;
        if (this.rasterAlpha === 0) {
          if (var3 > 0) {
            do {
              var2 = this.colorPalette[var6 >> 8];
              var6 = var6 + var7 | 0;
              var0[var1++] = var2;
              var0[var1++] = var2;
              var0[var1++] = var2;
              var0[var1++] = var2;
              --var3;
            } while (var3 > 0);
          }
          var3 = var5 - var4 & 3;
          if (var3 > 0) {
            var2 = this.colorPalette[var6 >> 8];
            do {
              var0[var1++] = var2;
              --var3;
            } while (var3 > 0);
          }
        } else {
          var8 = this.rasterAlpha;
          var9 = 256 - this.rasterAlpha | 0;
          if (var3 > 0) {
            do {
              var2 = this.colorPalette[var6 >> 8];
              var6 = var6 + var7 | 0;
              var2 = (Math.imul(var9, var2 & 65280) >> 8 & 65280) + (Math.imul(var9, var2 & 16711935) >> 8 & 16711935) | 0;
              var10 = var0[var1];
              var0[var1++] = (Math.imul(var10 & 16711935, var8) >> 8 & 16711935) + var2 + (Math.imul(var8, var10 & 65280) >> 8 & 65280);
              var10 = var0[var1];
              var0[var1++] = (Math.imul(var10 & 16711935, var8) >> 8 & 16711935) + var2 + (Math.imul(var8, var10 & 65280) >> 8 & 65280);
              var10 = var0[var1];
              var0[var1++] = (Math.imul(var10 & 16711935, var8) >> 8 & 16711935) + var2 + (Math.imul(var8, var10 & 65280) >> 8 & 65280);
              var10 = var0[var1];
              var0[var1++] = (Math.imul(var10 & 16711935, var8) >> 8 & 16711935) + var2 + (Math.imul(var8, var10 & 65280) >> 8 & 65280);
              --var3;
            } while (var3 > 0);
          }
          var3 = var5 - var4 & 3;
          if (var3 > 0) {
            var2 = this.colorPalette[var6 >> 8];
            var2 = (Math.imul(var9, var2 & 65280) >> 8 & 65280) + (Math.imul(var9, var2 & 16711935) >> 8 & 16711935) | 0;
            do {
              var10 = var0[var1];
              var0[var1++] = (Math.imul(var10 & 16711935, var8) >> 8 & 16711935) + var2 + (Math.imul(var8, var10 & 65280) >> 8 & 65280);
              --var3;
            } while (var3 > 0);
          }
        }
      } else {
        var3 = var5 - var4 | 0;
        if (this.rasterAlpha === 0) {
          do {
            var0[var1++] = this.colorPalette[var6 >> 8];
            var6 = var6 + var7 | 0;
            --var3;
          } while (var3 > 0);
        } else {
          var8 = this.rasterAlpha;
          var9 = 256 - this.rasterAlpha | 0;
          do {
            var2 = this.colorPalette[var6 >> 8];
            var6 = var6 + var7 | 0;
            var2 = (Math.imul(var9, var2 & 65280) >> 8 & 65280) + (Math.imul(var9, var2 & 16711935) >> 8 & 16711935) | 0;
            var10 = var0[var1];
            var0[var1++] = (Math.imul(var10 & 16711935, var8) >> 8 & 16711935) + var2 + (Math.imul(var8, var10 & 65280) >> 8 & 65280);
            --var3;
          } while (var3 > 0);
        }
      }
    }
  }

  rasterFlat(var0: number, var1: number, var2: number, var3: number, var4: number, var5: number, var6: number): void {
    let var7 = 0;
    if (var0 !== var1) {
      var7 = idiv(var4 - var3 << 14, var1 - var0 | 0);
    }
    let var8 = 0;
    if (var2 !== var1) {
      var8 = idiv(var5 - var4 << 14, var2 - var1 | 0);
    }
    let var9 = 0;
    if (var0 !== var2) {
      var9 = idiv(var3 - var5 << 14, var0 - var2 | 0);
    }
    if (var0 <= var1 && var0 <= var2) {
      if (var0 < this.Rasterizer3D_clipHeight) {
        if (var1 > this.Rasterizer3D_clipHeight) {
          var1 = this.Rasterizer3D_clipHeight;
        }
        if (var2 > this.Rasterizer3D_clipHeight) {
          var2 = this.Rasterizer3D_clipHeight;
        }
        if (var1 < var2) {
          var5 = var3 <<= 14;
          if (var0 < 0) {
            var5 = var5 - Math.imul(var0, var9) | 0;
            var3 = var3 - Math.imul(var0, var7) | 0;
            var0 = 0;
          }
          var4 <<= 14;
          if (var1 < 0) {
            var4 = var4 - Math.imul(var8, var1) | 0;
            var1 = 0;
          }
          if ((var0 === var1 || var9 >= var7) && (var0 !== var1 || var9 <= var8)) {
            var2 = var2 - var1 | 0;
            var1 = var1 - var0 | 0;
            var0 = this.rasterClipY[var0];
            while (true) {
              --var1;
              if (var1 < 0) {
                while (true) {
                  --var2;
                  if (var2 < 0) {
                    return;
                  }
                  this.method2842(this.graphicsPixels, var0, var6, 0, var4 >> 14, var5 >> 14);
                  var5 = var5 + var9 | 0;
                  var4 = var4 + var8 | 0;
                  var0 = var0 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2842(this.graphicsPixels, var0, var6, 0, var3 >> 14, var5 >> 14);
              var5 = var5 + var9 | 0;
              var3 = var3 + var7 | 0;
              var0 = var0 + this.graphicsPixelsWidth | 0;
            }
          } else {
            var2 = var2 - var1 | 0;
            var1 = var1 - var0 | 0;
            var0 = this.rasterClipY[var0];
            while (true) {
              --var1;
              if (var1 < 0) {
                while (true) {
                  --var2;
                  if (var2 < 0) {
                    return;
                  }
                  this.method2842(this.graphicsPixels, var0, var6, 0, var5 >> 14, var4 >> 14);
                  var5 = var5 + var9 | 0;
                  var4 = var4 + var8 | 0;
                  var0 = var0 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2842(this.graphicsPixels, var0, var6, 0, var5 >> 14, var3 >> 14);
              var5 = var5 + var9 | 0;
              var3 = var3 + var7 | 0;
              var0 = var0 + this.graphicsPixelsWidth | 0;
            }
          }
        } else {
          var4 = var3 <<= 14;
          if (var0 < 0) {
            var4 = var4 - Math.imul(var0, var9) | 0;
            var3 = var3 - Math.imul(var0, var7) | 0;
            var0 = 0;
          }
          var5 <<= 14;
          if (var2 < 0) {
            var5 = var5 - Math.imul(var8, var2) | 0;
            var2 = 0;
          }
          if (var0 !== var2 && var9 < var7 || var0 === var2 && var8 > var7) {
            var1 = var1 - var2 | 0;
            var2 = var2 - var0 | 0;
            var0 = this.rasterClipY[var0];
            while (true) {
              --var2;
              if (var2 < 0) {
                while (true) {
                  --var1;
                  if (var1 < 0) {
                    return;
                  }
                  this.method2842(this.graphicsPixels, var0, var6, 0, var5 >> 14, var3 >> 14);
                  var5 = var5 + var8 | 0;
                  var3 = var3 + var7 | 0;
                  var0 = var0 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2842(this.graphicsPixels, var0, var6, 0, var4 >> 14, var3 >> 14);
              var4 = var4 + var9 | 0;
              var3 = var3 + var7 | 0;
              var0 = var0 + this.graphicsPixelsWidth | 0;
            }
          } else {
            var1 = var1 - var2 | 0;
            var2 = var2 - var0 | 0;
            var0 = this.rasterClipY[var0];
            while (true) {
              --var2;
              if (var2 < 0) {
                while (true) {
                  --var1;
                  if (var1 < 0) {
                    return;
                  }
                  this.method2842(this.graphicsPixels, var0, var6, 0, var3 >> 14, var5 >> 14);
                  var5 = var5 + var8 | 0;
                  var3 = var3 + var7 | 0;
                  var0 = var0 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2842(this.graphicsPixels, var0, var6, 0, var3 >> 14, var4 >> 14);
              var4 = var4 + var9 | 0;
              var3 = var3 + var7 | 0;
              var0 = var0 + this.graphicsPixelsWidth | 0;
            }
          }
        }
      }
    } else if (var1 <= var2) {
      if (var1 < this.Rasterizer3D_clipHeight) {
        if (var2 > this.Rasterizer3D_clipHeight) {
          var2 = this.Rasterizer3D_clipHeight;
        }
        if (var0 > this.Rasterizer3D_clipHeight) {
          var0 = this.Rasterizer3D_clipHeight;
        }
        if (var2 < var0) {
          var3 = var4 <<= 14;
          if (var1 < 0) {
            var3 = var3 - Math.imul(var7, var1) | 0;
            var4 = var4 - Math.imul(var8, var1) | 0;
            var1 = 0;
          }
          var5 <<= 14;
          if (var2 < 0) {
            var5 = var5 - Math.imul(var9, var2) | 0;
            var2 = 0;
          }
          if ((var2 === var1 || var7 >= var8) && (var2 !== var1 || var7 <= var9)) {
            var0 = var0 - var2 | 0;
            var2 = var2 - var1 | 0;
            var1 = this.rasterClipY[var1];
            while (true) {
              --var2;
              if (var2 < 0) {
                while (true) {
                  --var0;
                  if (var0 < 0) {
                    return;
                  }
                  this.method2842(this.graphicsPixels, var1, var6, 0, var5 >> 14, var3 >> 14);
                  var3 = var3 + var7 | 0;
                  var5 = var5 + var9 | 0;
                  var1 = var1 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2842(this.graphicsPixels, var1, var6, 0, var4 >> 14, var3 >> 14);
              var3 = var3 + var7 | 0;
              var4 = var4 + var8 | 0;
              var1 = var1 + this.graphicsPixelsWidth | 0;
            }
          } else {
            var0 = var0 - var2 | 0;
            var2 = var2 - var1 | 0;
            var1 = this.rasterClipY[var1];
            while (true) {
              --var2;
              if (var2 < 0) {
                while (true) {
                  --var0;
                  if (var0 < 0) {
                    return;
                  }
                  this.method2842(this.graphicsPixels, var1, var6, 0, var3 >> 14, var5 >> 14);
                  var3 = var3 + var7 | 0;
                  var5 = var5 + var9 | 0;
                  var1 = var1 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2842(this.graphicsPixels, var1, var6, 0, var3 >> 14, var4 >> 14);
              var3 = var3 + var7 | 0;
              var4 = var4 + var8 | 0;
              var1 = var1 + this.graphicsPixelsWidth | 0;
            }
          }
        } else {
          var5 = var4 <<= 14;
          if (var1 < 0) {
            var5 = var5 - Math.imul(var7, var1) | 0;
            var4 = var4 - Math.imul(var8, var1) | 0;
            var1 = 0;
          }
          var3 <<= 14;
          if (var0 < 0) {
            var3 = var3 - Math.imul(var0, var9) | 0;
            var0 = 0;
          }
          if (var7 < var8) {
            var2 = var2 - var0 | 0;
            var0 = var0 - var1 | 0;
            var1 = this.rasterClipY[var1];
            while (true) {
              --var0;
              if (var0 < 0) {
                while (true) {
                  --var2;
                  if (var2 < 0) {
                    return;
                  }
                  this.method2842(this.graphicsPixels, var1, var6, 0, var3 >> 14, var4 >> 14);
                  var3 = var3 + var9 | 0;
                  var4 = var4 + var8 | 0;
                  var1 = var1 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2842(this.graphicsPixels, var1, var6, 0, var5 >> 14, var4 >> 14);
              var5 = var5 + var7 | 0;
              var4 = var4 + var8 | 0;
              var1 = var1 + this.graphicsPixelsWidth | 0;
            }
          } else {
            var2 = var2 - var0 | 0;
            var0 = var0 - var1 | 0;
            var1 = this.rasterClipY[var1];
            while (true) {
              --var0;
              if (var0 < 0) {
                while (true) {
                  --var2;
                  if (var2 < 0) {
                    return;
                  }
                  this.method2842(this.graphicsPixels, var1, var6, 0, var4 >> 14, var3 >> 14);
                  var3 = var3 + var9 | 0;
                  var4 = var4 + var8 | 0;
                  var1 = var1 + this.graphicsPixelsWidth | 0;
                }
              }
              this.method2842(this.graphicsPixels, var1, var6, 0, var4 >> 14, var5 >> 14);
              var5 = var5 + var7 | 0;
              var4 = var4 + var8 | 0;
              var1 = var1 + this.graphicsPixelsWidth | 0;
            }
          }
        }
      }
    } else if (var2 < this.Rasterizer3D_clipHeight) {
      if (var0 > this.Rasterizer3D_clipHeight) {
        var0 = this.Rasterizer3D_clipHeight;
      }
      if (var1 > this.Rasterizer3D_clipHeight) {
        var1 = this.Rasterizer3D_clipHeight;
      }
      if (var0 < var1) {
        var4 = var5 <<= 14;
        if (var2 < 0) {
          var4 = var4 - Math.imul(var8, var2) | 0;
          var5 = var5 - Math.imul(var9, var2) | 0;
          var2 = 0;
        }
        var3 <<= 14;
        if (var0 < 0) {
          var3 = var3 - Math.imul(var0, var7) | 0;
          var0 = 0;
        }
        if (var8 < var9) {
          var1 = var1 - var0 | 0;
          var0 = var0 - var2 | 0;
          var2 = this.rasterClipY[var2];
          while (true) {
            --var0;
            if (var0 < 0) {
              while (true) {
                --var1;
                if (var1 < 0) {
                  return;
                }
                this.method2842(this.graphicsPixels, var2, var6, 0, var4 >> 14, var3 >> 14);
                var4 = var4 + var8 | 0;
                var3 = var3 + var7 | 0;
                var2 = var2 + this.graphicsPixelsWidth | 0;
              }
            }
            this.method2842(this.graphicsPixels, var2, var6, 0, var4 >> 14, var5 >> 14);
            var4 = var4 + var8 | 0;
            var5 = var5 + var9 | 0;
            var2 = var2 + this.graphicsPixelsWidth | 0;
          }
        } else {
          var1 = var1 - var0 | 0;
          var0 = var0 - var2 | 0;
          var2 = this.rasterClipY[var2];
          while (true) {
            --var0;
            if (var0 < 0) {
              while (true) {
                --var1;
                if (var1 < 0) {
                  return;
                }
                this.method2842(this.graphicsPixels, var2, var6, 0, var3 >> 14, var4 >> 14);
                var4 = var4 + var8 | 0;
                var3 = var3 + var7 | 0;
                var2 = var2 + this.graphicsPixelsWidth | 0;
              }
            }
            this.method2842(this.graphicsPixels, var2, var6, 0, var5 >> 14, var4 >> 14);
            var4 = var4 + var8 | 0;
            var5 = var5 + var9 | 0;
            var2 = var2 + this.graphicsPixelsWidth | 0;
          }
        }
      } else {
        var3 = var5 <<= 14;
        if (var2 < 0) {
          var3 = var3 - Math.imul(var8, var2) | 0;
          var5 = var5 - Math.imul(var9, var2) | 0;
          var2 = 0;
        }
        var4 <<= 14;
        if (var1 < 0) {
          var4 = var4 - Math.imul(var7, var1) | 0;
          var1 = 0;
        }
        if (var8 < var9) {
          var0 = var0 - var1 | 0;
          var1 = var1 - var2 | 0;
          var2 = this.rasterClipY[var2];
          while (true) {
            --var1;
            if (var1 < 0) {
              while (true) {
                --var0;
                if (var0 < 0) {
                  return;
                }
                this.method2842(this.graphicsPixels, var2, var6, 0, var4 >> 14, var5 >> 14);
                var4 = var4 + var7 | 0;
                var5 = var5 + var9 | 0;
                var2 = var2 + this.graphicsPixelsWidth | 0;
              }
            }
            this.method2842(this.graphicsPixels, var2, var6, 0, var3 >> 14, var5 >> 14);
            var3 = var3 + var8 | 0;
            var5 = var5 + var9 | 0;
            var2 = var2 + this.graphicsPixelsWidth | 0;
          }
        } else {
          var0 = var0 - var1 | 0;
          var1 = var1 - var2 | 0;
          var2 = this.rasterClipY[var2];
          while (true) {
            --var1;
            if (var1 < 0) {
              while (true) {
                --var0;
                if (var0 < 0) {
                  return;
                }
                this.method2842(this.graphicsPixels, var2, var6, 0, var5 >> 14, var4 >> 14);
                var4 = var4 + var7 | 0;
                var5 = var5 + var9 | 0;
                var2 = var2 + this.graphicsPixelsWidth | 0;
              }
            }
            this.method2842(this.graphicsPixels, var2, var6, 0, var5 >> 14, var3 >> 14);
            var3 = var3 + var8 | 0;
            var5 = var5 + var9 | 0;
            var2 = var2 + this.graphicsPixelsWidth | 0;
          }
        }
      }
    }
  }

  method2842(var0: Int32Array, var1: number, var2: number, var3: number, var4: number, var5: number): void {
    if (this.rasterClipEnable) {
      if (var5 > this.rasterClipX) {
        var5 = this.rasterClipX;
      }
      if (var4 < 0) {
        var4 = 0;
      }
    }
    if (var4 < var5) {
      var1 = var1 + var4 | 0;
      var3 = var5 - var4 >> 2;
      if (this.rasterAlpha !== 0) {
        if (this.rasterAlpha === 254) {
          while (true) {
            --var3;
            if (var3 < 0) {
              var3 = var5 - var4 & 3;
              while (true) {
                --var3;
                if (var3 < 0) {
                  return;
                }
                var0[var1++] = var0[var1];
              }
            }
            var0[var1++] = var0[var1];
            var0[var1++] = var0[var1];
            var0[var1++] = var0[var1];
            var0[var1++] = var0[var1];
          }
        } else {
          const var6 = this.rasterAlpha;
          const var7 = 256 - this.rasterAlpha | 0;
          var2 = (Math.imul(var7, var2 & 65280) >> 8 & 65280) + (Math.imul(var7, var2 & 16711935) >> 8 & 16711935) | 0;
          while (true) {
            --var3;
            let var8 = 0;
            if (var3 < 0) {
              var3 = var5 - var4 & 3;
              while (true) {
                --var3;
                if (var3 < 0) {
                  return;
                }
                var8 = var0[var1];
                var0[var1++] = (Math.imul(var8 & 16711935, var6) >> 8 & 16711935) + var2 + (Math.imul(var6, var8 & 65280) >> 8 & 65280);
              }
            }
            var8 = var0[var1];
            var0[var1++] = (Math.imul(var8 & 16711935, var6) >> 8 & 16711935) + var2 + (Math.imul(var6, var8 & 65280) >> 8 & 65280);
            var8 = var0[var1];
            var0[var1++] = (Math.imul(var8 & 16711935, var6) >> 8 & 16711935) + var2 + (Math.imul(var6, var8 & 65280) >> 8 & 65280);
            var8 = var0[var1];
            var0[var1++] = (Math.imul(var8 & 16711935, var6) >> 8 & 16711935) + var2 + (Math.imul(var6, var8 & 65280) >> 8 & 65280);
            var8 = var0[var1];
            var0[var1++] = (Math.imul(var8 & 16711935, var6) >> 8 & 16711935) + var2 + (Math.imul(var6, var8 & 65280) >> 8 & 65280);
          }
        }
      } else {
        while (true) {
          --var3;
          if (var3 < 0) {
            var3 = var5 - var4 & 3;
            while (true) {
              --var3;
              if (var3 < 0) {
                return;
              }
              var0[var1++] = var2;
            }
          }
          var0[var1++] = var2;
          var0[var1++] = var2;
          var0[var1++] = var2;
          var0[var1++] = var2;
        }
      }
    }
  }

  rasterTextureAffine(var0: number, var1: number, var2: number, var3: number, var4: number, var5: number, var6: number, var7: number, var8: number, var9: number, var10: number, var11: number, var12: number, var13: number, var14: number, var15: number, var16: number, var17: number, var18: number): void {
    const var19 = this.textureProvider.load(var18);
    let var20 = 0;
    if (var19 === undefined) {
      var20 = this.textureProvider.getAverageTextureRGB(var18);
      this.rasterGouraud(var0, var1, var2, var3, var4, var5, method2794(var20, var6), method2794(var20, var7), method2794(var20, var8));
    } else {
      this.lowMem = this.textureProvider.vmethod3066(var18);
      this.field1909 = this.textureProvider.vmethod3057(var18);
      var20 = var4 - var3 | 0;
      const var21 = var1 - var0 | 0;
      const var22 = var5 - var3 | 0;
      const var23 = var2 - var0 | 0;
      const var24 = var7 - var6 | 0;
      const var25 = var8 - var6 | 0;
      let var26 = 0;
      if (var0 !== var1) {
        var26 = idiv(var4 - var3 << 14, var1 - var0 | 0);
      }
      let var27 = 0;
      if (var2 !== var1) {
        var27 = idiv(var5 - var4 << 14, var2 - var1 | 0);
      }
      let var28 = 0;
      if (var0 !== var2) {
        var28 = idiv(var3 - var5 << 14, var0 - var2 | 0);
      }
      const var29 = Math.imul(var20, var23) - Math.imul(var22, var21) | 0;
      if (var29 !== 0) {
        const var30 = idiv(Math.imul(var24, var23) - Math.imul(var25, var21) << 9, var29);
        const var31 = idiv(Math.imul(var25, var20) - Math.imul(var24, var22) << 9, var29);
        var10 = var9 - var10 | 0;
        var13 = var12 - var13 | 0;
        var16 = var15 - var16 | 0;
        var11 = var11 - var9 | 0;
        var14 = var14 - var12 | 0;
        var17 = var17 - var15 | 0;
        let var32 = Math.imul(var11, var12) - Math.imul(var9, var14) << 14;
        const var33 = Math.trunc((Math.imul(var15, var14) - Math.imul(var17, var12) | 0) * 8 * 16384 / this.Rasterizer3D_zoom) | 0;
        const var34 = Math.trunc((Math.imul(var17, var9) - Math.imul(var11, var15) | 0) * 16384 / this.Rasterizer3D_zoom) | 0;
        let var35 = Math.imul(var10, var12) - Math.imul(var13, var9) << 14;
        const var36 = Math.trunc((Math.imul(var13, var15) - Math.imul(var16, var12) | 0) * 8 * 16384 / this.Rasterizer3D_zoom) | 0;
        const var37 = Math.trunc((Math.imul(var16, var9) - Math.imul(var10, var15) | 0) * 16384 / this.Rasterizer3D_zoom) | 0;
        let var38 = Math.imul(var13, var11) - Math.imul(var10, var14) << 14;
        const var39 = Math.trunc((Math.imul(var16, var14) - Math.imul(var13, var17) | 0) * 8 * 16384 / this.Rasterizer3D_zoom) | 0;
        const var40 = Math.trunc((Math.imul(var17, var10) - Math.imul(var11, var16) | 0) * 16384 / this.Rasterizer3D_zoom) | 0;
        let var41 = 0;
        if (var0 <= var1 && var0 <= var2) {
          if (var0 < this.Rasterizer3D_clipHeight) {
            if (var1 > this.Rasterizer3D_clipHeight) {
              var1 = this.Rasterizer3D_clipHeight;
            }
            if (var2 > this.Rasterizer3D_clipHeight) {
              var2 = this.Rasterizer3D_clipHeight;
            }
            var6 = var30 + ((var6 << 9) - Math.imul(var3, var30)) | 0;
            if (var1 < var2) {
              var5 = var3 <<= 14;
              if (var0 < 0) {
                var5 = var5 - Math.imul(var0, var28) | 0;
                var3 = var3 - Math.imul(var0, var26) | 0;
                var6 = var6 - Math.imul(var0, var31) | 0;
                var0 = 0;
              }
              var4 <<= 14;
              if (var1 < 0) {
                var4 = var4 - Math.imul(var27, var1) | 0;
                var1 = 0;
              }
              var41 = var0 - this.centerY | 0;
              var32 = var32 + Math.imul(var34, var41) | 0;
              var35 = var35 + Math.imul(var37, var41) | 0;
              var38 = var38 + Math.imul(var40, var41) | 0;
              if ((var0 === var1 || var28 >= var26) && (var0 !== var1 || var28 <= var27)) {
                var2 = var2 - var1 | 0;
                var1 = var1 - var0 | 0;
                var0 = this.rasterClipY[var0];
                while (true) {
                  --var1;
                  if (var1 < 0) {
                    while (true) {
                      --var2;
                      if (var2 < 0) {
                        return;
                      }
                      this.method2791(this.graphicsPixels, var19, 0, 0, var0, var4 >> 14, var5 >> 14, var6, var30, var32, var35, var38, var33, var36, var39);
                      var5 = var5 + var28 | 0;
                      var4 = var4 + var27 | 0;
                      var6 = var6 + var31 | 0;
                      var0 = var0 + this.graphicsPixelsWidth | 0;
                      var32 = var32 + var34 | 0;
                      var35 = var35 + var37 | 0;
                      var38 = var38 + var40 | 0;
                    }
                  }
                  this.method2791(this.graphicsPixels, var19, 0, 0, var0, var3 >> 14, var5 >> 14, var6, var30, var32, var35, var38, var33, var36, var39);
                  var5 = var5 + var28 | 0;
                  var3 = var3 + var26 | 0;
                  var6 = var6 + var31 | 0;
                  var0 = var0 + this.graphicsPixelsWidth | 0;
                  var32 = var32 + var34 | 0;
                  var35 = var35 + var37 | 0;
                  var38 = var38 + var40 | 0;
                }
              } else {
                var2 = var2 - var1 | 0;
                var1 = var1 - var0 | 0;
                var0 = this.rasterClipY[var0];
                while (true) {
                  --var1;
                  if (var1 < 0) {
                    while (true) {
                      --var2;
                      if (var2 < 0) {
                        return;
                      }
                      this.method2791(this.graphicsPixels, var19, 0, 0, var0, var5 >> 14, var4 >> 14, var6, var30, var32, var35, var38, var33, var36, var39);
                      var5 = var5 + var28 | 0;
                      var4 = var4 + var27 | 0;
                      var6 = var6 + var31 | 0;
                      var0 = var0 + this.graphicsPixelsWidth | 0;
                      var32 = var32 + var34 | 0;
                      var35 = var35 + var37 | 0;
                      var38 = var38 + var40 | 0;
                    }
                  }
                  this.method2791(this.graphicsPixels, var19, 0, 0, var0, var5 >> 14, var3 >> 14, var6, var30, var32, var35, var38, var33, var36, var39);
                  var5 = var5 + var28 | 0;
                  var3 = var3 + var26 | 0;
                  var6 = var6 + var31 | 0;
                  var0 = var0 + this.graphicsPixelsWidth | 0;
                  var32 = var32 + var34 | 0;
                  var35 = var35 + var37 | 0;
                  var38 = var38 + var40 | 0;
                }
              }
            } else {
              var4 = var3 <<= 14;
              if (var0 < 0) {
                var4 = var4 - Math.imul(var0, var28) | 0;
                var3 = var3 - Math.imul(var0, var26) | 0;
                var6 = var6 - Math.imul(var0, var31) | 0;
                var0 = 0;
              }
              var5 <<= 14;
              if (var2 < 0) {
                var5 = var5 - Math.imul(var27, var2) | 0;
                var2 = 0;
              }
              var41 = var0 - this.centerY | 0;
              var32 = var32 + Math.imul(var34, var41) | 0;
              var35 = var35 + Math.imul(var37, var41) | 0;
              var38 = var38 + Math.imul(var40, var41) | 0;
              if (var0 !== var2 && var28 < var26 || var0 === var2 && var27 > var26) {
                var1 = var1 - var2 | 0;
                var2 = var2 - var0 | 0;
                var0 = this.rasterClipY[var0];
                while (true) {
                  --var2;
                  if (var2 < 0) {
                    while (true) {
                      --var1;
                      if (var1 < 0) {
                        return;
                      }
                      this.method2791(this.graphicsPixels, var19, 0, 0, var0, var5 >> 14, var3 >> 14, var6, var30, var32, var35, var38, var33, var36, var39);
                      var5 = var5 + var27 | 0;
                      var3 = var3 + var26 | 0;
                      var6 = var6 + var31 | 0;
                      var0 = var0 + this.graphicsPixelsWidth | 0;
                      var32 = var32 + var34 | 0;
                      var35 = var35 + var37 | 0;
                      var38 = var38 + var40 | 0;
                    }
                  }
                  this.method2791(this.graphicsPixels, var19, 0, 0, var0, var4 >> 14, var3 >> 14, var6, var30, var32, var35, var38, var33, var36, var39);
                  var4 = var4 + var28 | 0;
                  var3 = var3 + var26 | 0;
                  var6 = var6 + var31 | 0;
                  var0 = var0 + this.graphicsPixelsWidth | 0;
                  var32 = var32 + var34 | 0;
                  var35 = var35 + var37 | 0;
                  var38 = var38 + var40 | 0;
                }
              } else {
                var1 = var1 - var2 | 0;
                var2 = var2 - var0 | 0;
                var0 = this.rasterClipY[var0];
                while (true) {
                  --var2;
                  if (var2 < 0) {
                    while (true) {
                      --var1;
                      if (var1 < 0) {
                        return;
                      }
                      this.method2791(this.graphicsPixels, var19, 0, 0, var0, var3 >> 14, var5 >> 14, var6, var30, var32, var35, var38, var33, var36, var39);
                      var5 = var5 + var27 | 0;
                      var3 = var3 + var26 | 0;
                      var6 = var6 + var31 | 0;
                      var0 = var0 + this.graphicsPixelsWidth | 0;
                      var32 = var32 + var34 | 0;
                      var35 = var35 + var37 | 0;
                      var38 = var38 + var40 | 0;
                    }
                  }
                  this.method2791(this.graphicsPixels, var19, 0, 0, var0, var3 >> 14, var4 >> 14, var6, var30, var32, var35, var38, var33, var36, var39);
                  var4 = var4 + var28 | 0;
                  var3 = var3 + var26 | 0;
                  var6 = var6 + var31 | 0;
                  var0 = var0 + this.graphicsPixelsWidth | 0;
                  var32 = var32 + var34 | 0;
                  var35 = var35 + var37 | 0;
                  var38 = var38 + var40 | 0;
                }
              }
            }
          }
        } else if (var1 <= var2) {
          if (var1 < this.Rasterizer3D_clipHeight) {
            if (var2 > this.Rasterizer3D_clipHeight) {
              var2 = this.Rasterizer3D_clipHeight;
            }
            if (var0 > this.Rasterizer3D_clipHeight) {
              var0 = this.Rasterizer3D_clipHeight;
            }
            var7 = var30 + ((var7 << 9) - Math.imul(var30, var4)) | 0;
            if (var2 < var0) {
              var3 = var4 <<= 14;
              if (var1 < 0) {
                var3 = var3 - Math.imul(var26, var1) | 0;
                var4 = var4 - Math.imul(var27, var1) | 0;
                var7 = var7 - Math.imul(var31, var1) | 0;
                var1 = 0;
              }
              var5 <<= 14;
              if (var2 < 0) {
                var5 = var5 - Math.imul(var28, var2) | 0;
                var2 = 0;
              }
              var41 = var1 - this.centerY | 0;
              var32 = var32 + Math.imul(var34, var41) | 0;
              var35 = var35 + Math.imul(var37, var41) | 0;
              var38 = var38 + Math.imul(var40, var41) | 0;
              if ((var2 === var1 || var26 >= var27) && (var2 !== var1 || var26 <= var28)) {
                var0 = var0 - var2 | 0;
                var2 = var2 - var1 | 0;
                var1 = this.rasterClipY[var1];
                while (true) {
                  --var2;
                  if (var2 < 0) {
                    while (true) {
                      --var0;
                      if (var0 < 0) {
                        return;
                      }
                      this.method2791(this.graphicsPixels, var19, 0, 0, var1, var5 >> 14, var3 >> 14, var7, var30, var32, var35, var38, var33, var36, var39);
                      var3 = var3 + var26 | 0;
                      var5 = var5 + var28 | 0;
                      var7 = var7 + var31 | 0;
                      var1 = var1 + this.graphicsPixelsWidth | 0;
                      var32 = var32 + var34 | 0;
                      var35 = var35 + var37 | 0;
                      var38 = var38 + var40 | 0;
                    }
                  }
                  this.method2791(this.graphicsPixels, var19, 0, 0, var1, var4 >> 14, var3 >> 14, var7, var30, var32, var35, var38, var33, var36, var39);
                  var3 = var3 + var26 | 0;
                  var4 = var4 + var27 | 0;
                  var7 = var7 + var31 | 0;
                  var1 = var1 + this.graphicsPixelsWidth | 0;
                  var32 = var32 + var34 | 0;
                  var35 = var35 + var37 | 0;
                  var38 = var38 + var40 | 0;
                }
              } else {
                var0 = var0 - var2 | 0;
                var2 = var2 - var1 | 0;
                var1 = this.rasterClipY[var1];
                while (true) {
                  --var2;
                  if (var2 < 0) {
                    while (true) {
                      --var0;
                      if (var0 < 0) {
                        return;
                      }
                      this.method2791(this.graphicsPixels, var19, 0, 0, var1, var3 >> 14, var5 >> 14, var7, var30, var32, var35, var38, var33, var36, var39);
                      var3 = var3 + var26 | 0;
                      var5 = var5 + var28 | 0;
                      var7 = var7 + var31 | 0;
                      var1 = var1 + this.graphicsPixelsWidth | 0;
                      var32 = var32 + var34 | 0;
                      var35 = var35 + var37 | 0;
                      var38 = var38 + var40 | 0;
                    }
                  }
                  this.method2791(this.graphicsPixels, var19, 0, 0, var1, var3 >> 14, var4 >> 14, var7, var30, var32, var35, var38, var33, var36, var39);
                  var3 = var3 + var26 | 0;
                  var4 = var4 + var27 | 0;
                  var7 = var7 + var31 | 0;
                  var1 = var1 + this.graphicsPixelsWidth | 0;
                  var32 = var32 + var34 | 0;
                  var35 = var35 + var37 | 0;
                  var38 = var38 + var40 | 0;
                }
              }
            } else {
              var5 = var4 <<= 14;
              if (var1 < 0) {
                var5 = var5 - Math.imul(var26, var1) | 0;
                var4 = var4 - Math.imul(var27, var1) | 0;
                var7 = var7 - Math.imul(var31, var1) | 0;
                var1 = 0;
              }
              var3 <<= 14;
              if (var0 < 0) {
                var3 = var3 - Math.imul(var0, var28) | 0;
                var0 = 0;
              }
              var41 = var1 - this.centerY | 0;
              var32 = var32 + Math.imul(var34, var41) | 0;
              var35 = var35 + Math.imul(var37, var41) | 0;
              var38 = var38 + Math.imul(var40, var41) | 0;
              if (var26 < var27) {
                var2 = var2 - var0 | 0;
                var0 = var0 - var1 | 0;
                var1 = this.rasterClipY[var1];
                while (true) {
                  --var0;
                  if (var0 < 0) {
                    while (true) {
                      --var2;
                      if (var2 < 0) {
                        return;
                      }
                      this.method2791(this.graphicsPixels, var19, 0, 0, var1, var3 >> 14, var4 >> 14, var7, var30, var32, var35, var38, var33, var36, var39);
                      var3 = var3 + var28 | 0;
                      var4 = var4 + var27 | 0;
                      var7 = var7 + var31 | 0;
                      var1 = var1 + this.graphicsPixelsWidth | 0;
                      var32 = var32 + var34 | 0;
                      var35 = var35 + var37 | 0;
                      var38 = var38 + var40 | 0;
                    }
                  }
                  this.method2791(this.graphicsPixels, var19, 0, 0, var1, var5 >> 14, var4 >> 14, var7, var30, var32, var35, var38, var33, var36, var39);
                  var5 = var5 + var26 | 0;
                  var4 = var4 + var27 | 0;
                  var7 = var7 + var31 | 0;
                  var1 = var1 + this.graphicsPixelsWidth | 0;
                  var32 = var32 + var34 | 0;
                  var35 = var35 + var37 | 0;
                  var38 = var38 + var40 | 0;
                }
              } else {
                var2 = var2 - var0 | 0;
                var0 = var0 - var1 | 0;
                var1 = this.rasterClipY[var1];
                while (true) {
                  --var0;
                  if (var0 < 0) {
                    while (true) {
                      --var2;
                      if (var2 < 0) {
                        return;
                      }
                      this.method2791(this.graphicsPixels, var19, 0, 0, var1, var4 >> 14, var3 >> 14, var7, var30, var32, var35, var38, var33, var36, var39);
                      var3 = var3 + var28 | 0;
                      var4 = var4 + var27 | 0;
                      var7 = var7 + var31 | 0;
                      var1 = var1 + this.graphicsPixelsWidth | 0;
                      var32 = var32 + var34 | 0;
                      var35 = var35 + var37 | 0;
                      var38 = var38 + var40 | 0;
                    }
                  }
                  this.method2791(this.graphicsPixels, var19, 0, 0, var1, var4 >> 14, var5 >> 14, var7, var30, var32, var35, var38, var33, var36, var39);
                  var5 = var5 + var26 | 0;
                  var4 = var4 + var27 | 0;
                  var7 = var7 + var31 | 0;
                  var1 = var1 + this.graphicsPixelsWidth | 0;
                  var32 = var32 + var34 | 0;
                  var35 = var35 + var37 | 0;
                  var38 = var38 + var40 | 0;
                }
              }
            }
          }
        } else if (var2 < this.Rasterizer3D_clipHeight) {
          if (var0 > this.Rasterizer3D_clipHeight) {
            var0 = this.Rasterizer3D_clipHeight;
          }
          if (var1 > this.Rasterizer3D_clipHeight) {
            var1 = this.Rasterizer3D_clipHeight;
          }
          var8 = (var8 << 9) - Math.imul(var5, var30) + var30 | 0;
          if (var0 < var1) {
            var4 = var5 <<= 14;
            if (var2 < 0) {
              var4 = var4 - Math.imul(var27, var2) | 0;
              var5 = var5 - Math.imul(var28, var2) | 0;
              var8 = var8 - Math.imul(var31, var2) | 0;
              var2 = 0;
            }
            var3 <<= 14;
            if (var0 < 0) {
              var3 = var3 - Math.imul(var0, var26) | 0;
              var0 = 0;
            }
            var41 = var2 - this.centerY | 0;
            var32 = var32 + Math.imul(var34, var41) | 0;
            var35 = var35 + Math.imul(var37, var41) | 0;
            var38 = var38 + Math.imul(var40, var41) | 0;
            if (var27 < var28) {
              var1 = var1 - var0 | 0;
              var0 = var0 - var2 | 0;
              var2 = this.rasterClipY[var2];
              while (true) {
                --var0;
                if (var0 < 0) {
                  while (true) {
                    --var1;
                    if (var1 < 0) {
                      return;
                    }
                    this.method2791(this.graphicsPixels, var19, 0, 0, var2, var4 >> 14, var3 >> 14, var8, var30, var32, var35, var38, var33, var36, var39);
                    var4 = var4 + var27 | 0;
                    var3 = var3 + var26 | 0;
                    var8 = var8 + var31 | 0;
                    var2 = var2 + this.graphicsPixelsWidth | 0;
                    var32 = var32 + var34 | 0;
                    var35 = var35 + var37 | 0;
                    var38 = var38 + var40 | 0;
                  }
                }
                this.method2791(this.graphicsPixels, var19, 0, 0, var2, var4 >> 14, var5 >> 14, var8, var30, var32, var35, var38, var33, var36, var39);
                var4 = var4 + var27 | 0;
                var5 = var5 + var28 | 0;
                var8 = var8 + var31 | 0;
                var2 = var2 + this.graphicsPixelsWidth | 0;
                var32 = var32 + var34 | 0;
                var35 = var35 + var37 | 0;
                var38 = var38 + var40 | 0;
              }
            } else {
              var1 = var1 - var0 | 0;
              var0 = var0 - var2 | 0;
              var2 = this.rasterClipY[var2];
              while (true) {
                --var0;
                if (var0 < 0) {
                  while (true) {
                    --var1;
                    if (var1 < 0) {
                      return;
                    }
                    this.method2791(this.graphicsPixels, var19, 0, 0, var2, var3 >> 14, var4 >> 14, var8, var30, var32, var35, var38, var33, var36, var39);
                    var4 = var4 + var27 | 0;
                    var3 = var3 + var26 | 0;
                    var8 = var8 + var31 | 0;
                    var2 = var2 + this.graphicsPixelsWidth | 0;
                    var32 = var32 + var34 | 0;
                    var35 = var35 + var37 | 0;
                    var38 = var38 + var40 | 0;
                  }
                }
                this.method2791(this.graphicsPixels, var19, 0, 0, var2, var5 >> 14, var4 >> 14, var8, var30, var32, var35, var38, var33, var36, var39);
                var4 = var4 + var27 | 0;
                var5 = var5 + var28 | 0;
                var8 = var8 + var31 | 0;
                var2 = var2 + this.graphicsPixelsWidth | 0;
                var32 = var32 + var34 | 0;
                var35 = var35 + var37 | 0;
                var38 = var38 + var40 | 0;
              }
            }
          } else {
            var3 = var5 <<= 14;
            if (var2 < 0) {
              var3 = var3 - Math.imul(var27, var2) | 0;
              var5 = var5 - Math.imul(var28, var2) | 0;
              var8 = var8 - Math.imul(var31, var2) | 0;
              var2 = 0;
            }
            var4 <<= 14;
            if (var1 < 0) {
              var4 = var4 - Math.imul(var26, var1) | 0;
              var1 = 0;
            }
            var41 = var2 - this.centerY | 0;
            var32 = var32 + Math.imul(var34, var41) | 0;
            var35 = var35 + Math.imul(var37, var41) | 0;
            var38 = var38 + Math.imul(var40, var41) | 0;
            if (var27 < var28) {
              var0 = var0 - var1 | 0;
              var1 = var1 - var2 | 0;
              var2 = this.rasterClipY[var2];
              while (true) {
                --var1;
                if (var1 < 0) {
                  while (true) {
                    --var0;
                    if (var0 < 0) {
                      return;
                    }
                    this.method2791(this.graphicsPixels, var19, 0, 0, var2, var4 >> 14, var5 >> 14, var8, var30, var32, var35, var38, var33, var36, var39);
                    var4 = var4 + var26 | 0;
                    var5 = var5 + var28 | 0;
                    var8 = var8 + var31 | 0;
                    var2 = var2 + this.graphicsPixelsWidth | 0;
                    var32 = var32 + var34 | 0;
                    var35 = var35 + var37 | 0;
                    var38 = var38 + var40 | 0;
                  }
                }
                this.method2791(this.graphicsPixels, var19, 0, 0, var2, var3 >> 14, var5 >> 14, var8, var30, var32, var35, var38, var33, var36, var39);
                var3 = var3 + var27 | 0;
                var5 = var5 + var28 | 0;
                var8 = var8 + var31 | 0;
                var2 = var2 + this.graphicsPixelsWidth | 0;
                var32 = var32 + var34 | 0;
                var35 = var35 + var37 | 0;
                var38 = var38 + var40 | 0;
              }
            } else {
              var0 = var0 - var1 | 0;
              var1 = var1 - var2 | 0;
              var2 = this.rasterClipY[var2];
              while (true) {
                --var1;
                if (var1 < 0) {
                  while (true) {
                    --var0;
                    if (var0 < 0) {
                      return;
                    }
                    this.method2791(this.graphicsPixels, var19, 0, 0, var2, var5 >> 14, var4 >> 14, var8, var30, var32, var35, var38, var33, var36, var39);
                    var4 = var4 + var26 | 0;
                    var5 = var5 + var28 | 0;
                    var8 = var8 + var31 | 0;
                    var2 = var2 + this.graphicsPixelsWidth | 0;
                    var32 = var32 + var34 | 0;
                    var35 = var35 + var37 | 0;
                    var38 = var38 + var40 | 0;
                  }
                }
                this.method2791(this.graphicsPixels, var19, 0, 0, var2, var5 >> 14, var3 >> 14, var8, var30, var32, var35, var38, var33, var36, var39);
                var3 = var3 + var27 | 0;
                var5 = var5 + var28 | 0;
                var8 = var8 + var31 | 0;
                var2 = var2 + this.graphicsPixelsWidth | 0;
                var32 = var32 + var34 | 0;
                var35 = var35 + var37 | 0;
                var38 = var38 + var40 | 0;
              }
            }
          }
        }
      }
    }
  }

  method2791(var0: Int32Array, var1: Int32Array, var2: number, var3: number, var4: number, var5: number, var6: number, var7: number, var8: number, var9: number, var10: number, var11: number, var12: number, var13: number, var14: number): void {
    if (this.rasterClipEnable) {
      if (var6 > this.rasterClipX) {
        var6 = this.rasterClipX;
      }
      if (var5 < 0) {
        var5 = 0;
      }
    }
    if (var5 < var6) {
      var4 = var4 + var5 | 0;
      var7 = var7 + Math.imul(var5, var8) | 0;
      let var17 = var6 - var5 | 0;
      let var15 = 0;
      let var16 = 0;
      let var18 = 0;
      let var19 = 0;
      let var20 = 0;
      let var21 = 0;
      let var22 = 0;
      let var23 = 0;
      if (this.lowMem) {
        var23 = var5 - this.centerX | 0;
        var9 = var9 + Math.imul(var23, var12 >> 3) | 0;
        var10 = var10 + Math.imul(var13 >> 3, var23) | 0;
        var11 = var11 + Math.imul(var23, var14 >> 3) | 0;
        var22 = var11 >> 12;
        if (var22 !== 0) {
          var18 = idiv(var9, var22);
          var19 = idiv(var10, var22);
          if (var18 < 0) {
            var18 = 0;
          } else if (var18 > 4032) {
            var18 = 4032;
          }
        } else {
          var18 = 0;
          var19 = 0;
        }
        var9 = var9 + var12 | 0;
        var10 = var10 + var13 | 0;
        var11 = var11 + var14 | 0;
        var22 = var11 >> 12;
        if (var22 !== 0) {
          var20 = idiv(var9, var22);
          var21 = idiv(var10, var22);
          if (var20 < 0) {
            var20 = 0;
          } else if (var20 > 4032) {
            var20 = 4032;
          }
        } else {
          var20 = 0;
          var21 = 0;
        }
        var2 = (var18 << 20) + var19 | 0;
        var16 = (var21 - var19 >> 3) + (var20 - var18 >> 3 << 20) | 0;
        var17 >>= 3;
        var8 <<= 3;
        var15 = var7 >> 8;
        if (this.field1909) {
          if (var17 > 0) {
            do {
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var18 = var20;
              var19 = var21;
              var9 = var9 + var12 | 0;
              var10 = var10 + var13 | 0;
              var11 = var11 + var14 | 0;
              var22 = var11 >> 12;
              if (var22 !== 0) {
                var20 = idiv(var9, var22);
                var21 = idiv(var10, var22);
                if (var20 < 0) {
                  var20 = 0;
                } else if (var20 > 4032) {
                  var20 = 4032;
                }
              } else {
                var20 = 0;
                var21 = 0;
              }
              var2 = (var18 << 20) + var19 | 0;
              var16 = (var21 - var19 >> 3) + (var20 - var18 >> 3 << 20) | 0;
              var7 = var7 + var8 | 0;
              var15 = var7 >> 8;
              --var17;
            } while (var17 > 0);
          }
          var17 = var6 - var5 & 7;
          if (var17 > 0) {
            do {
              var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              --var17;
            } while (var17 > 0);
          }
        } else {
          if (var17 > 0) {
            do {
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var18 = var20;
              var19 = var21;
              var9 = var9 + var12 | 0;
              var10 = var10 + var13 | 0;
              var11 = var11 + var14 | 0;
              var22 = var11 >> 12;
              if (var22 !== 0) {
                var20 = idiv(var9, var22);
                var21 = idiv(var10, var22);
                if (var20 < 0) {
                  var20 = 0;
                } else if (var20 > 4032) {
                  var20 = 4032;
                }
              } else {
                var20 = 0;
                var21 = 0;
              }
              var2 = (var18 << 20) + var19 | 0;
              var16 = (var21 - var19 >> 3) + (var20 - var18 >> 3 << 20) | 0;
              var7 = var7 + var8 | 0;
              var15 = var7 >> 8;
              --var17;
            } while (var17 > 0);
          }
          var17 = var6 - var5 & 7;
          if (var17 > 0) {
            do {
              if ((var3 = var1[(var2 >>> 26) + (var2 & 4032) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              --var17;
            } while (var17 > 0);
          }
        }
      } else {
        var23 = var5 - this.centerX | 0;
        var9 = var9 + Math.imul(var23, var12 >> 3) | 0;
        var10 = var10 + Math.imul(var13 >> 3, var23) | 0;
        var11 = var11 + Math.imul(var23, var14 >> 3) | 0;
        var22 = var11 >> 14;
        if (var22 !== 0) {
          var18 = idiv(var9, var22);
          var19 = idiv(var10, var22);
          if (var18 < 0) {
            var18 = 0;
          } else if (var18 > 16256) {
            var18 = 16256;
          }
        } else {
          var18 = 0;
          var19 = 0;
        }
        var9 = var9 + var12 | 0;
        var10 = var10 + var13 | 0;
        var11 = var11 + var14 | 0;
        var22 = var11 >> 14;
        if (var22 !== 0) {
          var20 = idiv(var9, var22);
          var21 = idiv(var10, var22);
          if (var20 < 0) {
            var20 = 0;
          } else if (var20 > 16256) {
            var20 = 16256;
          }
        } else {
          var20 = 0;
          var21 = 0;
        }
        var2 = (var18 << 18) + var19 | 0;
        var16 = (var21 - var19 >> 3) + (var20 - var18 >> 3 << 18) | 0;
        var17 >>= 3;
        var8 <<= 3;
        var15 = var7 >> 8;
        if (this.field1909) {
          if (var17 > 0) {
            do {
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var18 = var20;
              var19 = var21;
              var9 = var9 + var12 | 0;
              var10 = var10 + var13 | 0;
              var11 = var11 + var14 | 0;
              var22 = var11 >> 14;
              if (var22 !== 0) {
                var20 = idiv(var9, var22);
                var21 = idiv(var10, var22);
                if (var20 < 0) {
                  var20 = 0;
                } else if (var20 > 16256) {
                  var20 = 16256;
                }
              } else {
                var20 = 0;
                var21 = 0;
              }
              var2 = (var18 << 18) + var19 | 0;
              var16 = (var21 - var19 >> 3) + (var20 - var18 >> 3 << 18) | 0;
              var7 = var7 + var8 | 0;
              var15 = var7 >> 8;
              --var17;
            } while (var17 > 0);
          }
          var17 = var6 - var5 & 7;
          if (var17 > 0) {
            do {
              var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0];
              var0[var4++] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              var2 = var2 + var16 | 0;
              --var17;
            } while (var17 > 0);
          }
        } else {
          if (var17 > 0) {
            do {
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var18 = var20;
              var19 = var21;
              var9 = var9 + var12 | 0;
              var10 = var10 + var13 | 0;
              var11 = var11 + var14 | 0;
              var22 = var11 >> 14;
              if (var22 !== 0) {
                var20 = idiv(var9, var22);
                var21 = idiv(var10, var22);
                if (var20 < 0) {
                  var20 = 0;
                } else if (var20 > 16256) {
                  var20 = 16256;
                }
              } else {
                var20 = 0;
                var21 = 0;
              }
              var2 = (var18 << 18) + var19 | 0;
              var16 = (var21 - var19 >> 3) + (var20 - var18 >> 3 << 18) | 0;
              var7 = var7 + var8 | 0;
              var15 = var7 >> 8;
              --var17;
            } while (var17 > 0);
          }
          var17 = var6 - var5 & 7;
          if (var17 > 0) {
            do {
              if ((var3 = var1[(var2 & 16256) + (var2 >>> 25) | 0]) !== 0) {
                var0[var4] = (Math.imul(var15, var3 & 65280) & 16711680) + (Math.imul(var3 & 16711935, var15) & -16711936) >> 8;
              }
              ++var4;
              var2 = var2 + var16 | 0;
              --var17;
            } while (var17 > 0);
          }
        }
      }
    }
  }
}

export function method2794(var0: number, var1: number): number {
  var1 = Math.imul(var0 & 127, var1) >> 7;
  if (var1 < 2) {
    var1 = 2;
  } else if (var1 > 126) {
    var1 = 126;
  }
  return (var0 & 65408) + var1 | 0;
}
