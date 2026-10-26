import type { EffectLinks } from "./links";
import { refKey, stoppedTargeting, type Line, type Ref, type Session } from "./session";

/**
 * Whether a log line is about someone: they did it, it was done to them, or it was aimed at them. For
 * you that also covers your own clicks, inventory, side panel and game messages. Floor effects count
 * for whoever's animation they're tied to (see links.ts).
 */

const YOURS = new Set(["click", "items", "ui_tab", "stat", "var", "chat", "widget_open", "widget_close", "mark", "header", "end"]);

export function relatesTo(session: Session, line: Line, key: string, tiedEffects: Set<Line>): boolean {
  if (line.e === "mark") return true;
  if (key === "me" && YOURS.has(line.e) && (line.e !== "chat" || !line.who || refKey(line.who) === "me")) return true;
  for (const field of ["who", "from", "to", "at"]) {
    const ref = line[field] as Ref | undefined;
    if (ref && refKey(ref) === key) return true;
  }
  if (line.e === "target" && !line.at) {
    const was = stoppedTargeting(session, line);
    if (was && refKey(was) === key) return true;
  }
  return tiedEffects.has(line);
}

/** Floor effects tied to the recent animations of someone, for counting them as theirs */
export function effectsOfActor(session: Session, links: EffectLinks | undefined, key: string, t: number, lookback = 10): Set<Line> {
  const out = new Set<Line>();
  if (!links) return out;
  for (let i = Math.max(0, t - lookback); i <= t; i++) {
    for (const l of session.events(i)) {
      if (l.e === "anim" && l.a !== -1 && refKey(l.who) === key) for (const e of links.effectsOf(l)) out.add(e);
    }
  }
  return out;
}

/** Turns a key ("me", "n123", "p45") back into a reference */
export function refOfKey(key: string, session: Session, t: number): Ref | undefined {
  if (key === "me") return { k: "me" };
  const tick = session.tickAt(t);
  const all = [...(tick?.npcs ?? []), ...(tick?.players ?? [])];
  return all.find((a) => a.who && refKey(a.who) === key)?.who ?? undefined;
}
