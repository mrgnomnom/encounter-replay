// Ported from RuneLite's cache library (net.runelite.cache.definitions.FramemapDefinition, FrameDefinition and loaders.FramemapLoader, FrameLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";

export class FramemapDefinition {
  id = 0;
  types!: number[];
  frameMaps!: number[][];
  length = 0;

  getId(): number { return this.id; }
}

export class FramemapLoader {
  load(id: number, b: Uint8Array): FramemapDefinition {
    const def = new FramemapDefinition();
    const inp = new InputStream(b);
    def.id = id;
    def.length = inp.readUnsignedByte();
    def.types = new Array(def.length);
    def.frameMaps = new Array(def.length);
    for (let i = 0; i < def.length; ++i) def.types[i] = inp.readUnsignedByte();
    for (let i = 0; i < def.length; ++i) def.frameMaps[i] = new Array(inp.readUnsignedByte()).fill(0);
    for (let i = 0; i < def.length; ++i) {
      for (let j = 0; j < def.frameMaps[i].length; ++j) def.frameMaps[i][j] = inp.readUnsignedByte();
    }
    return def;
  }
}

export class FrameDefinition {
  /** File id */
  id = 0;
  framemap!: FramemapDefinition;
  translator_x!: number[];
  translator_y!: number[];
  translator_z!: number[];
  translatorCount = -1;
  indexFrameIds!: number[];
  showing = false;

  getId(): number { return this.id; }
}

export class FrameLoader {
  load(framemap: FramemapDefinition, id: number, b: Uint8Array): FrameDefinition {
    const def = new FrameDefinition();
    const inp = new InputStream(b);
    const data = new InputStream(b);
    def.id = id;
    def.framemap = framemap;
    inp.readUnsignedShort(); // framemapArchiveIndex
    const length = inp.readUnsignedByte();
    data.skip(3 + length); // framemapArchiveIndex + length + data
    // Java's scratch arrays hold 500; a frame with more translators throws there, so it does here
    const indexFrameIds: number[] = [];
    const scratchTranslatorX: number[] = [];
    const scratchTranslatorY: number[] = [];
    const scratchTranslatorZ: number[] = [];
    const types = framemap.types;
    let lastI = -1;
    let index = 0;
    const put = (frameId: number, x: number, y: number, z: number) => {
      if (index >= 500) throw new RangeError("Frame has more than 500 translators");
      indexFrameIds[index] = frameId;
      scratchTranslatorX[index] = x;
      scratchTranslatorY[index] = y;
      scratchTranslatorZ[index] = z;
      ++index;
    };
    for (let i = 0; i < length; ++i) {
      const var9 = inp.readUnsignedByte();
      if (var9 <= 0) continue;
      if (i >= types.length) throw new RangeError(`Frame uses group ${i} of a ${types.length}-group framemap`);
      if (types[i] !== 0) {
        for (let var10 = i - 1; var10 > lastI; --var10) {
          if (types[var10] === 0) {
            put(var10, 0, 0, 0);
            break;
          }
        }
      }
      const var11 = types[i] === 3 ? 128 : 0;
      const x = (var9 & 1) !== 0 ? data.readShortSmart() : var11;
      const y = (var9 & 2) !== 0 ? data.readShortSmart() : var11;
      const z = (var9 & 4) !== 0 ? data.readShortSmart() : var11;
      put(i, x, y, z);
      lastI = i;
      if (types[i] === 5) def.showing = true;
    }
    if (data.getOffset() !== b.length) throw new Error("Frame data not fully read");
    def.translatorCount = index;
    def.indexFrameIds = indexFrameIds;
    def.translator_x = scratchTranslatorX;
    def.translator_y = scratchTranslatorY;
    def.translator_z = scratchTranslatorZ;
    return def;
  }
}
