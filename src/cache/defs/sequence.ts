// Ported from RuneLite's cache library (net.runelite.cache.definitions.SequenceDefinition and loaders.SequenceLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";

/** SequenceDefinition.Sound */
export class Sound {
  constructor(
    readonly id: number,
    readonly loops: number,
    readonly location: number,
    readonly retain: number,
    readonly weight: number,
  ) {}

  getId(): number { return this.id; }
  getLoops(): number { return this.loops; }
  getLocation(): number { return this.location; }
  getRetain(): number { return this.retain; }
  getWeight(): number { return this.weight; }
}

export class SequenceDefinition {
  debugName?: string;
  /** Top 16 bits are FrameDefinition ids */
  frameIDs?: number[];
  chatFrameIds?: number[];
  frameLengths?: number[];
  frameStep = -1;
  verticalOffset = 0;
  interleaveLeave?: number[];
  stretches = false;
  forcedPriority = 5;
  leftHandItem = -1;
  rightHandItem = -1;
  maxLoops = 99;
  precedenceAnimating = -1;
  priority = -1;
  replyMode = 2;
  animMayaID = -1;
  /** A Guava ArrayListMultimap in the Java: each frame's sounds, in the order read; invalid sounds are undefined */
  frameSounds = new Map<number, (Sound | undefined)[]>();
  animMayaStart = 0;
  animMayaEnd = 0;
  animMayaMasks?: boolean[];
  soundsCrossWorldView = false;

  constructor(private readonly id: number) {}

  getId(): number { return this.id; }
}

export class SequenceLoader {
  static readonly REV_220_SEQ_ARCHIVE_REV = 1141;
  static readonly REV_226_SEQ_ARCHIVE_REV = 1268;

  private rev220FrameSounds = true;
  private rev226 = true;

  configureForRevision(rev: number): this {
    this.rev220FrameSounds = rev > SequenceLoader.REV_220_SEQ_ARCHIVE_REV;
    this.rev226 = rev > SequenceLoader.REV_226_SEQ_ARCHIVE_REV;
    return this;
  }

  isRev220FrameSounds(): boolean { return this.rev220FrameSounds; }
  setRev220FrameSounds(v: boolean): this { this.rev220FrameSounds = v; return this; }
  isRev226(): boolean { return this.rev226; }
  setRev226(v: boolean): this { this.rev226 = v; return this; }

  load(id: number, b: Uint8Array): SequenceDefinition {
    const def = new SequenceDefinition(id);
    const is = new InputStream(b);
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      this.decodeValues(opcode, def, is);
    }
    return def;
  }

  private decodeValues(opcode: number, def: SequenceDefinition, stream: InputStream): void {
    let var3: number;
    let var4: number;
    const rev226 = this.rev226;
    if (opcode === 1) {
      var3 = stream.readUnsignedShort();
      def.frameLengths = new Array(var3);
      for (var4 = 0; var4 < var3; ++var4) def.frameLengths[var4] = stream.readUnsignedShort();
      def.frameIDs = new Array(var3);
      for (var4 = 0; var4 < var3; ++var4) def.frameIDs[var4] = stream.readUnsignedShort();
      for (var4 = 0; var4 < var3; ++var4) def.frameIDs[var4] = (def.frameIDs[var4] + (stream.readUnsignedShort() << 16)) | 0;
    } else if (opcode === 2) {
      def.frameStep = stream.readUnsignedShort();
    } else if (opcode === 3) {
      var3 = stream.readUnsignedByte();
      def.interleaveLeave = new Array(1 + var3);
      for (var4 = 0; var4 < var3; ++var4) def.interleaveLeave[var4] = stream.readUnsignedByte();
      def.interleaveLeave[var3] = 9999999;
    } else if (opcode === 4) {
      def.stretches = true;
    } else if (opcode === 5) {
      def.forcedPriority = stream.readUnsignedByte();
    } else if (opcode === 6) {
      def.leftHandItem = stream.readUnsignedShort();
    } else if (opcode === 7) {
      def.rightHandItem = stream.readUnsignedShort();
    } else if (opcode === 8) {
      def.maxLoops = stream.readUnsignedByte();
    } else if (opcode === 9) {
      def.precedenceAnimating = stream.readUnsignedByte();
    } else if (opcode === 10) {
      def.priority = stream.readUnsignedByte();
    } else if (opcode === 11) {
      def.replyMode = stream.readUnsignedByte();
    } else if (opcode === 12) {
      var3 = stream.readUnsignedByte();
      def.chatFrameIds = new Array(var3);
      for (var4 = 0; var4 < var3; ++var4) def.chatFrameIds[var4] = stream.readUnsignedShort();
      for (var4 = 0; var4 < var3; ++var4) def.chatFrameIds[var4] = (def.chatFrameIds[var4] + (stream.readUnsignedShort() << 16)) | 0;
    } else if (opcode === 13 && !rev226) {
      var3 = stream.readUnsignedByte();
      for (var4 = 0; var4 < var3; ++var4) putSound(def, var4, this.readFrameSound(stream));
    } else if (opcode === (rev226 ? 13 : 14)) {
      def.animMayaID = stream.readInt();
    } else if (opcode === (rev226 ? 14 : 15)) {
      var3 = stream.readUnsignedShort();
      for (var4 = 0; var4 < var3; ++var4) {
        const frame = stream.readUnsignedShort();
        putSound(def, frame, this.readFrameSound(stream));
      }
    } else if (opcode === (rev226 ? 15 : 16)) {
      def.animMayaStart = stream.readUnsignedShort();
      def.animMayaEnd = stream.readUnsignedShort();
    } else if (opcode === 16) {
      def.verticalOffset = stream.readByte();
    } else if (opcode === 17) {
      def.animMayaMasks = new Array(256).fill(false);
      var3 = stream.readUnsignedByte();
      for (var4 = 0; var4 < var3; ++var4) def.animMayaMasks[stream.readUnsignedByte()] = true;
    } else if (opcode === 18) {
      def.debugName = stream.readString();
    } else if (opcode === 19) {
      def.soundsCrossWorldView = true;
    } else {
      console.warn(`Unrecognized sequence opcode ${opcode}`);
    }
  }

  private readFrameSound(stream: InputStream): Sound | undefined {
    let id: number;
    let loops: number;
    let location: number;
    let retain: number;
    let weight = -1;
    if (!this.rev220FrameSounds) {
      const bits = stream.read24BitInt();
      location = bits & 15;
      id = bits >> 8;
      loops = (bits >> 4) & 7;
      retain = 0;
    } else {
      id = stream.readUnsignedShort();
      if (this.rev226) weight = stream.readUnsignedByte();
      loops = stream.readUnsignedByte();
      location = stream.readUnsignedByte();
      retain = stream.readUnsignedByte();
    }
    return id >= 1 && loops >= 1 && location >= 0 && retain >= 0 ? new Sound(id, loops, location, retain, weight) : undefined;
  }
}

/** Multimap.put */
function putSound(def: SequenceDefinition, frame: number, sound: Sound | undefined): void {
  let list = def.frameSounds.get(frame);
  if (!list) def.frameSounds.set(frame, (list = []));
  list.push(sound);
}
