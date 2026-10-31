/**
 * Recordings are gzipped (.jsonl.gz) once the recorder stops them; older ones, and ones still being
 * written, are plain .jsonl. Both open the same way: the browser unpacks gzip itself, so no library is
 * needed. The recorder puts each one's length in the gzip header's comment, {"ticks":N}, so a list can
 * show it from the first few bytes instead of unpacking tens of megabytes.
 */

/** A recording's file name, plain or packed; only plain names, nothing that could reach outside its folder */
export const RECORDING_NAME = /^[\w.-]+\.jsonl(?:\.gz)?$/;

/** A recording's name without its ending: "20261027-TFA.jsonl.gz" → "20261027-TFA" */
export function withoutEnding(name: string): string {
  return name.replace(/\.jsonl(?:\.gz)?$/i, "").replace(/\.gz$/i, "");
}

export function isGzip(head: Uint8Array): boolean {
  return head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;
}

/** A recording's text, unpacked if it's gzipped. One cut off partway keeps the whole lines that came out of it */
export async function recordingText(file: Blob): Promise<string> {
  if (!isGzip(new Uint8Array(await file.slice(0, 2).arrayBuffer()))) return file.text();
  const reader = file.stream().pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream()).getReader();
  const parts: string[] = [];
  try {
    for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value);
  } catch {
    const text = parts.join("");
    return text.slice(0, text.lastIndexOf("\n") + 1);
  }
  return parts.join("");
}

const FLAG_EXTRA = 4;
const FLAG_NAME = 8;
const FLAG_COMMENT = 16;

/** The length a gzip's header gives, from its first few hundred bytes; undefined if it gives none */
export function ticksFromHeader(head: Uint8Array): number | undefined {
  if (!isGzip(head) || head.length < 10) return undefined;
  const flags = head[3];
  let at = 10;
  if (flags & FLAG_EXTRA) at += 2 + (head[at] | (head[at + 1] << 8));
  if (flags & FLAG_NAME) {
    while (at < head.length && head[at] !== 0) at++;
    at++;
  }
  if (!(flags & FLAG_COMMENT) || at >= head.length) return undefined;
  const end = head.indexOf(0, at);
  const comment = new TextDecoder("latin1").decode(head.subarray(at, end < 0 ? head.length : end));
  const m = /"ticks":(\d+)/.exec(comment);
  return m ? Number(m[1]) : undefined;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Packs a recording as the recorder does: gzip, with its length in the header when it's known */
export async function pack(text: string, ticks?: number): Promise<Blob> {
  const bytes = new TextEncoder().encode(text);
  const deflated = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
  const comment = ticks === undefined ? undefined : new TextEncoder().encode(`{"ticks":${ticks}}\0`);
  // Magic, deflate, flags, no time, no extra flags, unknown OS
  const header = new Uint8Array([0x1f, 0x8b, 8, comment ? FLAG_COMMENT : 0, 0, 0, 0, 0, 0, 255]);
  const trailer = new Uint8Array(8);
  const view = new DataView(trailer.buffer);
  view.setUint32(0, crc32(bytes), true);
  view.setUint32(4, bytes.length >>> 0, true);
  return new Blob([header, ...(comment ? [comment] : []), deflated, trailer], { type: "application/gzip" });
}
