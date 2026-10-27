import type { Line, Session } from "./session";
import { playerNames, toJsonl, trimLines, type RawLine } from "./trim";

/**
 * Notes on a recording: your own, added at a tick, and the text of the markers dropped while recording.
 * Notes are "mark" lines like markers (marked by: "you"), so the timeline, log and an exported file all
 * treat them the same. Kept in the browser per recording until they're exported with it.
 */

interface Saved {
  added: { t: number; c: number; note: string }[];
  /** Recorded markers' notes as edited, by the marker's place in the file */
  edited: Record<number, string>;
}

export interface ExportOptions {
  from: number;
  to: number;
  hideNames: boolean;
}

export class Notes {
  private session: Session | undefined;
  private text = "";
  private storeKey = "";
  /** Recorded markers: their place among the file's lines, for saving edits and exporting */
  private readonly recordedIndex = new Map<Line, number>();
  private readonly edited = new Map<number, string>();
  private readonly added: Line[] = [];

  /** Picks up a newly opened recording, with any notes made on it before */
  load(session: Session, text: string, name: string): void {
    this.session = session;
    this.text = text;
    this.storeKey = `replay.notes:${name}:${session.lines.length}`;
    this.recordedIndex.clear();
    this.edited.clear();
    this.added.length = 0;
    session.lines.forEach((l, i) => {
      if (l.e === "mark") this.recordedIndex.set(l, i);
    });
    const saved = this.read();
    for (const [i, note] of Object.entries(saved?.edited ?? {})) {
      const line = session.lines[Number(i)];
      if (line?.e !== "mark") continue;
      line.note = note;
      this.edited.set(Number(i), note);
    }
    for (const n of saved?.added ?? []) this.add(n.t, n.c, n.note, false);
  }

  /** Markers and notes at ticks from..to, earliest first */
  between(from: number, to: number): Line[] {
    const out: Line[] = [];
    if (!this.session) return out;
    for (let t = Math.max(0, from); t <= to; t++) for (const l of this.session.events(t)) if (l.e === "mark") out.push(l);
    return out;
  }

  isYours(line: Line): boolean {
    return line.by === "you";
  }

  get count(): number {
    return this.session ? this.session.lines.filter((l) => l.e === "mark").length : 0;
  }

  add(t: number, c: number, note: string, save = true): Line | undefined {
    if (!this.session) return undefined;
    const line: Line = { t, c, e: "mark", note, by: "you" } as Line;
    this.session.addLine(line);
    this.added.push(line);
    if (save) this.save();
    return line;
  }

  edit(line: Line, note: string): void {
    line.note = note;
    const i = this.recordedIndex.get(line);
    if (i != null) this.edited.set(i, note);
    this.save();
  }

  remove(line: Line): void {
    if (!this.session || !this.isYours(line)) return;
    this.session.removeLine(line);
    const i = this.added.indexOf(line);
    if (i >= 0) this.added.splice(i, 1);
    this.save();
  }

  /**
   * The recording, or the stretch of it, as a file to share: the original lines with your notes in place
   * and markers' edited text, cut to the stretch with what it needs carried in (see trim.ts)
   */
  exportText({ from, to, hideNames }: ExportOptions): string {
    const lines = parse(this.text);
    for (const [i, note] of this.edited) if (lines[i]?.e === "mark") lines[i].note = note;
    for (const n of [...this.added].sort((a, b) => a.t - b.t || a.c - b.c)) {
      const at = lines.findIndex((l) => l.t > n.t || (l.t === n.t && l.c > n.c && l.e !== "header"));
      lines.splice(at < 0 ? lines.length : at, 0, { t: n.t, c: n.c, e: "mark", note: n.note, by: "you" });
    }
    let renames: [string, string][] = [];
    if (hideNames) {
      const { own, others } = playerNames(lines);
      renames = others.map((name, i) => [name, `Player ${i + 1}`]);
      if (own) renames.push([own, "You"]);
    }
    return toJsonl(trimLines(lines, from, to, { renames }));
  }

  private read(): Saved | undefined {
    try {
      const raw = localStorage.getItem(this.storeKey);
      return raw ? (JSON.parse(raw) as Saved) : undefined;
    } catch {
      return undefined;
    }
  }

  private save(): void {
    const saved: Saved = {
      added: this.added.map((l) => ({ t: l.t, c: l.c, note: l.note })),
      edited: Object.fromEntries(this.edited),
    };
    try {
      if (saved.added.length || this.edited.size) localStorage.setItem(this.storeKey, JSON.stringify(saved));
      else localStorage.removeItem(this.storeKey);
    } catch {
      // Storage blocked: notes last until the page closes
    }
  }
}

/** The file's lines as Session.parse reads them, unchanged, so their places match */
function parse(text: string): RawLine[] {
  const lines: RawLine[] = [];
  for (const raw of text.split("\n")) {
    const s = raw.trim();
    if (!s) continue;
    try {
      lines.push(JSON.parse(s));
    } catch {
      // Unreadable, as Session.parse skips it
    }
  }
  return lines;
}
