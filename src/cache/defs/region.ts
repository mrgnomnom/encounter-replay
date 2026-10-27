// Ported from RuneLite's cache library (net.runelite.cache.region.Region and HeightCalc, BSD-2-Clause, see LICENSE in src/cache/store).
// Integer arithmetic wraps as Java's int does, hence Math.imul.
import { Location, type LocationsDefinition, Position } from "./locations";
import type { MapDefinition } from "./map";

const JAGEX_CIRCULAR_ANGLE = 2048;
const ANGULAR_RATIO = 360 / JAGEX_CIRCULAR_ANGLE;
// Math.toRadians as Java 9+ computes it: a multiply by this constant
const JAGEX_RADIAN = ANGULAR_RATIO * 0.017453292519943295;
const SIN = new Int32Array(JAGEX_CIRCULAR_ANGLE);
const COS = new Int32Array(JAGEX_CIRCULAR_ANGLE);
for (let i = 0; i < JAGEX_CIRCULAR_ANGLE; i++) {
  SIN[i] = Math.trunc(65536.0 * Math.sin(i * JAGEX_RADIAN));
  COS[i] = Math.trunc(65536.0 * Math.cos(i * JAGEX_RADIAN));
}

/** Java's int division: truncates toward zero */
const div = (a: number, b: number): number => Math.trunc(a / b) | 0;

export class HeightCalc {
  /** The sine and cosine tables, exposed so tests can compare them with the Java's */
  static readonly SIN: Int32Array = SIN;
  static readonly COS: Int32Array = COS;

  static calculate(x: number, y: number): number {
    let n =
      HeightCalc.interpolateNoise(x + 45365, y + 91923, 4) - 128 +
      ((HeightCalc.interpolateNoise(10294 + x, y + 37821, 2) - 128) >> 1) +
      ((HeightCalc.interpolateNoise(x, y, 1) - 128) >> 2);
    n = 35 + Math.trunc(n * 0.3);
    if (n < 10) n = 10;
    else if (n > 60) n = 60;
    return n;
  }

  static interpolateNoise(x: number, y: number, frequency: number): number {
    const intX = div(x, frequency);
    const fracX = x & (frequency - 1);
    const intY = div(y, frequency);
    const fracY = y & (frequency - 1);
    const v1 = HeightCalc.smoothedNoise1(intX, intY);
    const v2 = HeightCalc.smoothedNoise1(intX + 1, intY);
    const v3 = HeightCalc.smoothedNoise1(intX, intY + 1);
    const v4 = HeightCalc.smoothedNoise1(1 + intX, 1 + intY);
    const i1 = HeightCalc.interpolate(v1, v2, fracX, frequency);
    const i2 = HeightCalc.interpolate(v3, v4, fracX, frequency);
    return HeightCalc.interpolate(i1, i2, fracY, frequency);
  }

  static smoothedNoise1(x: number, y: number): number {
    const noise = HeightCalc.noise;
    const corners = noise(x - 1, y - 1) + noise(x + 1, y - 1) + noise(x - 1, 1 + y) + noise(x + 1, y + 1);
    const sides = noise(x - 1, y) + noise(1 + x, y) + noise(x, y - 1) + noise(x, 1 + y);
    const center = noise(x, y);
    return div(center, 4) + div(sides, 8) + div(corners, 16);
  }

  static noise(x: number, y: number): number {
    let n = (x + Math.imul(y, 57)) | 0;
    n ^= n << 13;
    const inner = (Math.imul(Math.imul(n, n), 15731) + 789221) | 0;
    return ((((Math.imul(n, inner) + 1376312589) | 0) & 0x7fffffff) >> 19) & 255;
  }

  static interpolate(a: number, b: number, x: number, y: number): number {
    const f = (65536 - COS[div(1024 * x, y)]) >> 1;
    return (Math.imul(f, b) >> 16) + (Math.imul(a, 65536 - f) >> 16);
  }
}

const X = 64;
const Y = 64;
const Z = 4;

const grid = (): number[][][] => Array.from({ length: Z }, () => Array.from({ length: X }, () => new Array<number>(Y).fill(0)));

export class Region {
  static readonly X = X;
  static readonly Y = Y;
  static readonly Z = Z;

  private readonly regionID: number;
  private readonly baseX: number;
  private readonly baseY: number;
  private readonly tileHeights = grid();
  private readonly tileSettings = grid();
  private readonly overlayIds = grid();
  private readonly overlayPaths = grid();
  private readonly overlayRotations = grid();
  private readonly underlayIds = grid();
  private readonly locations: Location[] = [];

  /** Region(int id), or Region(int x, int y) when given both */
  constructor(id: number, y?: number) {
    if (y === undefined) {
      this.regionID = id;
      this.baseX = ((id >> 8) & 0xff) << 6; // local coords are in bottom 6 bits (64*64)
      this.baseY = (id & 0xff) << 6;
    } else {
      this.regionID = (id << 8) | y;
      this.baseX = id << 6;
      this.baseY = y << 6;
    }
  }

  loadTerrain(map: MapDefinition): void {
    const tiles = map.getTiles();
    for (let z = 0; z < Z; z++) {
      for (let x = 0; x < X; x++) {
        for (let y = 0; y < Y; y++) {
          const tile = tiles[z][x][y];
          if (tile.height === undefined) {
            if (z === 0) this.tileHeights[0][x][y] = -HeightCalc.calculate(this.baseX + x + 0xe3b7b, this.baseY + y + 0x87cce) * 8;
            else this.tileHeights[z][x][y] = this.tileHeights[z - 1][x][y] - 240;
          } else {
            let height = tile.getHeight()!;
            if (height === 1) height = 0;
            if (z === 0) this.tileHeights[0][x][y] = -height * 8;
            else this.tileHeights[z][x][y] = this.tileHeights[z - 1][x][y] - height * 8;
          }
          this.overlayIds[z][x][y] = tile.getOverlayId();
          this.overlayPaths[z][x][y] = tile.getOverlayPath();
          this.overlayRotations[z][x][y] = tile.getOverlayRotation();
          this.tileSettings[z][x][y] = tile.getSettings();
          this.underlayIds[z][x][y] = tile.getUnderlayId();
        }
      }
    }
  }

  loadLocations(locs: LocationsDefinition): void {
    for (const loc of locs.getLocations()) {
      const p = loc.getPosition();
      this.locations.push(new Location(loc.getId(), loc.getType(), loc.getOrientation(),
        new Position(this.getBaseX() + p.getX(), this.getBaseY() + p.getY(), p.getZ())));
    }
  }

  getRegionID(): number { return this.regionID; }
  getBaseX(): number { return this.baseX; }
  getBaseY(): number { return this.baseY; }
  getTileHeight(z: number, x: number, y: number): number { return this.tileHeights[z][x][y]; }
  getTileSetting(z: number, x: number, y: number): number { return this.tileSettings[z][x][y]; }
  getOverlayId(z: number, x: number, y: number): number { return this.overlayIds[z][x][y] & 0x7fff; }
  getOverlayPath(z: number, x: number, y: number): number { return this.overlayPaths[z][x][y]; }
  getOverlayRotation(z: number, x: number, y: number): number { return this.overlayRotations[z][x][y]; }
  getUnderlayId(z: number, x: number, y: number): number { return this.underlayIds[z][x][y] & 0x7fff; }
  getLocations(): Location[] { return this.locations; }
  getRegionX(): number { return this.baseX >> 6; }
  getRegionY(): number { return this.baseY >> 6; }
}
