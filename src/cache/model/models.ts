// Ported from RuneLite's cache library (net.runelite.cache.models: CircularAngle, FaceNormal, VertexNormal,
// Vector3f; BSD-2-Clause, see LICENSE in src/cache/store).

const UNIT = Math.PI / 1024; // How much of the circle each unit of SINE/COSINE is

/** Sine and cosine for each of the 2048 angle units, * 65536 and truncated to an int */
export const CircularAngle = (() => {
  const SINE = new Int32Array(2048);
  const COSINE = new Int32Array(2048);
  for (let i = 0; i < 2048; i++) {
    SINE[i] = (65536 * Math.sin(i * UNIT)) | 0;
    COSINE[i] = (65536 * Math.cos(i * UNIT)) | 0;
  }
  return { SINE, COSINE };
})();

export class FaceNormal {
  x = 0;
  y = 0;
  z = 0;
}

export class Vector3f {
  constructor(readonly x: number, readonly y: number, readonly z: number) {}
}

export class VertexNormal {
  x = 0;
  y = 0;
  z = 0;
  magnitude = 0;

  normalize(): Vector3f {
    const f = Math.fround;
    let length = Math.sqrt((Math.imul(this.x, this.x) + Math.imul(this.y, this.y) + Math.imul(this.z, this.z)) | 0) | 0;
    if (length === 0) length = 1;
    return new Vector3f(f(f(this.x) / length), f(f(this.y) / length), f(f(this.z) / length));
  }
}
