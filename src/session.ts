/**
 * An Encounter Recorder session: the parsed lines plus indexes for jumping to any tick.
 * The file format is documented in the encounter-recorder README.
 */

export type Ref =
  | { k: "me" }
  | { k: "npc"; i: number; id: number }
  | { k: "player"; i: number }
  | { k: "other" }
  | null;

export interface Pos {
  x: number;
  y: number;
  p: number;
  sx: number;
  sy: number;
  lx?: number;
  ly?: number;
}

export interface Spot {
  id: number;
  h: number;
  start: number;
  f: number;
}

export interface ActorState extends Pos {
  who: Ref;
  tile?: Pos;
  o: number;
  of?: number;
  a: number;
  af: number;
  pose: number;
  spot?: Spot[];
  hp?: [number, number];
  int?: Ref;
  head?: string | [number, number][];
  skull?: number;
}

export interface MeState extends ActorState {
  hpNow: number;
  hpMax: number;
  prayNow: number;
  prayMax: number;
  run: number;
  spec: number;
  prayers: string[];
  dest?: Pos;
}

export interface UiState {
  tab: number;
  /** Which attack styles the wielded weapon offers (format 5) */
  weaponType?: number;
  spellbook: number;
  quickPrayers: number;
  style: number;
  autoRetaliate: boolean;
  runOn: boolean;
}

export interface TickLine extends Line {
  e: "tick";
  abs: number;
  ms: number;
  me?: MeState;
  npcs: ActorState[];
  players?: ActorState[];
  ui?: UiState;
}

/** Any line of the file. Every line has a tick, a client cycle and an event name */
export interface Line {
  t: number;
  c: number;
  e: string;
  // Lines are open-ended JSON: each event documents its own fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
}

/**
 * A walk click's tile is the recorder's guess, the tile under the mouse, which can be a tile off. Since
 * format 6 a "dest" line follows with the tile the client itself worked out from the click and walked
 * you to: that replaces the guess
 */
function exactWalkTiles(lines: Line[]): void {
  const walks = new Map<number, Line>();
  for (const l of lines) {
    if (l.e === "click" && l.action === "WALK") walks.set(l.c, l);
    else if (l.e === "dest" && l.click != null) {
      const click = walks.get(l.click);
      if (click) click.tile = { x: l.x, y: l.y, p: l.p, pl: l.pl, sx: l.sx, sy: l.sy };
    }
  }
}

export function refKey(ref: Ref | undefined): string {
  if (!ref) return "";
  switch (ref.k) {
    case "npc":
      return "n" + ref.i;
    case "player":
      return "p" + ref.i;
    default:
      return ref.k;
  }
}

export class Session {
  readonly lines: Line[];
  readonly byTick: Line[][];
  readonly ticks: (TickLine | undefined)[];
  readonly header: Line | undefined;
  readonly scenes: Line[];
  readonly npcNames = new Map<number, string>();
  readonly npcSizes = new Map<number, number>();
  /**
   * The forms each NPC index took, in order: the ID it had from tick t, and whether it spawned then. An
   * index is reused once its NPC has gone, so a spawn starts a new NPC
   */
  private readonly npcForms = new Map<number, { t: number; id: number; spawn: boolean }[]>();
  readonly itemNames = new Map<number, string>();
  readonly unreadable: number;
  private readonly items = new Map<string, Line[]>();
  private readonly tabs: Line[] = [];
  /** Lines naming each player index, in order: indexes get reused as players come and go */
  private readonly playerNames = new Map<number, Line[]>();
  private ownName: string | undefined;
  private healthReadings?: Map<string, Line[]>;

  private constructor(lines: Line[], unreadable: number) {
    this.lines = lines;
    this.unreadable = unreadable;
    exactWalkTiles(lines);
    let last = 0;
    for (const l of lines) last = Math.max(last, l.t ?? 0);
    this.byTick = Array.from({ length: last + 1 }, () => []);
    this.ticks = new Array(last + 1);
    this.scenes = [];
    let header: Line | undefined;
    let scene: Line | undefined;
    for (const l of lines) {
      if (l.e === "scene") scene = l;
      else scenePlanes(l, scene);
      this.byTick[l.t ?? 0].push(l);
      if (l.who?.k === "npc" && l.who.id != null) {
        const forms = this.npcForms.get(l.who.i) ?? [];
        const spawn = l.e === "npc_spawn";
        if (spawn || forms[forms.length - 1]?.id !== l.who.id) forms.push({ t: l.t ?? 0, id: l.who.id, spawn });
        this.npcForms.set(l.who.i, forms);
      }
      switch (l.e) {
        case "header":
          header = l;
          break;
        case "tick":
          this.ticks[l.t] = l as TickLine;
          break;
        case "scene":
          this.scenes.push(l);
          break;
        case "npcdef":
          for (const id of [l.def.id, l.def.baseId]) {
            if (id == null) continue;
            this.npcNames.set(id, l.def.name);
            this.npcSizes.set(id, l.def.size || 1);
          }
          break;
        case "itemdef":
          this.itemNames.set(l.id, l.name);
          break;
        case "click":
          // Format 1 had no item definitions, but clicks still name the item they were on
          if (l.item > 0 && l.target && !this.itemNames.has(l.item)) this.itemNames.set(l.item, l.target);
          break;
        case "items": {
          const list = this.items.get(l.which) ?? [];
          list.push(l);
          this.items.set(l.which, list);
          break;
        }
        case "ui_tab":
          this.tabs.push(l);
          break;
        case "look":
        case "player_spawn":
          if (!l.name) break;
          if (l.who?.k === "me") this.ownName = l.name;
          else if (l.who?.k === "player") {
            const list = this.playerNames.get(l.who.i) ?? [];
            list.push(l);
            this.playerNames.set(l.who.i, list);
          }
          break;
      }
    }
    this.header = header;
  }

  static parse(text: string): Session {
    const lines: Line[] = [];
    let unreadable = 0;
    for (const raw of text.split("\n")) {
      const s = raw.trim();
      if (!s) continue;
      try {
        lines.push(JSON.parse(s));
      } catch {
        // A recording cut off by a crash ends in half a line; everything before it is intact
        unreadable++;
      }
    }
    return new Session(lines, unreadable);
  }

  /** Adds a line the page made, such as a note, in cycle order within its tick */
  addLine(line: Line): void {
    const t = Math.max(0, Math.min(this.lastTick, line.t ?? 0));
    line.t = t;
    this.lines.push(line);
    const list = this.byTick[t];
    const at = list.findIndex((l) => (l.c ?? 0) > (line.c ?? 0));
    list.splice(at < 0 ? list.length : at, 0, line);
  }

  removeLine(line: Line): void {
    const i = this.lines.indexOf(line);
    if (i >= 0) this.lines.splice(i, 1);
    const list = this.byTick[line.t ?? 0];
    const j = list?.indexOf(line) ?? -1;
    if (j >= 0) list.splice(j, 1);
  }

  get lastTick(): number {
    return this.byTick.length - 1;
  }

  /**
   * A best guess at another player's health while the game isn't showing their bar: the last reading it
   * showed. Health only falls through hits, and every hit shows the bar again, so between readings it
   * stays the same or rises (food, regeneration): this never overstates it. Full before the first
   * reading, and after an empty one: they died, and respawn
   */
  guessedHp(key: string, t: number): [number, number] {
    if (!this.healthReadings) {
      this.healthReadings = new Map();
      for (const tick of this.ticks) {
        for (const p of tick?.players ?? []) {
          if (!p.hp) continue;
          const k = refKey(p.who);
          const readings = this.healthReadings.get(k) ?? [];
          readings.push({ t: tick!.t, c: tick!.c, e: "hp", hp: p.hp } as Line);
          this.healthReadings.set(k, readings);
        }
      }
    }
    const last = latestAtOrBefore(this.healthReadings.get(key) ?? [], t);
    return !last || last.hp[0] === 0 ? [1, 1] : last.hp;
  }

  /** The snapshot for tick t, or the latest before it if that tick has none */
  tickAt(t: number): TickLine | undefined {
    for (let i = Math.min(t, this.lastTick); i >= 0; i--) {
      const line = this.ticks[i];
      if (line) return line;
    }
    return undefined;
  }

  events(t: number): Line[] {
    return this.byTick[t] ?? [];
  }

  sceneAt(t: number): Line | undefined {
    return latestAtOrBefore(this.scenes, t);
  }

  itemsAt(which: "inv" | "worn", t: number): [number, number][] {
    return latestAtOrBefore(this.items.get(which) ?? [], t)?.items ?? [];
  }

  /** The side panel tab open at tick t: a switch during the tick wins over the previous tick's snapshot */
  tabAt(t: number): number {
    const event = latestAtOrBefore(this.tabs, t);
    if (event && event.t === t) return event.tab;
    return this.tickAt(t)?.ui?.tab ?? event?.tab ?? 3;
  }

  /**
   * An NPC definition's name. Some are "null" in the game's data: the game never names those (effects,
   * hazards, a boss between forms), so they're "unnamed NPC" rather than "null"
   */
  npcName(id: number): string {
    const name = this.npcNames.get(id);
    if (name === undefined) return `NPC ${id}`;
    return isUnnamed(name) ? `unnamed NPC ${id}` : name;
  }

  /**
   * The name to show for an NPC at tick t: its own, or, in a form the game doesn't name, the name it had
   * in an earlier form (a boss between phases is still the boss). Nothing for NPCs the game never names
   */
  npcShownName(ref: { i: number; id: number }, t = Infinity): string | undefined {
    const own = this.npcNames.get(ref.id);
    if (own !== undefined && !isUnnamed(own)) return own;
    const forms = this.npcForms.get(ref.i) ?? [];
    let at = forms.length - 1;
    while (at >= 0 && forms[at].t > t) at--;
    for (; at >= 0; at--) {
      const name = this.npcNames.get(forms[at].id);
      if (name !== undefined && !isUnnamed(name)) return name;
      if (forms[at].spawn) break;
    }
    return own === undefined ? `NPC ${ref.id}` : undefined;
  }

  itemName(id: number): string {
    return this.itemNames.get(id) ?? `item ${id}`;
  }

  /** A player's name at tick t (or the last one known), if the recording has names */
  playerName(index: number, t = Infinity): string | undefined {
    const list = this.playerNames.get(index);
    if (!list) return undefined;
    return (latestAtOrBefore(list, t) ?? list[0]).name;
  }

  /** Your own name, if the recording has names */
  get you(): string | undefined {
    return this.ownName;
  }

  label(ref: Ref | undefined, t = Infinity): string {
    if (!ref) return "–";
    switch (ref.k) {
      case "me":
        return this.ownName ? `${this.ownName} (you)` : "you";
      case "npc":
        return `${this.npcShownName(ref, t) ?? this.npcName(ref.id)}#${ref.i}`;
      case "player":
        // Recordings made before names were recorded only know players by index
        return this.playerName(ref.i, t) ?? `Player ${ref.i}`;
      default:
        return ref.k;
    }
  }

  /** How many tiles across an actor is */
  sizeOf(ref: Ref | undefined): number {
    return ref?.k === "npc" ? this.npcSizes.get(ref.id) ?? 1 : 1;
  }
}

const previousTargets = new WeakMap<Session, Map<Line, Ref>>();

/**
 * What an actor had been targeting before a "target" line that clears it (the game reports a cleared
 * target as nothing, not as what was let go of)
 */
export function stoppedTargeting(session: Session, line: Line): Ref | undefined {
  let index = previousTargets.get(session);
  if (!index) {
    index = new Map();
    const current = new Map<string, Ref>();
    for (const l of session.lines) {
      if (l.e !== "target") continue;
      const key = refKey(l.who);
      if (l.at) current.set(key, l.at);
      else {
        const was = current.get(key);
        if (was) index.set(l, was);
        current.delete(key);
      }
    }
    previousTargets.set(session, index);
  }
  return index.get(line);
}

/**
 * Inside an instance, recorded positions carry the floor of the template the instance was copied from,
 * which needn't be the floor they're on (a player-owned house's ground floor is scene floor 1, copied
 * from templates on floor 2). This puts each position on its scene floor, worked out from the instance's
 * chunk table, keeping the template floor as "wp". Recordings from format 5 write the scene floor as "pl"
 */
function scenePlanes(line: Line, scene: Line | undefined): void {
  if (!scene?.instance || !scene.templates) return;
  const templates: number[][][] = scene.templates;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fix = (o: any) => {
    if (!o || o.sx == null || o.sy == null || o.p == null || o.wp != null) return;
    if (o.pl != null) {
      o.wp = o.p;
      o.p = o.pl;
      return;
    }
    const cx = o.sx >> 3;
    const cy = o.sy >> 3;
    // Several scene floors can come from the same template floor (every floor of a player-owned house
    // does), so match the template chunk the recorded x and y point into as well
    let byFloor: number | undefined;
    for (let z = 0; z < templates.length; z++) {
      const packed = templates[z]?.[cx]?.[cy];
      if (packed == null || packed === -1 || ((packed >> 24) & 3) !== o.p) continue;
      const chunkX = (packed >> 14) & 0x3ff;
      const chunkY = (packed >> 3) & 0x7ff;
      if (o.x != null && o.y != null && o.x >> 3 === chunkX && o.y >> 3 === chunkY) {
        o.wp = o.p;
        o.p = z;
        return;
      }
      byFloor ??= z;
    }
    if (byFloor !== undefined) {
      o.wp = o.p;
      o.p = byFloor;
    }
  };
  // Objects have their own floor field and their own handling (objects.ts)
  if (line.e === "obj" || line.e === "obj_gone") return;
  fix(line);
  fix(line.start);
  fix(line.target);
  fix(line.tile);
  if (line.e === "tick") {
    for (const a of [line.me, ...(line.npcs ?? []), ...(line.players ?? [])]) {
      fix(a);
      fix(a?.tile);
      fix(a?.dest);
    }
  }
}

/** The last entry at or before tick t, in a list sorted by tick */
export function latestAtOrBefore(list: Line[], t: number): Line | undefined {
  let lo = 0;
  let hi = list.length - 1;
  let found: Line | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= t) {
      found = list[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The game's placeholder name for NPCs it never names */
function isUnnamed(name: string): boolean {
  return !name || name === "null";
}
