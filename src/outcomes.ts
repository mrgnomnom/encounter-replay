import { refKey, type Line, type Session } from "./session";

/**
 * What the server did with each click. A click is what you did on the client; the server acts on it at
 * its next tick, and the result reaches the client as a state change (a prayer varbit, an inventory or
 * equipment update, a new target). Matching the two shows which clicks the server took on time, which
 * missed its cut-off and landed a tick later, and which it never acted on.
 *
 * Every line is labelled with the tick that ends its window, so a click and the server's response to it
 * normally share a label: the response arrives just before that window's GameTick.
 */

export type OutcomeStatus =
  /** The server acted on it at its next tick */
  | "on-time"
  /** It arrived after the server's cut-off for that tick and landed at the one after */
  | "late"
  /** The game held it for several ticks (potion and food delays, walking into range) */
  | "delayed"
  /** Nothing to change: it was already that way (attacking what you're already attacking) */
  | "already"
  /** The server never made the change it asked for */
  | "ignored"
  /** A later click in the same tick undid it before the server got to it (prayer flicking) */
  | "superseded"
  /** Another plugin cancelled the click, so it never left the client */
  | "cancelled"
  /** A kind of click this doesn't know how to follow */
  | "unknown";

export interface Outcome {
  click: Line;
  status: OutcomeStatus;
  /** What the click asked for, in words */
  intent: string;
  /** The tick label and client cycle the server's change arrived on */
  appliedTick?: number;
  appliedCycle?: number;
  /** Server ticks between the click and its effect: 1 is on time */
  serverTicks?: number;
  /**
   * Client cycles (20 ms) between the click and the end of its tick window, when the server's update
   * for that tick arrived. In the last few cycles a click may or may not make the server's cut-off
   */
  margin?: number;
}

// How long to wait for an effect before calling a click ignored
const WINDOW_TICKS = 5;
const PRAYER_INTERFACE = 541;
const INVENTORY_INTERFACE = 149;

export function clickOutcomes(session: Session): Outcome[] {
  const worn: Line[] = [];
  const inv: Line[] = [];
  const targets: Line[] = [];
  for (const l of session.lines) {
    if (l.e === "items") (l.which === "worn" ? worn : inv).push(l);
    else if (l.e === "target" && l.who?.k === "me") targets.push(l);
  }
  const out: Outcome[] = [];
  const clicks = session.lines.filter((l) => l.e === "click");
  for (const click of clicks) {
    if (click.consumed) {
      out.push({ click, status: "cancelled", intent: describe(click) });
      continue;
    }
    // Two clicks on the same thing in one tick reach the server together: the last one decides
    const later = clicks.find((o) => o.t === click.t && o.c > click.c && o.widget?.[0] === click.widget?.[0] &&
      o.widget?.[1] === click.widget?.[1] && o.target === click.target && o.option !== click.option);
    if (later && (click.option === "Activate" || click.option === "Deactivate")) {
      out.push({ click, status: "superseded", intent: `${describe(click)} (undone by ${later.option.toLowerCase()} in the same tick)` });
      continue;
    }
    const o = follow(session, click, worn, inv, targets);
    const end = session.ticks[click.t]?.c;
    if (end != null) o.margin = end - click.c;
    out.push(o);
  }
  return out;
}

function describe(c: Line): string {
  return `${c.option} ${c.target ?? ""}`.trim();
}

/** The first line after the click, within the window, that satisfies the test */
function firstAfter(lines: Line[], click: Line, test: (l: Line) => boolean): Line | undefined {
  for (const l of lines) {
    if (l.t < click.t || (l.t === click.t && l.c < click.c)) continue;
    if (l.t > click.t + WINDOW_TICKS) break;
    if (test(l)) return l;
  }
  return undefined;
}

function applied(click: Line, intent: string, effect: Line | undefined, cycle?: number): Outcome {
  if (!effect) return { click, status: "ignored", intent };
  const serverTicks = effect.t - click.t + 1;
  return {
    click,
    intent,
    status: serverTicks <= 1 ? "on-time" : serverTicks === 2 ? "late" : "delayed",
    appliedTick: effect.t,
    appliedCycle: cycle ?? effect.c,
    serverTicks,
  };
}

function follow(session: Session, click: Line, worn: Line[], inv: Line[], targets: Line[]): Outcome {
  const intent = describe(click);
  const option: string = click.option ?? "";

  // Prayers: the prayer list in the tick snapshots is the server's word on what's active
  if ((option === "Activate" || option === "Deactivate") && click.widget?.[0] === PRAYER_INTERFACE) {
    const prayer = String(click.target ?? "").toUpperCase().replace(/ /g, "_");
    const want = option === "Activate";
    const active = (t: number) => (session.tickAt(t)?.me?.prayers ?? []).includes(prayer);
    if (active(click.t - 1) === want) return { click, status: "already", intent: `${intent} (already ${want ? "on" : "off"})` };
    for (let t = click.t; t <= click.t + WINDOW_TICKS; t++) {
      if (active(t) === want) {
        const tick = session.ticks[t];
        return applied(click, intent, tick, tick?.c);
      }
    }
    return { click, status: "ignored", intent };
  }

  // Wearing or wielding: the item shows up in the equipment container
  if ((option === "Wear" || option === "Wield" || option === "Equip") && click.item > 0) {
    return applied(click, intent, firstAfter(worn, click, (w) => w.items.some(([id]: [number]) => id === click.item)));
  }

  // Eating, drinking and other inventory actions on a slot: that slot changes
  if (click.widget?.[0] === INVENTORY_INTERFACE && click.item > 0 && ["Eat", "Drink", "Drop", "Empty", "Break"].includes(option)) {
    const slot = click.p0;
    return applied(click, intent, firstAfter(inv, click, (l) => (l.items[slot]?.[0] ?? -1) !== click.item || (l.items[slot]?.[1] ?? 0) === 0));
  }

  // Attacking or otherwise interacting with an NPC: you start targeting it (the menu entry's id is its index)
  if (String(click.action ?? "").startsWith("NPC_") && click.id >= 0) {
    const want = refKey({ k: "npc", i: click.id, id: 0 });
    const effect = firstAfter(targets, click, (l) => refKey(l.at) === want);
    // Clicking what you're already interacting with changes nothing the server reports
    if (!effect && refKey(session.tickAt(click.t - 1)?.me?.int ?? null) === want) return { click, status: "already", intent };
    return applied(click, intent, effect);
  }

  return { click, status: "unknown", intent };
}

/** Clicks still waiting on the server at the end of tick t: clicked by then, not yet acted on */
export function pendingAt(outcomes: Outcome[], t: number): Outcome[] {
  return outcomes.filter((o) => o.click.t <= t && (o.status === "late" || o.status === "delayed") && (o.appliedTick ?? 0) > t);
}
