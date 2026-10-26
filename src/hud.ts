import type { Bundle } from "./cache/bundle";
import { GameUi } from "./gameui";
import type { ClickPoint } from "./accuracy";
import { targetsOf, type Target } from "./highlight";
import { isOthersHit, isYourHit, landedProjectile } from "./hits";
import type { EffectLinks } from "./links";
import { pendingAt, type Outcome, type OutcomeStatus } from "./outcomes";
import { effectsOfActor, relatesTo } from "./relevance";
import { refKey, stoppedTargeting, type Line, type Session } from "./session";

/**
 * The interface around the 3D view: orbs, the side panel as it was in game, this tick's clicks,
 * the timeline and the event log.
 */

const TAB_NAMES = ["Combat", "Skills", "Quests", "Inventory", "Equipment", "Prayer", "Magic",
  "Tab 7", "Tab 8", "Tab 9", "Logout", "Settings", "Emotes", "Music"];
const TAB_SHORT = ["Cmb", "Skl", "Qst", "Inv", "Eqp", "Pray", "Mag", "7", "8", "9", "Out", "Set", "Emo", "Mus"];
// Prayer book order. Deadeye and Mystic Vigour replace Eagle Eye and Mystic Might in the same slot
const PRAYERS: [string, string][] = [
  ["THICK_SKIN", "Thick Skin"], ["BURST_OF_STRENGTH", "Burst of Str"], ["CLARITY_OF_THOUGHT", "Clarity"],
  ["SHARP_EYE", "Sharp Eye"], ["MYSTIC_WILL", "Mystic Will"], ["ROCK_SKIN", "Rock Skin"],
  ["SUPERHUMAN_STRENGTH", "Superhuman"], ["IMPROVED_REFLEXES", "Imp. Reflex"], ["RAPID_RESTORE", "Rapid Rest."],
  ["RAPID_HEAL", "Rapid Heal"], ["PROTECT_ITEM", "Prot. Item"], ["HAWK_EYE", "Hawk Eye"],
  ["MYSTIC_LORE", "Mystic Lore"], ["STEEL_SKIN", "Steel Skin"], ["ULTIMATE_STRENGTH", "Ult. Str"],
  ["INCREDIBLE_REFLEXES", "Inc. Reflex"], ["PROTECT_FROM_MAGIC", "Prot. Mage"], ["PROTECT_FROM_MISSILES", "Prot. Range"],
  ["PROTECT_FROM_MELEE", "Prot. Melee"], ["EAGLE_EYE|DEADEYE", "Eagle/Dead"], ["MYSTIC_MIGHT|MYSTIC_VIGOUR", "Might/Vigour"],
  ["RETRIBUTION", "Retribution"], ["REDEMPTION", "Redemption"], ["SMITE", "Smite"], ["PRESERVE", "Preserve"],
  ["CHIVALRY", "Chivalry"], ["PIETY", "Piety"], ["RIGOUR", "Rigour"], ["AUGURY", "Augury"],
];
const WORN_SLOTS: [number, string][] = [[0, "Head"], [1, "Cape"], [2, "Neck"], [3, "Weapon"], [4, "Body"],
  [5, "Shield"], [7, "Legs"], [9, "Hands"], [10, "Feet"], [12, "Ring"], [13, "Ammo"]];
const SPELLBOOKS = ["Standard", "Ancient", "Lunar", "Arceuus"];
const INVENTORY_INTERFACE = 149;
// Data for drawing rather than events: definitions, map dumps, and appearance and movement-animation
// updates (which follow gear switches and are shown on the models instead)
const LOG_SKIP = new Set(["tick", "scene", "obj", "objdef", "npcdef", "itemdef", "stat", "look", "moves", "ui_layout", "press"]);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function div(className: string, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  if (className) d.className = className;
  if (text != null) d.textContent = text;
  return d;
}

function span(className: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = className;
  s.textContent = text;
  return s;
}

function compact(n: number): string {
  return n >= 10_000_000 ? Math.floor(n / 1e6) + "M" : n >= 100_000 ? Math.floor(n / 1e3) + "K" : String(n);
}

export class Hud {
  private viewTab = 3;
  private followTab = true;
  private timelineBase: ImageData | null = null;
  private bundle: Bundle | undefined;
  private readonly gameUi: GameUi;
  private outcomes: Outcome[] = [];
  /** Whose lines the log keeps, when filtering: a key like "me", "n123", "p45" */
  followKey = "me";
  filterLog = true;
  private links: EffectLinks | undefined;
  private outcomesByTick = new Map<number, Outcome[]>();
  /** The stretch of ticks the timeline shows, when zoomed in */
  private zoom: { from: number; to: number } | null = null;
  private accuracyPoints: ClickPoint[] | undefined;
  private readonly outcomeOf = new Map<Line, Outcome>();

  /** Called with what a hovered log line or click points at, or nothing when the hover ends */
  onHover: (targets: Target[]) => void = () => {};
  private hovered: Line | undefined;
  private session: Session | undefined;
  private shownTick = -1;

  constructor(private readonly onTabPicked: () => void) {
    // The in-game side panel, used when a cache bundle has the game's interface sprites
    this.gameUi = new GameUi($("aside"), (tab) => {
      this.followTab = false;
      $<HTMLInputElement>("followTab").checked = false;
      this.viewTab = tab;
      this.onTabPicked();
    });
    $("aside").prepend(this.gameUi.root);
    this.gameUi.show(false);
    const tabs = $("tabs");
    TAB_SHORT.forEach((label, i) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.title = TAB_NAMES[i];
      b.onclick = () => {
        this.followTab = false;
        ($("followTab") as HTMLInputElement).checked = false;
        this.viewTab = i;
        this.onTabPicked();
      };
      tabs.appendChild(b);
    });
    $<HTMLInputElement>("accuracy").onchange = () => {
      this.setAccuracy(this.accuracyPoints);
      this.onTabPicked();
    };
    $<HTMLInputElement>("followTab").onchange = (e) => {
      this.followTab = (e.target as HTMLInputElement).checked;
      this.onTabPicked();
    };
  }

  /** Click positions for the accuracy view, or undefined when the recording doesn't have them */
  setAccuracy(points: ClickPoint[] | undefined): void {
    this.accuracyPoints = points;
    const box = $<HTMLInputElement>("accuracy");
    box.disabled = !points;
    box.parentElement!.title = points ? "Every click of the session on its button: green hits, red misses"
      : "Needs a recording from the updated recorder (format 4), which records where each button was";
    this.gameUi.accuracy = points && box.checked ? points : undefined;
  }

  /** Shows a side panel tab regardless of the one open in game */
  pinTab(tab: number): void {
    this.followTab = false;
    $<HTMLInputElement>("followTab").checked = false;
    this.viewTab = tab;
  }

  /** Which effects come with which animations, to mention them on animation lines */
  setLinks(links: EffectLinks): void {
    this.links = links;
  }

  /** What the server did with each click, for badges, the timeline and pending markers */
  setOutcomes(outcomes: Outcome[]): void {
    this.outcomes = outcomes;
    this.outcomeOf.clear();
    this.outcomesByTick.clear();
    for (const o of outcomes) {
      this.outcomeOf.set(o.click, o);
      const list = this.outcomesByTick.get(o.click.t) ?? [];
      list.push(o);
      this.outcomesByTick.set(o.click.t, list);
    }
    this.zoom = null;
  }

  /** Draws the side panel as in game when the bundle has the interface sprites, plainly otherwise */
  setBundle(bundle: Bundle | undefined): void {
    this.bundle = bundle?.hasInterface ? bundle : undefined;
    const ingame = !!this.bundle;
    this.gameUi.show(ingame);
    for (const id of ["orbs", "tabs", "panelTitle", "panel"]) {
      const e = document.getElementById(id);
      if (e) e.style.display = ingame ? "none" : "";
    }
  }

  showMeta(session: Session, fileName: string): void {
    const h = session.header ?? ({} as Partial<Line>);
    $("meta").textContent = `${fileName} · ${h.label ?? "?"} · revision ${h.revision ?? "?"} · ` +
      `${session.lastTick + 1} ticks (${((session.lastTick + 1) * 0.6).toFixed(1)} s) · format ${h.format ?? "?"}` +
      (session.unreadable ? ` · ${session.unreadable} unreadable lines` : "");
  }

  /** Redraws everything that changes once per tick */
  showTick(session: Session, t: number, showVars: boolean): void {
    const tl = session.tickAt(t);
    const me = tl?.me;
    const orb = (id: string, text: string, on?: boolean) => {
      $(id).querySelector("b")!.textContent = text;
      $(id).classList.toggle("on", !!on);
    };
    orb("orbHp", me ? `${me.hpNow}` : "–");
    orb("orbPray", me ? `${me.prayNow}` : "–", tl?.ui?.quickPrayers === 1);
    orb("orbRun", me ? `${Math.floor(me.run / 100)}%` : "–", tl?.ui?.runOn);
    orb("orbSpec", me ? `${Math.floor(me.spec / 10)}%` : "–");

    const gameTab = session.tabAt(t);
    if (this.followTab) this.viewTab = gameTab;
    [...$("tabs").children].forEach((b, i) => {
      b.classList.toggle("game", i === gameTab);
      b.classList.toggle("view", i === this.viewTab);
    });
    $("panelName").textContent = TAB_NAMES[this.viewTab] + (this.viewTab === gameTab ? " (open in game)" : "");
    this.session = session;
    this.shownTick = t;
    // A hovered line from another tick is gone from the log: let go of its highlight
    if (this.hovered && this.hovered.t !== t) this.hover(undefined);
    this.renderPanel(session, t, gameTab);

    const clicks = session.events(t).filter((l) => l.e === "click");
    const panel = $("panel");
    panel.replaceChildren();
    if (this.viewTab === 3) panel.appendChild(this.inventory(session, t, clicks));
    else if (this.viewTab === 4) panel.appendChild(this.equipment(session, t));
    else if (this.viewTab === 5) panel.appendChild(this.prayers(session, t));
    else if (this.viewTab === 6) {
      const book = tl?.ui?.spellbook;
      panel.appendChild(div("muted", `Spellbook: ${book == null ? "not recorded" : SPELLBOOKS[book] ?? book}`));
    } else if (this.viewTab === 0) {
      const u = tl?.ui;
      panel.appendChild(div("muted", u ? `Attack style slot ${u.style} · auto retaliate ${u.autoRetaliate ? "on" : "off"}` : "Not recorded in this session"));
    } else {
      panel.appendChild(div("muted", "This tab isn't drawn in the replay"));
    }

    $("clickCount").textContent = clicks.length ? String(clicks.length) : "";
    const list = $("clicks");
    list.replaceChildren();
    const tickStart = session.tickAt(t - 1)?.c;
    for (const c of clicks) {
      const d = div("click-row hoverable");
      this.hoverable(d, c);
      const o = this.outcomeOf.get(c);
      if (o) d.appendChild(span(`badge ${o.status}`, BADGE[o.status]));
      d.appendChild(document.createTextNode(`${c.option} ${c.target || ""}`.trim()));
      // When in the tick it happened, and when the server's change arrived
      const into = o?.margin != null ? ` · ${o.margin} cycles before the tick's update` : tickStart != null ? ` · ${c.c - tickStart} cycles into the tick` : "";
      const result = o?.appliedTick != null ? ` · applied tick ${o.appliedTick}${o.serverTicks && o.serverTicks > 1 ? ` (${o.serverTicks} server ticks)` : ""}` : "";
      d.appendChild(span("w", `${into}${result}`));
      d.title = o ? OUTCOME_HELP[o.status] : "";
      list.appendChild(d);
    }
    if (!clicks.length) list.appendChild(div("muted", "–"));
    this.screen(session, clicks);
    this.log(session, t, showVars);
    $("tickLabel").textContent = `tick ${t} / ${session.lastTick} · ${(t * 0.6).toFixed(1)} s`;
  }

  private inventory(session: Session, t: number, clicks: Line[]): HTMLElement {
    const inv = session.itemsAt("inv", t);
    const before = session.itemsAt("inv", t - 1);
    const clicked = new Set(clicks.filter((c) => c.widget?.[0] === INVENTORY_INTERFACE).map((c) => c.p0));
    const grid = div("grid inv");
    for (let i = 0; i < 28; i++) {
      const [id, qty] = inv[i] ?? [-1, 0];
      const was = before[i] ?? [-1, 0];
      const slot = div("slot");
      if (clicked.has(i)) slot.classList.add("clicked");
      if (t > 0 && (was[0] !== id || was[1] !== qty)) slot.classList.add("changed");
      if (id > 0) {
        if (qty > 1) slot.appendChild(span("q", compact(qty)));
        slot.appendChild(span("n", session.itemName(id)));
        slot.title = `${session.itemName(id)} (${id}) ×${qty}`;
      }
      grid.appendChild(slot);
    }
    return grid;
  }

  private equipment(session: Session, t: number): HTMLElement {
    const worn = session.itemsAt("worn", t);
    const before = session.itemsAt("worn", t - 1);
    const grid = div("grid equip");
    for (const [slot, name] of WORN_SLOTS) {
      const [id, qty] = worn[slot] ?? [-1, 0];
      grid.appendChild(div("k", name));
      const v = div("", id > 0 ? session.itemName(id) + (qty > 1 ? ` ×${compact(qty)}` : "") : "–");
      if (t > 0 && (before[slot] ?? [-1])[0] !== id) v.classList.add("changed");
      grid.appendChild(v);
    }
    return grid;
  }

  private prayers(session: Session, t: number): HTMLElement {
    const on = new Set(session.tickAt(t)?.me?.prayers ?? []);
    const was = new Set(session.tickAt(t - 1)?.me?.prayers ?? []);
    const grid = div("grid pray");
    for (const [ids, label] of PRAYERS) {
      const names = ids.split("|");
      const slot = div("slot");
      slot.appendChild(span("n", label));
      const active = names.some((n) => on.has(n));
      if (active) slot.classList.add("on");
      if (t > 0 && active !== names.some((n) => was.has(n))) slot.classList.add("changed");
      grid.appendChild(slot);
    }
    return grid;
  }

  private screen(session: Session, clicks: Line[]): void {
    const c = $<HTMLCanvasElement>("screen");
    const ctx = c.getContext("2d")!;
    const W = session.header?.canvasW;
    const H = session.header?.canvasH;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#3a3732";
    ctx.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
    ctx.fillStyle = "#9a958b";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    if (!W || !H) {
      ctx.fillText("Click positions need a format 2 session", 8, c.height / 2);
      return;
    }
    const scale = Math.min((c.width - 2) / W, (c.height - 2) / H);
    const ox = (c.width - W * scale) / 2;
    const oy = (c.height - H * scale) / 2;
    ctx.strokeRect(ox, oy, W * scale, H * scale);
    for (const k of clicks) {
      if (k.mx == null) continue;
      const x = ox + k.mx * scale;
      const y = oy + k.my * scale;
      // Yellow for walking, red for everything else, like the game's own click crosses
      ctx.strokeStyle = k.action === "WALK" ? "#f1c40f" : "#e74c3c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
    }
  }

  private lastShowVars = false;

  private log(session: Session, t: number, showVars: boolean): void {
    this.lastShowVars = showVars;
    const log = $("log");
    log.replaceChildren();
    this.logRows.clear();
    // A selection from a timeline click lasts while its tick is shown
    if ([...this.selected].some((l) => l.t !== t)) this.selected.clear();
    const tied = this.filterLog ? effectsOfActor(session, this.links, this.followKey, t) : new Set<Line>();
    let hidden = 0;
    for (const l of session.events(t)) {
      if (LOG_SKIP.has(l.e) || (l.e === "var" && !showVars) || ((l.e === "obj" || l.e === "obj_gone") && l.init)) continue;
      // Lines picked from the timeline show even when the filter would hide them
      if (this.filterLog && !this.selected.has(l) && !relatesTo(session, l, this.followKey, tied)) {
        hidden++;
        continue;
      }
      const d = div(`${l.e === "mark" ? "mark " : ""}hoverable${this.selected.has(l) ? " tl-selected" : ""}`);
      this.hoverable(d, l);
      this.logRows.set(l, d);
      d.appendChild(span("c", `c${l.c} `));
      d.appendChild(document.createTextNode(describe(session, l)));
      const effects = l.e === "anim" && this.links ? this.links.effectsOf(l).length : 0;
      if (effects) d.appendChild(span("w", ` with ${effects} effect${effects > 1 ? "s" : ""} (hover to play together)`));
      log.appendChild(d);
    }
    if (!log.childElementCount) log.appendChild(div("c", hidden ? "Nothing about them this tick" : "Nothing happened this tick"));
    if (hidden) log.appendChild(div("c", `${hidden} other line${hidden > 1 ? "s" : ""} hidden: untick "only lines about" to see them`));
  }

  /** The lines a timeline mark at tick t in a row stands for */
  marksAt(session: Session, t: number, row: MarkRow): Line[] {
    const events = session.events(t);
    if (row === "mark") return events.filter((l) => l.e === "mark");
    if (row === "hit") return events.filter((l) => l.e === "hit" && l.who && refKey(l.who) === this.followKey);
    if (row === "anim") return events.filter((l) => l.e === "anim" && l.who?.k === "npc" && l.a !== -1);
    return (this.outcomesByTick.get(t) ?? []).filter((o) => o.status === "late" || o.status === "delayed" || o.status === "ignored" || o.status === "cancelled").map((o) => o.click);
  }

  /**
   * The timeline mark under a point: its tick and the lines it stands for. Zoomed out, a mark a few
   * pixels either side still counts, since ticks are thinner than a pointer
   */
  markUnder(session: Session, clientX: number, clientY: number): { t: number; row: MarkRow; lines: Line[] } | undefined {
    const r = $("timeline").getBoundingClientRect();
    const f = (clientY - r.top) / r.height;
    const rows: MarkRow[] = f < 0.26 ? ["click", "mark"] : f < 0.61 ? ["hit", "mark"] : ["anim", "mark"];
    const centre = this.tickAtX(session, clientX);
    const [from, to] = this.range(session);
    const reach = Math.max(1, Math.round((3 * (to - from)) / Math.max(1, r.width)));
    for (let d = 0; d <= reach; d++) {
      for (const t of d === 0 ? [centre] : [centre - d, centre + d]) {
        for (const row of rows) {
          const lines = this.marksAt(session, t, row);
          if (lines.length) return { t, row, lines };
        }
      }
    }
    return undefined;
  }

  /** Hovering the timeline: a small tooltip, and the lines lit in the log when they're on screen */
  showMarkHover(session: Session, hit: { t: number; lines: Line[] } | undefined, clientX: number, clientY: number): void {
    const tip = $("timelineTip");
    for (const row of this.logRows.values()) row.classList.remove("tl-hover");
    if (!hit) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    const shown = hit.lines.slice(0, 3).map((l) => describe(session, l));
    if (hit.lines.length > 3) shown.push(`and ${hit.lines.length - 3} more`);
    tip.textContent = `tick ${hit.t}\n${shown.join("\n")}`;
    const wrap = $("timelineWrap").getBoundingClientRect();
    tip.style.left = `${Math.min(wrap.width - 220, Math.max(0, clientX - wrap.left - 20))}px`;
    tip.style.bottom = `${wrap.bottom - clientY + 14}px`;
    if (hit.t === this.shownTick) for (const l of hit.lines) this.logRows.get(l)?.classList.add("tl-hover");
  }

  /** After jumping to a mark: its lines picked out in the log, and what they refer to highlighted */
  selectLines(lines: Line[]): void {
    this.selected = new Set(lines);
    if (this.session) this.log(this.session, this.shownTick, this.lastShowVars);
    const first = lines.find((l) => this.logRows.has(l));
    this.logRows.get(first!)?.scrollIntoView({ block: "nearest" });
    if (first) this.hover(first);
  }
  private selected = new Set<Line>();
  private readonly logRows = new Map<Line, HTMLElement>();

  private renderPanel(session: Session, t: number, gameTab: number): void {
    if (!this.bundle) return;
    const thisTick = this.outcomes.filter((o) => o.click.t === t);
    const slot = this.hovered && (targetsOf(this.hovered, session).find((x) => x.kind === "slot") as Extract<Target, { kind: "slot" }> | undefined);
    // Hovering something in another tab shows that tab while the hover lasts
    const tab = slot ? slot.tab : this.viewTab;
    this.gameUi.render(session, t, this.bundle, tab, gameTab, pendingAt(this.outcomes, t), thisTick, slot ?? undefined);
  }

  private hoverable(row: HTMLElement, line: Line): void {
    row.onmouseenter = () => this.hover(line);
    row.onmouseleave = () => this.hover(undefined);
  }

  private hover(line: Line | undefined): void {
    if (line === this.hovered) return;
    this.hovered = line;
    const session = this.session;
    this.onHover(line && session ? targetsOf(line, session) : []);
    if (session) this.renderPanel(session, this.shownTick, session.tabAt(this.shownTick));
  }

  /** The ticks the timeline spans: the zoomed stretch, or the whole recording */
  private range(session: Session): [number, number] {
    return this.zoom ? [this.zoom.from, this.zoom.to] : [0, Math.max(1, session.lastTick)];
  }

  /** The tick under a point on the timeline */
  tickAtX(session: Session, clientX: number): number {
    const r = $("timeline").getBoundingClientRect();
    const [from, to] = this.range(session);
    const p = Math.min(1, Math.max(0, (clientX - r.left - 4) / (r.width - 8)));
    return Math.round(from + p * (to - from));
  }

  /** Where a tick sits on the timeline, in page pixels */
  xOfTick(session: Session, tick: number): number {
    const r = $("timeline").getBoundingClientRect();
    const [from, to] = this.range(session);
    return r.left + 4 + ((r.width - 8) * (tick - from)) / Math.max(1, to - from);
  }

  /** Shows the stretch being dragged out, or hides it */
  showSelection(session: Session, a: number | null, b?: number): void {
    const sel = $("timelineSel");
    sel.hidden = a === null || b === undefined;
    if (a === null || b === undefined) return;
    const left = $("timelineWrap").getBoundingClientRect().left;
    const x1 = this.xOfTick(session, Math.min(a, b)) - left;
    const x2 = this.xOfTick(session, Math.max(a, b)) - left;
    sel.style.left = `${x1}px`;
    sel.style.width = `${Math.max(2, x2 - x1)}px`;
  }

  /** Zooms the timeline into a stretch of ticks, or back out to the whole recording */
  setZoom(session: Session, from: number | null, to?: number): void {
    this.zoom = from === null || to === undefined ? null : { from: Math.max(0, from), to: Math.min(session.lastTick, to) };
    $("zoomReset").hidden = !this.zoom;
    $("zoomLabel").hidden = !this.zoom;
    if (this.zoom) $("zoomLabel").textContent = `ticks ${this.zoom.from}–${this.zoom.to} (${((this.zoom.to - this.zoom.from) * 0.6).toFixed(1)} s)`;
    this.drawTimeline(session);
  }

  drawTimeline(session: Session): void {
    const canvas = $<HTMLCanvasElement>("timeline");
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    const [from, to] = this.range(session);
    const span = Math.max(1, to - from);
    ctx.fillStyle = "#22201d";
    ctx.fillRect(0, 0, W, H);
    const x = (t: number) => 4 * dpr + ((W - 8 * dpr) * (t - from)) / span;
    // Zoomed in, each tick's marks widen to fill its share of the timeline
    const tickW = Math.max(dpr, ((W - 8 * dpr) / span) * 0.8);
    if (span <= 200) {
      // Close enough to count ticks: a faint line on each one
      ctx.fillStyle = "#2c2a26";
      for (let t = from; t <= to; t++) ctx.fillRect(x(t), 0, 1, H);
    }
    session.byTick.forEach((events, t) => {
      if (t < from || t > to) return;
      let anim = false;
      let hit = false;
      let mark = false;
      for (const l of events) {
        if (l.e === "anim" && l.who?.k === "npc" && l.a !== -1) anim = true;
        if (l.e === "hit" && l.who && refKey(l.who) === this.followKey) hit = true;
        if (l.e === "mark") mark = true;
      }
      if (anim) { ctx.fillStyle = ANIM_COLOR; ctx.fillRect(x(t), H * 0.62, tickW, H * 0.3); }
      if (hit) { ctx.fillStyle = "#f0604f"; ctx.fillRect(x(t), H * 0.3, Math.max(1.5 * dpr, tickW), H * 0.3); }
      if (mark) { ctx.fillStyle = "#b08cf0"; ctx.fillRect(x(t) - dpr, 0, Math.max(3 * dpr, tickW), H); }
      // Clicks the server took late or never acted on, along the top edge
      for (const o of this.outcomesByTick.get(t) ?? []) {
        const color = o.status === "late" ? "#f1c40f" : o.status === "delayed" ? "#6fa0ea" : o.status === "ignored" || o.status === "cancelled" ? "#ffffff" : null;
        if (color) { ctx.fillStyle = color; ctx.fillRect(x(t), 0, Math.max(1.5 * dpr, tickW), H * 0.22); }
      }
    });
    this.timelineBase = ctx.getImageData(0, 0, W, H);
  }

  drawCursor(session: Session, position: number): void {
    if (!this.timelineBase) return;
    const canvas = $<HTMLCanvasElement>("timeline");
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.putImageData(this.timelineBase, 0, 0);
    const [from, to] = this.range(session);
    // Outside a zoomed stretch the playhead isn't drawn
    if (position < from || position > to) return;
    const x = 4 * dpr + ((canvas.width - 8 * dpr) * (position - from)) / Math.max(1, to - from);
    ctx.fillStyle = "#ece8e1";
    ctx.fillRect(x - dpr, 0, 2 * dpr, canvas.height);
  }
}

// NPC animations on the timeline: teal, well clear of the yellow "late" marks
const ANIM_COLOR = "#3cc0a8";

/** A row of marks on the timeline, from the top: click outcomes, hits, NPC animations; markers span all */
type MarkRow = "click" | "hit" | "anim" | "mark";

const BADGE: Record<OutcomeStatus, string> = {
  "on-time": "✓", late: "late", delayed: "held", already: "=", ignored: "✗", superseded: "↺", cancelled: "⊘", unknown: "·",
};

const OUTCOME_HELP: Record<OutcomeStatus, string> = {
  "on-time": "The server acted on this at its next tick",
  late: "This missed the server's cut-off for its tick and landed at the next one",
  delayed: "The game held this for several ticks (a potion or food delay, walking into range)",
  already: "Nothing to change: it was already that way",
  ignored: "The server never made this change",
  superseded: "A later click in the same tick undid this before the server got to it",
  cancelled: "Another plugin cancelled this click, so it never reached the server",
  unknown: "Not a kind of click the replay follows yet",
};

export function describe(session: Session, l: Line): string {
  const who = (r: Line["who"]) => session.label(r);
  // "you take", "Ocellus takes"
  const verb = (r: Line["who"], base: string, s = `${base}s`) => (r?.k === "me" ? base : s);
  switch (l.e) {
    case "anim": return `${who(l.who)} animation ${l.a}`;
    case "spot": return `${who(l.who)} graphics ${l.spot.map((s: { id: number }) => s.id).join(", ") || "cleared"}`;
    case "gfx": return `graphic ${l.id} at ${l.x},${l.y}`;
    case "proj": return `projectile ${l.id} ${who(l.from)} → ${who(l.to)}, ${l.endCycle - l.startCycle} cycles`;
    case "hit": {
      // Only a projectile landing on the same cycle names a source: everything else stays unattributed
      const proj = landedProjectile(session, l);
      const source = proj ? ` (${session.label(proj.from)}, projectile ${proj.id})` : isYourHit(l) ? " (yours)" : isOthersHit(l) ? " (not yours)" : "";
      return `${who(l.who)} ${verb(l.who, "take", "takes")} ${l.amount}${source}`;
    }
    case "sound": return `sound ${l.id}${l.from ? " from " + who(l.from) : ""}${l.delay ? " delay " + l.delay : ""}`;
    case "area_sound": return `area sound ${l.id} at ${l.x},${l.y}`;
    case "click": return `click: ${l.option} ${l.target || ""}`.trim();
    case "items": return `${l.which === "inv" ? "inventory" : "equipment"} changed`;
    case "target": {
      if (l.at) return `${who(l.who)} ${verb(l.who, "target")} ${who(l.at)}`;
      const was = stoppedTargeting(session, l);
      return `${who(l.who)} ${verb(l.who, "stop")} targeting${was ? ` ${who(was)}` : ""}`;
    }
    case "say": return `${who(l.who)} ${l.who?.k === "me" ? "say" : "says"} "${l.text}"`;
    case "chat": return l.who !== undefined ? `${who(l.who)}: ${l.text}` : `[${l.type}] ${l.text}`;
    case "var": return `var ${l.varbit !== -1 ? "varbit " + l.varbit : "varp " + l.varp} = ${l.value}`;
    case "npc_spawn": return `${who(l.who)} appears at ${l.x},${l.y}`;
    case "npc_gone": return `${who(l.who)} leaves${l.dead ? " (dead)" : ""}`;
    case "npc_changed": return `${who(l.who)} changes from ${session.npcName(l.from)}`;
    case "ui_tab": return `side panel → ${TAB_NAMES[l.tab] ?? l.tab}`;
    case "look": return `${who(l.who)} appearance (combat ${l.cb ?? "?"})`;
    case "moves": return `${who(l.who)} movement anims ${l.anims.join(", ")}`;
    case "mark": return `MARK: ${l.note}`;
    case "widget_open": return `interface ${l.group} opened`;
    case "widget_close": return `interface ${l.group} closed`;
    case "death": return `${who(l.who)} died`;
    case "item": return `${session.itemName(l.id)}${l.qty > 1 ? ` ×${l.qty}` : ""} appears on the ground`;
    case "item_gone": return `${session.itemName(l.id)} leaves the ground`;
    default: {
      const rest = Object.fromEntries(Object.entries(l).filter(([k]) => !["t", "c", "e"].includes(k)));
      return `${l.e} ${JSON.stringify(rest).slice(0, 140)}`;
    }
  }
}
