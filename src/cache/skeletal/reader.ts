// Ported from rs-map-viewer by dennisdev (BSD-2-Clause, see LICENSE in this folder): the parts of its
// ByteBuffer that skeletal animation files need.

const floatView = new DataView(new ArrayBuffer(4));

export class Reader {
  offset = 0;

  constructor(private readonly data: Uint8Array) {}

  get remaining(): number {
    return this.data.length - this.offset;
  }

  readUnsignedByte(): number {
    return this.data[this.offset++];
  }

  readByte(): number {
    return (this.data[this.offset++] << 24) >> 24;
  }

  readUnsignedShort(): number {
    this.offset += 2;
    return (this.data[this.offset - 2] << 8) | this.data[this.offset - 1];
  }

  readShort(): number {
    const v = this.readUnsignedShort();
    return v > 32767 ? v - 65536 : v;
  }

  readInt(): number {
    this.offset += 4;
    const d = this.data;
    const o = this.offset;
    return (d[o - 4] << 24) | (d[o - 3] << 16) | (d[o - 2] << 8) | d[o - 1];
  }

  readFloat(): number {
    floatView.setInt32(0, this.readInt());
    return floatView.getFloat32(0);
  }

  /** One byte (value - 64) when the top bit is clear, otherwise two bytes (value - 49152) */
  readSmart2(): number {
    if (this.data[this.offset] < 128) return this.readUnsignedByte() - 64;
    return this.readUnsignedShort() - 49152;
  }
}

/** Float.MAX_VALUE, which curve points use as a marker */
export const FLOAT_MAX = 3.4028234663852886e38;
