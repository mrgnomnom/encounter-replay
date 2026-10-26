import type { Line } from "./session";

/**
 * A made-up fight in the recorder's format, for working on the engine before real boss recordings
 * exist. A size-3 boss alternates a lobbed magic attack and a fast ranged one every five ticks; you
 * walk around it switching protection prayers, sometimes late. Every ID here is invented.
 */

const SIZE = 104;
const BASE_X = 3200;
const BASE_Y = 3200;
const TICKS = 80;
const CYCLES_PER_TICK = 30;
const BOSS = { k: "npc", i: 7, id: 90001 } as const;
const RAT = { k: "npc", i: 12, id: 90002 } as const;
const BYSTANDER = { k: "player", i: 205 } as const;
const MAGIC = 90101;
const RANGED = 90102;
const SLAM = 90103;

function pos(tileX: number, tileY: number, plane = 0) {
  return {
    x: BASE_X + Math.floor(tileX), y: BASE_Y + Math.floor(tileY), p: plane,
    sx: Math.floor(tileX), sy: Math.floor(tileY),
    lx: Math.round(tileX * 128), ly: Math.round(tileY * 128),
  };
}

function arena(): { collision: number[][]; heights: number[][] } {
  const collision = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
  const heights = Array.from({ length: SIZE }, (_, x) =>
    Array.from({ length: SIZE }, (_, y) => {
      // Flat inside the arena, rolling hills outside it
      const d = Math.max(Math.abs(x - 52), Math.abs(y - 52));
      return d <= 14 ? 0 : -Math.round(60 * (Math.sin(x / 5) + Math.cos(y / 6) + 2));
    }),
  );
  const lo = 40;
  const hi = 64;
  for (let i = lo; i <= hi; i++) {
    collision[i][hi] |= 0x2; // wall on the north edge
    collision[i][lo] |= 0x20; // south
    collision[hi][i] |= 0x8; // east
    collision[lo][i] |= 0x80; // west
  }
  for (const [x, y] of [[44, 44], [44, 60], [60, 44], [60, 60]]) collision[x][y] |= 0x100;
  collision[52][lo] &= ~0x20; // a gap in the south wall
  return { collision, heights };
}

/** Facing from one tile towards another, in the client's 2048-step circle (0 south, 512 west) */
function face(fromX: number, fromY: number, toX: number, toY: number): number {
  const angle = Math.atan2(-(toX - fromX), -(toY - fromY));
  return Math.round(((angle / (Math.PI * 2)) * 2048 + 2048) % 2048);
}

export function syntheticSession(): string {
  const lines: Line[] = [];
  let cycle = 5000;
  const emit = (t: number, e: string, fields: Record<string, unknown>, at = cycle) => lines.push({ t, c: at, e, ...fields });
  const { collision, heights } = arena();

  emit(0, "header", {
    format: 2, label: "synthetic demo", automatic: false, revision: 0, world: 0, worldTypes: [],
    startedMs: 0, startTick: 0, otherPlayers: true, localChat: true, sceneLayout: true, vars: true,
    canvasW: 765, canvasH: 503, resized: false,
  });
  emit(0, "scene", { baseX: BASE_X, baseY: BASE_Y, plane: 0, instance: true, regions: [], templates: [], collision: [collision], heights: [heights], settings: [] });
  emit(0, "npcdef", { def: { id: BOSS.id, name: "Training Golem", size: 3, level: 450, models: [], stats: [], actions: [] } });
  emit(0, "npcdef", { def: { id: RAT.id, name: "Rat", size: 1, level: 1, models: [], stats: [], actions: [] } });
  const items: [number, string][] = [[90201, "Shark"], [90202, "Prayer potion(4)"], [90203, "Saradomin brew(4)"], [90204, "Crossbow"]];
  for (const [id, name] of items) emit(0, "itemdef", { id, name, stackable: false, noted: false });
  const inventory: [number, number][] = Array.from({ length: 28 }, (_, i) => (i < 8 ? [90201, 1] : i < 12 ? [90202, 1] : i < 14 ? [90203, 1] : [-1, 0]));
  emit(0, "items", { which: "inv", items: inventory.map((x) => [...x]) });
  emit(0, "items", { which: "worn", items: Array.from({ length: 14 }, (_, i) => (i === 3 ? [90204, 1] : [-1, 0])) });
  emit(0, "ui_tab", { tab: 3 });

  let meHp = 99;
  let prayer: string = "PROTECT_FROM_MAGIC";
  let tab = 3;
  let ate = 0;
  const boss = { x: 51 + 1.5, y: 54 + 1.5 };
  const pendingHits: { t: number; amount: number }[] = [];

  for (let t = 0; t < TICKS; t++) {
    cycle = 5000 + t * CYCLES_PER_TICK;
    // You walk a slow circle around the boss
    const angle = (t / TICKS) * Math.PI * 2;
    const me = { x: 52.5 + Math.cos(angle) * 6, y: 55.5 + Math.sin(angle) * 6 };
    const next = { x: 52.5 + Math.cos(((t + 1) / TICKS) * Math.PI * 2) * 6, y: 55.5 + Math.sin(((t + 1) / TICKS) * Math.PI * 2) * 6 };

    if (t % 4 === 0) {
      emit(t, "click", {
        option: "Walk here", target: "", action: "WALK", id: 0, p0: Math.floor(next.x), p1: Math.floor(next.y), item: -1,
        mx: 380 + Math.round(Math.cos(angle) * 90), my: 250 + Math.round(Math.sin(angle) * 60),
      }, cycle - 20);
    }

    // The boss attacks every five ticks, alternating styles; the projectile lands three ticks later
    if (t >= 4 && t % 5 === 4) {
      const magic = (t / 5) % 2 < 1;
      const o = face(boss.x, boss.y, me.x, me.y);
      emit(t, "anim", { who: BOSS, a: magic ? 91001 : 91002, o, ...pos(boss.x, boss.y) }, cycle - 25);
      emit(t, "proj", {
        id: magic ? MAGIC : RANGED, from: BOSS, to: { k: "me" },
        start: pos(boss.x, boss.y), target: pos(me.x, me.y),
        startCycle: cycle + 10, endCycle: cycle + (magic ? 95 : 65),
        startHeight: 200, endHeight: 70, slope: magic ? 40 : 6, startPos: 96,
      }, cycle - 25);
      emit(t, "area_sound", { id: magic ? 92001 : 92002, delay: 0, range: 10, from: BOSS, ...pos(boss.x, boss.y) }, cycle - 25);
      // Late prayer switch every third attack
      const protectedRight = (magic ? "PROTECT_FROM_MAGIC" : "PROTECT_FROM_MISSILES") === prayer || (t / 5) % 3 === 0;
      pendingHits.push({ t: t + (magic ? 3 : 2), amount: protectedRight ? 0 : 18 + (t % 7) });
      const nextStyle = magic ? "PROTECT_FROM_MISSILES" : "PROTECT_FROM_MAGIC";
      if ((t / 5) % 3 !== 0) {
        if (tab !== 5) {
          tab = 5;
          emit(t, "ui_tab", { tab }, cycle - 15);
        }
        prayer = nextStyle;
        emit(t, "click", { option: "Activate", target: nextStyle.toLowerCase().replace(/_/g, " "), action: "CC_OP", id: 1, p0: -1, p1: (541 << 16) | 23, widget: [541, 23], item: -1, mx: 640, my: 300 }, cycle - 10);
      }
    }

    // Every fifteen ticks the boss slams the floor around you
    if (t % 15 === 10) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        emit(t, "gfx", { id: SLAM, start: cycle, z: 0, ...pos(Math.floor(me.x) + dx + 0.5, Math.floor(me.y) + dy + 0.5) }, cycle - 5);
      }
      emit(t, "say", { who: BOSS, text: "Stand still!" }, cycle - 5);
    }

    for (const h of pendingHits.filter((p) => p.t === t)) {
      meHp = Math.max(1, meHp - h.amount);
      emit(t, "hit", { who: { k: "me" }, type: h.amount === 0 ? 12 : 16, amount: h.amount, mine: true, others: false, until: cycle + 45 }, cycle - 8);
    }

    // Eat when low, from the inventory tab
    if (meHp < 60 && t - ate > 3) {
      if (tab !== 3) {
        tab = 3;
        emit(t, "ui_tab", { tab }, cycle - 18);
      }
      const slot = inventory.findIndex(([id]) => id === 90201);
      if (slot >= 0) {
        emit(t, "click", { option: "Eat", target: "Shark", action: "CC_OP", id: 2, p0: slot, p1: (149 << 16), widget: [149, 0], item: 90201, mx: 600, my: 260 + slot * 4 }, cycle - 12);
        inventory[slot] = [-1, 0];
        emit(t, "items", { which: "inv", items: inventory.map((x) => [...x]) }, cycle - 6);
        emit(t, "anim", { who: { k: "me" }, a: 829, o: 0, ...pos(me.x, me.y) }, cycle - 6);
        meHp = Math.min(99, meHp + 20);
        ate = t;
      }
    }

    if (t === 3) emit(t, "say", { who: BYSTANDER, text: "gl" }, cycle - 10);
    if (t === 30) emit(t, "chat", { type: "PUBLICCHAT", who: { k: "me" }, text: "this golem hits hard" }, cycle - 10);
    if (t === 30) emit(t, "say", { who: { k: "me" }, text: "this golem hits hard" }, cycle - 10);

    const bossHp = Math.max(0, 30 - Math.floor(t / 3));
    const rat = { x: 46.5 + Math.sin(t / 3) * 2, y: 48.5 + Math.cos(t / 4) };
    const attacking = t >= 4 && t % 5 === 4;
    emit(t, "tick", {
      abs: 100 + t, ms: t * 600,
      me: {
        who: { k: "me" }, ...pos(me.x, me.y), tile: pos(next.x, next.y), o: face(me.x, me.y, next.x, next.y),
        a: -1, af: -1, pose: 824, hpNow: meHp, hpMax: 99, prayNow: 70 - Math.floor(t / 4), prayMax: 70,
        run: 10000 - t * 40, spec: 1000, prayers: [prayer, "RIGOUR"], dest: pos(next.x, next.y),
      },
      npcs: [
        {
          who: BOSS, ...pos(boss.x, boss.y), tile: pos(boss.x - 1.5, boss.y - 1.5), o: face(boss.x, boss.y, me.x, me.y),
          a: attacking ? (((t / 5) % 2 < 1) ? 91001 : 91002) : -1, af: attacking ? 0 : -1, pose: 91000,
          hp: [bossHp, 30], int: { k: "me" }, head: t > 40 ? [[440, 2]] : undefined,
        },
        { who: RAT, ...pos(rat.x, rat.y), o: (t * 97) % 2048, a: -1, af: -1, pose: 2700 },
      ],
      players: [{ who: BYSTANDER, ...pos(47.5, 43.5), o: 1024, a: t % 8 < 2 ? 866 : -1, af: 0, pose: 808 }],
      ui: { tab, spellbook: 0, quickPrayers: 0, style: 1, autoRetaliate: true, runOn: true },
    }, cycle + CYCLES_PER_TICK - 1);
  }
  emit(TICKS, "end", { reason: "stopped by hand", ticks: TICKS, endedMs: TICKS * 600 }, cycle + CYCLES_PER_TICK);
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}
