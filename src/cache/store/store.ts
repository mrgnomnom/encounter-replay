// Reads the game cache's own files (main_file_cache.dat2 and its .idx files), as RuneLite's cache library
// does (net.runelite.cache.fs, BSD-2-Clause, see LICENSE in this folder). Nothing is written.
import { gunzipSync } from "fflate";
import { bunzip2 } from "./bzip2";
import { InputStream } from "./input";

/** Where the cache's files come from: a folder the browser was given, or the disk in Node */
export interface CacheSource {
  /** Up to `length` bytes of a cache file from `offset`; fewer at its end */
  read(name: string, offset: number, length: number): Promise<Uint8Array>;
  /** A whole (small) file, or undefined if it's missing */
  readAll(name: string): Promise<Uint8Array | undefined>;
}

export interface ArchiveInfo {
  id: number;
  nameHash: number;
  crc: number;
  revision: number;
  /** File ids in the order the archive packs them */
  files: number[];
}

export interface IndexInfo {
  id: number;
  revision: number;
  archives: Map<number, ArchiveInfo>;
  /** The .idx file: 6 bytes per archive, its size and first sector in the data file */
  entries: Uint8Array;
}

const SECTOR_SIZE = 520;
const DATA_FILE = "main_file_cache.dat2";
const META_INDEX = 255;

export class CacheStore {
  private readonly indexes = new Map<number, Promise<IndexInfo | undefined>>();

  private constructor(private readonly source: CacheSource, private readonly meta: Uint8Array) {}

  static async open(source: CacheSource): Promise<CacheStore> {
    const meta = await source.readAll(`main_file_cache.idx${META_INDEX}`);
    if (!meta) throw new Error("No main_file_cache.idx255: this isn't a game cache folder");
    return new CacheStore(source, meta);
  }

  /** An index's reference table: which archives and files it has, and their revisions */
  index(id: number): Promise<IndexInfo | undefined> {
    let p = this.indexes.get(id);
    if (!p) {
      p = this.loadIndex(id);
      this.indexes.set(id, p);
    }
    return p;
  }

  /** A whole archive, decompressed: one file's contents, or several files packed together */
  async group(indexId: number, archiveId: number): Promise<Uint8Array | undefined> {
    const index = await this.index(indexId);
    if (!index || !index.archives.has(archiveId)) return undefined;
    const raw = await this.readEntry(indexId, index.entries, archiveId);
    return raw ? decompress(raw).data : undefined;
  }

  /** An archive's files by id */
  async files(indexId: number, archiveId: number): Promise<Map<number, Uint8Array> | undefined> {
    const index = await this.index(indexId);
    const archive = index?.archives.get(archiveId);
    if (!archive) return undefined;
    const data = await this.group(indexId, archiveId);
    return data ? splitArchive(data, archive.files) : undefined;
  }

  /** One file of an archive */
  async file(indexId: number, archiveId: number, fileId: number): Promise<Uint8Array | undefined> {
    return (await this.files(indexId, archiveId))?.get(fileId);
  }

  private async loadIndex(id: number): Promise<IndexInfo | undefined> {
    const entries = await this.source.readAll(`main_file_cache.idx${id}`);
    if (!entries) return undefined;
    const raw = await this.readEntry(META_INDEX, this.meta, id);
    if (!raw) return undefined;
    return { id, entries, ...readReferenceTable(decompress(raw).data) };
  }

  /** An entry's bytes from the data file, following its chain of sectors */
  private async readEntry(indexId: number, entries: Uint8Array, archiveId: number): Promise<Uint8Array | undefined> {
    const at = archiveId * 6;
    if (at + 6 > entries.length) return undefined;
    const size = (entries[at] << 16) | (entries[at + 1] << 8) | entries[at + 2];
    let sector = (entries[at + 3] << 16) | (entries[at + 4] << 8) | entries[at + 5];
    if (size <= 0 || sector <= 0) return undefined;
    const big = archiveId > 0xffff;
    const header = big ? 10 : 8;
    const block = SECTOR_SIZE - header;
    const out = new Uint8Array(size);
    let done = 0;
    let part = 0;
    while (done < size) {
      if (sector === 0) return undefined;
      // Sectors usually follow one another, so read the rest in one go and walk it while they do
      const sectorsLeft = Math.ceil((size - done) / block);
      const chunk = await this.source.read(DATA_FILE, sector * SECTOR_SIZE, sectorsLeft * SECTOR_SIZE);
      let offset = 0;
      for (;;) {
        if (offset + header > chunk.length) return undefined;
        const c = chunk.subarray(offset, offset + SECTOR_SIZE);
        const n = Math.min(block, size - done);
        const archive = big ? ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0 : (c[0] << 8) | c[1];
        const p = big ? (c[4] << 8) | c[5] : (c[2] << 8) | c[3];
        const next = big ? (c[6] << 16) | (c[7] << 8) | c[8] : (c[4] << 16) | (c[5] << 8) | c[6];
        const idx = big ? c[9] : c[7];
        if (archive !== archiveId || p !== part || idx !== indexId || c.length < header + n) return undefined;
        out.set(c.subarray(header, header + n), done);
        done += n;
        part++;
        if (done >= size) break;
        if (next !== sector + 1) {
          sector = next;
          break;
        }
        sector = next;
        offset += SECTOR_SIZE;
      }
    }
    return out;
  }
}

/** A reference table (IndexData in the cache library) */
export function readReferenceTable(data: Uint8Array): { revision: number; archives: Map<number, ArchiveInfo> } {
  const s = new InputStream(data);
  const protocol = s.readUnsignedByte();
  if (protocol < 5 || protocol > 7) throw new Error(`Unsupported reference table protocol ${protocol}`);
  const revision = protocol >= 6 ? s.readInt() : 0;
  const flags = s.readUnsignedByte();
  const named = (flags & 1) !== 0;
  const sized = (flags & 4) !== 0;
  const count = () => (protocol >= 7 ? s.readBigSmart() : s.readUnsignedShort());
  const n = count();
  const list: ArchiveInfo[] = [];
  let last = 0;
  for (let i = 0; i < n; i++) list.push({ id: (last += count()), nameHash: 0, crc: 0, revision: 0, files: [] });
  if (named) for (const a of list) a.nameHash = s.readInt();
  for (const a of list) a.crc = s.readInt();
  if (sized) s.skip(8 * n);
  for (const a of list) a.revision = s.readInt();
  const fileCounts = list.map(() => count());
  list.forEach((a, i) => {
    let lastFile = 0;
    for (let f = 0; f < fileCounts[i]; f++) a.files.push((lastFile += count()));
  });
  // File name hashes follow when named; nothing here needs them
  return { revision, archives: new Map(list.map((a) => [a.id, a])) };
}

/** A container: compression type, length, the (de)compressed data and an optional revision */
export function decompress(raw: Uint8Array): { data: Uint8Array; compression: number } {
  const s = new InputStream(raw);
  const compression = s.readUnsignedByte();
  const length = s.readInt();
  if (length < 0) throw new Error("Invalid container");
  if (compression === 0) return { data: raw.slice(5, 5 + length), compression };
  const expected = s.readInt();
  const body = raw.subarray(9, 9 + length);
  let data: Uint8Array;
  if (compression === 1) data = bunzip2(body, expected);
  else if (compression === 2) data = gunzipSync(body);
  else throw new Error(`Unknown compression type ${compression}`);
  if (data.length !== expected) throw new Error(`Container decompressed to ${data.length} bytes, expected ${expected}`);
  return { data, compression };
}

/** Splits an archive holding several files into each file's contents (ArchiveFiles.loadContents) */
export function splitArchive(data: Uint8Array, fileIds: number[]): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  if (fileIds.length === 1) {
    out.set(fileIds[0], data);
    return out;
  }
  const count = fileIds.length;
  const s = new InputStream(data);
  s.setOffset(data.length - 1);
  const chunks = s.readUnsignedByte();
  s.setOffset(data.length - 1 - chunks * count * 4);
  const chunkSizes: number[][] = fileIds.map(() => new Array(chunks).fill(0));
  const sizes = new Array(count).fill(0);
  for (let chunk = 0; chunk < chunks; chunk++) {
    let size = 0;
    for (let id = 0; id < count; id++) {
      size += s.readInt();
      chunkSizes[id][chunk] = size;
      sizes[id] += size;
    }
  }
  const contents = sizes.map((n) => new Uint8Array(n));
  const offsets = new Array(count).fill(0);
  let at = 0;
  for (let chunk = 0; chunk < chunks; chunk++) {
    for (let id = 0; id < count; id++) {
      const n = chunkSizes[id][chunk];
      contents[id].set(data.subarray(at, at + n), offsets[id]);
      offsets[id] += n;
      at += n;
    }
  }
  fileIds.forEach((id, i) => out.set(id, contents[i]));
  return out;
}
