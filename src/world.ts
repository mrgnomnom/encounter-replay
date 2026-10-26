import * as THREE from "three";
import type { TerrainPlane } from "./cache/bundle";
import type { Line } from "./session";

/**
 * The ground, walls and blocked tiles of the loaded map, built from a session's "scene" line. With
 * ground colours from a cache bundle the floor is coloured as in game; without, it's a checkerboard
 * and the collision map stands in for walls and scenery.
 *
 * Three.js space: one unit per tile, x east, y up, z south (so north is -z). Scene tile (sx, sy)
 * covers x in [sx, sx + 1] and z in [-(sy + 1), -sy].
 */

// Collision flags, as in RuneLite's CollisionDataFlag
const BLOCK_FULL = 0x100 | 0x40000 | 0x200000;
const WALL_N = 0x2;
const WALL_E = 0x8;
const WALL_S = 0x20;
const WALL_W = 0x80;

const WALL_HEIGHT = 1.1;
const WALL_THICKNESS = 0.08;
const BLOCK_HEIGHT = 0.45;
// The client blends underlay colours over this many tiles each way
const BLEND_RADIUS = 5;

export function toThree(tileX: number, tileY: number, up: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(tileX, up, -tileY);
}

export interface Ground {
  /** Ground colours for a floor, from a cache bundle */
  terrain?: (plane: number) => TerrainPlane | undefined;
  textureColor?: (id: number) => number | undefined;
  /** Draw the collision map's walls and blocked tiles */
  collision: boolean;
  /** Tile heights when the scene line has none (open-world map loads, from the cache) */
  heights?: number[][][];
  /** What's under bridges (floor -1): drawn below the bridge decks */
  below?: { terrain: TerrainPlane; heights: number[][] };
}

export class World {
  readonly group = new THREE.Group();
  private key = "";
  private allHeights: number[][][] | undefined;
  private plane = 0;

  /** Rebuilds when the map, the floor or what's drawn changes */
  show(scene: Line | undefined, plane: number, ground: Ground): void {
    const current = ground.terrain?.(plane);
    const key = `${scene?.t}:${scene?.c}:${plane}:${!!current}:${ground.collision}:${!!ground.heights}:${!!ground.below}`;
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!scene) return;
    this.allHeights = scene.heights ?? ground.heights;
    this.belowHeights = ground.below?.heights;
    this.sceneT = scene.t;
    this.plane = plane;
    const flags: number[][] | undefined = scene.collision?.[plane];
    const size = flags?.length || 104;
    if (current && ground.terrain) {
      // Every floor up to yours, as the game draws them: lower floors show through gaps in yours
      for (let p = 0; p <= plane; p++) {
        const terrain = ground.terrain(p);
        if (terrain) this.group.add(this.coloredGround(size, terrain, p, ground.textureColor));
      }
      if (ground.below) {
        // Under bridges: the riverbed or ground the deck spans
        this.group.add(this.coloredGround(size, ground.below.terrain, -1, ground.textureColor));
      }
    } else {
      this.group.add(this.ground(size));
    }
    if (flags && ground.collision) {
      this.group.add(this.blocks(flags));
      this.group.add(this.walls(flags));
    }
  }

  /**
   * How far floor objects (slabs, platforms, rugs) raise each tile above its ground, per floor. The game
   * draws a tile's floor objects before the actors standing on it, so actors always look as if they're
   * on top; with a depth buffer they'd sink into anything thicker than paint, so they're lifted instead
   */
  private readonly lifts = new Map<string, Float32Array>();
  private sceneT = -1;
  private belowHeights: number[][] | undefined;

  /** Lifts for a map load (by its tick) and floor; kept across redraws, dropped with clearLifts */
  setLift(sceneT: number, plane: number, lift: Float32Array): void {
    this.lifts.set(`${sceneT}:${plane}`, lift);
  }

  clearLifts(): void {
    this.lifts.clear();
  }

  /** Where things standing at a point stand: the ground, or the top of a floor object covering it */
  standAt(tileX: number, tileY: number, plane = this.plane): number {
    const lift = this.lifts.get(`${this.sceneT}:${plane}`);
    const x = Math.floor(tileX);
    const y = Math.floor(tileY);
    const extra = lift && x >= 0 && y >= 0 && x < 104 && y < 104 ? lift[x * 104 + y] : 0;
    return this.groundAt(tileX, tileY, plane) + extra;
  }

  /**
   * Ground height in tiles at a point given in tiles. Tile heights are only recorded inside instances;
   * elsewhere the ground is flat
   */
  groundAt(tileX: number, tileY: number, plane = this.plane): number {
    const h = plane === -1 ? this.belowHeights : this.allHeights?.[plane];
    if (!h) return 0;
    const x0 = Math.max(0, Math.min(h.length - 1, Math.floor(tileX)));
    const y0 = Math.max(0, Math.min(h[0].length - 1, Math.floor(tileY)));
    const x1 = Math.min(h.length - 1, x0 + 1);
    const y1 = Math.min(h[0].length - 1, y0 + 1);
    const fx = tileX - x0;
    const fy = tileY - y0;
    const top = h[x0][y1] * (1 - fx) + h[x1][y1] * fx;
    const bottom = h[x0][y0] * (1 - fx) + h[x1][y0] * fx;
    // The game stores heights as negative numbers going up, 128 to a tile
    return -(bottom * (1 - fy) + top * fy) / 128;
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
    }
    this.allHeights = undefined;
  }

  private ground(size: number): THREE.Mesh {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const light = new THREE.Color(0x5b6b47);
    const dark = new THREE.Color(0x4f5e3d);
    for (let x = 0; x <= size; x++) {
      for (let y = 0; y <= size; y++) {
        positions.push(x, this.groundAt(x, y), -y);
        const c = (x + y) % 2 === 0 ? light : dark;
        colors.push(c.r, c.g, c.b);
      }
    }
    const at = (x: number, y: number) => x * (size + 1) + y;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        indices.push(at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * The floor as in game: underlay colours blended across neighbouring tiles and shaded smoothly
   * between tile corners, overlays drawn flat on top. Tiles with neither are the void around an
   * instance and aren't drawn. Overlay shapes (half tiles, diagonals) are drawn as whole tiles for now
   */
  private coloredGround(size: number, terrain: TerrainPlane, plane: number, textureColor?: (id: number) => number | undefined): THREE.Mesh {
    const n = 104;
    const blended = new Int32Array(n * n).fill(-1);
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let dx = -BLEND_RADIUS; dx <= BLEND_RADIUS; dx++) {
          for (let dy = -BLEND_RADIUS; dy <= BLEND_RADIUS; dy++) {
            const bx = x + dx;
            const by = y + dy;
            if (bx < 0 || by < 0 || bx >= n || by >= n) continue;
            const c = terrain.under[bx * n + by];
            if (c < 0) continue;
            r += (c >> 16) & 255;
            g += (c >> 8) & 255;
            b += c & 255;
            count++;
          }
        }
        if (count && terrain.under[x * n + y] >= 0) blended[x * n + y] = ((r / count) << 16) | ((g / count) << 8) | (b / count);
      }
    }
    // Each corner takes the average of the blended tiles around it, which smooths the floor
    const corner = (x: number, y: number): number => {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (const [tx, ty] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        const c = blended[tx * n + ty];
        if (c < 0) continue;
        r += (c >> 16) & 255;
        g += (c >> 8) & 255;
        b += c & 255;
        count++;
      }
      return count ? ((r / count) << 16) | ((g / count) << 8) | (b / count) : 0x404040;
    };

    const positions: number[] = [];
    const colors: number[] = [];
    const push = (x: number, y: number, rgb: number) => {
      positions.push(x, this.groundAt(x, y, plane), -y);
      colors.push(((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255);
    };
    for (let x = 0; x < Math.min(size, n); x++) {
      for (let y = 0; y < Math.min(size, n); y++) {
        const i = x * n + y;
        let over = terrain.over[i];
        if (over <= -2) over = textureColor?.(-2 - over) ?? 0x808080;
        const hasUnder = terrain.under[i] >= 0;
        if (over < 0 && !hasUnder) continue;
        const c00 = over >= 0 ? over : corner(x, y);
        const c10 = over >= 0 ? over : corner(x + 1, y);
        const c01 = over >= 0 ? over : corner(x, y + 1);
        const c11 = over >= 0 ? over : corner(x + 1, y + 1);
        push(x, y, c00); push(x + 1, y, c10); push(x, y + 1, c01);
        push(x + 1, y, c10); push(x + 1, y + 1, c11); push(x, y + 1, c01);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    // Pushed back a touch in depth so floors drawn by objects at the same height win, as they do in game
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private blocks(flags: number[][]): THREE.InstancedMesh {
    const tiles: [number, number][] = [];
    flags.forEach((col, x) => col.forEach((f, y) => { if (f & BLOCK_FULL) tiles.push([x, y]); }));
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, BLOCK_HEIGHT, 1),
      new THREE.MeshLambertMaterial({ color: 0x6d675c }),
      Math.max(1, tiles.length),
    );
    const m = new THREE.Matrix4();
    tiles.forEach(([x, y], i) => {
      m.makeTranslation(x + 0.5, this.groundAt(x + 0.5, y + 0.5) + BLOCK_HEIGHT / 2, -(y + 0.5));
      mesh.setMatrixAt(i, m);
    });
    mesh.count = tiles.length;
    mesh.castShadow = true;
    return mesh;
  }

  private walls(flags: number[][]): THREE.InstancedMesh {
    // Each wall is centred on a tile edge: [centre x, centre y in tiles, runs east-west]
    const edges: [number, number, boolean][] = [];
    flags.forEach((col, x) =>
      col.forEach((f, y) => {
        if (f & WALL_N) edges.push([x + 0.5, y + 1, true]);
        if (f & WALL_S) edges.push([x + 0.5, y, true]);
        if (f & WALL_E) edges.push([x + 1, y + 0.5, false]);
        if (f & WALL_W) edges.push([x, y + 0.5, false]);
      }),
    );
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, WALL_HEIGHT, 1),
      new THREE.MeshLambertMaterial({ color: 0xcfc6b4 }),
      Math.max(1, edges.length),
    );
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    edges.forEach(([x, y, eastWest], i) => {
      scale.set(eastWest ? 1 : WALL_THICKNESS, 1, eastWest ? WALL_THICKNESS : 1);
      toThree(x, y, this.groundAt(x, y) + WALL_HEIGHT / 2, pos);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = edges.length;
    mesh.castShadow = true;
    return mesh;
  }
}
