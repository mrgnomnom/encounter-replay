// Ported from RuneLite's cache library (net.runelite.cache.item.Model and Renderable, BSD-2-Clause, see
// LICENSE in src/cache/store). A lit model: projects its vertices, sorts its faces by depth and priority,
// and hands each to Graphics3D. Translated line for line with Java int semantics.
import { COSINE, SINE, type Graphics3D } from "./graphics3d";
import { d2i, idiv } from "./intMath";

/**
 * Faces bucketed by depth. Java gives every Model its own 6000 x 512 table; draws never overlap and only
 * read back what the same draw wrote, so one shared table, its rows made as they're first needed, does the
 * same without 12MB per icon
 */
const facesByDistance: Int32Array[] = [];

/** Java's bounds checks, where an icon can trip them: the whole icon fails rather than drawing garbage */
function outOfBounds(what: string, index: number): never {
  throw new RangeError(`Model ${what} index ${index} out of bounds`);
}

/** An index into SINE/COSINE */
function angle(index: number): void {
  if (index < 0 || index >= 2048) outOfBounds("angle", index);
}

/** Renderable: the base class only gives the height */
export abstract class Renderable {
  modelHeight = 1000;
}

export class Model extends Renderable {
  faceClipped = new Array<boolean>(6500).fill(false);
  modelViewportYs = new Int32Array(6500);
  modelViewportXs = new Int32Array(6500);
  modelViewportZs = new Int32Array(6500);
  modelLocalX = new Int32Array(6500);
  modelLocalY = new Int32Array(6500);
  modelLocalZ = new Int32Array(6500);
  distanceFaceCount = new Int32Array(6000);
  numOfPriority = new Int32Array(12);
  orderedFaces = Array.from({ length: 12 }, () => new Int32Array(2000));
  eq10 = new Int32Array(2000);
  eq11 = new Int32Array(2000);
  lt10 = new Int32Array(12);
  verticesCount = 0;
  verticesX: Int32Array = new Int32Array(0);
  verticesY: Int32Array = new Int32Array(0);
  verticesZ: Int32Array = new Int32Array(0);
  indicesCount = 0;
  indices1: Int32Array = new Int32Array(0);
  indices2: Int32Array = new Int32Array(0);
  indices3: Int32Array = new Int32Array(0);
  faceColors1: Int32Array = new Int32Array(0);
  faceColors2: Int32Array = new Int32Array(0);
  faceColors3: Int32Array = new Int32Array(0);
  facePriorities: Int8Array | undefined;
  faceTransparencies: Int8Array | undefined;
  textureCoords: Int8Array | undefined;
  faceTextures: Int16Array | undefined;
  numTextureFaces = 0;
  texIndices1: Int32Array = new Int32Array(0);
  texIndices2: Int32Array = new Int32Array(0);
  texIndices3: Int32Array = new Int32Array(0);
  boundsType = 0;
  bottomY = 0;
  XYZMag = 0;
  diameter = 0;
  radius = 0;
  extremeX = -1;
  extremeY = -1;
  extremeZ = -1;

  calculateBoundsCylinder(): void {
    if (this.boundsType !== 1) {
      this.boundsType = 1;
      this.modelHeight = 0;
      this.bottomY = 0;
      this.XYZMag = 0;
      for (let var1 = 0; var1 < this.verticesCount; ++var1) {
        const var2 = this.verticesX[var1];
        const var3 = this.verticesY[var1];
        const var4 = this.verticesZ[var1];
        if ((-var3 | 0) > this.modelHeight) {
          this.modelHeight = -var3 | 0;
        }
        if (var3 > this.bottomY) {
          this.bottomY = var3;
        }
        const var5 = Math.imul(var2, var2) + Math.imul(var4, var4) | 0;
        if (var5 > this.XYZMag) {
          this.XYZMag = var5;
        }
      }
      this.XYZMag = d2i(Math.sqrt(this.XYZMag) + 0.99);
      this.radius = d2i(Math.sqrt(Math.imul(this.XYZMag, this.XYZMag) + Math.imul(this.modelHeight, this.modelHeight) | 0) + 0.99);
      this.diameter = this.radius + d2i(Math.sqrt(Math.imul(this.XYZMag, this.XYZMag) + Math.imul(this.bottomY, this.bottomY) | 0) + 0.99) | 0;
    }
  }

  projectAndDraw(graphics: Graphics3D, yzRotation: number, xzRotation: number, xyRotation: number, orientation: number, xOffset: number, yOffset: number, zOffset: number): void {
    this.distanceFaceCount[0] = -1;
    if (this.boundsType !== 2 && this.boundsType !== 1) {
      this.boundsType = 2;
      this.XYZMag = 0;
      for (let var1 = 0; var1 < this.verticesCount; ++var1) {
        let x = this.verticesX[var1];
        let y = this.verticesY[var1];
        let z = this.verticesZ[var1];
        const magnitude_squared = Math.imul(x, x) + Math.imul(z, z) + Math.imul(y, y) | 0;
        if (magnitude_squared > this.XYZMag) {
          this.XYZMag = magnitude_squared;
        }
      }
      this.XYZMag = d2i(Math.sqrt(this.XYZMag) + 0.99);
      this.radius = this.XYZMag;
      this.diameter = this.XYZMag + this.XYZMag | 0;
    }
    angle(orientation);
    const sinX = SINE[orientation];
    const cosX = COSINE[orientation];
    const zRelatedVariable = Math.imul(sinX, yOffset) + Math.imul(cosX, zOffset) >> 16;
    if (this.verticesCount > 6500) outOfBounds("vertex", 6500);
    if (this.verticesCount > 0) {
      if (xyRotation !== 0) angle(xyRotation);
      if (yzRotation !== 0) angle(yzRotation);
      if (xzRotation !== 0) angle(xzRotation);
    }
    for (let i = 0; i < this.verticesCount; ++i) {
      let x = this.verticesX[i];
      let y = this.verticesY[i];
      let z = this.verticesZ[i];
      if (xyRotation !== 0) {
        const sinZ = SINE[xyRotation];
        const cosZ = COSINE[xyRotation];
        let tmp = 0;
        tmp = Math.imul(y, sinZ) + Math.imul(x, cosZ) >> 16;
        y = Math.imul(y, cosZ) - Math.imul(x, sinZ) >> 16;
        x = tmp;
      }
      if (yzRotation !== 0) {
        const sinR1 = SINE[yzRotation];
        const cosR1 = COSINE[yzRotation];
        let tmp = 0;
        tmp = Math.imul(y, cosR1) - Math.imul(z, sinR1) >> 16;
        z = Math.imul(y, sinR1) + Math.imul(z, cosR1) >> 16;
        y = tmp;
      }
      if (xzRotation !== 0) {
        const sinY = SINE[xzRotation];
        const cosY = COSINE[xzRotation];
        let tmp = 0;
        tmp = Math.imul(z, sinY) + Math.imul(x, cosY) >> 16;
        z = Math.imul(z, cosY) - Math.imul(x, sinY) >> 16;
        x = tmp;
      }
      x = x + xOffset | 0;
      y = y + yOffset | 0;
      z = z + zOffset | 0;
      let tmp = Math.imul(y, cosX) - Math.imul(z, sinX) >> 16;
      z = Math.imul(y, sinX) + Math.imul(z, cosX) >> 16;
      this.modelViewportZs[i] = z - zRelatedVariable;
      this.modelViewportYs[i] = idiv(Math.imul(x, graphics.Rasterizer3D_zoom), z) + graphics.centerX;
      this.modelViewportXs[i] = idiv(Math.imul(tmp, graphics.Rasterizer3D_zoom), z) + graphics.centerY;
      if (this.faceTextures !== undefined) {
        this.modelLocalX[i] = x;
        this.modelLocalY[i] = tmp;
        this.modelLocalZ[i] = z;
      }
    }
    this.draw(graphics);
  }

  draw(graphics: Graphics3D): void {
    if (this.diameter < 6000) {
      for (let var5 = 0; var5 < this.diameter; ++var5) {
        this.distanceFaceCount[var5] = 0;
      }
      let var7 = 0;
      let var9 = 0;
      let var10 = 0;
      let var11 = 0;
      let var12 = 0;
      let var13 = 0;
      let var14 = 0;
      let var15 = 0;
      let var17 = 0;
      let var27 = 0;
      let var26 = 0;
      for (var26 = 0; var26 < this.indicesCount; ++var26) {
        if (this.faceColors3[var26] !== -2) {
          var7 = this.indices1[var26];
          var27 = this.indices2[var26];
          var9 = this.indices3[var26];
          var10 = this.modelViewportYs[var7];
          var11 = this.modelViewportYs[var27];
          var12 = this.modelViewportYs[var9];
          if ((Math.imul(var10 - var11, this.modelViewportXs[var9] - this.modelViewportXs[var27]) - Math.imul(var12 - var11, this.modelViewportXs[var7] - this.modelViewportXs[var27]) | 0) > 0) {
            if (var10 >= 0 && var11 >= 0 && var12 >= 0 && var10 <= graphics.rasterClipX && var11 <= graphics.rasterClipX && var12 <= graphics.rasterClipX) {
              if (var26 >= 6500) outOfBounds("face", var26);
              this.faceClipped[var26] = false;
            } else {
              if (var26 >= 6500) outOfBounds("face", var26);
              this.faceClipped[var26] = true;
            }
            var13 = idiv(this.modelViewportZs[var7] + this.modelViewportZs[var27] + this.modelViewportZs[var9] | 0, 3) + this.radius | 0;
            if (var13 < 0 || var13 >= 6000) outOfBounds("depth", var13);
            const row = facesByDistance[var13] ??= new Int32Array(512);
            const count = this.distanceFaceCount[var13]++;
            if (count >= 512) outOfBounds("depth bucket", count);
            row[count] = var26;
          }
        }
      }
      let var8: Int32Array;
      if (this.facePriorities === undefined) {
        for (var26 = this.diameter - 1 | 0; var26 >= 0; --var26) {
          var7 = this.distanceFaceCount[var26];
          if (var7 > 0) {
            var8 = facesByDistance[var26];
            for (var9 = 0; var9 < var7; ++var9) {
              this.rasterFace(graphics, var8[var9]);
            }
          }
        }
      } else {
        for (var26 = 0; var26 < 12; ++var26) {
          this.numOfPriority[var26] = 0;
          this.lt10[var26] = 0;
        }
        for (var26 = this.diameter - 1 | 0; var26 >= 0; --var26) {
          var7 = this.distanceFaceCount[var26];
          if (var7 > 0) {
            var8 = facesByDistance[var26];
            for (var9 = 0; var9 < var7; ++var9) {
              var10 = var8[var9];
              const var31 = this.facePriorities[var10];
              if (var31 < 0 || var31 >= 12) outOfBounds("priority", var31);
              var12 = this.numOfPriority[var31]++;
              if (var12 >= 2000) outOfBounds("priority bucket", var12);
              this.orderedFaces[var31][var12] = var10;
              if (var31 < 10) {
                this.lt10[var31] += var26;
              } else if (var31 === 10) {
                this.eq10[var12] = var26;
              } else {
                this.eq11[var12] = var26;
              }
            }
          }
        }
        var26 = 0;
        if (this.numOfPriority[1] > 0 || this.numOfPriority[2] > 0) {
          var26 = idiv(this.lt10[1] + this.lt10[2] | 0, this.numOfPriority[1] + this.numOfPriority[2] | 0);
        }
        var7 = 0;
        if (this.numOfPriority[3] > 0 || this.numOfPriority[4] > 0) {
          var7 = idiv(this.lt10[3] + this.lt10[4] | 0, this.numOfPriority[3] + this.numOfPriority[4] | 0);
        }
        var27 = 0;
        if (this.numOfPriority[6] > 0 || this.numOfPriority[8] > 0) {
          var27 = idiv(this.lt10[8] + this.lt10[6] | 0, this.numOfPriority[8] + this.numOfPriority[6] | 0);
        }
        var10 = 0;
        var11 = this.numOfPriority[10];
        let var28 = this.orderedFaces[10];
        let var29 = this.eq10;
        if (var10 === var11) {
          var10 = 0;
          var11 = this.numOfPriority[11];
          var28 = this.orderedFaces[11];
          var29 = this.eq11;
        }
        if (var10 < var11) {
          var9 = var29[var10];
        } else {
          var9 = -1000;
        }
        for (var14 = 0; var14 < 10; ++var14) {
          while (var14 === 0 && var9 > var26) {
            this.rasterFace(graphics, var28[var10++]);
            if (var10 === var11 && var28 !== this.orderedFaces[11]) {
              var10 = 0;
              var11 = this.numOfPriority[11];
              var28 = this.orderedFaces[11];
              var29 = this.eq11;
            }
            if (var10 < var11) {
              var9 = var29[var10];
            } else {
              var9 = -1000;
            }
          }
          while (var14 === 3 && var9 > var7) {
            this.rasterFace(graphics, var28[var10++]);
            if (var10 === var11 && var28 !== this.orderedFaces[11]) {
              var10 = 0;
              var11 = this.numOfPriority[11];
              var28 = this.orderedFaces[11];
              var29 = this.eq11;
            }
            if (var10 < var11) {
              var9 = var29[var10];
            } else {
              var9 = -1000;
            }
          }
          while (var14 === 5 && var9 > var27) {
            this.rasterFace(graphics, var28[var10++]);
            if (var10 === var11 && var28 !== this.orderedFaces[11]) {
              var10 = 0;
              var11 = this.numOfPriority[11];
              var28 = this.orderedFaces[11];
              var29 = this.eq11;
            }
            if (var10 < var11) {
              var9 = var29[var10];
            } else {
              var9 = -1000;
            }
          }
          var15 = this.numOfPriority[var14];
          const var30 = this.orderedFaces[var14];
          for (var17 = 0; var17 < var15; ++var17) {
            this.rasterFace(graphics, var30[var17]);
          }
        }
        while (var9 !== -1000) {
          this.rasterFace(graphics, var28[var10++]);
          if (var10 === var11 && var28 !== this.orderedFaces[11]) {
            var10 = 0;
            var28 = this.orderedFaces[11];
            var11 = this.numOfPriority[11];
            var29 = this.eq11;
          }
          if (var10 < var11) {
            var9 = var29[var10];
          } else {
            var9 = -1000;
          }
        }
      }
    }
  }

  rasterFace(graphics: Graphics3D, face: number): void {
    const var2 = this.indices1[face];
    const var3 = this.indices2[face];
    const var4 = this.indices3[face];
    graphics.rasterClipEnable = this.faceClipped[face];
    if (this.faceTransparencies === undefined) {
      graphics.rasterAlpha = 0;
    } else {
      graphics.rasterAlpha = this.faceTransparencies[face] & 255;
    }
    if (this.faceTextures !== undefined && this.faceTextures[face] !== -1) {
      let var5 = 0;
      let var6 = 0;
      let var7 = 0;
      if (this.textureCoords !== undefined && this.textureCoords[face] !== -1) {
        const var8 = this.textureCoords[face] & 255;
        var5 = this.texIndices1[var8];
        var6 = this.texIndices2[var8];
        var7 = this.texIndices3[var8];
      } else {
        var5 = var2;
        var6 = var3;
        var7 = var4;
      }
      if (this.faceColors3[face] === -1) {
        graphics.rasterTextureAffine(this.modelViewportXs[var2], this.modelViewportXs[var3], this.modelViewportXs[var4], this.modelViewportYs[var2], this.modelViewportYs[var3], this.modelViewportYs[var4], this.faceColors1[face], this.faceColors1[face], this.faceColors1[face], this.modelLocalX[var5], this.modelLocalX[var6], this.modelLocalX[var7], this.modelLocalY[var5], this.modelLocalY[var6], this.modelLocalY[var7], this.modelLocalZ[var5], this.modelLocalZ[var6], this.modelLocalZ[var7], this.faceTextures[face]);
      } else {
        graphics.rasterTextureAffine(this.modelViewportXs[var2], this.modelViewportXs[var3], this.modelViewportXs[var4], this.modelViewportYs[var2], this.modelViewportYs[var3], this.modelViewportYs[var4], this.faceColors1[face], this.faceColors2[face], this.faceColors3[face], this.modelLocalX[var5], this.modelLocalX[var6], this.modelLocalX[var7], this.modelLocalY[var5], this.modelLocalY[var6], this.modelLocalY[var7], this.modelLocalZ[var5], this.modelLocalZ[var6], this.modelLocalZ[var7], this.faceTextures[face]);
      }
    } else if (this.faceColors3[face] === -1) {
      const field1889 = graphics.colorPalette;
      graphics.rasterFlat(this.modelViewportXs[var2], this.modelViewportXs[var3], this.modelViewportXs[var4], this.modelViewportYs[var2], this.modelViewportYs[var3], this.modelViewportYs[var4], field1889[this.faceColors1[face]]);
    } else {
      graphics.rasterGouraud(this.modelViewportXs[var2], this.modelViewportXs[var3], this.modelViewportXs[var4], this.modelViewportYs[var2], this.modelViewportYs[var3], this.modelViewportYs[var4], this.faceColors1[face], this.faceColors2[face], this.faceColors3[face]);
    }
  }
}
