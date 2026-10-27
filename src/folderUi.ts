import {
  FOLDER_PATHS, filesRead, folderPickerSupported, forgetFolders, onRead, pickFolder, reconnect, rememberedFolders,
  type FolderKind, type Folders,
} from "./runeliteFolder";

/**
 * Connecting the two folders the page reads, with what each holds said before the browser asks, and a
 * panel showing what the page can see: the folders, every file it has read, and why it can't send them
 * anywhere.
 */

const LABELS: Record<FolderKind, { title: string; holds: string }> = {
  sessions: { title: "Your recordings", holds: "Encounter Recorder's sessions folder: the recordings you made, nothing else." },
  cache: { title: "The game cache", holds: "Jagex's game files (models, maps, sprites), the same for every player. Used to draw the game." },
};

const isWindows = () => /Win/.test(navigator.platform);

export class FolderUi {
  folders: Folders = {};
  private needPermission: Folders = {};
  private readonly dialog = document.getElementById("folderDialog") as HTMLDialogElement;
  private readonly privacy = document.getElementById("privacyDialog") as HTMLDialogElement;
  private readonly button = document.getElementById("connectFolder") as HTMLButtonElement;

  constructor(private readonly changed: (kind: FolderKind) => void) {
    this.button.onclick = () => this.open();
    (document.getElementById("privacyOpen") as HTMLButtonElement).onclick = () => this.showPrivacy();
    onRead(() => this.privacy.open && this.showPrivacy());
    for (const d of [this.dialog, this.privacy]) d.addEventListener("click", (e) => e.target === d && d.close());
    this.refreshButton();
  }

  async restore(): Promise<void> {
    const { ready, needPermission } = await rememberedFolders();
    this.folders = ready;
    this.needPermission = needPermission;
    this.refreshButton();
  }

  /** The connect dialog, opened by the header button or when something needs a folder */
  open(why?: string): void {
    if (!folderPickerSupported()) {
      this.dialog.replaceChildren(el("h2", "Use Chrome or Edge"), el("p", "Reading your recordings and the game cache from your computer needs a Chromium browser: Chrome, Edge, Brave or Opera."), closeButton(this.dialog));
      this.dialog.showModal();
      return;
    }
    const rows = (["sessions", "cache"] as const).map((kind) => this.row(kind));
    this.dialog.replaceChildren(
      el("h2", "Connect your RuneLite folders"),
      ...(why ? [el("p", why, "why")] : []),
      el("p", "The replay reads two folders on this computer. The browser will ask once for each, to view files only: it can't change them, and this page can't send them anywhere."),
      ...rows,
      el("p", "Not your .runelite folder itself: it also holds your logins, so the page turns it away.", "muted"),
      closeButton(this.dialog, "Done"),
    );
    if (!this.dialog.open) this.dialog.showModal();
  }

  private row(kind: FolderKind): HTMLElement {
    const row = el("div", "", "folder-row");
    const connected = !!this.folders[kind];
    const path = FOLDER_PATHS[kind][isWindows() ? "windows" : "other"];
    const head = el("div", "", "folder-head");
    head.append(el("b", LABELS[kind].title), el("span", connected ? "✓ connected" : this.needPermission[kind] ? "needs your OK again" : "", connected ? "ok" : "muted"));
    const where = el("div", "", "folder-path");
    const code = el("code", path);
    const copy = el("button", "Copy");
    copy.title = isWindows() ? "Paste it into the folder picker's address bar" : "In the folder picker, press Cmd+Shift+G and paste it";
    copy.onclick = () => void navigator.clipboard.writeText(path).then(() => (copy.textContent = "Copied"));
    where.append(code, copy);
    const action = el("button", connected ? "Change…" : this.needPermission[kind] ? "Allow again" : "Choose folder…", "primary");
    const error = el("p", "", "error");
    action.onclick = async () => {
      try {
        const again = this.needPermission[kind];
        if (again && !connected) {
          if (!(await reconnect(again))) return;
          this.folders[kind] = again;
        } else {
          this.folders[kind] = await pickFolder(kind);
        }
        delete this.needPermission[kind];
        this.refreshButton();
        this.changed(kind);
        this.open();
      } catch (e) {
        // Cancelling the picker isn't worth a message
        if (!(e instanceof DOMException && e.name === "AbortError")) error.textContent = e instanceof Error ? e.message : String(e);
      }
    };
    row.append(head, el("p", LABELS[kind].holds, "muted"), where, action, error);
    return row;
  }

  private refreshButton(): void {
    const missing = !this.folders.sessions || !this.folders.cache;
    this.button.hidden = !missing;
    this.button.textContent = this.needPermission.sessions || this.needPermission.cache ? "Reconnect RuneLite folders" : "Connect RuneLite folders";
  }

  /** What the page can see: the folders it was given, every file it has read, and what it can't do */
  showPrivacy(): void {
    const folders = el("ul");
    for (const kind of ["sessions", "cache"] as const) {
      const dir = this.folders[kind];
      folders.append(el("li", `${LABELS[kind].title}: ${dir ? `"${dir.name}" folder, view only` : "not connected"}`));
    }
    const files = el("ul", "", "files-read");
    const sorted = [...filesRead].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    for (const [name, bytes] of sorted) files.append(el("li", `${name} · ${formatBytes(bytes)}`));
    if (!sorted.length) files.append(el("li", "Nothing yet", "muted"));
    const forget = el("button", "Forget both folders");
    forget.onclick = async () => {
      await forgetFolders();
      this.folders = {};
      this.needPermission = {};
      this.refreshButton();
      this.showPrivacy();
    };
    this.privacy.replaceChildren(
      el("h2", "What this page can see"),
      el("h3", "Folders"),
      folders,
      el("h3", "Files read this visit"),
      files,
      el("h3", "What it can't do"),
      el("p", "Send anything anywhere. The page's security policy tells your browser to block every connection except loading the page itself, so your recordings and files stay on this computer. You can check it in your browser's developer tools (Network tab), or unplug the internet: the replay keeps working."),
      el("p", "No accounts, no cookies, no analytics. The source is public."),
      el("div", "", "dialog-buttons"),
    );
    this.privacy.lastElementChild!.append(forget, closeButton(this.privacy));
    if (!this.privacy.open) this.privacy.showModal();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function closeButton(dialog: HTMLDialogElement, label = "Close"): HTMLButtonElement {
  const b = el("button", label);
  b.onclick = () => dialog.close();
  return b;
}

function formatBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`;
}
