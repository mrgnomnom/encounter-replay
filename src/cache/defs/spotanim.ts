// Ported from RuneLite's cache library (net.runelite.cache.definitions.SpotAnimDefinition and loaders.SpotAnimLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";
import { toShort } from "./casts";

export class SpotAnimDefinition {
  debugName?: string;
  /** Spelled as in the Java */
  rotaton = 0;
  textureToReplace?: number[];
  id = 0;
  textureToFind?: number[];
  resizeY = 128;
  animationId = -1;
  recolorToFind?: number[];
  recolorToReplace?: number[];
  fullRecolor = -1;
  resizeX = 128;
  modelId = 0;
  ambient = 0;
  contrast = 0;
  clickable = true;

  getId(): number { return this.id; }
}

export class SpotAnimLoader {
  load(id: number, b: Uint8Array): SpotAnimDefinition {
    const def = new SpotAnimDefinition();
    const is = new InputStream(b);
    def.id = id;
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      this.decodeValues(opcode, def, is);
    }
    return def;
  }

  private decodeValues(opcode: number, def: SpotAnimDefinition, stream: InputStream): void {
    if (opcode === 1) {
      def.modelId = stream.readUnsignedShort();
    } else if (opcode === 2) {
      def.animationId = stream.readUnsignedShort();
    } else if (opcode === 3) {
      def.modelId = stream.readInt();
    } else if (opcode === 4) {
      def.resizeX = stream.readUnsignedShort();
    } else if (opcode === 5) {
      def.resizeY = stream.readUnsignedShort();
    } else if (opcode === 6) {
      def.rotaton = stream.readUnsignedShort();
    } else if (opcode === 7) {
      def.ambient = stream.readUnsignedByte();
    } else if (opcode === 8) {
      def.contrast = stream.readUnsignedByte();
    } else if (opcode === 9) {
      def.debugName = stream.readString();
    } else if (opcode === 10) {
      def.clickable = false;
    } else if (opcode === 40) {
      const var3 = stream.readUnsignedByte();
      def.recolorToFind = new Array(var3);
      def.recolorToReplace = new Array(var3);
      for (let var4 = 0; var4 < var3; ++var4) {
        def.recolorToFind[var4] = toShort(stream.readUnsignedShort());
        def.recolorToReplace[var4] = toShort(stream.readUnsignedShort());
      }
    } else if (opcode === 41) {
      const var3 = stream.readUnsignedByte();
      def.textureToFind = new Array(var3);
      def.textureToReplace = new Array(var3);
      for (let var4 = 0; var4 < var3; ++var4) {
        def.textureToFind[var4] = toShort(stream.readUnsignedShort());
        def.textureToReplace[var4] = toShort(stream.readUnsignedShort());
      }
    } else if (opcode === 42) {
      def.fullRecolor = toShort(stream.readUnsignedShort());
    }
  }
}
