// Ported from RuneLite's cache library (net.runelite.cache.region.Position, Location, definitions.LocationsDefinition and loaders.LocationsLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";

export class Position {
  constructor(private readonly x: number, private readonly y: number, private readonly z: number) {}

  static fromPacked(packedPosition: number): Position {
    if (packedPosition === -1) return new Position(-1, -1, -1);
    const z = (packedPosition >> 28) & 3;
    const x = (packedPosition >> 14) & 16383;
    const y = packedPosition & 16383;
    return new Position(x, y, z);
  }

  getX(): number { return this.x; }
  getY(): number { return this.y; }
  getZ(): number { return this.z; }
}

export class Location {
  constructor(
    private readonly id: number,
    private readonly type: number,
    private readonly orientation: number,
    private readonly position: Position,
  ) {}

  getId(): number { return this.id; }
  getType(): number { return this.type; }
  getOrientation(): number { return this.orientation; }
  getPosition(): Position { return this.position; }
}

export class LocationsDefinition {
  regionX = 0;
  regionY = 0;
  locations: Location[] = [];

  getRegionX(): number { return this.regionX; }
  getRegionY(): number { return this.regionY; }
  getLocations(): Location[] { return this.locations; }
}

export class LocationsLoader {
  load(regionX: number, regionY: number, b: Uint8Array): LocationsDefinition {
    const loc = new LocationsDefinition();
    loc.regionX = regionX;
    loc.regionY = regionY;
    this.loadLocations(loc, b);
    return loc;
  }

  private loadLocations(loc: LocationsDefinition, b: Uint8Array): void {
    const buf = new InputStream(b);
    let id = -1;
    let idOffset: number;
    while ((idOffset = buf.readUnsignedIntSmartShortCompat()) !== 0) {
      id += idOffset;
      let position = 0;
      let positionOffset: number;
      while ((positionOffset = buf.readUnsignedShortSmart()) !== 0) {
        position += positionOffset - 1;
        const localY = position & 0x3f;
        const localX = (position >> 6) & 0x3f;
        const height = (position >> 12) & 0x3;
        const attributes = buf.readUnsignedByte();
        const type = attributes >> 2;
        const orientation = attributes & 0x3;
        loc.locations.push(new Location(id, type, orientation, new Position(localX, localY, height)));
      }
    }
  }
}
