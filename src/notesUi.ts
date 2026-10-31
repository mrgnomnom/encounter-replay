import type { Notes } from "./notes";
import { pack } from "./packed";
import { ticksFromTail } from "./recordingList";
import type { Line } from "./session";

/**
 * Notes on the map: markers and your notes pop up at the bottom left of the view as playback passes them,
 * where they can be edited. + Note adds one at the tick shown, and Export downloads the timeline's view of
 * the recording, notes included, as a file to share.
 */

export interface NotesUiHooks {
  /** The tick shown, and the client cycle at that moment */
  tick(): number;
  cycle(): number;
  /** The timeline's view: the zoomed stretch, or the whole recording */
  range(): { from: number; to: number; zoomed: boolean };
  /** Redraws the timeline and the log after notes change */
  changed(): void;
  /** The recording's name, for the downloaded file's */
  baseName(): string;
  pause(): void;
}

// A note stays up for this many ticks after its own
const SHOW_TICKS = 5;

export class NotesUi {
  private readonly box = document.getElementById("notes") as HTMLElement;
  private readonly dialog = document.getElementById("exportDialog") as HTMLDialogElement;
  private shownKey = "";
  private editing: Line | "new" | undefined;
  private draftTick = 0;
  private draftCycle = 0;

  constructor(private readonly notes: Notes, private readonly hooks: NotesUiHooks) {
    (document.getElementById("addNote") as HTMLButtonElement).onclick = () => this.startNew();
    (document.getElementById("exportOpen") as HTMLButtonElement).onclick = () => this.openExport();
    this.dialog.addEventListener("click", (e) => e.target === this.dialog && this.dialog.close());
    document.addEventListener("keydown", (e) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (!typing && e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.startNew();
      }
    });
  }

  /** Called every frame: redraws only when the notes in view change */
  update(): void {
    const t = this.hooks.tick();
    const lines = this.notes.between(t - SHOW_TICKS + 1, t);
    const key = `${t}|${lines.map((l) => `${l.t}:${l.c}:${l.note}`).join("|")}|${this.editing === "new" ? "new" : this.editing ? "e" : ""}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.render(lines, t);
  }

  /** A new recording: nothing open for editing */
  reset(): void {
    this.editing = undefined;
    this.shownKey = "";
  }

  private render(lines: Line[], t: number): void {
    this.box.replaceChildren();
    // Newest at the bottom, nearest the timeline
    for (const line of lines) {
      if (this.editing === line) this.box.append(this.editor(line.note ?? "", line.t, (text) => this.save(line, text)));
      else this.box.append(this.card(line, t));
    }
    if (this.editing === "new") this.box.append(this.editor("", this.draftTick, (text) => this.save("new", text)));
  }

  private card(line: Line, t: number): HTMLElement {
    const yours = this.notes.isYours(line);
    const card = el("div", "", `note-card${line.t === t ? " now" : ""}${yours ? " yours" : ""}`);
    const head = el("div", "", "note-head");
    head.append(el("span", `${yours ? "Note" : "Marker"} · tick ${line.t}`));
    const tools = el("span", "", "note-tools");
    const edit = el("button", "✎");
    edit.title = "Edit";
    edit.onclick = () => {
      this.editing = line;
      this.hooks.pause();
      this.shownKey = "";
      this.update();
    };
    tools.append(edit);
    if (yours) {
      const remove = el("button", "✕");
      remove.title = "Delete this note";
      remove.onclick = () => {
        this.notes.remove(line);
        this.after();
      };
      tools.append(remove);
    }
    head.append(tools);
    card.append(head, el("div", line.note || "No note", line.note ? "note-text" : "note-text empty"));
    return card;
  }

  private editor(text: string, tick: number, done: (text: string | undefined) => void): HTMLElement {
    const card = el("div", "", "note-card editing");
    card.append(el("div", `Note · tick ${tick}`, "note-head"));
    const area = el("textarea");
    area.value = text;
    area.rows = 3;
    area.placeholder = "What happened here?";
    const save = el("button", "Save", "primary");
    const cancel = el("button", "Cancel", "link");
    save.onclick = () => done(area.value.trim());
    cancel.onclick = () => done(undefined);
    area.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
        e.preventDefault();
        done(area.value.trim());
      }
      if (e.key === "Escape") done(undefined);
    };
    const buttons = el("div", "", "note-buttons");
    buttons.append(el("span", "Enter saves · Shift+Enter new line", "hint"), cancel, save);
    card.append(area, buttons);
    setTimeout(() => area.focus(), 0);
    return card;
  }

  private startNew(): void {
    if (this.box.closest(".hidden") || this.editing === "new") return;
    this.hooks.pause();
    this.draftTick = this.hooks.tick();
    this.draftCycle = this.hooks.cycle();
    this.editing = "new";
    this.shownKey = "";
    this.update();
  }

  private save(target: Line | "new", text: string | undefined): void {
    if (text !== undefined) {
      if (target === "new") {
        if (text) this.notes.add(this.draftTick, this.draftCycle, text);
      } else {
        this.notes.edit(target, text);
      }
    }
    this.editing = undefined;
    this.after();
  }

  private after(): void {
    this.shownKey = "";
    this.hooks.changed();
    this.update();
  }

  // ---------- export ----------

  private openExport(): void {
    const { from, to, zoomed } = this.hooks.range();
    const seconds = ((to - from) * 0.6).toFixed(1);
    const hide = el("input");
    hide.type = "checkbox";
    hide.id = "exportHideNames";
    const hideLabel = el("label", "", "export-option");
    hideLabel.append(hide, " Hide player names ", el("span", "(yours becomes “You”, others “Player 1”, “Player 2”…)", "muted"));
    const notes = this.notes.between(from, to).length;
    const download = el("button", "Download", "primary");
    download.onclick = async () => {
      const text = this.notes.exportText({ from, to, hideNames: hide.checked });
      // Packed as the recorder packs recordings: about 18 times smaller, small enough to post anywhere
      const name = `${this.hooks.baseName()}${zoomed ? `-ticks-${from}-${to}` : ""}.jsonl.gz`;
      const url = URL.createObjectURL(await pack(text, ticksFromTail(text.slice(-8192))));
      const a = el("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.dialog.close();
    };
    const cancel = el("button", "Cancel");
    cancel.onclick = () => this.dialog.close();
    const buttons = el("div", "", "dialog-buttons");
    buttons.append(cancel, download);
    this.dialog.replaceChildren(
      el("h2", "Export recording"),
      el("p", zoomed ? `Ticks ${from}–${to} (${seconds} s), the stretch the timeline shows.` : `The whole recording (${seconds} s).`),
      ...(zoomed ? [] : [el("p", "To export just part of it, drag across the timeline first.", "muted")]),
      el("p", notes ? `Includes ${notes} note${notes === 1 ? "" : "s"}.` : "No notes in this stretch yet: press N to add one at the tick shown.", "muted"),
      hideLabel,
      el("p", "The file opens in the replay like any recording. It's saved on this computer only; share it however you like.", "muted"),
      buttons,
    );
    this.dialog.showModal();
    download.focus();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
