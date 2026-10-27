import {
  FOLDER_PATHS, filesRead, folderPickerSupported, forgetFolders, onRead, pickCacheFiles, pickSessionsFolder, reconnect, rememberedFolders,
  type FolderKind, type Folders,
} from "./runeliteFolder";
import { githubLink, kofiButton } from "./support";

/**
 * Setting up the folders the page reads. First a landing page, with nothing else on screen, that walks
 * through connecting the game cache step by step; then, from the replay, an optional default recordings
 * directory. Each says what it holds before the browser asks. Also a panel showing what the page can
 * see: the folders, every file it has read, and why it can't send them anywhere.
 */

/** The recorder's page on the Plugin Hub, once it's there */
export const PLUGIN_HUB_URL = "https://runelite.net/plugin-hub/show/encounter-recorder";

const LABELS: Record<FolderKind, { title: string; holds: string }> = {
  sessions: { title: "Your recordings", holds: "Encounter Recorder's sessions folder: the recordings you made, nothing else." },
  cache: { title: "The game cache", holds: "Jagex's game files (models, maps, sprites), the same for every player. Used to draw the game." },
};

const isWindows = () => /Win/.test(navigator.platform);
const pathOf = (kind: FolderKind) => FOLDER_PATHS[kind][isWindows() ? "windows" : "other"];

export class FolderUi {
  folders: Folders = {};
  private needPermission: Folders = {};
  /** The cache was connected as a whole folder before: that access was dropped, for its files instead */
  private upgraded = false;
  private readonly landing = document.getElementById("landing") as HTMLElement;
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

  /** Picks up the folders connected before; until the game cache is connected, only the landing page shows */
  async restore(skipLanding = false): Promise<void> {
    // The landing page shows at once, so the replay never flashes up behind it while the browser looks
    // up the folders it remembers
    if (!skipLanding) this.showLanding();
    const { ready, needPermission, upgraded } = await rememberedFolders();
    this.folders = ready;
    this.needPermission = needPermission;
    this.upgraded = upgraded;
    this.refreshButton();
    if (skipLanding) return;
    if (this.folders.cache) this.hideLanding();
    else this.showLanding();
  }

  // ---------- the landing page: the game cache, step by step ----------

  private showLanding(): void {
    document.body.classList.add("landing-open");
    this.landing.hidden = false;
    const card = el("div", "", "landing-card");
    const hub = el("p", "", "landing-hub");
    const link = el("a", "Encounter Recorder on the RuneLite Plugin Hub");
    link.href = PLUGIN_HUB_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    hub.append("Record your fights with ", link, ".");
    card.append(el("h1", "OSRS Encounter Replay", "osrs-title"), el("p", "Watch your fights back, tick by tick, with the game's own models.", "landing-lede"), hub);

    if (!folderPickerSupported()) {
      card.append(el("h2", "Use Chrome or Edge"), el("p", "The replay reads the game's files from your computer, which needs a Chromium browser: Chrome, Edge, Brave or Opera."));
      this.landing.replaceChildren(card);
      return;
    }

    const note = el("p", "", "landing-note");
    const see = el("button", "Check what this page can see", "link");
    see.onclick = () => this.showPrivacy();
    note.append("This page can't change your files nor send them anywhere. Everything is local. ", see);
    card.append(note);

    const error = el("p", "", "error");
    const again = this.needPermission.cache;
    if (again) {
      // Connected before: the browser only wants a click to allow it again
      const allow = el("button", "Allow access to the game cache", "primary big");
      allow.onclick = async () => {
        if (!(await reconnect(again))) return;
        this.cacheConnected(again);
      };
      card.append(el("h2", "Welcome back"), el("p", "Your browser asks once per visit before the replay may read the game cache again."), allow, error);
    } else {
      const choose = el("button", "Choose files…", "primary big");
      choose.onclick = async () => {
        try {
          this.cacheConnected(await pickCacheFiles());
        } catch (e) {
          // Cancelling the picker isn't worth a message
          if (!(e instanceof DOMException && e.name === "AbortError")) error.textContent = e instanceof Error ? e.message : String(e);
        }
      };
      const steps = el("ol", "", "landing-steps");
      steps.append(
        step("Copy the game cache's location", copyField(pathOf("cache"))),
        step(isWindows()
          ? "Click Choose files, paste the location into the address bar at the top of the window and press Enter"
          : "Click Choose files, press Cmd+Shift+G, paste the location and press Enter", choose, error),
        step(isWindows() ? "Press Ctrl+A to select every file it lists, then click Open" : "Press Cmd+A to select every file it lists, then click Open"),
      );
      const why = "Only the game's own files (main_file_cache) are listed: the page never gets the rest of that folder, which can hold your game settings and a remembered username.";
      card.append(el("h2", "One-time Game Cache Setup"), el("p", "This allows us to render the game properly", "muted"));
      if (this.upgraded) card.append(el("p", "The page now asks for just the game cache's files instead of its whole folder, so it can't even see anything else in there. Please choose them once more.", "landing-note"));
      card.append(steps, el("p", why, "muted"));
    }
    // At the bottom of the screen, out of the way of the setup
    const support = el("div", "", "landing-support");
    support.append(el("span", "Enjoying it?", "muted"), kofiButton(), githubLink("button"));
    this.landing.replaceChildren(card, support);
  }

  private hideLanding(): void {
    this.landing.hidden = true;
    document.body.classList.remove("landing-open");
  }

  private cacheConnected(files: FileSystemFileHandle[]): void {
    this.folders.cache = files;
    this.upgraded = false;
    delete this.needPermission.cache;
    this.hideLanding();
    this.refreshButton();
    this.changed("cache");
  }

  // ---------- the default recordings directory ----------

  /** The recordings directory dialog, opened by the header button, the drop area, or a link to a recording */
  open(why?: string): void {
    if (!folderPickerSupported()) {
      this.dialog.replaceChildren(el("h2", "Use Chrome or Edge"), el("p", "Reading your recordings from your computer needs a Chromium browser: Chrome, Edge, Brave or Opera. You can still drag a recording onto the page."), closeButton(this.dialog));
      this.dialog.showModal();
      return;
    }
    const connected = !!this.folders.sessions;
    const again = this.needPermission.sessions;
    const error = el("p", "", "error");
    const action = el("button", connected ? "Change folder…" : again ? "Allow again" : "Choose folder…", "primary");
    action.onclick = async () => {
      try {
        if (again && !connected) {
          if (!(await reconnect(again))) return;
          this.folders.sessions = again;
        } else {
          this.folders.sessions = await pickSessionsFolder();
        }
        delete this.needPermission.sessions;
        this.refreshButton();
        this.changed("sessions");
        this.dialog.close();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) error.textContent = e instanceof Error ? e.message : String(e);
      }
    };
    const steps = el("ol", "", "landing-steps");
    steps.append(
      step("Copy the recordings folder's location", copyField(pathOf("sessions"))),
      step(isWindows()
        ? "Click Choose folder, paste the location into the address bar, press Enter, then click Select Folder"
        : "Click Choose folder, press Cmd+Shift+G, paste the location, press Enter, then click Select", action, error),
      step("When the browser asks, click View files"),
    );
    this.dialog.replaceChildren(
      el("h2", "Default recording directory"),
      ...(why ? [el("p", why, "why")] : []),
      el("p", connected
        ? `Connected: "${this.folders.sessions!.name}". Your recordings are listed under Recordings… and the plugin's Open replay button opens them directly.`
        : "Set it once and your recordings are listed under Recordings…, and the plugin's Open replay button opens them directly. It holds only your recordings; the page can view them but not change them."),
      steps,
      closeButton(this.dialog, "Close"),
    );
    if (!this.dialog.open) this.dialog.showModal();
  }

  private refreshButton(): void {
    this.button.hidden = !!this.folders.sessions;
    this.button.textContent = this.needPermission.sessions ? "Reconnect Recording Directory" : "Setup Default Recording Directory";
  }

  // ---------- what the page can see ----------

  /** The folders it was given, every file it has read, and what it can't do */
  showPrivacy(): void {
    const folders = el("ul");
    const cache = this.folders.cache;
    folders.append(el("li", `${LABELS.cache.title}: ${cache ? `${cache.length} files (main_file_cache.dat2 and its .idx files), view only. Nothing else in their folder` : "not connected"}`));
    const sessions = this.folders.sessions;
    folders.append(el("li", `${LABELS.sessions.title}: ${sessions ? `"${sessions.name}" folder, view only` : "not connected"}`));
    const files = el("ul", "", "files-read");
    const sorted = [...filesRead].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    for (const [name, bytes] of sorted) files.append(el("li", `${name} · ${formatBytes(bytes)}`));
    if (!sorted.length) files.append(el("li", "Nothing yet", "muted"));
    const forget = el("button", "Forget both");
    forget.onclick = async () => {
      await forgetFolders();
      this.folders = {};
      this.needPermission = {};
      this.refreshButton();
      this.privacy.close();
      this.showLanding();
    };
    this.privacy.replaceChildren(
      el("h2", "What this page can see"),
      el("h3", "What it can read"),
      folders,
      el("h3", "Files read this visit"),
      files,
      el("h3", "What it can't do"),
      el("p", "Send anything anywhere. The page's security policy tells your browser to block every connection except loading the page itself, so your recordings and files stay on this computer. You can check it in your browser's developer tools (Network tab), or unplug the internet: the replay keeps working."),
      el("p", "No accounts, no cookies, no analytics."),
      el("div", "", "dialog-buttons"),
    );
    this.privacy.lastElementChild!.append(forget, closeButton(this.privacy));
    if (!this.privacy.open) this.privacy.showModal();
  }
}

function step(text: string, ...extra: HTMLElement[]): HTMLLIElement {
  const li = el("li");
  li.append(el("span", text), ...extra);
  return li;
}

/** A location to paste into the folder picker, with a copy button */
function copyField(path: string): HTMLElement {
  const where = el("div", "", "folder-path");
  const copy = el("button", "Copy");
  copy.onclick = () => void navigator.clipboard.writeText(path).then(() => (copy.textContent = "Copied ✓"));
  where.append(el("code", path), copy);
  return where;
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
