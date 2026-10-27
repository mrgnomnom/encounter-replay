// Ported from RuneLite's cache library (net.runelite.cache.definitions.ObjectDefinition and loaders.ObjectLoader, BSD-2-Clause, see LICENSE in src/cache/store).
// The Java fields are private behind Lombok getters: here they're public, with the getters alongside. The two
// booleans whose own names start with "is" (isHollow, isRotated) can't have a same-named getter, so read the field.
import { InputStream, type ParamValue } from "../store/input";
import { toShort } from "./casts";
import { EntityOpsDefinition, EntityOpsLoader } from "./entityOps";

export class ObjectDefinition {
  id = 0;
  retextureToFind?: number[];
  decorDisplacement = 16;
  isHollow = false;
  name = "null";
  objectModels?: number[];
  objectTypes?: number[];
  fullRecolor = -1;
  recolorToFind?: number[];
  mapAreaId = -1;
  textureToReplace?: number[];
  sizeX = 1;
  sizeY = 1;
  ambientSoundDistance = 0;
  ambientSoundIds?: number[];
  ambientSoundRetain = 0;
  offsetX = 0;
  mergeNormals = false;
  wallOrDoor = -1;
  animationID = -1;
  varbitID = -1;
  ambient = 0;
  contrast = 0;
  ops = new EntityOpsDefinition();
  interactType = 2;
  mapSceneID = -1;
  blockingMask = 0;
  recolorToReplace?: number[];
  shadow = true;
  modelSizeX = 128;
  modelSizeHeight = 128;
  modelSizeY = 128;
  objectID = 0;
  offsetHeight = 0;
  offsetY = 0;
  obstructsGround = false;
  contouredGround = -1;
  supportsItems = -1;
  raise = 0;
  configChangeDest?: number[];
  category = 0;
  isRotated = false;
  varpID = -1;
  ambientSoundId = -1;
  modelClipped = false;
  soundDistanceFadeCurve = 0;
  soundFadeInDuration = 300;
  soundFadeOutDuration = 300;
  soundFadeInCurve = 0;
  soundFadeOutCurve = 0;
  soundVisibility = 2;
  ambientSoundChangeTicksMin = 0;
  ambientSoundChangeTicksMax = 0;
  blocksProjectile = true;
  randomizeAnimStart = false;
  deferAnimChange = false;
  unknown1 = false;
  params?: Map<number, ParamValue>;

  getId(): number { return this.id; }
  getRetextureToFind(): number[] | undefined { return this.retextureToFind; }
  getDecorDisplacement(): number { return this.decorDisplacement; }
  getName(): string { return this.name; }
  getObjectModels(): number[] | undefined { return this.objectModels; }
  getObjectTypes(): number[] | undefined { return this.objectTypes; }
  getFullRecolor(): number { return this.fullRecolor; }
  getRecolorToFind(): number[] | undefined { return this.recolorToFind; }
  getMapAreaId(): number { return this.mapAreaId; }
  getTextureToReplace(): number[] | undefined { return this.textureToReplace; }
  getSizeX(): number { return this.sizeX; }
  getSizeY(): number { return this.sizeY; }
  getAmbientSoundDistance(): number { return this.ambientSoundDistance; }
  getAmbientSoundIds(): number[] | undefined { return this.ambientSoundIds; }
  getAmbientSoundRetain(): number { return this.ambientSoundRetain; }
  getOffsetX(): number { return this.offsetX; }
  isMergeNormals(): boolean { return this.mergeNormals; }
  getWallOrDoor(): number { return this.wallOrDoor; }
  getAnimationID(): number { return this.animationID; }
  getVarbitID(): number { return this.varbitID; }
  getAmbient(): number { return this.ambient; }
  getContrast(): number { return this.contrast; }
  getOps(): EntityOpsDefinition { return this.ops; }
  getInteractType(): number { return this.interactType; }
  getMapSceneID(): number { return this.mapSceneID; }
  getBlockingMask(): number { return this.blockingMask; }
  getRecolorToReplace(): number[] | undefined { return this.recolorToReplace; }
  isShadow(): boolean { return this.shadow; }
  getModelSizeX(): number { return this.modelSizeX; }
  getModelSizeHeight(): number { return this.modelSizeHeight; }
  getModelSizeY(): number { return this.modelSizeY; }
  getObjectID(): number { return this.objectID; }
  getOffsetHeight(): number { return this.offsetHeight; }
  getOffsetY(): number { return this.offsetY; }
  isObstructsGround(): boolean { return this.obstructsGround; }
  getContouredGround(): number { return this.contouredGround; }
  getSupportsItems(): number { return this.supportsItems; }
  getRaise(): number { return this.raise; }
  getConfigChangeDest(): number[] | undefined { return this.configChangeDest; }
  getCategory(): number { return this.category; }
  getVarpID(): number { return this.varpID; }
  getAmbientSoundId(): number { return this.ambientSoundId; }
  isModelClipped(): boolean { return this.modelClipped; }
  getSoundDistanceFadeCurve(): number { return this.soundDistanceFadeCurve; }
  getSoundFadeInDuration(): number { return this.soundFadeInDuration; }
  getSoundFadeOutDuration(): number { return this.soundFadeOutDuration; }
  getSoundFadeInCurve(): number { return this.soundFadeInCurve; }
  getSoundFadeOutCurve(): number { return this.soundFadeOutCurve; }
  getSoundVisibility(): number { return this.soundVisibility; }
  getAmbientSoundChangeTicksMin(): number { return this.ambientSoundChangeTicksMin; }
  getAmbientSoundChangeTicksMax(): number { return this.ambientSoundChangeTicksMax; }
  isBlocksProjectile(): boolean { return this.blocksProjectile; }
  isRandomizeAnimStart(): boolean { return this.randomizeAnimStart; }
  isDeferAnimChange(): boolean { return this.deferAnimChange; }
  isUnknown1(): boolean { return this.unknown1; }
  getParams(): Map<number, ParamValue> | undefined { return this.params; }
}

export class ObjectLoader {
  static readonly REV_220_OBJ_ARCHIVE_REV = 1673;

  private rev220SoundData = true;
  private entityOpsLoader = new EntityOpsLoader();

  configureForRevision(rev: number): this {
    this.rev220SoundData = rev >= ObjectLoader.REV_220_OBJ_ARCHIVE_REV;
    return this;
  }

  isRev220SoundData(): boolean { return this.rev220SoundData; }
  setRev220SoundData(v: boolean): this { this.rev220SoundData = v; return this; }

  load(id: number, b: Uint8Array): ObjectDefinition {
    const def = new ObjectDefinition();
    const is = new InputStream(b);
    def.id = id;
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      this.processOp(opcode, def, is);
    }
    this.post(def);
    return def;
  }

  private processOp(opcode: number, def: ObjectDefinition, is: InputStream): void {
    if (opcode === 1 || opcode === 6) {
      // 6 is 1 with int model ids
      const length = is.readUnsignedByte();
      if (length > 0) {
        const objectTypes = new Array<number>(length);
        const objectModels = new Array<number>(length);
        for (let index = 0; index < length; ++index) {
          objectModels[index] = opcode === 1 ? is.readUnsignedShort() : is.readInt();
          objectTypes[index] = is.readUnsignedByte();
        }
        def.objectTypes = objectTypes;
        def.objectModels = objectModels;
      }
    } else if (opcode === 2) {
      def.name = is.readString();
    } else if (opcode === 5 || opcode === 7) {
      const length = is.readUnsignedByte();
      if (length > 0) {
        def.objectTypes = undefined;
        const objectModels = new Array<number>(length);
        for (let index = 0; index < length; ++index) objectModels[index] = opcode === 5 ? is.readUnsignedShort() : is.readInt();
        def.objectModels = objectModels;
      }
    } else if (opcode === 14) {
      def.sizeX = is.readUnsignedByte();
    } else if (opcode === 15) {
      def.sizeY = is.readUnsignedByte();
    } else if (opcode === 17) {
      def.interactType = 0;
      def.blocksProjectile = false;
    } else if (opcode === 18) {
      def.blocksProjectile = false;
    } else if (opcode === 19) {
      def.wallOrDoor = is.readUnsignedByte();
    } else if (opcode === 21) {
      def.contouredGround = 0;
    } else if (opcode === 22) {
      def.mergeNormals = true;
    } else if (opcode === 23) {
      def.modelClipped = true;
    } else if (opcode === 24) {
      def.animationID = is.readUnsignedShort();
      if (def.animationID === 0xffff) def.animationID = -1;
    } else if (opcode === 27) {
      def.interactType = 1;
    } else if (opcode === 28) {
      def.decorDisplacement = is.readUnsignedByte();
    } else if (opcode === 29) {
      def.ambient = is.readByte();
    } else if (opcode >= 30 && opcode < 35) {
      this.entityOpsLoader.decodeOp(def.ops, is, opcode - 30);
    } else if (opcode === 39) {
      def.contrast = is.readByte() * 25;
    } else if (opcode === 40) {
      const length = is.readUnsignedByte();
      const recolorToFind = new Array<number>(length);
      const recolorToReplace = new Array<number>(length);
      for (let index = 0; index < length; ++index) {
        recolorToFind[index] = is.readShort();
        recolorToReplace[index] = is.readShort();
      }
      def.recolorToFind = recolorToFind;
      def.recolorToReplace = recolorToReplace;
    } else if (opcode === 41) {
      const length = is.readUnsignedByte();
      const retextureToFind = new Array<number>(length);
      const textureToReplace = new Array<number>(length);
      for (let index = 0; index < length; ++index) {
        retextureToFind[index] = is.readShort();
        textureToReplace[index] = is.readShort();
      }
      def.retextureToFind = retextureToFind;
      def.textureToReplace = textureToReplace;
    } else if (opcode === 42) {
      def.fullRecolor = toShort(is.readUnsignedShort());
    } else if (opcode === 61) {
      def.category = is.readUnsignedShort();
    } else if (opcode === 62) {
      def.isRotated = true;
    } else if (opcode === 64) {
      def.shadow = false;
    } else if (opcode === 65) {
      def.modelSizeX = is.readUnsignedShort();
    } else if (opcode === 66) {
      def.modelSizeHeight = is.readUnsignedShort();
    } else if (opcode === 67) {
      def.modelSizeY = is.readUnsignedShort();
    } else if (opcode === 68) {
      def.mapSceneID = is.readUnsignedShort();
    } else if (opcode === 69) {
      def.blockingMask = is.readByte();
    } else if (opcode === 70) {
      // Stored unsigned; the client (and the exporter) read the offsets as (short)
      def.offsetX = is.readUnsignedShort();
    } else if (opcode === 71) {
      def.offsetHeight = is.readUnsignedShort();
    } else if (opcode === 72) {
      def.offsetY = is.readUnsignedShort();
    } else if (opcode === 73) {
      def.obstructsGround = true;
    } else if (opcode === 74) {
      def.isHollow = true;
    } else if (opcode === 75) {
      def.supportsItems = is.readUnsignedByte();
    } else if (opcode === 77 || opcode === 92) {
      let varpID = is.readUnsignedShort();
      if (varpID === 0xffff) varpID = -1;
      def.varbitID = varpID;
      let configId = is.readUnsignedShort();
      if (configId === 0xffff) configId = -1;
      def.varpID = configId;
      let last = -1;
      if (opcode === 92) {
        last = is.readUnsignedShort();
        if (last === 0xffff) last = -1;
      }
      const length = is.readUnsignedByte();
      const configChangeDest = new Array<number>(length + 2).fill(0);
      for (let index = 0; index <= length; ++index) {
        configChangeDest[index] = is.readUnsignedShort();
        if (configChangeDest[index] === 0xffff) configChangeDest[index] = -1;
      }
      configChangeDest[length + 1] = last;
      def.configChangeDest = configChangeDest;
    } else if (opcode === 78) {
      def.ambientSoundId = is.readUnsignedShort();
      def.ambientSoundDistance = is.readUnsignedByte();
      if (this.rev220SoundData) def.ambientSoundRetain = is.readUnsignedByte();
    } else if (opcode === 79) {
      def.ambientSoundChangeTicksMin = is.readUnsignedShort();
      def.ambientSoundChangeTicksMax = is.readUnsignedShort();
      def.ambientSoundDistance = is.readUnsignedByte();
      if (this.rev220SoundData) def.ambientSoundRetain = is.readUnsignedByte();
      const length = is.readUnsignedByte();
      const ambientSoundIds = new Array<number>(length);
      for (let index = 0; index < length; ++index) ambientSoundIds[index] = is.readUnsignedShort();
      def.ambientSoundIds = ambientSoundIds;
    } else if (opcode === 81) {
      def.contouredGround = is.readUnsignedByte() * 256;
    } else if (opcode === 82) {
      def.mapAreaId = is.readUnsignedShort();
    } else if (opcode === 89) {
      def.randomizeAnimStart = true;
    } else if (opcode === 90) {
      def.deferAnimChange = true;
    } else if (opcode === 91) {
      def.soundDistanceFadeCurve = is.readUnsignedByte();
    } else if (opcode === 93) {
      def.soundFadeInCurve = is.readUnsignedByte();
      def.soundFadeInDuration = is.readUnsignedShort();
      def.soundFadeOutCurve = is.readUnsignedByte();
      def.soundFadeOutDuration = is.readUnsignedShort();
    } else if (opcode === 94) {
      def.unknown1 = true;
    } else if (opcode === 95) {
      def.soundVisibility = is.readUnsignedByte();
    } else if (opcode === 96) {
      def.raise = is.readUnsignedByte();
    } else if (opcode === 100) {
      this.entityOpsLoader.decodeSubOp(def.ops, is);
    } else if (opcode === 101) {
      this.entityOpsLoader.decodeConditionalOp(def.ops, is);
    } else if (opcode === 102) {
      this.entityOpsLoader.decodeConditionalSubOp(def.ops, is);
    } else if (opcode === 249) {
      def.params = is.readParams();
    } else {
      console.warn(`Unrecognized object opcode ${opcode}`);
    }
  }

  private post(def: ObjectDefinition): void {
    if (def.wallOrDoor === -1) {
      def.wallOrDoor = 0;
      if (def.objectModels !== undefined && (def.objectTypes === undefined || def.objectTypes[0] === 10)) def.wallOrDoor = 1;
      if (def.ops.ops.some((op) => op !== undefined && op.text !== undefined)) def.wallOrDoor = 1;
    }
    if (def.supportsItems === -1) def.supportsItems = def.interactType !== 0 ? 1 : 0;
  }
}
