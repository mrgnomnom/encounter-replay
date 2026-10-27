/**
 * A short guided tour of the replay on the demo recording: each step lights up one part of the page with a
 * card beside it. The page stays usable, so a step can be done by hand, or Next does it. Skipping or
 * finishing ends on how to open your own recordings.
 */

export interface TourHooks {
  /** Opens the demo recording; resolves once it's open */
  openDemo(): Promise<void>;
  seek(t: number): void;
  pause(): void;
  /** Follows whoever the follow list names with this text, or "me" */
  follow(who: string): void;
  /** Shows a side panel tab, as clicking it does */
  pickTab(tab: number): void;
  /** Ticks "follow the tab open in game" */
  followGameTab(): void;
  /** Where a tick's late-click mark sits, along the top of the timeline */
  lateMark(t: number): DOMRect | undefined;
  importRecording(): void;
  setDirectory(): void;
}

interface Step {
  title: string;
  text: string;
  /** What to light up, an element or a spot on screen; nothing centres the card */
  target?: () => Element | DOMRect | null | undefined;
  /** Sets the scene when the step opens */
  enter?: () => void;
  /** What Next does before moving on, for steps that ask you to do something */
  next?: () => void;
}

const DONE_KEY = "replay.tutorialDone";
const INVENTORY = 3;
const $ = (selector: string) => document.querySelector(selector);

export const tutorialDone = (): boolean => {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
};

export class Tour {
  private readonly spot = document.createElement("div");
  private readonly card = document.createElement("div");
  private steps: Step[] = [];
  private at = -1;
  private frame = 0;

  constructor(private readonly hooks: TourHooks) {
    this.spot.className = "tour-spot";
    this.card.className = "tour-card";
    this.card.setAttribute("role", "dialog");
    document.addEventListener("keydown", (e) => {
      if (this.at >= 0 && e.key === "Escape") this.finish();
    });
  }

  get running(): boolean {
    return this.at >= 0;
  }

  /** Opens the demo and starts the tour, at a later step if given (for screenshots) */
  async start(from = 0): Promise<void> {
    await this.hooks.openDemo();
    const h = this.hooks;
    this.steps = [
      {
        title: "Welcome to OSRS Replay",
        text: "Here's an example recording. You can record anything!",
        enter: () => { h.pause(); h.follow("me"); h.followGameTab(); h.seek(3); },
      },
      {
        title: "Play it back",
        text: "Play with spacebar, step tick by tick with ← →, or click the timeline to jump.",
        target: () => $("footer .transport"),
      },
      {
        title: "The log",
        text: "Shows everything that happened this tick: clicks, attacks and hits. Hover a line to see it on the map.",
        target: () => $("#log"),
        enter: () => { h.follow("me"); h.seek(13); },
      },
      {
        title: "Camera and follow",
        text: "Follow picks whose side you watch: the camera and log stick with them. Drag to orbit, right-drag to pan, scroll to zoom.",
        target: () => $("#viewControls"),
        enter: () => h.follow("me"),
      },
      {
        title: "Your side panel",
        text: "Your inventory, gear and prayers, as they were. This is what you saw that tick.",
        target: () => $(".game-ui .side-panel") ?? $("#tabs"),
        enter: () => { h.follow("me"); h.followGameTab(); h.seek(14); },
      },
      {
        title: "Look inside a tab",
        text: "You can look at other tabs at any time. Try Inventory.",
        target: () => $(`.game-ui [data-tab="${INVENTORY}"]`) ?? $(`#tabs [data-tab="${INVENTORY}"]`),
        enter: () => { h.follow("me"); h.followGameTab(); h.seek(14); },
        next: () => h.pickTab(INVENTORY),
      },
      {
        title: "Back to what you saw",
        text: "Tick this to go back to the tab you had open in game as it plays.",
        target: () => $("#followTab")?.parentElement,
        next: () => h.followGameTab(),
      },
      {
        title: "Late clicks",
        text: "Yellow marks are late clicks. Here Torva was clicked 20 ms before the tick ended, so the game put it on a tick later. Hover a mark to see what it was.",
        target: () => h.lateMark(12) ?? $("#timeline"),
        enter: () => { h.follow("me"); h.followGameTab(); h.seek(12); },
      },
    ];
    this.card.classList.remove("tour-end");
    document.body.append(this.spot, this.card);
    // Later steps build on the scene the earlier ones set
    for (let i = 0; i < from && i < this.steps.length; i++) this.steps[i].enter?.();
    if (from >= this.steps.length) {
      this.finish();
      return;
    }
    this.show(from);
  }

  private show(i: number): void {
    this.at = i;
    const step = this.steps[i];
    step.enter?.();
    this.render(step, i);
    cancelAnimationFrame(this.frame);
    // Panels redraw as the replay plays: keep the light on its target
    const follow = () => {
      this.place(step);
      this.frame = requestAnimationFrame(follow);
    };
    follow();
  }

  private render(step: Step, i: number): void {
    const count = document.createElement("span");
    count.className = "tour-count";
    count.textContent = `${i + 1} / ${this.steps.length}`;
    const title = document.createElement("b");
    title.textContent = step.title;
    const text = document.createElement("p");
    text.textContent = step.text;
    const skip = document.createElement("button");
    skip.className = "link";
    skip.textContent = "Skip tour";
    skip.onclick = () => this.finish();
    const next = document.createElement("button");
    next.className = "primary";
    next.textContent = i === this.steps.length - 1 ? "Finish" : "Next";
    next.onclick = () => this.advance();
    const buttons = document.createElement("div");
    buttons.className = "tour-buttons";
    buttons.append(skip);
    if (i > 0) {
      const back = document.createElement("button");
      back.textContent = "Back";
      back.onclick = () => this.show(i - 1);
      buttons.append(back);
    }
    buttons.append(next);
    this.card.replaceChildren(count, title, text, buttons);
    next.focus();
  }

  private advance(): void {
    const step = this.steps[this.at];
    step?.next?.();
    if (this.at + 1 < this.steps.length) this.show(this.at + 1);
    else this.finish();
  }

  /** Lights the target and sets the card beside it, where there's room */
  private place(step: Step): void {
    const target = step.target?.();
    const pad = 6;
    const card = this.card.getBoundingClientRect();
    if (!target) {
      this.spot.style.cssText = "left:50%;top:50%;width:0;height:0";
      this.card.style.left = `${(innerWidth - card.width) / 2}px`;
      this.card.style.top = `${(innerHeight - card.height) / 2}px`;
      return;
    }
    const r = target instanceof DOMRect ? target : target.getBoundingClientRect();
    Object.assign(this.spot.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    const gap = 14;
    const spaces = [
      { side: "below", room: innerHeight - r.bottom },
      { side: "above", room: r.top },
      { side: "left", room: r.left },
      { side: "right", room: innerWidth - r.right },
    ];
    const fits = spaces.find((s) => (s.side === "below" || s.side === "above" ? s.room > card.height + gap : s.room > card.width + gap)) ?? spaces[0];
    let x = r.left + r.width / 2 - card.width / 2;
    let y = r.bottom + gap;
    if (fits.side === "above") y = r.top - gap - card.height;
    if (fits.side === "left" || fits.side === "right") {
      x = fits.side === "left" ? r.left - gap - card.width : r.right + gap;
      y = r.top + r.height / 2 - card.height / 2;
    }
    this.card.style.left = `${Math.max(12, Math.min(innerWidth - card.width - 12, x))}px`;
    this.card.style.top = `${Math.max(12, Math.min(innerHeight - card.height - 12, y))}px`;
  }

  /** Skipped or finished: the tour ends on how to open your own recordings */
  private finish(): void {
    cancelAnimationFrame(this.frame);
    this.at = -1;
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // Storage blocked: the tour shows again next time
    }
    // No dimming at the end, so the glowing header buttons show where to go next
    this.spot.remove();
    const title = document.createElement("b");
    title.textContent = "Now watch your own fights";
    const text = document.createElement("p");
    text.textContent = "Drag a recording onto the page, or import one. Set a default recording directory and the plugin's Open replay button takes you straight to each new recording.";
    const importButton = document.createElement("button");
    importButton.className = "primary";
    importButton.textContent = "Import Recording";
    importButton.onclick = () => { this.close(); this.hooks.importRecording(); };
    const directory = document.createElement("button");
    directory.textContent = "Set default directory";
    directory.onclick = () => { this.close(); this.hooks.setDirectory(); };
    const stay = document.createElement("button");
    stay.className = "link";
    stay.textContent = "Keep watching";
    stay.onclick = () => this.close();
    const buttons = document.createElement("div");
    buttons.className = "tour-buttons";
    buttons.append(stay, directory, importButton);
    this.card.replaceChildren(title, text, buttons);
    this.card.classList.add("tour-end");
    this.place({ title: "", text: "" });
    importButton.focus();
    // The header's buttons glow for a moment, so they're easy to find again
    for (const id of ["openSession", "connectFolder"]) {
      const b = document.getElementById(id);
      b?.classList.remove("tour-glow");
      void b?.offsetWidth;
      b?.classList.add("tour-glow");
    }
  }

  private close(): void {
    this.spot.remove();
    this.card.remove();
    this.card.classList.remove("tour-end");
  }
}
