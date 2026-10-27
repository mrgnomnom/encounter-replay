// Ported from RuneLite's cache library (net.runelite.cache.definitions.loaders.ModelLoader, BSD-2-Clause, see
// LICENSE in src/cache/store). Kept line for line with the Java, down to its variable names, so the two can be
// compared side by side.
import { InputStream } from "../store/input";
import { ModelDefinition } from "./modelDefinition";

/** Java's ArrayIndexOutOfBoundsException, where a typed array would quietly give undefined instead */
function at(array: Int16Array | undefined, index: number): number {
  if (array === undefined) throw new TypeError("null array");
  if (index < 0 || index >= array.length) throw new RangeError(`Index ${index} out of bounds for length ${array.length}`);
  return array[index];
}

/** Java's stream sits on a ByteBuffer, whose position can't be set past its end even when nothing is read there */
class Stream extends InputStream {
  override setOffset(offset: number): void {
    if (offset < 0 || offset > this.getLength()) throw new RangeError(`Offset ${offset} outside 0..${this.getLength()}`);
    super.setOffset(offset);
  }
}

/** A Java (byte) cast */
const toByte = (v: number) => (v << 24) >> 24;

export class ModelLoader {
  /** A model from its archive in index 7 (decompressed), with normals, texture coordinates and vertex groups worked out */
  load(modelId: number, b: Uint8Array): ModelDefinition {
    const def = new ModelDefinition();
    def.id = modelId;

    if (b.length < 2) throw new RangeError(`Model ${modelId} is only ${b.length} bytes`);
    const last = b[b.length - 1];
    const secondLast = b[b.length - 2];
    if (last === 0xfd && secondLast === 0xff) this.decodeType3(def, b);
    else if (last === 0xfe && secondLast === 0xff) this.decodeType2(def, b);
    else if (last === 0xff && secondLast === 0xff) this.decodeType1(def, b);
    else this.decodeOldFormat(def, b);

    def.computeNormals();
    def.computeTextureUVCoordinates();
    def.computeAnimationTables();

    return def;
  }

  decodeType3(def: ModelDefinition, var1: Uint8Array): void {
    const var2 = new Stream(var1);
    const var3 = new Stream(var1);
    const var4 = new Stream(var1);
    const var5 = new Stream(var1);
    const var6 = new Stream(var1);
    const var7 = new Stream(var1);
    const var8 = new Stream(var1);
    var2.setOffset(var1.length - 26);
    const var9 = var2.readUnsignedShort();
    const var10 = var2.readUnsignedShort();
    const var11 = var2.readUnsignedByte();
    const var12 = var2.readUnsignedByte();
    const var13 = var2.readUnsignedByte();
    const var14 = var2.readUnsignedByte();
    const var15 = var2.readUnsignedByte();
    const var16 = var2.readUnsignedByte();
    const var17 = var2.readUnsignedByte();
    const var18 = var2.readUnsignedByte();
    const var19 = var2.readUnsignedShort();
    const var20 = var2.readUnsignedShort();
    const var21 = var2.readUnsignedShort();
    const var22 = var2.readUnsignedShort();
    const var23 = var2.readUnsignedShort();
    const var24 = var2.readUnsignedShort();
    let var25 = 0;
    let var26 = 0;
    let var27 = 0;
    let var28: number;
    if (var11 > 0) {
      def.textureRenderTypes = new Int8Array(var11);
      var2.setOffset(0);

      for (var28 = 0; var28 < var11; ++var28) {
        const var29 = (def.textureRenderTypes[var28] = var2.readByte());
        if (var29 === 0) ++var25;
        if (var29 >= 1 && var29 <= 3) ++var26;
        if (var29 === 2) ++var27;
      }
    }

    var28 = var11 + var9;
    const var58 = var28;
    if (var12 === 1) var28 += var10;

    const var30 = var28;
    var28 += var10;
    const var31 = var28;
    if (var13 === 255) var28 += var10;

    const var32 = var28;
    if (var15 === 1) var28 += var10;

    const var33 = var28;
    var28 += var24;
    const var34 = var28;
    if (var14 === 1) var28 += var10;

    const var35 = var28;
    var28 += var22;
    const var36 = var28;
    if (var16 === 1) var28 += var10 * 2;

    const var37 = var28;
    var28 += var23;
    const var38 = var28;
    var28 += var10 * 2;
    const var39 = var28;
    var28 += var19;
    const var40 = var28;
    var28 += var20;
    const var41 = var28;
    var28 += var21;
    const var42 = var28;
    var28 += var25 * 6;
    const var43 = var28;
    var28 += var26 * 6;
    const var44 = var28;
    var28 += var26 * 6;
    const var45 = var28;
    var28 += var26 * 2;
    const var46 = var28;
    var28 += var26;
    const var47 = var28;
    var28 = var28 + var26 * 2 + var27 * 2;
    def.vertexCount = var9;
    def.faceCount = var10;
    def.numTextureFaces = var11;
    def.vertexX = new Int32Array(var9);
    def.vertexY = new Int32Array(var9);
    def.vertexZ = new Int32Array(var9);
    def.faceIndices1 = new Int32Array(var10);
    def.faceIndices2 = new Int32Array(var10);
    def.faceIndices3 = new Int32Array(var10);
    if (var17 === 1) def.packedVertexGroups = new Int32Array(var9);

    if (var12 === 1) def.faceRenderTypes = new Int8Array(var10);

    if (var13 === 255) def.faceRenderPriorities = new Int8Array(var10);
    else def.priority = toByte(var13);

    if (var14 === 1) def.faceTransparencies = new Int8Array(var10);

    if (var15 === 1) def.packedTransparencyVertexGroups = new Int32Array(var10);

    if (var16 === 1) def.faceTextures = new Int16Array(var10);

    if (var16 === 1 && var11 > 0) def.textureCoords = new Int8Array(var10);

    if (var18 === 1) {
      def.animayaGroups = new Array(var9).fill(undefined);
      def.animayaScales = new Array(var9).fill(undefined);
    }

    def.faceColors = new Int16Array(var10);
    if (var11 > 0) {
      def.texIndices1 = new Int16Array(var11);
      def.texIndices2 = new Int16Array(var11);
      def.texIndices3 = new Int16Array(var11);
    }

    var2.setOffset(var11);
    var3.setOffset(var39);
    var4.setOffset(var40);
    var5.setOffset(var41);
    var6.setOffset(var33);
    let var48 = 0;
    let var49 = 0;
    let var50 = 0;

    let var51: number;
    let var52: number;
    let var53: number;
    let var54: number;
    let var55: number;
    for (var51 = 0; var51 < var9; ++var51) {
      var52 = var2.readUnsignedByte();
      var53 = 0;
      if ((var52 & 1) !== 0) var53 = var3.readShortSmart();

      var54 = 0;
      if ((var52 & 2) !== 0) var54 = var4.readShortSmart();

      var55 = 0;
      if ((var52 & 4) !== 0) var55 = var5.readShortSmart();

      def.vertexX[var51] = var48 + var53;
      def.vertexY[var51] = var49 + var54;
      def.vertexZ[var51] = var50 + var55;
      var48 = def.vertexX[var51];
      var49 = def.vertexY[var51];
      var50 = def.vertexZ[var51];
      if (var17 === 1) def.packedVertexGroups![var51] = var6.readUnsignedByte();
    }

    if (var18 === 1) {
      for (var51 = 0; var51 < var9; ++var51) {
        var52 = var6.readUnsignedByte();
        const groups = (def.animayaGroups![var51] = new Int32Array(var52));
        const scales = (def.animayaScales![var51] = new Int32Array(var52));

        for (var53 = 0; var53 < var52; ++var53) {
          groups[var53] = var6.readUnsignedByte();
          scales[var53] = var6.readUnsignedByte();
        }
      }
    }

    var2.setOffset(var38);
    var3.setOffset(var58);
    var4.setOffset(var31);
    var5.setOffset(var34);
    var6.setOffset(var32);
    var7.setOffset(var36);
    var8.setOffset(var37);

    for (var51 = 0; var51 < var10; ++var51) {
      def.faceColors[var51] = var2.readUnsignedShort();
      if (var12 === 1) def.faceRenderTypes![var51] = var3.readByte();

      if (var13 === 255) def.faceRenderPriorities![var51] = var4.readByte();

      if (var14 === 1) def.faceTransparencies![var51] = var5.readByte();

      if (var15 === 1) def.packedTransparencyVertexGroups![var51] = var6.readUnsignedByte();

      if (var16 === 1) def.faceTextures![var51] = var7.readUnsignedShort() - 1;

      if (def.textureCoords !== undefined && def.faceTextures![var51] !== -1) {
        def.textureCoords[var51] = var8.readUnsignedByte() - 1;
      }
    }

    var2.setOffset(var35);
    var3.setOffset(var30);
    var51 = 0;
    var52 = 0;
    var53 = 0;
    var54 = 0;

    let var56: number;
    for (var55 = 0; var55 < var10; ++var55) {
      var56 = var3.readUnsignedByte();
      if (var56 === 1) {
        var51 = var2.readShortSmart() + var54;
        var52 = var2.readShortSmart() + var51;
        var53 = var2.readShortSmart() + var52;
        var54 = var53;
        def.faceIndices1[var55] = var51;
        def.faceIndices2[var55] = var52;
        def.faceIndices3[var55] = var53;
      }

      if (var56 === 2) {
        var52 = var53;
        var53 = var2.readShortSmart() + var54;
        var54 = var53;
        def.faceIndices1[var55] = var51;
        def.faceIndices2[var55] = var52;
        def.faceIndices3[var55] = var53;
      }

      if (var56 === 3) {
        var51 = var53;
        var53 = var2.readShortSmart() + var54;
        var54 = var53;
        def.faceIndices1[var55] = var51;
        def.faceIndices2[var55] = var52;
        def.faceIndices3[var55] = var53;
      }

      if (var56 === 4) {
        const var57 = var51;
        var51 = var52;
        var52 = var57;
        var53 = var2.readShortSmart() + var54;
        var54 = var53;
        def.faceIndices1[var55] = var51;
        def.faceIndices2[var55] = var57;
        def.faceIndices3[var55] = var53;
      }
    }

    var2.setOffset(var42);
    var3.setOffset(var43);
    var4.setOffset(var44);
    var5.setOffset(var45);
    var6.setOffset(var46);
    var7.setOffset(var47);

    for (var55 = 0; var55 < var11; ++var55) {
      var56 = def.textureRenderTypes![var55] & 255;
      if (var56 === 0) {
        def.texIndices1![var55] = var2.readUnsignedShort();
        def.texIndices2![var55] = var2.readUnsignedShort();
        def.texIndices3![var55] = var2.readUnsignedShort();
      }
    }

    var2.setOffset(var28);
    var55 = var2.readUnsignedByte();
    if (var55 !== 0) {
      var2.readUnsignedShort();
      var2.readUnsignedShort();
      var2.readUnsignedShort();
      var2.readInt();
    }

    const hasOffsets = var2.readUnsignedByte() === 1;
    if (hasOffsets) {
      def.faceZOffsets = new Int8Array(var10);

      for (let i = 0; i < var10; ++i) def.faceZOffsets[i] = var2.readByte();
    }
  }

  decodeType2(def: ModelDefinition, var1: Uint8Array): void {
    let var2 = false;
    let var3 = false;
    const var4 = new Stream(var1);
    const var5 = new Stream(var1);
    const var6 = new Stream(var1);
    const var7 = new Stream(var1);
    const var8 = new Stream(var1);
    var4.setOffset(var1.length - 23);
    const var9 = var4.readUnsignedShort();
    const var10 = var4.readUnsignedShort();
    const var11 = var4.readUnsignedByte();
    const var12 = var4.readUnsignedByte();
    const var13 = var4.readUnsignedByte();
    const var14 = var4.readUnsignedByte();
    const var15 = var4.readUnsignedByte();
    const var16 = var4.readUnsignedByte();
    const var17 = var4.readUnsignedByte();
    const var18 = var4.readUnsignedShort();
    const var19 = var4.readUnsignedShort();
    const var20 = var4.readUnsignedShort();
    const var21 = var4.readUnsignedShort();
    const var22 = var4.readUnsignedShort();
    const var23 = 0;
    let var24 = var23 + var9;
    const var25 = var24;
    var24 += var10;
    const var26 = var24;
    if (var13 === 255) var24 += var10;

    const var27 = var24;
    if (var15 === 1) var24 += var10;

    const var28 = var24;
    if (var12 === 1) var24 += var10;

    const var29 = var24;
    var24 += var22;
    const var30 = var24;
    if (var14 === 1) var24 += var10;

    const var31 = var24;
    var24 += var21;
    const var32 = var24;
    var24 += var10 * 2;
    const var33 = var24;
    var24 += var11 * 6;
    const var34 = var24;
    var24 += var18;
    const var35 = var24;
    var24 += var19;
    const var36 = var24;
    var24 += var20;
    def.vertexCount = var9;
    def.faceCount = var10;
    def.numTextureFaces = var11;
    def.vertexX = new Int32Array(var9);
    def.vertexY = new Int32Array(var9);
    def.vertexZ = new Int32Array(var9);
    def.faceIndices1 = new Int32Array(var10);
    def.faceIndices2 = new Int32Array(var10);
    def.faceIndices3 = new Int32Array(var10);
    if (var11 > 0) {
      def.textureRenderTypes = new Int8Array(var11);
      def.texIndices1 = new Int16Array(var11);
      def.texIndices2 = new Int16Array(var11);
      def.texIndices3 = new Int16Array(var11);
    }

    if (var16 === 1) def.packedVertexGroups = new Int32Array(var9);

    if (var12 === 1) {
      def.faceRenderTypes = new Int8Array(var10);
      def.textureCoords = new Int8Array(var10);
      def.faceTextures = new Int16Array(var10);
    }

    if (var13 === 255) def.faceRenderPriorities = new Int8Array(var10);
    else def.priority = toByte(var13);

    if (var14 === 1) def.faceTransparencies = new Int8Array(var10);

    if (var15 === 1) def.packedTransparencyVertexGroups = new Int32Array(var10);

    if (var17 === 1) {
      def.animayaGroups = new Array(var9).fill(undefined);
      def.animayaScales = new Array(var9).fill(undefined);
    }

    def.faceColors = new Int16Array(var10);
    var4.setOffset(var23);
    var5.setOffset(var34);
    var6.setOffset(var35);
    var7.setOffset(var36);
    var8.setOffset(var29);
    let var37 = 0;
    let var38 = 0;
    let var39 = 0;

    let var40: number;
    let var41: number;
    let var42: number;
    let var43: number;
    let var44: number;
    for (var40 = 0; var40 < var9; ++var40) {
      var41 = var4.readUnsignedByte();
      var42 = 0;
      if ((var41 & 1) !== 0) var42 = var5.readShortSmart();

      var43 = 0;
      if ((var41 & 2) !== 0) var43 = var6.readShortSmart();

      var44 = 0;
      if ((var41 & 4) !== 0) var44 = var7.readShortSmart();

      def.vertexX[var40] = var37 + var42;
      def.vertexY[var40] = var38 + var43;
      def.vertexZ[var40] = var39 + var44;
      var37 = def.vertexX[var40];
      var38 = def.vertexY[var40];
      var39 = def.vertexZ[var40];
      if (var16 === 1) def.packedVertexGroups![var40] = var8.readUnsignedByte();
    }

    if (var17 === 1) {
      for (var40 = 0; var40 < var9; ++var40) {
        var41 = var8.readUnsignedByte();
        const groups = (def.animayaGroups![var40] = new Int32Array(var41));
        const scales = (def.animayaScales![var40] = new Int32Array(var41));

        for (var42 = 0; var42 < var41; ++var42) {
          groups[var42] = var8.readUnsignedByte();
          scales[var42] = var8.readUnsignedByte();
        }
      }
    }

    var4.setOffset(var32);
    var5.setOffset(var28);
    var6.setOffset(var26);
    var7.setOffset(var30);
    var8.setOffset(var27);

    for (var40 = 0; var40 < var10; ++var40) {
      def.faceColors[var40] = var4.readUnsignedShort();
      if (var12 === 1) {
        var41 = var5.readUnsignedByte();
        if ((var41 & 1) === 1) {
          def.faceRenderTypes![var40] = 1;
          var2 = true;
        } else {
          def.faceRenderTypes![var40] = 0;
        }

        if ((var41 & 2) === 2) {
          def.textureCoords![var40] = var41 >> 2;
          def.faceTextures![var40] = def.faceColors[var40];
          def.faceColors[var40] = 127;
          if (def.faceTextures![var40] !== -1) var3 = true;
        } else {
          def.textureCoords![var40] = -1;
          def.faceTextures![var40] = -1;
        }
      }

      if (var13 === 255) def.faceRenderPriorities![var40] = var6.readByte();

      if (var14 === 1) def.faceTransparencies![var40] = var7.readByte();

      if (var15 === 1) def.packedTransparencyVertexGroups![var40] = var8.readUnsignedByte();
    }

    var4.setOffset(var31);
    var5.setOffset(var25);
    var40 = 0;
    var41 = 0;
    var42 = 0;
    var43 = 0;

    let var45: number;
    let var46: number;
    for (var44 = 0; var44 < var10; ++var44) {
      var45 = var5.readUnsignedByte();
      if (var45 === 1) {
        var40 = var4.readShortSmart() + var43;
        var41 = var4.readShortSmart() + var40;
        var42 = var4.readShortSmart() + var41;
        var43 = var42;
        def.faceIndices1[var44] = var40;
        def.faceIndices2[var44] = var41;
        def.faceIndices3[var44] = var42;
      }

      if (var45 === 2) {
        var41 = var42;
        var42 = var4.readShortSmart() + var43;
        var43 = var42;
        def.faceIndices1[var44] = var40;
        def.faceIndices2[var44] = var41;
        def.faceIndices3[var44] = var42;
      }

      if (var45 === 3) {
        var40 = var42;
        var42 = var4.readShortSmart() + var43;
        var43 = var42;
        def.faceIndices1[var44] = var40;
        def.faceIndices2[var44] = var41;
        def.faceIndices3[var44] = var42;
      }

      if (var45 === 4) {
        var46 = var40;
        var40 = var41;
        var41 = var46;
        var42 = var4.readShortSmart() + var43;
        var43 = var42;
        def.faceIndices1[var44] = var40;
        def.faceIndices2[var44] = var46;
        def.faceIndices3[var44] = var42;
      }
    }

    var4.setOffset(var33);

    for (var44 = 0; var44 < var11; ++var44) {
      def.textureRenderTypes![var44] = 0;
      def.texIndices1![var44] = var4.readUnsignedShort();
      def.texIndices2![var44] = var4.readUnsignedShort();
      def.texIndices3![var44] = var4.readUnsignedShort();
    }

    var4.setOffset(var24);
    const hasOffsets = var4.readUnsignedByte() === 1;
    if (hasOffsets) {
      def.faceZOffsets = new Int8Array(var10);

      for (var45 = 0; var45 < var10; ++var45) def.faceZOffsets[var45] = var4.readByte();
    }

    if (def.textureCoords !== undefined) {
      let var47 = false;

      for (var45 = 0; var45 < var10; ++var45) {
        var46 = def.textureCoords[var45] & 255;
        if (var46 !== 255) {
          if (
            def.faceIndices1[var45] === (at(def.texIndices1, var46) & 0xffff) &&
            def.faceIndices2[var45] === (at(def.texIndices2, var46) & 0xffff) &&
            def.faceIndices3[var45] === (at(def.texIndices3, var46) & 0xffff)
          ) {
            def.textureCoords[var45] = -1;
          } else {
            var47 = true;
          }
        }
      }

      if (!var47) def.textureCoords = undefined;
    }

    if (!var3) def.faceTextures = undefined;

    if (!var2) def.faceRenderTypes = undefined;
  }

  decodeType1(def: ModelDefinition, var1: Uint8Array): void {
    const var2 = new Stream(var1);
    const var3 = new Stream(var1);
    const var4 = new Stream(var1);
    const var5 = new Stream(var1);
    const var6 = new Stream(var1);
    const var7 = new Stream(var1);
    const var8 = new Stream(var1);
    var2.setOffset(var1.length - 23);
    const var9 = var2.readUnsignedShort();
    const var10 = var2.readUnsignedShort();
    const var11 = var2.readUnsignedByte();
    const var12 = var2.readUnsignedByte();
    const var13 = var2.readUnsignedByte();
    const var14 = var2.readUnsignedByte();
    const var15 = var2.readUnsignedByte();
    const var16 = var2.readUnsignedByte();
    const var17 = var2.readUnsignedByte();
    const var18 = var2.readUnsignedShort();
    const var19 = var2.readUnsignedShort();
    const var20 = var2.readUnsignedShort();
    const var21 = var2.readUnsignedShort();
    const var22 = var2.readUnsignedShort();
    let var23 = 0;
    let var24 = 0;
    let var25 = 0;
    let var26: number;
    if (var11 > 0) {
      def.textureRenderTypes = new Int8Array(var11);
      var2.setOffset(0);

      for (var26 = 0; var26 < var11; ++var26) {
        const var27 = (def.textureRenderTypes[var26] = var2.readByte());
        if (var27 === 0) ++var23;
        if (var27 >= 1 && var27 <= 3) ++var24;
        if (var27 === 2) ++var25;
      }
    }

    var26 = var11 + var9;
    const var56 = var26;
    if (var12 === 1) var26 += var10;

    const var28 = var26;
    var26 += var10;
    const var29 = var26;
    if (var13 === 255) var26 += var10;

    const var30 = var26;
    if (var15 === 1) var26 += var10;

    const var31 = var26;
    if (var17 === 1) var26 += var9;

    const var32 = var26;
    if (var14 === 1) var26 += var10;

    const var33 = var26;
    var26 += var21;
    const var34 = var26;
    if (var16 === 1) var26 += var10 * 2;

    const var35 = var26;
    var26 += var22;
    const var36 = var26;
    var26 += var10 * 2;
    const var37 = var26;
    var26 += var18;
    const var38 = var26;
    var26 += var19;
    const var39 = var26;
    var26 += var20;
    const var40 = var26;
    var26 += var23 * 6;
    const var41 = var26;
    var26 += var24 * 6;
    const var42 = var26;
    var26 += var24 * 6;
    const var43 = var26;
    var26 += var24 * 2;
    const var44 = var26;
    var26 += var24;
    const var45 = var26;
    var26 = var26 + var24 * 2 + var25 * 2;
    def.vertexCount = var9;
    def.faceCount = var10;
    def.numTextureFaces = var11;
    def.vertexX = new Int32Array(var9);
    def.vertexY = new Int32Array(var9);
    def.vertexZ = new Int32Array(var9);
    def.faceIndices1 = new Int32Array(var10);
    def.faceIndices2 = new Int32Array(var10);
    def.faceIndices3 = new Int32Array(var10);
    if (var17 === 1) def.packedVertexGroups = new Int32Array(var9);

    if (var12 === 1) def.faceRenderTypes = new Int8Array(var10);

    if (var13 === 255) def.faceRenderPriorities = new Int8Array(var10);
    else def.priority = toByte(var13);

    if (var14 === 1) def.faceTransparencies = new Int8Array(var10);

    if (var15 === 1) def.packedTransparencyVertexGroups = new Int32Array(var10);

    if (var16 === 1) def.faceTextures = new Int16Array(var10);

    if (var16 === 1 && var11 > 0) def.textureCoords = new Int8Array(var10);

    def.faceColors = new Int16Array(var10);
    if (var11 > 0) {
      def.texIndices1 = new Int16Array(var11);
      def.texIndices2 = new Int16Array(var11);
      def.texIndices3 = new Int16Array(var11);
    }

    var2.setOffset(var11);
    var3.setOffset(var37);
    var4.setOffset(var38);
    var5.setOffset(var39);
    var6.setOffset(var31);
    let var46 = 0;
    let var47 = 0;
    let var48 = 0;

    let var49: number;
    let var50: number;
    let var51: number;
    let var52: number;
    let var53: number;
    for (var49 = 0; var49 < var9; ++var49) {
      var50 = var2.readUnsignedByte();
      var51 = 0;
      if ((var50 & 1) !== 0) var51 = var3.readShortSmart();

      var52 = 0;
      if ((var50 & 2) !== 0) var52 = var4.readShortSmart();

      var53 = 0;
      if ((var50 & 4) !== 0) var53 = var5.readShortSmart();

      def.vertexX[var49] = var46 + var51;
      def.vertexY[var49] = var47 + var52;
      def.vertexZ[var49] = var48 + var53;
      var46 = def.vertexX[var49];
      var47 = def.vertexY[var49];
      var48 = def.vertexZ[var49];
      if (var17 === 1) def.packedVertexGroups![var49] = var6.readUnsignedByte();
    }

    var2.setOffset(var36);
    var3.setOffset(var56);
    var4.setOffset(var29);
    var5.setOffset(var32);
    var6.setOffset(var30);
    var7.setOffset(var34);
    var8.setOffset(var35);

    for (var49 = 0; var49 < var10; ++var49) {
      def.faceColors[var49] = var2.readUnsignedShort();
      if (var12 === 1) def.faceRenderTypes![var49] = var3.readByte();

      if (var13 === 255) def.faceRenderPriorities![var49] = var4.readByte();

      if (var14 === 1) def.faceTransparencies![var49] = var5.readByte();

      if (var15 === 1) def.packedTransparencyVertexGroups![var49] = var6.readUnsignedByte();

      if (var16 === 1) def.faceTextures![var49] = var7.readUnsignedShort() - 1;

      if (def.textureCoords !== undefined && def.faceTextures![var49] !== -1) {
        def.textureCoords[var49] = var8.readUnsignedByte() - 1;
      }
    }

    var2.setOffset(var33);
    var3.setOffset(var28);
    var49 = 0;
    var50 = 0;
    var51 = 0;
    var52 = 0;

    let var54: number;
    for (var53 = 0; var53 < var10; ++var53) {
      var54 = var3.readUnsignedByte();
      if (var54 === 1) {
        var49 = var2.readShortSmart() + var52;
        var50 = var2.readShortSmart() + var49;
        var51 = var2.readShortSmart() + var50;
        var52 = var51;
        def.faceIndices1[var53] = var49;
        def.faceIndices2[var53] = var50;
        def.faceIndices3[var53] = var51;
      }

      if (var54 === 2) {
        var50 = var51;
        var51 = var2.readShortSmart() + var52;
        var52 = var51;
        def.faceIndices1[var53] = var49;
        def.faceIndices2[var53] = var50;
        def.faceIndices3[var53] = var51;
      }

      if (var54 === 3) {
        var49 = var51;
        var51 = var2.readShortSmart() + var52;
        var52 = var51;
        def.faceIndices1[var53] = var49;
        def.faceIndices2[var53] = var50;
        def.faceIndices3[var53] = var51;
      }

      if (var54 === 4) {
        const var55 = var49;
        var49 = var50;
        var50 = var55;
        var51 = var2.readShortSmart() + var52;
        var52 = var51;
        def.faceIndices1[var53] = var49;
        def.faceIndices2[var53] = var55;
        def.faceIndices3[var53] = var51;
      }
    }

    var2.setOffset(var40);
    var3.setOffset(var41);
    var4.setOffset(var42);
    var5.setOffset(var43);
    var6.setOffset(var44);
    var7.setOffset(var45);

    for (var53 = 0; var53 < var11; ++var53) {
      var54 = def.textureRenderTypes![var53] & 255;
      if (var54 === 0) {
        def.texIndices1![var53] = var2.readUnsignedShort();
        def.texIndices2![var53] = var2.readUnsignedShort();
        def.texIndices3![var53] = var2.readUnsignedShort();
      }
    }

    var2.setOffset(var26);
    var53 = var2.readUnsignedByte();
    if (var53 !== 0) {
      var2.readUnsignedShort();
      var2.readUnsignedShort();
      var2.readUnsignedShort();
      var2.readInt();
    }
  }

  decodeOldFormat(def: ModelDefinition, inputData: Uint8Array): void {
    let usesFaceRenderTypes = false;
    let usesFaceTextures = false;
    const stream1 = new Stream(inputData);
    const stream2 = new Stream(inputData);
    const stream3 = new Stream(inputData);
    const stream4 = new Stream(inputData);
    const stream5 = new Stream(inputData);
    stream1.setOffset(inputData.length - 18);
    const vertexCount = stream1.readUnsignedShort();
    const faceCount = stream1.readUnsignedShort();
    const textureCount = stream1.readUnsignedByte();
    const isTextured = stream1.readUnsignedByte();
    const faceRenderPriority = stream1.readUnsignedByte();
    const hasFaceTransparencies = stream1.readUnsignedByte();
    const hasPackedTransparencyVertexGroups = stream1.readUnsignedByte();
    const hasPackedVertexGroups = stream1.readUnsignedByte();
    const vertexXDataByteCount = stream1.readUnsignedShort();
    const vertexYDataByteCount = stream1.readUnsignedShort();
    stream1.readUnsignedShort(); // vertezZDataByteCount: nothing follows the z data
    const faceIndexDataByteCount = stream1.readUnsignedShort();
    const offsetOfVertexFlags = 0;
    let dataOffset = offsetOfVertexFlags + vertexCount;
    const offsetOfFaceIndexCompressionTypes = dataOffset;
    dataOffset += faceCount;
    const offsetOfFaceRenderPriorities = dataOffset;
    if (faceRenderPriority === 255) dataOffset += faceCount;

    const offsetOfPackedTransparencyVertexGroups = dataOffset;
    if (hasPackedTransparencyVertexGroups === 1) dataOffset += faceCount;

    const offsetOfFaceTextureFlags = dataOffset;
    if (isTextured === 1) dataOffset += faceCount;

    const offsetOfPackedVertexGroups = dataOffset;
    if (hasPackedVertexGroups === 1) dataOffset += vertexCount;

    const offsetOfFaceTransparencies = dataOffset;
    if (hasFaceTransparencies === 1) dataOffset += faceCount;

    const offsetOfFaceIndexData = dataOffset;
    dataOffset += faceIndexDataByteCount;
    const offsetOfFaceColorsOrFaceTextures = dataOffset;
    dataOffset += faceCount * 2;
    const offsetOfTextureIndices = dataOffset;
    dataOffset += textureCount * 6;
    const offsetOfVertexXData = dataOffset;
    dataOffset += vertexXDataByteCount;
    const offsetOfVertexYData = dataOffset;
    dataOffset += vertexYDataByteCount;
    const offsetOfVertexZData = dataOffset;
    def.vertexCount = vertexCount;
    def.faceCount = faceCount;
    def.numTextureFaces = textureCount;
    def.vertexX = new Int32Array(vertexCount);
    def.vertexY = new Int32Array(vertexCount);
    def.vertexZ = new Int32Array(vertexCount);
    def.faceIndices1 = new Int32Array(faceCount);
    def.faceIndices2 = new Int32Array(faceCount);
    def.faceIndices3 = new Int32Array(faceCount);
    if (textureCount > 0) {
      def.textureRenderTypes = new Int8Array(textureCount);
      def.texIndices1 = new Int16Array(textureCount);
      def.texIndices2 = new Int16Array(textureCount);
      def.texIndices3 = new Int16Array(textureCount);
    }

    if (hasPackedVertexGroups === 1) def.packedVertexGroups = new Int32Array(vertexCount);

    if (isTextured === 1) {
      def.faceRenderTypes = new Int8Array(faceCount);
      def.textureCoords = new Int8Array(faceCount);
      def.faceTextures = new Int16Array(faceCount);
    }

    if (faceRenderPriority === 255) def.faceRenderPriorities = new Int8Array(faceCount);
    else def.priority = toByte(faceRenderPriority);

    if (hasFaceTransparencies === 1) def.faceTransparencies = new Int8Array(faceCount);

    if (hasPackedTransparencyVertexGroups === 1) def.packedTransparencyVertexGroups = new Int32Array(faceCount);

    def.faceColors = new Int16Array(faceCount);
    stream1.setOffset(offsetOfVertexFlags);
    stream2.setOffset(offsetOfVertexXData);
    stream3.setOffset(offsetOfVertexYData);
    stream4.setOffset(offsetOfVertexZData);
    stream5.setOffset(offsetOfPackedVertexGroups);
    let previousVertexX = 0;
    let previousVertexY = 0;
    let previousVertexZ = 0;

    for (let i = 0; i < vertexCount; ++i) {
      const vertexFlags = stream1.readUnsignedByte();
      let deltaX = 0;
      if ((vertexFlags & 1) !== 0) deltaX = stream2.readShortSmart();

      let deltaY = 0;
      if ((vertexFlags & 2) !== 0) deltaY = stream3.readShortSmart();

      let deltaZ = 0;
      if ((vertexFlags & 4) !== 0) deltaZ = stream4.readShortSmart();

      def.vertexX[i] = previousVertexX + deltaX;
      def.vertexY[i] = previousVertexY + deltaY;
      def.vertexZ[i] = previousVertexZ + deltaZ;
      previousVertexX = def.vertexX[i];
      previousVertexY = def.vertexY[i];
      previousVertexZ = def.vertexZ[i];
      if (hasPackedVertexGroups === 1) def.packedVertexGroups![i] = stream5.readUnsignedByte();
    }

    stream1.setOffset(offsetOfFaceColorsOrFaceTextures);
    stream2.setOffset(offsetOfFaceTextureFlags);
    stream3.setOffset(offsetOfFaceRenderPriorities);
    stream4.setOffset(offsetOfFaceTransparencies);
    stream5.setOffset(offsetOfPackedTransparencyVertexGroups);

    for (let i = 0; i < faceCount; ++i) {
      def.faceColors[i] = stream1.readUnsignedShort();
      if (isTextured === 1) {
        const faceTextureFlags = stream2.readUnsignedByte();
        if ((faceTextureFlags & 1) === 1) {
          def.faceRenderTypes![i] = 1;
          usesFaceRenderTypes = true;
        } else {
          def.faceRenderTypes![i] = 0;
        }

        if ((faceTextureFlags & 2) === 2) {
          def.textureCoords![i] = faceTextureFlags >> 2;
          def.faceTextures![i] = def.faceColors[i];
          def.faceColors[i] = 127;
          if (def.faceTextures![i] !== -1) usesFaceTextures = true;
        } else {
          def.textureCoords![i] = -1;
          def.faceTextures![i] = -1;
        }
      }

      if (faceRenderPriority === 255) def.faceRenderPriorities![i] = stream3.readByte();

      if (hasFaceTransparencies === 1) def.faceTransparencies![i] = stream4.readByte();

      if (hasPackedTransparencyVertexGroups === 1) def.packedTransparencyVertexGroups![i] = stream5.readUnsignedByte();
    }

    stream1.setOffset(offsetOfFaceIndexData);
    stream2.setOffset(offsetOfFaceIndexCompressionTypes);
    let previousIndex1 = 0;
    let previousIndex2 = 0;
    let previousIndex3 = 0;

    for (let i = 0; i < faceCount; ++i) {
      const faceIndexCompressionType = stream2.readUnsignedByte();
      if (faceIndexCompressionType === 1) {
        previousIndex1 = stream1.readShortSmart() + previousIndex3;
        previousIndex2 = stream1.readShortSmart() + previousIndex1;
        previousIndex3 = stream1.readShortSmart() + previousIndex2;
        def.faceIndices1[i] = previousIndex1;
        def.faceIndices2[i] = previousIndex2;
        def.faceIndices3[i] = previousIndex3;
      }

      if (faceIndexCompressionType === 2) {
        previousIndex2 = previousIndex3;
        previousIndex3 = stream1.readShortSmart() + previousIndex3;
        def.faceIndices1[i] = previousIndex1;
        def.faceIndices2[i] = previousIndex2;
        def.faceIndices3[i] = previousIndex3;
      }

      if (faceIndexCompressionType === 3) {
        previousIndex1 = previousIndex3;
        previousIndex3 = stream1.readShortSmart() + previousIndex3;
        def.faceIndices1[i] = previousIndex1;
        def.faceIndices2[i] = previousIndex2;
        def.faceIndices3[i] = previousIndex3;
      }

      if (faceIndexCompressionType === 4) {
        const swap = previousIndex1;
        previousIndex1 = previousIndex2;
        previousIndex2 = swap;
        previousIndex3 = stream1.readShortSmart() + previousIndex3;
        def.faceIndices1[i] = previousIndex1;
        def.faceIndices2[i] = previousIndex2;
        def.faceIndices3[i] = previousIndex3;
      }
    }

    stream1.setOffset(offsetOfTextureIndices);

    for (let i = 0; i < textureCount; ++i) {
      def.textureRenderTypes![i] = 0;
      def.texIndices1![i] = stream1.readUnsignedShort();
      def.texIndices2![i] = stream1.readUnsignedShort();
      def.texIndices3![i] = stream1.readUnsignedShort();
    }

    if (def.textureCoords !== undefined) {
      let usesTextureCoords = false;

      for (let i = 0; i < faceCount; ++i) {
        const coord = def.textureCoords[i] & 255;
        if (coord !== 255) {
          if (
            def.faceIndices1[i] === (at(def.texIndices1, coord) & 0xffff) &&
            def.faceIndices2[i] === (at(def.texIndices2, coord) & 0xffff) &&
            def.faceIndices3[i] === (at(def.texIndices3, coord) & 0xffff)
          ) {
            def.textureCoords[i] = -1;
          } else {
            usesTextureCoords = true;
          }
        }
      }

      if (!usesTextureCoords) def.textureCoords = undefined;
    }

    if (!usesFaceTextures) def.faceTextures = undefined;

    if (!usesFaceRenderTypes) def.faceRenderTypes = undefined;
  }
}
