/**
 * Recordings as the recorder's panel lists them: by the name they were given (the file's time stamp left
 * off, hyphens back to spaces, a repeated name's number as "TFA-1"), newest first. Here each also gets its
 * size and length in ticks.
 */

export interface RecordingFile {
  name: string;
  size: number;
  modified: number;
  /** How many ticks it spans, read from its last line; undefined if that couldn't be read */
  ticks?: number;
}

// yyyyMMdd-HHmmss-<name>.jsonl, as the recorder names files
const FILE = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(.*)\.jsonl$/;
// A repeated name's number: "TFA_1" in the file, shown as "TFA-1" (names never hold "_")
const COUNTED = /^(.*)_(\d+)$/;

/** The name a recording was given, as the plugin's panel shows it */
export function shownName(fileName: string): string {
  const m = FILE.exec(fileName);
  if (!m) return fileName.replace(/\.jsonl$/i, "");
  const label = m[7];
  if (!label) return "session";
  const counted = COUNTED.exec(label);
  return counted ? `${counted[1].replace(/-/g, " ")}-${counted[2]}` : label.replace(/-/g, " ");
}

/** When a recording started: its file's time stamp, or else when the file last changed */
export function recordedAt(f: RecordingFile): number {
  const m = FILE.exec(f.name);
  if (!m) return f.modified;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const when = new Date(y, mo - 1, d, h, mi, s).getTime();
  return Number.isNaN(when) ? f.modified : when;
}

/** Newest first, as the plugin's panel orders them; ties by file name in plain character order, as Java compares */
export function sortRecordings<T extends RecordingFile>(files: T[]): T[] {
  return [...files].sort((a, b) => recordedAt(b) - recordedAt(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** How many ticks a recording spans, from the end of its file: its last whole line's tick, counted from 0 */
export function ticksFromTail(tail: string): number | undefined {
  const lines = tail.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const t = (JSON.parse(line) as { t?: unknown }).t;
      if (typeof t === "number") return t + 1;
    } catch {
      // Cut off at the start of the tail, or still being written: try the line before
    }
  }
  return undefined;
}

/** How much of a file's end to read for its last line */
export const TAIL_BYTES = 8192;

/** "TFA 5man · 30.6 MB · 2,599 ticks" */
export function describeRecording(f: RecordingFile): string {
  const parts = [shownName(f.name), `${(f.size / 1048576).toFixed(1)} MB`];
  if (f.ticks !== undefined) parts.push(`${f.ticks.toLocaleString("en-GB")} ticks`);
  return parts.join(" · ");
}
