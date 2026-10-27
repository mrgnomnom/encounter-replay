// Ported from RuneLite's cache library (net.runelite.cache.definitions.ItemDefinition and loaders.ItemLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream, type ParamValue } from "../store/input";
import { toShort } from "./casts";
import { EntityOpsDefinition, EntityOpsLoader } from "./entityOps";

export class ItemDefinition {
  name = "null";
  examine?: string;
  unknown1?: string;
  resizeX = 128;
  resizeY = 128;
  resizeZ = 128;
  xan2d = 0;
  yan2d = 0;
  zan2d = 0;
  cost = 1;
  stackable = 0;
  inventoryModel = 0;
  tradeable = true;
  geTradeable = false;
  bronzeman = false;
  wearPos1 = -1;
  wearPos2 = -1;
  wearPos3 = -1;
  members = false;
  fullRecolor = -1;
  colorFind?: number[];
  colorReplace?: number[];
  textureFind?: number[];
  textureReplace?: number[];
  zoom2d = 2000;
  xOffset2d = 0;
  yOffset2d = 0;
  ambient = 0;
  contrast = 0;
  countCo?: number[];
  countObj?: number[];
  groundOps = new EntityOpsDefinition().setOp(2, "Take");
  interfaceOptions: (string | undefined)[] = [undefined, undefined, undefined, undefined, "Drop"];
  subops?: ((string | undefined)[] | undefined)[];
  maleModel0 = -1;
  maleModel1 = -1;
  maleModel2 = -1;
  maleOffset = 0;
  maleHeadModel = -1;
  maleHeadModel2 = -1;
  femaleModel0 = -1;
  femaleModel1 = -1;
  femaleModel2 = -1;
  femaleOffset = 0;
  femaleHeadModel = -1;
  femaleHeadModel2 = -1;
  holdingWhitelist?: number[];
  category = 0;
  notedID = -1;
  notedTemplate = -1;
  team = 0;
  weight = 0;
  shiftClickDropIndex = -2;
  boughtId = -1;
  boughtTemplateId = -1;
  placeholderId = -1;
  placeholderTemplateId = -1;
  params?: Map<number, ParamValue>;

  constructor(public readonly id: number) {}

  getId(): number { return this.id; }

  linkNote(notedItem: ItemDefinition, unnotedItem: ItemDefinition): void {
    this.inventoryModel = notedItem.inventoryModel;
    this.zoom2d = notedItem.zoom2d;
    this.xan2d = notedItem.xan2d;
    this.yan2d = notedItem.yan2d;
    this.zan2d = notedItem.zan2d;
    this.xOffset2d = notedItem.xOffset2d;
    this.yOffset2d = notedItem.yOffset2d;
    this.colorFind = notedItem.colorFind;
    this.colorReplace = notedItem.colorReplace;
    this.textureFind = notedItem.textureFind;
    this.textureReplace = notedItem.textureReplace;
    this.name = unnotedItem.name;
    this.members = unnotedItem.members;
    this.cost = unnotedItem.cost;
    this.stackable = 1;
  }

  linkBought(var1: ItemDefinition, var2: ItemDefinition): void {
    this.inventoryModel = var1.inventoryModel;
    this.zoom2d = var1.zoom2d;
    this.xan2d = var1.xan2d;
    this.yan2d = var1.yan2d;
    this.zan2d = var1.zan2d;
    this.xOffset2d = var1.xOffset2d;
    this.yOffset2d = var1.yOffset2d;
    this.colorFind = var2.colorFind;
    this.colorReplace = var2.colorReplace;
    this.textureFind = var2.textureFind;
    this.textureReplace = var2.textureReplace;
    this.name = var2.name;
    this.members = var2.members;
    this.stackable = var2.stackable;
    this.maleModel0 = var2.maleModel0;
    this.maleModel1 = var2.maleModel1;
    this.maleModel2 = var2.maleModel2;
    this.femaleModel0 = var2.femaleModel0;
    this.femaleModel1 = var2.femaleModel1;
    this.femaleModel2 = var2.femaleModel2;
    this.maleHeadModel = var2.maleHeadModel;
    this.maleHeadModel2 = var2.maleHeadModel2;
    this.femaleHeadModel = var2.femaleHeadModel;
    this.femaleHeadModel2 = var2.femaleHeadModel2;
    this.team = var2.team;
    this.groundOps = var2.groundOps;
    this.interfaceOptions = new Array(5).fill(undefined);
    if (var2.interfaceOptions !== undefined) {
      for (let var3 = 0; var3 < 4; ++var3) this.interfaceOptions[var3] = var2.interfaceOptions[var3];
    }
    this.interfaceOptions[4] = "Discard";
    this.cost = 0;
  }

  linkPlaceholder(var1: ItemDefinition, var2: ItemDefinition): void {
    this.inventoryModel = var1.inventoryModel;
    this.zoom2d = var1.zoom2d;
    this.xan2d = var1.xan2d;
    this.yan2d = var1.yan2d;
    this.zan2d = var1.zan2d;
    this.xOffset2d = var1.xOffset2d;
    this.yOffset2d = var1.yOffset2d;
    this.colorFind = var1.colorFind;
    this.colorReplace = var1.colorReplace;
    this.textureFind = var1.textureFind;
    this.textureReplace = var1.textureReplace;
    this.stackable = var1.stackable;
    this.name = var2.name;
    this.cost = 0;
    this.members = false;
    this.tradeable = this.geTradeable = false;
  }
}

export class ItemLoader {
  private entityOpsLoader = new EntityOpsLoader();

  load(id: number, b: Uint8Array): ItemDefinition {
    const def = new ItemDefinition(id);
    const is = new InputStream(b);
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      this.decodeValues(opcode, def, is);
    }
    this.post(def);
    return def;
  }

  private decodeValues(opcode: number, def: ItemDefinition, stream: InputStream): void {
    if (opcode === 1) {
      def.inventoryModel = stream.readUnsignedShort();
    } else if (opcode === 2) {
      def.name = stream.readString();
    } else if (opcode === 3) {
      def.examine = stream.readString();
    } else if (opcode === 4) {
      def.zoom2d = stream.readUnsignedShort();
    } else if (opcode === 5) {
      def.xan2d = stream.readUnsignedShort();
    } else if (opcode === 6) {
      def.yan2d = stream.readUnsignedShort();
    } else if (opcode === 7) {
      def.xOffset2d = stream.readUnsignedShort();
      if (def.xOffset2d > 32767) def.xOffset2d -= 65536;
    } else if (opcode === 8) {
      def.yOffset2d = stream.readUnsignedShort();
      if (def.yOffset2d > 32767) def.yOffset2d -= 65536;
    } else if (opcode === 9) {
      def.unknown1 = stream.readString();
    } else if (opcode === 11) {
      def.stackable = 1;
    } else if (opcode === 12) {
      def.cost = stream.readInt();
    } else if (opcode === 13) {
      def.wearPos1 = stream.readByte();
    } else if (opcode === 14) {
      def.wearPos2 = stream.readByte();
    } else if (opcode === 15) {
      def.tradeable = false;
    } else if (opcode === 16) {
      def.members = true;
    } else if (opcode === 23) {
      def.maleModel0 = stream.readUnsignedShort();
      def.maleOffset = stream.readUnsignedByte();
    } else if (opcode === 24) {
      def.maleModel1 = stream.readUnsignedShort();
    } else if (opcode === 25) {
      def.femaleModel0 = stream.readUnsignedShort();
      def.femaleOffset = stream.readUnsignedByte();
    } else if (opcode === 26) {
      def.femaleModel1 = stream.readUnsignedShort();
    } else if (opcode === 27) {
      def.wearPos3 = stream.readByte();
    } else if (opcode >= 30 && opcode < 35) {
      this.entityOpsLoader.decodeOp(def.groundOps, stream, opcode - 30);
    } else if (opcode >= 35 && opcode < 40) {
      def.interfaceOptions[opcode - 35] = stream.readString();
    } else if (opcode === 40) {
      const var5 = stream.readUnsignedByte();
      def.colorFind = new Array(var5);
      def.colorReplace = new Array(var5);
      for (let var4 = 0; var4 < var5; ++var4) {
        def.colorFind[var4] = toShort(stream.readUnsignedShort());
        def.colorReplace[var4] = toShort(stream.readUnsignedShort());
      }
    } else if (opcode === 41) {
      const var5 = stream.readUnsignedByte();
      def.textureFind = new Array(var5);
      def.textureReplace = new Array(var5);
      for (let var4 = 0; var4 < var5; ++var4) {
        def.textureFind[var4] = toShort(stream.readUnsignedShort());
        def.textureReplace[var4] = toShort(stream.readUnsignedShort());
      }
    } else if (opcode === 42) {
      def.shiftClickDropIndex = stream.readByte();
    } else if (opcode === 43) {
      const opId = stream.readUnsignedByte();
      if (def.subops === undefined) def.subops = new Array(5).fill(undefined);
      const valid = opId >= 0 && opId < 5;
      if (valid && def.subops[opId] === undefined) def.subops[opId] = new Array(20).fill(undefined);
      for (;;) {
        const subopId = stream.readUnsignedByte() - 1;
        if (subopId === -1) break;
        const op = stream.readString();
        if (valid && subopId >= 0 && subopId < 20) def.subops[opId]![subopId] = op;
      }
    } else if (opcode === 44) {
      def.inventoryModel = stream.readInt();
    } else if (opcode === 45) {
      def.maleModel0 = stream.readInt();
      def.maleOffset = stream.readUnsignedByte();
    } else if (opcode === 46) {
      def.maleModel1 = stream.readInt();
    } else if (opcode === 47) {
      def.maleModel2 = stream.readInt();
    } else if (opcode === 48) {
      def.femaleModel0 = stream.readInt();
      def.femaleOffset = stream.readUnsignedByte();
    } else if (opcode === 49) {
      def.femaleModel1 = stream.readInt();
    } else if (opcode === 50) {
      def.femaleModel2 = stream.readInt();
    } else if (opcode === 51) {
      def.maleHeadModel = stream.readInt();
    } else if (opcode === 52) {
      def.maleHeadModel2 = stream.readInt();
    } else if (opcode === 53) {
      def.femaleHeadModel = stream.readInt();
    } else if (opcode === 54) {
      def.femaleHeadModel2 = stream.readInt();
    } else if (opcode === 65) {
      def.geTradeable = true;
    } else if (opcode === 75) {
      def.weight = stream.readShort();
    } else if (opcode === 78) {
      def.maleModel2 = stream.readUnsignedShort();
    } else if (opcode === 79) {
      def.femaleModel2 = stream.readUnsignedShort();
    } else if (opcode === 90) {
      def.maleHeadModel = stream.readUnsignedShort();
    } else if (opcode === 91) {
      def.femaleHeadModel = stream.readUnsignedShort();
    } else if (opcode === 92) {
      def.maleHeadModel2 = stream.readUnsignedShort();
    } else if (opcode === 93) {
      def.femaleHeadModel2 = stream.readUnsignedShort();
    } else if (opcode === 94) {
      def.category = stream.readUnsignedShort();
    } else if (opcode === 95) {
      def.zan2d = stream.readUnsignedShort();
    } else if (opcode === 97) {
      def.notedID = stream.readUnsignedShort();
    } else if (opcode === 98) {
      def.notedTemplate = stream.readUnsignedShort();
    } else if (opcode === 99) {
      def.fullRecolor = toShort(stream.readUnsignedShort());
    } else if (opcode >= 100 && opcode < 110) {
      if (def.countObj === undefined) {
        def.countObj = new Array(10).fill(0);
        def.countCo = new Array(10).fill(0);
      }
      def.countObj[opcode - 100] = stream.readUnsignedShort();
      def.countCo![opcode - 100] = stream.readUnsignedShort();
    } else if (opcode === 110) {
      def.resizeX = stream.readUnsignedShort();
    } else if (opcode === 111) {
      def.resizeY = stream.readUnsignedShort();
    } else if (opcode === 112) {
      def.resizeZ = stream.readUnsignedShort();
    } else if (opcode === 113) {
      def.ambient = stream.readByte();
    } else if (opcode === 114) {
      def.contrast = stream.readByte();
    } else if (opcode === 115) {
      def.team = stream.readUnsignedByte();
    } else if (opcode === 139) {
      def.boughtId = stream.readUnsignedShort();
    } else if (opcode === 140) {
      def.boughtTemplateId = stream.readUnsignedShort();
    } else if (opcode === 148) {
      def.placeholderId = stream.readUnsignedShort();
    } else if (opcode === 149) {
      def.placeholderTemplateId = stream.readUnsignedShort();
    } else if (opcode === 160) {
      def.stackable = 2;
    } else if (opcode === 161) {
      const len = stream.readUnsignedShort();
      def.holdingWhitelist = new Array(len);
      for (let i = 0; i < len; i++) def.holdingWhitelist[i] = stream.readUnsignedShort();
    } else if (opcode === 200) {
      this.entityOpsLoader.decodeSubOp(def.groundOps, stream);
    } else if (opcode === 201) {
      this.entityOpsLoader.decodeConditionalOp(def.groundOps, stream);
    } else if (opcode === 202) {
      this.entityOpsLoader.decodeConditionalSubOp(def.groundOps, stream);
    } else if (opcode === 249) {
      def.params = stream.readParams();
    } else if (opcode === 251) {
      def.bronzeman = true;
    } else {
      console.warn(`Unrecognized item opcode ${opcode}`);
    }
  }

  private post(def: ItemDefinition): void {
    if (def.stackable === 1) def.weight = 0;
  }
}
