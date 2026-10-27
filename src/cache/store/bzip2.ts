/**
 * A bzip2 decompressor for the cache's bzip2 containers. They store the stream without its "BZh1"
 * header, which is put back here. Checksums aren't verified: the cache's own CRCs cover the containers.
 */

const HEADER = [0x42, 0x5a, 0x68, 0x31];
const BLOCK_MAGIC_HI = 0x314159;
const BLOCK_MAGIC_LO = 0x265359;
const END_MAGIC_HI = 0x177245;
const END_MAGIC_LO = 0x385090;
const GROUP_SIZE = 50;
const MAX_CODE_LENGTH = 20;

class Bits {
  private pos = 0;
  constructor(private readonly data: Uint8Array) {}

  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.data[this.pos >> 3];
      if (byte === undefined) throw new Error("bzip2: unexpected end of data");
      v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v >>> 0;
  }

  bit(): number {
    return this.read(1);
  }
}

interface Huffman {
  limit: Int32Array;
  base: Int32Array;
  perm: Int32Array;
  minLen: number;
  maxLen: number;
}

/** Canonical codes: by length, then symbol. limit is each length's last code, base its first minus the codes before */
function huffman(lengths: Uint8Array, alphaSize: number): Huffman {
  let minLen = 32;
  let maxLen = 0;
  for (let i = 0; i < alphaSize; i++) {
    minLen = Math.min(minLen, lengths[i]);
    maxLen = Math.max(maxLen, lengths[i]);
  }
  const perm = new Int32Array(alphaSize);
  const limit = new Int32Array(MAX_CODE_LENGTH + 1).fill(-1);
  const base = new Int32Array(MAX_CODE_LENGTH + 1);
  let code = 0;
  let index = 0;
  for (let len = minLen; len <= maxLen; len++) {
    base[len] = code - index;
    for (let s = 0; s < alphaSize; s++) {
      if (lengths[s] !== len) continue;
      perm[index++] = s;
      code++;
    }
    limit[len] = code - 1;
    code <<= 1;
  }
  return { limit, base, perm, minLen, maxLen };
}

function decodeSymbol(bits: Bits, h: Huffman): number {
  let len = h.minLen;
  let code = bits.read(len);
  while (len <= h.maxLen) {
    if (code <= h.limit[len]) return h.perm[code - h.base[len]];
    code = (code << 1) | bits.bit();
    len++;
  }
  throw new Error("bzip2: bad Huffman code");
}

export function bunzip2(body: Uint8Array, expectedSize: number): Uint8Array {
  const data = new Uint8Array(body.length + 4);
  data.set(HEADER, 0);
  data.set(body, 4);
  const bits = new Bits(data);
  if (bits.read(24) !== 0x425a68) throw new Error("bzip2: no header");
  const level = bits.read(8) - 0x30;
  const blockMax = level * 100000;
  const out = new Uint8Array(expectedSize);
  let outPos = 0;
  const tt = new Uint32Array(blockMax);

  for (;;) {
    const hi = bits.read(24);
    const lo = bits.read(24);
    if (hi === END_MAGIC_HI && lo === END_MAGIC_LO) break;
    if (hi !== BLOCK_MAGIC_HI || lo !== BLOCK_MAGIC_LO) throw new Error("bzip2: bad block magic");
    bits.read(32); // block CRC
    if (bits.bit()) throw new Error("bzip2: randomised blocks aren't supported");
    const origPtr = bits.read(24);

    // Which byte values the block uses
    const used: number[] = [];
    const groupsUsed = bits.read(16);
    for (let i = 0; i < 16; i++) {
      if (groupsUsed & (0x8000 >> i)) {
        const bitsUsed = bits.read(16);
        for (let j = 0; j < 16; j++) if (bitsUsed & (0x8000 >> j)) used.push(i * 16 + j);
      }
    }
    const alphaSize = used.length + 2;

    const nGroups = bits.read(3);
    const nSelectors = bits.read(15);
    const mtfGroups = Array.from({ length: nGroups }, (_, i) => i);
    const selectors = new Uint8Array(nSelectors);
    for (let i = 0; i < nSelectors; i++) {
      let j = 0;
      while (bits.bit()) j++;
      const v = mtfGroups[j];
      mtfGroups.splice(j, 1);
      mtfGroups.unshift(v);
      selectors[i] = v;
    }

    const tables: Huffman[] = [];
    for (let g = 0; g < nGroups; g++) {
      const lengths = new Uint8Array(alphaSize);
      let len = bits.read(5);
      for (let s = 0; s < alphaSize; s++) {
        for (;;) {
          if (len < 1 || len > MAX_CODE_LENGTH) throw new Error("bzip2: bad code length");
          if (!bits.bit()) break;
          len += bits.bit() ? -1 : 1;
        }
        lengths[s] = len;
      }
      tables.push(huffman(lengths, alphaSize));
    }

    // Symbols: runs of zeros (RUNA, RUNB), move-to-front indices, end of block
    const mtf = used.slice();
    const counts = new Int32Array(256);
    const eob = alphaSize - 1;
    let n = 0;
    let groupLeft = 0;
    let selector = 0;
    let table = tables[0];
    let run = 0;
    let runWeight = 1;
    const flushRun = () => {
      if (run === 0) return;
      const b = mtf[0];
      if (n + run > blockMax) throw new Error("bzip2: block overflow");
      counts[b] += run;
      for (let k = 0; k < run; k++) tt[n++] = b;
      run = 0;
      runWeight = 1;
    };
    for (;;) {
      if (groupLeft === 0) {
        table = tables[selectors[selector++]];
        groupLeft = GROUP_SIZE;
      }
      groupLeft--;
      const sym = decodeSymbol(bits, table);
      if (sym <= 1) {
        run += runWeight << sym;
        runWeight <<= 1;
        continue;
      }
      flushRun();
      if (sym === eob) break;
      const idx = sym - 1;
      const b = mtf[idx];
      mtf.splice(idx, 1);
      mtf.unshift(b);
      if (n >= blockMax) throw new Error("bzip2: block overflow");
      counts[b]++;
      tt[n++] = b;
    }
    if (origPtr >= n) throw new Error("bzip2: bad origin pointer");

    // Inverse Burrows-Wheeler: link each position to the next
    const start = new Int32Array(256);
    for (let i = 0, sum = 0; i < 256; i++) {
      start[i] = sum;
      sum += counts[i];
    }
    for (let i = 0; i < n; i++) {
      const b = tt[i] & 0xff;
      tt[start[b]++] |= i << 8;
    }

    // Undo the initial run-length step: four equal bytes are followed by a count of more
    let pos = tt[origPtr] >>> 8;
    let last = -1;
    let same = 0;
    for (let i = 0; i < n; i++) {
      const entry = tt[pos];
      const b = entry & 0xff;
      pos = entry >>> 8;
      if (same === 4) {
        for (let k = 0; k < b; k++) out[outPos++] = last;
        same = 0;
        last = -1;
        continue;
      }
      if (b === last) same++;
      else {
        same = 1;
        last = b;
      }
      out[outPos++] = b;
    }
  }
  return outPos === expectedSize ? out : out.slice(0, outPos);
}
