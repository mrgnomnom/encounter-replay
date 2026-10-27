// Ported from RuneLite's cache library (net.runelite.cache.io.InputStream, BSD-2-Clause, see LICENSE in
// this folder). Method names match the Java so loaders port line for line.

const CHARACTERS = [
  "€", "\u0000", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š",
  "‹", "Œ", "\u0000", "Ž", "\u0000", "\u0000", "‘", "’", "“", "”", "•",
  "–", "—", "˜", "™", "š", "›", "œ", "\u0000", "ž", "Ÿ",
];

/** A param value: strings, ints, or longs (kept as bigint) */
export type ParamValue = string | number | bigint;

export class InputStream {
  private position = 0;

  constructor(private readonly buffer: Uint8Array) {}

  getArray(): Uint8Array { return this.buffer; }
  getOffset(): number { return this.position; }
  setOffset(offset: number): void { this.position = offset; }
  getLength(): number { return this.buffer.length; }
  remaining(): number { return this.buffer.length - this.position; }
  skip(length: number): void { this.position += length; }

  private need(n: number): void {
    if (this.position + n > this.buffer.length) throw new RangeError(`Read past the end (${this.position} + ${n} > ${this.buffer.length})`);
  }

  readByte(): number {
    this.need(1);
    return (this.buffer[this.position++] << 24) >> 24;
  }

  readUnsignedByte(): number {
    this.need(1);
    return this.buffer[this.position++];
  }

  readBytes(out: Uint8Array | Int8Array, off = 0, len = out.length - off): void {
    this.need(len);
    for (let i = 0; i < len; i++) out[off + i] = this.buffer[this.position + i];
    this.position += len;
  }

  readUnsignedShort(): number {
    this.need(2);
    const b = this.buffer;
    const p = this.position;
    this.position += 2;
    return (b[p] << 8) | b[p + 1];
  }

  readShort(): number {
    return (this.readUnsignedShort() << 16) >> 16;
  }

  read24BitInt(): number {
    return (this.readUnsignedByte() << 16) + (this.readUnsignedByte() << 8) + this.readUnsignedByte();
  }

  readInt(): number {
    this.need(4);
    const b = this.buffer;
    const p = this.position;
    this.position += 4;
    return (b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
  }

  readLong(): bigint {
    const hi = BigInt(this.readInt());
    const lo = BigInt(this.readInt() >>> 0);
    return BigInt.asIntN(64, (hi << 32n) | lo);
  }

  peek(): number {
    this.need(1);
    return (this.buffer[this.position] << 24) >> 24;
  }

  readBigSmart(): number {
    return this.peek() >= 0 ? this.readUnsignedShort() & 0xffff : this.readInt() & 0x7fffffff;
  }

  readBigSmart2(): number {
    if (this.peek() < 0) return this.readInt() & 0x7fffffff;
    const value = this.readUnsignedShort();
    return value === 32767 ? -1 : value;
  }

  readShortSmart(): number {
    const peek = this.peek() & 0xff;
    return peek < 128 ? this.readUnsignedByte() - 64 : this.readUnsignedShort() - 0xc000;
  }

  readUnsignedShortSmartMinusOne(): number {
    const peek = this.peek() & 0xff;
    return peek < 128 ? this.readUnsignedByte() - 1 : this.readUnsignedShort() - 0x8001;
  }

  readUnsignedShortSmart(): number {
    const peek = this.peek() & 0xff;
    return peek < 128 ? this.readUnsignedByte() : this.readUnsignedShort() - 0x8000;
  }

  readUnsignedIntSmartShortCompat(): number {
    let total = 0;
    let v = this.readUnsignedShortSmart();
    for (; v === 32767; v = this.readUnsignedShortSmart()) total += 32767;
    return total + v;
  }

  readString(): string {
    let s = "";
    for (;;) {
      let ch = this.readUnsignedByte();
      if (ch === 0) break;
      if (ch >= 128 && ch < 160) {
        const mapped = CHARACTERS[ch - 128];
        s += mapped === "\u0000" ? "?" : mapped;
        continue;
      }
      s += String.fromCharCode(ch);
    }
    return s;
  }

  readString2(): string {
    if (this.readByte() !== 0) throw new Error("Invalid jstr2");
    return this.readString();
  }

  readStringOrNull(): string | null {
    if (this.peek() !== 0) return this.readString();
    this.readByte();
    return null;
  }

  readVarInt(): number {
    let b = this.readByte();
    let v = 0;
    for (; b < 0; b = this.readByte()) v = (v | (b & 127)) << 7;
    return v | b;
  }

  readVarInt2(): number {
    let value = 0;
    let bits = 0;
    let read: number;
    do {
      read = this.readUnsignedByte();
      value |= (read & 0x7f) << bits;
      bits += 7;
    } while (read > 127);
    return value;
  }

  readParams(): Map<number, ParamValue> {
    const out = new Map<number, ParamValue>();
    const size = this.readUnsignedByte();
    for (let i = 0; i < size; i++) {
      const type = this.readUnsignedByte();
      const id = this.read24BitInt();
      out.set(id, type === 1 ? this.readString() : type === 2 ? this.readLong() : this.readInt());
    }
    return out;
  }

  getRemaining(): Uint8Array {
    const out = this.buffer.slice(this.position);
    this.position = this.buffer.length;
    return out;
  }
}
