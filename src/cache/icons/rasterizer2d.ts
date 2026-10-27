// Ported from RuneLite's cache library (net.runelite.cache.item.Rasterizer2D, BSD-2-Clause, see LICENSE in
// src/cache/store). The 2D raster the item renderer draws into; names match the Java.

export class Rasterizer2D {
  graphicsPixels: Int32Array = new Int32Array(0);
  graphicsPixelsWidth = 0;
  graphicsPixelsHeight = 0;
  drawingAreaTop = 0;
  drawingAreaBottom = 0;
  draw_region_x = 0;
  drawingAreaRight = 0;

  setRasterBuffer(var0: Int32Array, var1: number, var2: number): void {
    this.graphicsPixels = var0;
    this.graphicsPixelsWidth = var1;
    this.graphicsPixelsHeight = var2;
    this.setDrawRegion(0, 0, var1, var2);
  }

  setDrawRegion(var0: number, var1: number, var2: number, var3: number): void {
    if (var0 < 0) {
      var0 = 0;
    }
    if (var1 < 0) {
      var1 = 0;
    }
    if (var2 > this.graphicsPixelsWidth) {
      var2 = this.graphicsPixelsWidth;
    }
    if (var3 > this.graphicsPixelsHeight) {
      var3 = this.graphicsPixelsHeight;
    }
    this.draw_region_x = var0;
    this.drawingAreaTop = var1;
    this.drawingAreaRight = var2;
    this.drawingAreaBottom = var3;
  }

  reset(): void {
    let var0 = 0;
    let var1 = 0;
    for (var1 = Math.imul(this.graphicsPixelsWidth, this.graphicsPixelsHeight) - 7 | 0; var0 < var1; this.graphicsPixels[var0++] = 0) {
      this.graphicsPixels[var0++] = 0;
      this.graphicsPixels[var0++] = 0;
      this.graphicsPixels[var0++] = 0;
      this.graphicsPixels[var0++] = 0;
      this.graphicsPixels[var0++] = 0;
      this.graphicsPixels[var0++] = 0;
      this.graphicsPixels[var0++] = 0;
    }
    for (var1 = var1 + 7 | 0; var0 < var1; this.graphicsPixels[var0++] = 0) {
    }
  }
}
