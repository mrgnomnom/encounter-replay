// Ported from RuneLite's cache library (net.runelite.cache.definitions.KitDefinition and loaders.KitLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";

export class KitDefinition {
  recolorToReplace?: number[];
  recolorToFind?: number[];
  retextureToFind?: number[];
  retextureToReplace?: number[];
  bodyPartId = -1;
  models?: number[];
  chatheadModels: number[] = [-1, -1, -1, -1, -1];
  nonSelectable = false;

  constructor(private readonly id: number) {}

  getId(): number { return this.id; }
}

export class KitLoader {
  load(id: number, b: Uint8Array): KitDefinition {
    const def = new KitDefinition(id);
    const is = new InputStream(b);
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      if (opcode === 1) {
        def.bodyPartId = is.readUnsignedByte();
      } else if (opcode === 2) {
        const length = is.readUnsignedByte();
        def.models = new Array(length);
        for (let index = 0; index < length; ++index) def.models[index] = is.readUnsignedShort();
      } else if (opcode === 3) {
        def.nonSelectable = true;
      } else if (opcode === 5) {
        const length = is.readUnsignedByte();
        def.models = new Array(length);
        for (let index = 0; index < length; ++index) def.models[index] = is.readInt();
      } else if (opcode === 40) {
        const length = is.readUnsignedByte();
        def.recolorToFind = new Array(length);
        def.recolorToReplace = new Array(length);
        for (let index = 0; index < length; ++index) {
          def.recolorToFind[index] = is.readShort();
          def.recolorToReplace[index] = is.readShort();
        }
      } else if (opcode === 41) {
        const length = is.readUnsignedByte();
        def.retextureToFind = new Array(length);
        def.retextureToReplace = new Array(length);
        for (let index = 0; index < length; ++index) {
          def.retextureToFind[index] = is.readShort();
          def.retextureToReplace[index] = is.readShort();
        }
      } else if (opcode >= 60 && opcode < 70) {
        setChathead(def, opcode - 60, is.readUnsignedShort());
      } else if (opcode >= 70 && opcode < 80) {
        setChathead(def, opcode - 70, is.readInt());
      }
    }
    return def;
  }
}

/** chatheadModels has 5 slots and Java throws past them; so does this */
function setChathead(def: KitDefinition, index: number, model: number): void {
  if (index >= def.chatheadModels.length) throw new RangeError(`Kit chathead index ${index} out of bounds`);
  def.chatheadModels[index] = model;
}
