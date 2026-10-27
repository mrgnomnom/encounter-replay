// Ported from RuneLite's cache library (net.runelite.cache.definitions.NpcDefinition and loaders.NpcLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream, type ParamValue } from "../store/input";
import { toShort } from "./casts";
import { EntityOpsDefinition, EntityOpsLoader } from "./entityOps";

export class NpcDefinition {
  name = "null";
  size = 1;
  models?: number[];
  chatheadModels?: number[];
  standingAnimation = -1;
  idleRotateLeftAnimation = -1;
  idleRotateRightAnimation = -1;
  walkingAnimation = -1;
  rotate180Animation = -1;
  rotateLeftAnimation = -1;
  rotateRightAnimation = -1;
  runAnimation = -1;
  runRotate180Animation = -1;
  runRotateLeftAnimation = -1;
  runRotateRightAnimation = -1;
  crawlAnimation = -1;
  crawlRotate180Animation = -1;
  crawlRotateLeftAnimation = -1;
  crawlRotateRightAnimation = -1;
  idleAnimRestart = false;
  recolorToFind?: number[];
  recolorToReplace?: number[];
  fullRecolor = -1;
  retextureToFind?: number[];
  retextureToReplace?: number[];
  ops = new EntityOpsDefinition();
  isMinimapVisible = true;
  combatLevel = -1;
  widthScale = 128;
  heightScale = 128;
  renderPriority = 0;
  ambient = 0;
  contrast = 0;
  headIconArchiveIds?: number[];
  headIconSpriteIndex?: number[];
  rotationSpeed = 32;
  configs?: number[];
  varbitId = -1;
  varpIndex = -1;
  isInteractable = true;
  rotationFlag = true;
  isFollower = false;
  lowPriorityFollowerOps = false;
  params?: Map<number, ParamValue>;
  category = 0;
  height = -1;
  stats: number[] = [1, 1, 1, 1, 1, 1];
  footprintSize = -1;
  canHideForOverlap = false;
  overlapTintHSL = 39188;
  unknown1 = false;
  zbuf = true;

  constructor(public readonly id: number) {}

  getId(): number { return this.id; }
}

export class NpcLoader {
  static readonly REV_210_NPC_ARCHIVE_REV = 1493;

  private defaultHeadIconArchive = -1;
  private rev210HeadIcons = true;
  private rev233 = true;
  private entityOpsLoader = new EntityOpsLoader();

  configureForRevision(rev: number): this {
    this.rev210HeadIcons = rev >= NpcLoader.REV_210_NPC_ARCHIVE_REV;
    return this;
  }

  getDefaultHeadIconArchive(): number { return this.defaultHeadIconArchive; }
  setDefaultHeadIconArchive(v: number): this { this.defaultHeadIconArchive = v; return this; }
  isRev210HeadIcons(): boolean { return this.rev210HeadIcons; }
  setRev210HeadIcons(v: boolean): this { this.rev210HeadIcons = v; return this; }
  isRev233(): boolean { return this.rev233; }
  setRev233(v: boolean): this { this.rev233 = v; return this; }

  load(id: number, b: Uint8Array): NpcDefinition {
    const def = new NpcDefinition(id);
    const is = new InputStream(b);
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      this.decodeValues(opcode, def, is);
    }
    this.post(def);
    return def;
  }

  private post(def: NpcDefinition): void {
    if (def.footprintSize === -1) {
      // (int) (0.4F * (float) (size * 128)), in float arithmetic
      def.footprintSize = Math.trunc(Math.fround(Math.fround(0.4) * Math.fround(def.size * 128)));
    }
  }

  private decodeValues(opcode: number, def: NpcDefinition, stream: InputStream): void {
    let length: number;
    if (opcode === 1) {
      length = stream.readUnsignedByte();
      def.models = new Array(length);
      for (let index = 0; index < length; ++index) def.models[index] = stream.readUnsignedShort();
    } else if (opcode === 2) {
      def.name = stream.readString();
    } else if (opcode === 12) {
      def.size = stream.readUnsignedByte();
    } else if (opcode === 13) {
      def.standingAnimation = stream.readUnsignedShort();
    } else if (opcode === 14) {
      def.walkingAnimation = stream.readUnsignedShort();
    } else if (opcode === 15) {
      def.idleRotateLeftAnimation = stream.readUnsignedShort();
    } else if (opcode === 16) {
      def.idleRotateRightAnimation = stream.readUnsignedShort();
    } else if (opcode === 17) {
      def.walkingAnimation = stream.readUnsignedShort();
      def.rotate180Animation = stream.readUnsignedShort();
      def.rotateLeftAnimation = stream.readUnsignedShort();
      def.rotateRightAnimation = stream.readUnsignedShort();
    } else if (opcode === 18) {
      def.category = stream.readUnsignedShort();
    } else if (opcode >= 30 && opcode < 35) {
      this.entityOpsLoader.decodeOp(def.ops, stream, opcode - 30);
    } else if (opcode === 40) {
      length = stream.readUnsignedByte();
      def.recolorToFind = new Array(length);
      def.recolorToReplace = new Array(length);
      for (let index = 0; index < length; ++index) {
        def.recolorToFind[index] = toShort(stream.readUnsignedShort());
        def.recolorToReplace[index] = toShort(stream.readUnsignedShort());
      }
    } else if (opcode === 41) {
      length = stream.readUnsignedByte();
      def.retextureToFind = new Array(length);
      def.retextureToReplace = new Array(length);
      for (let index = 0; index < length; ++index) {
        def.retextureToFind[index] = toShort(stream.readUnsignedShort());
        def.retextureToReplace[index] = toShort(stream.readUnsignedShort());
      }
    } else if (opcode === 42) {
      def.fullRecolor = toShort(stream.readUnsignedShort());
    } else if (opcode === 60) {
      length = stream.readUnsignedByte();
      def.chatheadModels = new Array(length);
      for (let index = 0; index < length; ++index) def.chatheadModels[index] = stream.readUnsignedShort();
    } else if (opcode === 61) {
      length = stream.readUnsignedByte();
      def.models = new Array(length);
      for (let index = 0; index < length; ++index) def.models[index] = stream.readInt();
    } else if (opcode === 62) {
      length = stream.readUnsignedByte();
      def.chatheadModels = new Array(length);
      for (let index = 0; index < length; ++index) def.chatheadModels[index] = stream.readInt();
    } else if (opcode >= 74 && opcode <= 79) {
      def.stats[opcode - 74] = stream.readUnsignedShort();
    } else if (opcode === 93) {
      def.isMinimapVisible = false;
    } else if (opcode === 95) {
      def.combatLevel = stream.readUnsignedShort();
    } else if (opcode === 97) {
      def.widthScale = stream.readUnsignedShort();
    } else if (opcode === 98) {
      def.heightScale = stream.readUnsignedShort();
    } else if (opcode === 99) {
      def.renderPriority = 1;
    } else if (opcode === 100) {
      def.ambient = stream.readByte();
    } else if (opcode === 101) {
      def.contrast = stream.readByte();
    } else if (opcode === 102) {
      if (!this.rev210HeadIcons) {
        def.headIconArchiveIds = [this.defaultHeadIconArchive];
        def.headIconSpriteIndex = [toShort(stream.readUnsignedShort())];
      } else {
        const bitfield = stream.readUnsignedByte();
        let len = 0;
        for (let v = bitfield; v !== 0; v >>= 1) ++len;
        def.headIconArchiveIds = new Array(len);
        def.headIconSpriteIndex = new Array(len);
        for (let i = 0; i < len; i++) {
          if ((bitfield & (1 << i)) === 0) {
            def.headIconArchiveIds[i] = -1;
            def.headIconSpriteIndex[i] = -1;
          } else {
            def.headIconArchiveIds[i] = stream.readBigSmart2();
            def.headIconSpriteIndex[i] = toShort(stream.readUnsignedShortSmartMinusOne());
          }
        }
      }
    } else if (opcode === 103) {
      def.rotationSpeed = stream.readUnsignedShort();
    } else if (opcode === 106) {
      def.varbitId = stream.readUnsignedShort();
      if (def.varbitId === 65535) def.varbitId = -1;
      def.varpIndex = stream.readUnsignedShort();
      if (def.varpIndex === 65535) def.varpIndex = -1;
      length = stream.readUnsignedByte();
      def.configs = new Array(length + 2).fill(0);
      for (let index = 0; index <= length; ++index) {
        def.configs[index] = stream.readUnsignedShort();
        if (def.configs[index] === 0xffff) def.configs[index] = -1;
      }
      def.configs[length + 1] = -1;
    } else if (opcode === 107) {
      def.isInteractable = false;
    } else if (opcode === 109) {
      def.rotationFlag = false;
    } else if (opcode === 111 && !this.rev233) {
      // removed in 220
      def.isFollower = true;
      def.lowPriorityFollowerOps = true;
    } else if (opcode === 111 && this.rev233) {
      def.renderPriority = 2;
    } else if (opcode === 114) {
      def.runAnimation = stream.readUnsignedShort();
    } else if (opcode === 115) {
      def.runAnimation = stream.readUnsignedShort();
      def.runRotate180Animation = stream.readUnsignedShort();
      def.runRotateLeftAnimation = stream.readUnsignedShort();
      def.runRotateRightAnimation = stream.readUnsignedShort();
    } else if (opcode === 116) {
      def.crawlAnimation = stream.readUnsignedShort();
    } else if (opcode === 117) {
      def.crawlAnimation = stream.readUnsignedShort();
      def.crawlRotate180Animation = stream.readUnsignedShort();
      def.crawlRotateLeftAnimation = stream.readUnsignedShort();
      def.crawlRotateRightAnimation = stream.readUnsignedShort();
    } else if (opcode === 118) {
      def.varbitId = stream.readUnsignedShort();
      if (def.varbitId === 65535) def.varbitId = -1;
      def.varpIndex = stream.readUnsignedShort();
      if (def.varpIndex === 65535) def.varpIndex = -1;
      let v = stream.readUnsignedShort();
      if (v === 0xffff) v = -1;
      length = stream.readUnsignedByte();
      def.configs = new Array(length + 2).fill(0);
      for (let index = 0; index <= length; ++index) {
        def.configs[index] = stream.readUnsignedShort();
        if (def.configs[index] === 0xffff) def.configs[index] = -1;
      }
      def.configs[length + 1] = v;
    } else if (opcode === 122) {
      def.isFollower = true;
    } else if (opcode === 123) {
      def.lowPriorityFollowerOps = true;
    } else if (opcode === 124) {
      def.height = stream.readUnsignedShort();
    } else if (opcode === 126) {
      def.footprintSize = stream.readUnsignedShort();
    } else if (opcode === 129) {
      def.unknown1 = true;
    } else if (opcode === 130) {
      def.idleAnimRestart = true;
    } else if (opcode === 145) {
      def.canHideForOverlap = true;
    } else if (opcode === 146) {
      def.overlapTintHSL = stream.readUnsignedShort();
    } else if (opcode === 147) {
      def.zbuf = false;
    } else if (opcode === 249) {
      def.params = stream.readParams();
    } else if (opcode === 251) {
      this.entityOpsLoader.decodeSubOp(def.ops, stream);
    } else if (opcode === 252) {
      this.entityOpsLoader.decodeConditionalOp(def.ops, stream);
    } else if (opcode === 253) {
      this.entityOpsLoader.decodeConditionalSubOp(def.ops, stream);
    } else {
      console.warn(`Unrecognized npc opcode ${opcode}`);
    }
  }
}
