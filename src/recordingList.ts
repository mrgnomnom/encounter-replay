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

/**
 * How many ticks a recording spans, from the end of its file, as the plugin counts them: a stopped one
 * ends with its count (its end line's own tick is that count, not one more); one still being written, or
 * cut off, by its last whole line's tick, counted from 0
 */
export function ticksFromTail(tail: string): number | undefined {
  const lines = tail.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const last = JSON.parse(line) as { t?: unknown; e?: unknown; ticks?: unknown };
      if (last.e === "end" && typeof last.ticks === "number") return last.ticks;
      if (typeof last.t === "number") return last.t + 1;
    } catch {
      // Cut off at the start of the tail, or still being written: try the line before
    }
  }
  return undefined;
}

/** How much of a file's end to read for its last line */
export const TAIL_BYTES = 8192;

/** When it was recorded, as the plugin's list shows it: "27 Oct, 02:59", with the year only when it isn't this one */
export function shownTime(when: number, now = Date.now()): string {
  const date = new Date(when);
  const year = date.getFullYear() !== new Date(now).getFullYear();
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** "TFA 5man · 27 Oct, 02:59 · 30.6 MB · 2,599 ticks" */
export function describeRecording(f: RecordingFile, now = Date.now()): string {
  const parts = [shownName(f.name), shownTime(recordedAt(f), now), `${(f.size / 1048576).toFixed(1)} MB`];
  if (f.ticks !== undefined) parts.push(`${f.ticks.toLocaleString("en-GB")} ticks`);
  return parts.join(" · ");
}
