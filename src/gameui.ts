import type { Bundle } from "./cache/bundle";
import { spread, type ClickPoint } from "./accuracy";
import type { Target } from "./highlight";
import type { Outcome } from "./outcomes";
import { drawWidgets } from "./widgets";
import { latestAtOrBefore } from "./session";
import type { Line, Session } from "./session";

/**
 * The side panel drawn as in game, from the game's own sprites: the stone frame with its tabs, the
 * inventory with item icons and stack numbers, the prayer book lit as it was, the equipment screen,
 * and the hitpoints, prayer, run and special attack orbs. Laid out like the fixed-size client.
 */

// Sprite IDs, by their names in RuneLite's gameval SpriteID
const SIDE_BACKGROUND = 1031;
const SIDE_TOP = 1036;
const SIDE_BOTTOM = 1032;
const SIDE_LEFT_TOP = 1033;
const SIDE_LEFT_BOTTOM = 1034;
const SIDE_RIGHT = 1035;
const TAB_HIGHLIGHT = { topLeft: 1026, topRight: 1027, bottomLeft: 1028, bottomRight: 1029, middle: 1030 };
const PRAYER_GLOW = 4892;
const EQUIPMENT_SLOT_TILE = 170;
const ORB_FRAME = 1071;
const ORB_EMPTY = 1059;
// Tab icons in the order of the client's side panel tab numbers: top row 0-6, bottom row 7-13
const TAB_ICONS = [774, 775, 776, 777, 778, 779, 780, 2307, 781, 782, 784, 785, 786, 787];
const SPELLBOOK_TAB_ICONS = [780, 1583, 1584, 1711];
const TAB_NAMES = ["Combat", "Skills", "Quests", "Inventory", "Equipment", "Prayer", "Magic",
  "Tab 7", "Tab 8", "Tab 9", "Logout", "Settings", "Emotes", "Music"];

// The prayer book in order, with each prayer's sprite; Deadeye and Mystic Vigour take Eagle Eye's and
// Mystic Might's places once unlocked
const PRAYER_BOOK: [string, number, string?, number?][] = [
  ["THICK_SKIN", 115], ["BURST_OF_STRENGTH", 116], ["CLARITY_OF_THOUGHT", 117], ["SHARP_EYE", 133], ["MYSTIC_WILL", 134],
  ["ROCK_SKIN", 118], ["SUPERHUMAN_STRENGTH", 119], ["IMPROVED_REFLEXES", 120], ["RAPID_RESTORE", 121], ["RAPID_HEAL", 122],
  ["PROTECT_ITEM", 123], ["HAWK_EYE", 502], ["MYSTIC_LORE", 503], ["STEEL_SKIN", 124], ["ULTIMATE_STRENGTH", 125],
  ["INCREDIBLE_REFLEXES", 126], ["PROTECT_FROM_MAGIC", 127], ["PROTECT_FROM_MISSILES", 128], ["PROTECT_FROM_MELEE", 129],
  ["EAGLE_EYE", 504, "DEADEYE", 1422], ["MYSTIC_MIGHT", 505, "MYSTIC_VIGOUR", 1423], ["RETRIBUTION", 131], ["REDEMPTION", 130],
  ["SMITE", 132], ["PRESERVE", 947], ["CHIVALRY", 945], ["PIETY", 946], ["RIGOUR", 1420], ["AUGURY", 1421],
];

// Equipment slots: worn container index, empty-slot icon (Wornicons) and where the tile sits
const EQUIPMENT: [number, number, number, number][] = [
  [0, 156, 77, 6], [1, 157, 36, 45], [2, 158, 77, 45], [13, 166, 118, 45],
  [3, 159, 21, 84], [4, 161, 77, 84], [5, 162, 133, 84], [7, 163, 77, 124],
  [9, 164, 21, 164], [10, 165, 77, 164], [12, 160, 133, 164],
];

const INVENTORY_INTERFACE = 149;
const COMBAT_INTERFACE = 593;
const SPELLBOOK_INTERFACE = 218;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  parent?.appendChild(e);
  return e;
}

function sprite(bundle: Bundle, id: number, x: number, y: number, parent: HTMLElement, className = ""): HTMLImageElement | undefined {
  const src = bundle.uiSprite(id);
  if (!src) return undefined;
  const img = el("img", `gs ${className}`, parent);
  img.src = src;
  img.style.left = `${x}px`;
  img.style.top = `${y}px`;
  return img;
}

/** Stack numbers as the client writes them: yellow, then white thousands, then green millions */
function stackText(qty: number): { text: string; color: string } {
  if (qty >= 10_000_000) return { text: `${Math.floor(qty / 1_000_000)}M`, color: "#00ff80" };
  if (qty >= 100_000) return { text: `${Math.floor(qty / 1000)}K`, color: "#ffffff" };
  return { text: String(qty), color: "#ffff00" };
}

/** The orb number's colour, from green when full through yellow and orange to red */
function orbColor(fraction: number): string {
  if (fraction >= 0.75) return "#00ff00";
  if (fraction >= 0.5) return "#ffff00";
  if (fraction >= 0.25) return "#ff9800";
  return "#ff0000";
}

export class GameUi {
  readonly root: HTMLDivElement;
  private pending: Outcome[] = [];
  private thisTick: Outcome[] = [];
  /** A side panel button a hovered log line or click points at */
  private hovered: Extract<Target, { kind: "slot" }> | undefined;

  private pulse(parent: HTMLElement, x: number, y: number, w: number, h: number): void {
    this.mark(parent, x, y, w, h, "hl-pulse", "What the hovered line refers to");
  }
  /** Every click and miss of the session, when the accuracy view is on */
  accuracy: ClickPoint[] | undefined;
  private shownPoints: ClickPoint[] = [];

  /** Dots for every click on a button: green hits, red misses, this tick's larger */
  private dots(parent: HTMLElement, button: string, x: number, y: number, w: number, h: number, t: number): void {
    if (!this.accuracy) return;
    for (const p of this.accuracy) {
      if (p.button !== button) continue;
      this.shownPoints.push(p);
      const d = el("div", `acc-dot ${p.hit ? "hit" : "miss"}${p.t === t ? " now" : ""}`, parent);
      d.style.left = `${x + p.x * w}px`;
      d.style.top = `${y + p.y * h}px`;
    }
  }

  /** Marks a button for any pending or ignored click on it */
  private markClicks(parent: HTMLElement, x: number, y: number, w: number, h: number, matches: (o: Outcome) => boolean): void {
    if (this.pending.some(matches)) this.mark(parent, x, y, w, h, "pending", "Clicked, waiting on the server");
    const ignored = this.thisTick.find((o) => (o.status === "ignored" || o.status === "cancelled") && matches(o));
    if (ignored) this.mark(parent, x, y, w, h, "ignored", ignored.status === "cancelled" ? "Click cancelled by a plugin" : "The server ignored this click");
  }

  private mark(parent: HTMLElement, x: number, y: number, w: number, h: number, kind: string, title: string): void {
    const m = el("div", `click-mark ${kind}`, parent);
    Object.assign(m.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    m.title = title;
  }

  constructor(parent: HTMLElement, private readonly onTabPicked: (tab: number) => void) {
    this.root = el("div", "game-ui", parent);
  }

  show(on: boolean): void {
    this.root.style.display = on ? "" : "none";
  }

  /**
   * Draws the panel at tick t. Pending clicks (made, not yet acted on by the server) get a dashed
   * outline; clicks this tick the server ignored get a cross
   */
  render(session: Session, t: number, bundle: Bundle, viewTab: number, gameTab: number, pending: Outcome[] = [], thisTick: Outcome[] = [],
    hovered?: Extract<Target, { kind: "slot" }>): void {
    this.pending = pending;
    this.thisTick = thisTick;
    this.hovered = hovered;
    this.shownPoints = [];
    const root = this.root;
    root.replaceChildren();
    const tick = session.tickAt(t);
    const me = tick?.me;
    const ui = tick?.ui;

    // Orbs
    const orbs = el("div", "orbs-row", root);
    if (me) {
      this.orb(orbs, bundle, me.hpNow, me.hpNow / Math.max(1, me.hpMax), 1060, 1067);
      const praying = (me.prayers?.length ?? 0) > 0;
      this.orb(orbs, bundle, me.prayNow, me.prayNow / Math.max(1, me.prayMax), ui?.quickPrayers === 1 ? 1066 : 1063, praying ? 1058 : 1068);
      this.orb(orbs, bundle, Math.floor(me.run / 100), me.run / 10000, ui?.runOn ? 1065 : 1064, ui?.runOn ? 1070 : 1069);
      this.orb(orbs, bundle, Math.floor(me.spec / 10), me.spec / 1000, 1607, 1610);
    }

    // Frame: stones top and bottom, pillars at the sides, the stone background in the middle
    const panel = el("div", "side-panel", root);
    sprite(bundle, SIDE_TOP, 0, 0, panel);
    sprite(bundle, SIDE_LEFT_TOP, 0, 38, panel);
    sprite(bundle, SIDE_LEFT_BOTTOM, 3, 171, panel);
    sprite(bundle, SIDE_BACKGROUND, 31, 38, panel);
    sprite(bundle, SIDE_RIGHT, 221, 38, panel);
    sprite(bundle, SIDE_BOTTOM, 3, 299, panel);

    // Tabs: seven across each row; the open one has the red stone behind it
    for (let i = 0; i < 14; i++) {
      const row = i < 7 ? 0 : 1;
      const col = i % 7;
      const x = 9 + col * 33;
      const y = row === 0 ? 1 : 300;
      if (i === viewTab) {
        const corner = col === 0 ? (row === 0 ? TAB_HIGHLIGHT.topLeft : TAB_HIGHLIGHT.bottomLeft)
          : col === 6 ? (row === 0 ? TAB_HIGHLIGHT.topRight : TAB_HIGHLIGHT.bottomRight) : TAB_HIGHLIGHT.middle;
        sprite(bundle, corner, x - 2, y, panel);
      }
      const icon = i === 6 ? SPELLBOOK_TAB_ICONS[ui?.spellbook ?? 0] ?? 780 : TAB_ICONS[i];
      const img = sprite(bundle, icon, x, y, panel, "tab");
      if (img) {
        img.title = TAB_NAMES[i] + (i === gameTab ? " (open in game)" : "");
        img.onclick = () => this.onTabPicked(i);
        if (i === gameTab && i !== viewTab) img.classList.add("game-open");
      }
    }

    // Contents
    const content = el("div", "side-content", panel);
    const clicks = session.events(t).filter((l) => l.e === "click");
    if (viewTab === 3) this.inventory(content, session, t, bundle, clicks);
    else if (viewTab === 4) this.equipment(content, session, t, bundle);
    else if (viewTab === 5) this.prayers(content, session, t, bundle);
    else if ((viewTab === 0 || viewTab === 6) && this.recorded(content, session, t, bundle, viewTab === 0 ? COMBAT_INTERFACE : SPELLBOOK_INTERFACE)) {
      // Drawn from what the game showed
    } else if (viewTab === 0 && this.combat(content, session, t, bundle)) {
      // Drawn from the cache's combat styles
    } else if (viewTab === 6) {
      this.spellbook(content, session, t, bundle, ui?.spellbook ?? 0);
    } else {
      const note = el("div", "side-note", content);
      note.textContent = viewTab === 0 && ui ? `Attack style ${ui.style + 1}\nAuto retaliate ${ui.autoRetaliate ? "on" : "off"}\n\n(recordings from format 5 show\nthe combat options as in game)` : TAB_NAMES[viewTab];
    }
    // How accurate the clicks on this tab were, over the whole session
    if (this.accuracy && (viewTab === 3 || viewTab === 5)) {
      const s = spread(this.shownPoints);
      const summary = el("div", "acc-summary", root);
      summary.textContent = s.hits + s.misses
        ? `${s.hits} clicks, ${s.misses} misses · on average ${Math.round(s.meanOffCentre * 100)}% of the way from centre to edge`
        : "No clicks on this tab yet";
    }
  }

  /** The latest snapshot of an interface the recorder took, drawn as the game showed it */
  private recorded(content: HTMLElement, session: Session, t: number, bundle: Bundle, group: number): boolean {
    let list = this.snapshots.get(session)?.get(group);
    if (!list) {
      const byGroup = new Map<number, Line[]>();
      for (const l of session.lines) if (l.e === "ui_widgets") byGroup.set(l.group, [...(byGroup.get(l.group) ?? []), l]);
      this.snapshots.set(session, byGroup);
      list = byGroup.get(group) ?? [];
    }
    const snap = latestAtOrBefore(list, t);
    if (!snap) return false;
    drawWidgets(content, bundle, snap.widgets, snap.w, snap.h, 190, 261);
    return true;
  }
  private readonly snapshots = new WeakMap<Session, Map<number, Line[]>>();

  /**
   * The combat tab as the game lays it out: the weapon and its category, a button per attack style
   * with the game's icons (the selected one lit red), auto retaliate, and the special attack bar
   */
  private combat(content: HTMLElement, session: Session, t: number, bundle: Bundle): boolean {
    const tick = session.tickAt(t);
    const ui = tick?.ui;
    if (!ui) return false;
    const weapon = session.itemsAt("worn", t)[3]?.[0] ?? -1;
    const type = ui.weaponType ?? this.weaponTypes(session, bundle).of(weapon, t);
    const styles = type === undefined ? [] : bundle.combatStyles(type);
    const panel = el("div", "combat", content);
    const title = el("div", "combat-title", panel);
    title.textContent = weapon > 0 ? session.itemName(weapon) : "Unarmed";
    const sub = el("div", "combat-sub", panel);
    const cb = [...session.lines].reverse().find((l) => l.e === "look" && l.who?.k === "me" && l.t <= t)?.cb;
    sub.textContent = type === undefined ? "Weapon type not recorded" : cb ? `Combat Lvl: ${cb}` : "";
    styles.forEach(([slot, name, tooltip, icon], i) => {
      const button = el("div", `combat-style${slot === ui.style ? " on" : ""}`, panel);
      Object.assign(button.style, { left: `${i % 2 === 0 ? 21 : 101}px`, top: `${42 + Math.floor(i / 2) * 50}px` });
      button.title = `${name}\n${tooltip}`;
      const src = bundle.uiSprite(icon);
      if (src) {
        const img = el("img", "", button);
        img.src = src;
      }
      el("div", "label", button).textContent = name;
    });
    const auto = el("div", `combat-auto${ui.autoRetaliate ? " on" : ""}`, panel);
    auto.textContent = `Auto Retaliate\n(${ui.autoRetaliate ? "On" : "Off"})`;
    const spec = Math.floor((tick?.me?.spec ?? 0) / 10);
    const bar = el("div", "combat-spec", panel);
    el("div", "fill", bar).style.width = `${spec}%`;
    el("div", "text", bar).textContent = `Special Attack: ${spec}%`;
    return true;
  }

  /**
   * Weapon types learned from the recording: the game reports one (varbit 357) whenever the wielded
   * weapon changes, and weapons in the same item category share a type, which covers the weapon held
   * when the recording started once a weapon like it turns up
   */
  private weaponTypes(session: Session, bundle: Bundle): { of(weapon: number, t: number): number | undefined } {
    let learned = this.learnedTypes.get(session);
    if (!learned) {
      const byItem = new Map<number, number>();
      const byCategory = new Map<number, number>();
      const changes: Line[] = [];
      for (const l of session.lines) if (l.e === "var" && l.varbit === 357) changes.push(l);
      for (const c of changes) {
        const weapon = session.itemsAt("worn", c.t)[3]?.[0] ?? -1;
        byItem.set(weapon, c.value);
        const cat = bundle.item(weapon)?.category;
        if (cat != null && cat >= 0) byCategory.set(cat, c.value);
      }
      learned = {
        of(weapon: number, t: number) {
          const recorded = latestAtOrBefore(changes, t);
          if (recorded && (session.itemsAt("worn", recorded.t)[3]?.[0] ?? -1) === weapon) return recorded.value;
          if (weapon <= 0) return 0;
          const cat = bundle.item(weapon)?.category;
          return byItem.get(weapon) ?? (cat != null ? byCategory.get(cat) : undefined);
        },
      };
      this.learnedTypes.set(session, learned);
    }
    return learned;
  }
  private readonly learnedTypes = new WeakMap<Session, { of(weapon: number, t: number): number | undefined }>();

  /**
   * The spellbook for recordings that didn't snapshot it, from the cache's spell list. Lit or dim by
   * magic level alone: the game also weighs runes, staves and quests, which aren't known here
   */
  private spellbook(content: HTMLElement, session: Session, t: number, bundle: Bundle, book: number): void {
    const spells = bundle.spellbook(book);
    if (!spells.length) return;
    const level = latestAtOrBefore(session.lines.filter((l) => l.e === "stat" && l.skill === "MAGIC"), t)?.boosted ?? 99;
    const cols = Math.ceil(Math.sqrt((spells.length * 190) / 245));
    const cell = Math.min(190 / cols, 245 / Math.ceil(spells.length / cols));
    spells.forEach((s, i) => {
      const lit = level >= s.level;
      const img = sprite(bundle, lit ? s.on : s.off, (i % cols) * cell + (cell - 24) / 2, Math.floor(i / cols) * cell + (cell - 24) / 2, content);
      if (img) img.title = `${s.name} (level ${s.level})`;
    });
    const note = el("div", "spell-note", content);
    note.textContent = "approximate: lit by magic level only";
  }

  private orb(row: HTMLElement, bundle: Bundle, value: number, fraction: number, filler: number, icon: number): void {
    const orb = el("div", "orb", row);
    sprite(bundle, ORB_FRAME, 0, 0, orb);
    sprite(bundle, ORB_EMPTY, 27, 4, orb);
    // The colour fills from the bottom by how full it is
    const fill = sprite(bundle, filler, 27, 4, orb);
    const f = Math.max(0, Math.min(1, fraction));
    if (fill) fill.style.clipPath = `inset(${Math.round((1 - f) * 26)}px 0 0 0)`;
    sprite(bundle, icon, 27, 4, orb);
    const number = el("div", "orb-number", orb);
    number.textContent = String(value);
    number.style.color = orbColor(f);
  }

  private inventory(content: HTMLElement, session: Session, t: number, bundle: Bundle, clicks: Line[]): void {
    const items = session.itemsAt("inv", t);
    const clicked = new Set(clicks.filter((c) => c.widget?.[0] === INVENTORY_INTERFACE).map((c) => c.p0));
    for (let i = 0; i < 28; i++) {
      const [id, qty] = items[i] ?? [-1, 0];
      if (id <= 0) continue;
      const x = 13 + (i % 4) * 42;
      const y = 9 + Math.floor(i / 4) * 36;
      this.item(content, bundle, session, id, qty, x, y, clicked.has(i));
    }
    for (let i = 0; i < 28; i++) {
      this.markClicks(content, 13 + (i % 4) * 42 - 2, 9 + Math.floor(i / 4) * 36 - 2, 40, 36,
        (o) => o.click.widget?.[0] === INVENTORY_INTERFACE && o.click.p0 === i);
      this.dots(content, `inv:${i}`, 13 + (i % 4) * 42, 9 + Math.floor(i / 4) * 36, 36, 32, t);
      if (this.hovered?.inv === i) this.pulse(content, 13 + (i % 4) * 42 - 2, 9 + Math.floor(i / 4) * 36 - 2, 40, 36);
    }
  }

  private item(parent: HTMLElement, bundle: Bundle, session: Session, id: number, qty: number, x: number, y: number, clicked = false): void {
    const icon = bundle.itemIcon(id, qty);
    if (icon) {
      const img = el("img", `gs item${clicked ? " clicked" : ""}`, parent);
      img.src = icon;
      img.style.left = `${x}px`;
      img.style.top = `${y}px`;
      img.title = `${session.itemName(id)}${qty > 1 ? ` ×${qty.toLocaleString()}` : ""}`;
    }
    if (qty > 1) {
      const { text, color } = stackText(qty);
      const n = el("div", "stack", parent);
      n.textContent = text;
      n.style.color = color;
      n.style.left = `${x}px`;
      n.style.top = `${y - 1}px`;
    }
  }

  private equipment(content: HTMLElement, session: Session, t: number, bundle: Bundle): void {
    const worn = session.itemsAt("worn", t);
    for (const [slot, emptyIcon, x, y] of EQUIPMENT) {
      sprite(bundle, EQUIPMENT_SLOT_TILE, x, y, content);
      if (this.hovered?.tab === 4 && this.hovered.worn === slot) this.pulse(content, x, y, 36, 36);
      const [id, qty] = worn[slot] ?? [-1, 0];
      if (id > 0) this.item(content, bundle, session, id, qty, x, y + 2);
      else sprite(bundle, emptyIcon, x + 2, y + 2, content, "empty-slot");
    }
  }

  private prayers(content: HTMLElement, session: Session, t: number, bundle: Bundle): void {
    const on = new Set(session.tickAt(t)?.me?.prayers ?? []);
    PRAYER_BOOK.forEach(([name, icon, alt, altIcon], i) => {
      const x = 3 + (i % 5) * 37;
      const y = 4 + Math.floor(i / 5) * 37;
      const usingAlt = alt != null && on.has(alt);
      if (on.has(name) || usingAlt) sprite(bundle, PRAYER_GLOW, x, y, content);
      const img = sprite(bundle, usingAlt ? altIcon! : icon, x + 2, y + 2, content);
      if (img) img.title = (usingAlt ? alt! : name).toLowerCase().replace(/_/g, " ");
      const names = [name, alt].filter(Boolean).map((n) => n!.toLowerCase().replace(/_/g, " "));
      this.markClicks(content, x, y, 34, 34, (o) => o.click.widget?.[0] === 541 && names.includes(String(o.click.target).toLowerCase()));
      for (const n of [name, alt]) if (n) this.dots(content, `prayer:${n}`, x, y, 34, 34, t);
      if (this.hovered?.prayer && [name, alt].includes(this.hovered.prayer)) this.pulse(content, x, y, 34, 34);
    });
  }
}
