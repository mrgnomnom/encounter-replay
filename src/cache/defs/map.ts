// Ported from RuneLite's cache library (net.runelite.cache.definitions.MapDefinition and loaders.MapLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";
import { toByte, toShort } from "./casts";

/** MapDefinition.Tile */
export class Tile {
  height?: number;
  attrOpcode = 0;
  settings = 0;
  overlayId = 0;
  overlayPath = 0;
  overlayRotation = 0;
  underlayId = 0;

  getHeight(): number | undefined { return this.height; }
  getAttrOpcode(): number { return this.attrOpcode; }
  getSettings(): number { return this.settings; }
  getOverlayId(): number { return this.overlayId; }
  getOverlayPath(): number { return this.overlayPath; }
  getOverlayRotation(): number { return this.overlayRotation; }
  getUnderlayId(): number { return this.underlayId; }
}

export class MapDefinition {
  static readonly X = 64;
  static readonly Y = 64;
  static readonly Z = 4;

  regionX = 0;
  regionY = 0;
  /** [z][x][y]; MapLoader fills every tile */
  tiles: Tile[][][] = Array.from({ length: MapDefinition.Z }, () => Array.from({ length: MapDefinition.X }, () => new Array<Tile>(MapDefinition.Y)));

  getRegionX(): number { return this.regionX; }
  getRegionY(): number { return this.regionY; }
  getTiles(): Tile[][][] { return this.tiles; }
}

const { X, Y, Z } = MapDefinition;

export class MapLoader {
  load(regionX: number, regionY: number, b: Uint8Array): MapDefinition {
    const map = new MapDefinition();
    map.regionX = regionX;
    map.regionY = regionY;
    this.loadTerrain(map, b);
    return map;
  }

  private loadTerrain(map: MapDefinition, buf: Uint8Array): void {
    const tiles = map.tiles;
    const inp = new InputStream(buf);
    for (let z = 0; z < Z; z++) {
      for (let x = 0; x < X; x++) {
        for (let y = 0; y < Y; y++) {
          const tile = (tiles[z][x][y] = new Tile());
          for (;;) {
            const attribute = inp.readUnsignedShort();
            if (attribute === 0) {
              break;
            } else if (attribute === 1) {
              tile.height = inp.readUnsignedByte();
              break;
            } else if (attribute <= 49) {
              tile.attrOpcode = attribute;
              tile.overlayId = inp.readShort();
              tile.overlayPath = toByte(Math.trunc((attribute - 2) / 4));
              tile.overlayRotation = toByte((attribute - 2) & 3);
            } else if (attribute <= 81) {
              tile.settings = toByte(attribute - 49);
            } else {
              tile.underlayId = toShort(attribute - 81);
            }
          }
        }
      }
    }
  }
}
