// Ported from RuneLite's cache library (net.runelite.cache.definitions.ModelDefinition, BSD-2-Clause, see LICENSE
// in src/cache/store). Field and method names match the Java; int maths wraps as Java's does.
import { CircularAngle, FaceNormal, VertexNormal } from "./models";

/** Java's ArrayIndexOutOfBoundsException, where a typed array would quietly give undefined instead */
function check(index: number, length: number): void {
  if (index < 0 || index >= length) throw new RangeError(`Index ${index} out of bounds for length ${length}`);
}

export class ModelDefinition {
  id = 0;

  vertexCount = 0;
  // Java leaves these null until a loader fills them; every loader does, so they start empty here instead
  vertexX = new Int32Array(0);
  vertexY = new Int32Array(0);
  vertexZ = new Int32Array(0);
  vertexNormals: VertexNormal[] | undefined;

  faceCount = 0;
  faceIndices1 = new Int32Array(0);
  faceIndices2 = new Int32Array(0);
  faceIndices3 = new Int32Array(0);
  faceTransparencies: Int8Array | undefined;
  faceColors = new Int16Array(0);
  faceRenderPriorities: Int8Array | undefined;
  faceRenderTypes: Int8Array | undefined;
  faceNormals: (FaceNormal | undefined)[] | undefined;

  numTextureFaces = 0;
  texIndices1: Int16Array | undefined;
  texIndices2: Int16Array | undefined;
  texIndices3: Int16Array | undefined;
  faceTextureUCoordinates: (Float32Array | undefined)[] | undefined;
  faceTextureVCoordinates: (Float32Array | undefined)[] | undefined;
  texturePrimaryColors: Int16Array | undefined;
  faceTextures: Int16Array | undefined;
  faceZOffsets: Int8Array | undefined;
  textureCoords: Int8Array | undefined;
  textureRenderTypes: Int8Array | undefined;

  packedVertexGroups: Int32Array | undefined;
  packedTransparencyVertexGroups: Int32Array | undefined;

  /** A Java byte */
  priority = 0;

  private vertexGroups: (Int32Array | undefined)[] | undefined;
  animayaGroups: (Int32Array | undefined)[] | undefined;
  animayaScales: (Int32Array | undefined)[] | undefined;

  private origVX: Int32Array | undefined;
  private origVY: Int32Array | undefined;
  private origVZ: Int32Array | undefined;

  maxPriority = 0;

  static animOffsetX = 0;
  static animOffsetY = 0;
  static animOffsetZ = 0;

  // Lombok's accessors for the private fields; the public ones are read directly
  getVertexGroups(): (Int32Array | undefined)[] | undefined { return this.vertexGroups; }
  setVertexGroups(vertexGroups: (Int32Array | undefined)[] | undefined): void { this.vertexGroups = vertexGroups; }
  getOrigVX(): Int32Array | undefined { return this.origVX; }
  getOrigVY(): Int32Array | undefined { return this.origVY; }
  getOrigVZ(): Int32Array | undefined { return this.origVZ; }
  setOrigVX(origVX: Int32Array | undefined): void { this.origVX = origVX; }
  setOrigVY(origVY: Int32Array | undefined): void { this.origVY = origVY; }
  setOrigVZ(origVZ: Int32Array | undefined): void { this.origVZ = origVZ; }

  computeNormals(): void {
    if (this.vertexNormals) return;

    const vertexNormals: VertexNormal[] = (this.vertexNormals = new Array(this.vertexCount));
    for (let i = 0; i < this.vertexCount; i++) vertexNormals[i] = new VertexNormal();

    const vx = this.vertexX;
    const vy = this.vertexY;
    const vz = this.vertexZ;
    for (let i = 0; i < this.faceCount; i++) {
      const vertexA = this.faceIndices1[i];
      const vertexB = this.faceIndices2[i];
      const vertexC = this.faceIndices3[i];
      check(vertexA, vx.length);
      check(vertexB, vx.length);
      check(vertexC, vx.length);

      const xA = (vx[vertexB] - vx[vertexA]) | 0;
      const yA = (vy[vertexB] - vy[vertexA]) | 0;
      const zA = (vz[vertexB] - vz[vertexA]) | 0;

      const xB = (vx[vertexC] - vx[vertexA]) | 0;
      const yB = (vy[vertexC] - vy[vertexA]) | 0;
      const zB = (vz[vertexC] - vz[vertexA]) | 0;

      // Compute cross product
      let var11 = (Math.imul(yA, zB) - Math.imul(yB, zA)) | 0;
      let var12 = (Math.imul(zA, xB) - Math.imul(zB, xA)) | 0;
      let var13 = (Math.imul(xA, yB) - Math.imul(xB, yA)) | 0;

      while (var11 > 8192 || var12 > 8192 || var13 > 8192 || var11 < -8192 || var12 < -8192 || var13 < -8192) {
        var11 >>= 1;
        var12 >>= 1;
        var13 >>= 1;
      }

      let length = Math.sqrt((Math.imul(var11, var11) + Math.imul(var12, var12) + Math.imul(var13, var13)) | 0) | 0;
      if (length <= 0) length = 1;

      var11 = ((var11 * 256) / length) | 0;
      var12 = ((var12 * 256) / length) | 0;
      var13 = ((var13 * 256) / length) | 0;

      const var15 = this.faceRenderTypes === undefined ? 0 : this.faceRenderTypes[i];

      if (var15 === 0) {
        accumulate(vertexNormals[vertexA], var11, var12, var13);
        accumulate(vertexNormals[vertexB], var11, var12, var13);
        accumulate(vertexNormals[vertexC], var11, var12, var13);
      } else if (var15 === 1) {
        if (!this.faceNormals) this.faceNormals = new Array<FaceNormal | undefined>(this.faceCount).fill(undefined);
        const n = (this.faceNormals[i] = new FaceNormal());
        n.x = var11;
        n.y = var12;
        n.z = var13;
      }
    }
  }

  computeTextureUVCoordinates(): void {
    const faceCount = this.faceCount;
    const us: (Float32Array | undefined)[] = (this.faceTextureUCoordinates = new Array(faceCount).fill(undefined));
    const vs: (Float32Array | undefined)[] = (this.faceTextureVCoordinates = new Array(faceCount).fill(undefined));

    const faceTextures = this.faceTextures;
    if (faceTextures === undefined) return;

    // Java float maths: every operation rounds to single precision
    const f = Math.fround;
    const vx = this.vertexX;
    const vy = this.vertexY;
    const vz = this.vertexZ;
    const textureCoords = this.textureCoords;

    for (let i = 0; i < faceCount; i++) {
      if (faceTextures[i] === -1) continue;

      let u0: number, u1: number, u2: number, v0: number, v1: number, v2: number;

      if (textureCoords !== undefined && textureCoords[i] !== -1) {
        const tfaceIdx = textureCoords[i] & 0xff;
        const triangleA = this.faceIndices1[i];
        const triangleB = this.faceIndices2[i];
        const triangleC = this.faceIndices3[i];
        const t1 = this.texIndices1!;
        check(tfaceIdx, t1.length);
        const texA = t1[tfaceIdx];
        const texB = this.texIndices2![tfaceIdx];
        const texC = this.texIndices3![tfaceIdx];
        check(texA, vx.length);
        check(texB, vx.length);
        check(texC, vx.length);
        check(triangleA, vx.length);
        check(triangleB, vx.length);
        check(triangleC, vx.length);

        // v1 = vertex[texA]
        const v1x = f(vx[texA]);
        const v1y = f(vy[texA]);
        const v1z = f(vz[texA]);
        // v2 = vertex[texB] - v1
        const v2x = f(f(vx[texB]) - v1x);
        const v2y = f(f(vy[texB]) - v1y);
        const v2z = f(f(vz[texB]) - v1z);
        // v3 = vertex[texC] - v1
        const v3x = f(f(vx[texC]) - v1x);
        const v3y = f(f(vy[texC]) - v1y);
        const v3z = f(f(vz[texC]) - v1z);

        // v4 = vertex[triangleA] - v1
        const v4x = f(f(vx[triangleA]) - v1x);
        const v4y = f(f(vy[triangleA]) - v1y);
        const v4z = f(f(vz[triangleA]) - v1z);
        // v5 = vertex[triangleB] - v1
        const v5x = f(f(vx[triangleB]) - v1x);
        const v5y = f(f(vy[triangleB]) - v1y);
        const v5z = f(f(vz[triangleB]) - v1z);
        // v6 = vertex[triangleC] - v1
        const v6x = f(f(vx[triangleC]) - v1x);
        const v6y = f(f(vy[triangleC]) - v1y);
        const v6z = f(f(vz[triangleC]) - v1z);

        // v7 = v2 x v3
        const v7x = f(f(v2y * v3z) - f(v2z * v3y));
        const v7y = f(f(v2z * v3x) - f(v2x * v3z));
        const v7z = f(f(v2x * v3y) - f(v2y * v3x));

        // v8 = v3 x v7
        let v8x = f(f(v3y * v7z) - f(v3z * v7y));
        let v8y = f(f(v3z * v7x) - f(v3x * v7z));
        let v8z = f(f(v3x * v7y) - f(v3y * v7x));

        // f = 1 / (v8 ⋅ v2)
        let inv = f(1 / dot(v8x, v8y, v8z, v2x, v2y, v2z));

        u0 = f(dot(v8x, v8y, v8z, v4x, v4y, v4z) * inv);
        u1 = f(dot(v8x, v8y, v8z, v5x, v5y, v5z) * inv);
        u2 = f(dot(v8x, v8y, v8z, v6x, v6y, v6z) * inv);

        // v8 = v2 x v7
        v8x = f(f(v2y * v7z) - f(v2z * v7y));
        v8y = f(f(v2z * v7x) - f(v2x * v7z));
        v8z = f(f(v2x * v7y) - f(v2y * v7x));

        // f = 1 / (v8 ⋅ v3)
        inv = f(1 / dot(v8x, v8y, v8z, v3x, v3y, v3z));

        v0 = f(dot(v8x, v8y, v8z, v4x, v4y, v4z) * inv);
        v1 = f(dot(v8x, v8y, v8z, v5x, v5y, v5z) * inv);
        v2 = f(dot(v8x, v8y, v8z, v6x, v6y, v6z) * inv);
      } else {
        // Without a texture face the client maps the triangle onto itself, which reduces to these
        u0 = 0;
        v0 = 0;

        u1 = 1;
        v1 = 0;

        u2 = 0;
        v2 = 1;
      }

      us[i] = Float32Array.of(u0, u1, u2);
      vs[i] = Float32Array.of(v0, v1, v2);
    }
  }

  computeAnimationTables(): void {
    const packed = this.packedVertexGroups;
    if (packed !== undefined) {
      const groupCounts = new Int32Array(256);
      let numGroups = 0;

      for (let v = 0; v < this.vertexCount; v++) {
        const group = packed[v];
        ++groupCounts[group];
        if (group > numGroups) numGroups = group;
      }

      const vertexGroups: Int32Array[] = (this.vertexGroups = new Array(numGroups + 1));
      for (let g = 0; g <= numGroups; g++) {
        vertexGroups[g] = new Int32Array(groupCounts[g]);
        groupCounts[g] = 0;
      }

      for (let v = 0; v < this.vertexCount; v++) {
        const group = packed[v];
        vertexGroups[group][groupCounts[group]++] = v;
      }

      this.packedVertexGroups = undefined;
    }

    // triangleSkinValues is here
  }

  rotate(orientation: number): void {
    check(orientation, 2048);
    const sin = CircularAngle.SINE[orientation];
    const cos = CircularAngle.COSINE[orientation];
    const vx = this.vertexX;
    const vz = this.vertexZ;

    for (let i = 0; i < vx.length; i++) {
      vx[i] = (Math.imul(vx[i], cos) + Math.imul(vz[i], sin)) >> 16;
      vz[i] = (Math.imul(vz[i], cos) - Math.imul(vx[i], sin)) >> 16;
    }

    this.reset();
  }

  resetAnim(): void {
    if (this.origVX === undefined) return;

    this.vertexX.set(this.origVX);
    this.vertexY.set(this.origVY!);
    this.vertexZ.set(this.origVZ!);
  }

  animate(type: number, frameMap: ArrayLike<number>, dx: number, dy: number, dz: number): void {
    if (this.origVX === undefined) {
      this.origVX = this.vertexX.slice();
      this.origVY = this.vertexY.slice();
      this.origVZ = this.vertexZ.slice();
    }

    const verticesX = this.vertexX;
    const verticesY = this.vertexY;
    const verticesZ = this.vertexZ;
    const count = frameMap.length;
    const M = ModelDefinition;

    if (type === 0) {
      let var7 = 0;
      M.animOffsetX = 0;
      M.animOffsetY = 0;
      M.animOffsetZ = 0;

      for (let k = 0; k < count; k++) {
        const var9 = frameMap[k];
        if (var9 < this.vertexGroups!.length) {
          const var10 = this.group(var9);
          for (let j = 0; j < var10.length; j++) {
            const var12 = var10[j];
            check(var12, verticesX.length);
            M.animOffsetX = (M.animOffsetX + verticesX[var12]) | 0;
            M.animOffsetY = (M.animOffsetY + verticesY[var12]) | 0;
            M.animOffsetZ = (M.animOffsetZ + verticesZ[var12]) | 0;
            ++var7;
          }
        }
      }

      if (var7 > 0) {
        M.animOffsetX = (dx + ((M.animOffsetX / var7) | 0)) | 0;
        M.animOffsetY = (dy + ((M.animOffsetY / var7) | 0)) | 0;
        M.animOffsetZ = (dz + ((M.animOffsetZ / var7) | 0)) | 0;
      } else {
        M.animOffsetX = dx;
        M.animOffsetY = dy;
        M.animOffsetZ = dz;
      }
    } else if (type === 1) {
      for (let k = 0; k < count; k++) {
        const var8 = frameMap[k];
        if (var8 < this.vertexGroups!.length) {
          const var18 = this.group(var8);
          for (let j = 0; j < var18.length; j++) {
            const v = var18[j];
            check(v, verticesX.length);
            verticesX[v] += dx;
            verticesY[v] += dy;
            verticesZ[v] += dz;
          }
        }
      }
    } else if (type === 2) {
      const { SINE, COSINE } = CircularAngle;
      for (let k = 0; k < count; k++) {
        const var8 = frameMap[k];
        if (var8 < this.vertexGroups!.length) {
          const var18 = this.group(var8);
          for (let j = 0; j < var18.length; j++) {
            const v = var18[j];
            check(v, verticesX.length);
            verticesX[v] -= M.animOffsetX;
            verticesY[v] -= M.animOffsetY;
            verticesZ[v] -= M.animOffsetZ;
            const var12 = (dx & 255) * 8;
            const var13 = (dy & 255) * 8;
            const var14 = (dz & 255) * 8;
            if (var14 !== 0) {
              const s = SINE[var14];
              const c = COSINE[var14];
              const var17 = (Math.imul(s, verticesY[v]) + Math.imul(c, verticesX[v])) >> 16;
              verticesY[v] = (Math.imul(c, verticesY[v]) - Math.imul(s, verticesX[v])) >> 16;
              verticesX[v] = var17;
            }

            if (var12 !== 0) {
              const s = SINE[var12];
              const c = COSINE[var12];
              const var17 = (Math.imul(c, verticesY[v]) - Math.imul(s, verticesZ[v])) >> 16;
              verticesZ[v] = (Math.imul(s, verticesY[v]) + Math.imul(c, verticesZ[v])) >> 16;
              verticesY[v] = var17;
            }

            if (var13 !== 0) {
              const s = SINE[var13];
              const c = COSINE[var13];
              const var17 = (Math.imul(s, verticesZ[v]) + Math.imul(c, verticesX[v])) >> 16;
              verticesZ[v] = (Math.imul(c, verticesZ[v]) - Math.imul(s, verticesX[v])) >> 16;
              verticesX[v] = var17;
            }

            verticesX[v] += M.animOffsetX;
            verticesY[v] += M.animOffsetY;
            verticesZ[v] += M.animOffsetZ;
          }
        }
      }
    } else if (type === 3) {
      for (let k = 0; k < count; k++) {
        const var8 = frameMap[k];
        if (var8 < this.vertexGroups!.length) {
          const var18 = this.group(var8);
          for (let j = 0; j < var18.length; j++) {
            const v = var18[j];
            check(v, verticesX.length);
            verticesX[v] -= M.animOffsetX;
            verticesY[v] -= M.animOffsetY;
            verticesZ[v] -= M.animOffsetZ;
            verticesX[v] = (Math.imul(dx, verticesX[v]) / 128) | 0;
            verticesY[v] = (Math.imul(dy, verticesY[v]) / 128) | 0;
            verticesZ[v] = (Math.imul(dz, verticesZ[v]) / 128) | 0;
            verticesX[v] += M.animOffsetX;
            verticesY[v] += M.animOffsetY;
            verticesZ[v] += M.animOffsetZ;
          }
        }
      }
    } else if (type === 5) {
      // alpha animation
    }
  }

  /** vertexGroups[index], throwing where Java would (a negative index, or a null group) */
  private group(index: number): Int32Array {
    const groups = this.vertexGroups!;
    check(index, groups.length);
    const g = groups[index];
    if (g === undefined) throw new TypeError(`vertexGroups[${index}] is null`);
    return g;
  }

  method1493(): void {
    for (let i = 0; i < this.vertexCount; i++) this.vertexZ[i] = -this.vertexZ[i];

    for (let i = 0; i < this.faceCount; i++) {
      const var2 = this.faceIndices1[i];
      this.faceIndices1[i] = this.faceIndices3[i];
      this.faceIndices3[i] = var2;
    }

    this.reset();
  }

  rotate1(): void {
    for (let i = 0; i < this.vertexCount; i++) {
      const var2 = this.vertexX[i];
      this.vertexX[i] = this.vertexZ[i];
      this.vertexZ[i] = -var2;
    }

    this.reset();
  }

  rotate2(): void {
    for (let i = 0; i < this.vertexCount; i++) {
      this.vertexX[i] = -this.vertexX[i];
      this.vertexZ[i] = -this.vertexZ[i];
    }

    this.reset();
  }

  rotate3(): void {
    for (let i = 0; i < this.vertexCount; i++) {
      const var2 = this.vertexZ[i];
      this.vertexZ[i] = this.vertexX[i];
      this.vertexX[i] = -var2;
    }

    this.reset();
  }

  private reset(): void {
    this.vertexNormals = undefined;
    this.faceNormals = undefined;
    this.faceTextureUCoordinates = this.faceTextureVCoordinates = undefined;
  }

  resize(var1: number, var2: number, var3: number): void {
    for (let i = 0; i < this.vertexCount; i++) {
      this.vertexX[i] = (Math.imul(this.vertexX[i], var1) / 128) | 0;
      this.vertexY[i] = (Math.imul(var2, this.vertexY[i]) / 128) | 0;
      this.vertexZ[i] = (Math.imul(var3, this.vertexZ[i]) / 128) | 0;
    }

    this.reset();
  }

  /** Both arguments are Java shorts: an unsigned 16-bit colour is taken as its signed value, as a cast would */
  recolor(var1: number, var2: number): void {
    const from = (var1 << 16) >> 16;
    for (let i = 0; i < this.faceCount; i++) {
      if (this.faceColors[i] === from) this.faceColors[i] = var2;
    }
  }

  /** Both arguments are Java shorts, as for recolor */
  retexture(var1: number, var2: number): void {
    if (this.faceTextures !== undefined) {
      const from = (var1 << 16) >> 16;
      for (let i = 0; i < this.faceCount; i++) {
        if (this.faceTextures[i] === from) this.faceTextures[i] = var2;
      }
    }
  }

  move(xOffset: number, yOffset: number, zOffset: number): void {
    for (let i = 0; i < this.vertexCount; i++) {
      this.vertexX[i] += xOffset;
      this.vertexY[i] += yOffset;
      this.vertexZ[i] += zOffset;
    }
    this.reset();
  }

  computeMaxPriority(): void {
    if (this.faceRenderPriorities === undefined) return;

    for (let i = 0; i < this.faceCount; i++) {
      if (this.faceRenderPriorities[i] > this.maxPriority) this.maxPriority = this.faceRenderPriorities[i];
    }
  }
}

function accumulate(n: VertexNormal, x: number, y: number, z: number): void {
  n.x = (n.x + x) | 0;
  n.y = (n.y + y) | 0;
  n.z = (n.z + z) | 0;
  n.magnitude = (n.magnitude + 1) | 0;
}

/** a ⋅ b in Java floats, summed left to right */
function dot(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const f = Math.fround;
  return f(f(f(ax * bx) + f(ay * by)) + f(az * bz));
}
