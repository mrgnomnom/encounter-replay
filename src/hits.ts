import { refKey, type Line, type Session } from "./session";

/**
 * What the game says about who dealt a hit: only whether it was yours. A hitsplat carries a "mine" flag
 * and nothing more, so the replay doesn't guess at anyone else; hits that aren't yours are shown in a
 * slightly different hue instead. The one exception is Ocellus's scripted hit, below.
 */

/** Ocellus's unnamed form as its next phase begins in the Fractured Archive */
const OCELLUS_CHANGING_PHASE = 16675;
/** Recordings show 5250 and 12020 for the scripted hit, and nothing a player deals comes close */
const SCRIPTED_HIT_MIN = 1000;

/**
 * Ocellus takes one huge hit in each fight, on the tick it says "Your time... comes..." and The Blade
 * appears. The fight does that itself, but the game marks it as yours, so it's nobody's hit here
 */
function isScriptedHit(hit: Line): boolean {
  return hit.who?.id === OCELLUS_CHANGING_PHASE && (hit.amount ?? 0) >= SCRIPTED_HIT_MIN;
}

/** True for a hit you dealt to something else */
export function isYourHit(hit: Line): boolean {
  return !!hit.mine && refKey(hit.who) !== "me" && !isScriptedHit(hit);
}

/** True for a hit on something other than you that you didn't deal */
export function isOthersHit(hit: Line): boolean {
  return !isYourHit(hit) && refKey(hit.who) !== "me";
}

/** The game's heal hitsplat, which isn't damage taken */
export const HEAL_HITSPLAT = 6;

// A projectile's hitsplat appears on the cycle it lands, give or take a couple
const LANDING_CYCLES = 2;

/**
 * The projectile that landed on a hit's target on the same cycle as the hit, if one did. The projectile
 * line names who fired it and at whom, so this is recorded fact, not inference; hits with no such
 * projectile (melee, floor effects) get no source. Your hit on something else only matches your own
 * projectiles: someone else's landing beside it didn't deal it. (Hits on you are marked yours too, so the
 * mark alone doesn't settle it)
 */
export function landedProjectile(session: Session, hit: Line): Line | undefined {
  if (isScriptedHit(hit)) return undefined;
  const target = refKey(hit.who);
  return (aimedAt(session).get(target) ?? []).find((l) => l.c <= hit.c && Math.abs(hit.c - l.endCycle) <= LANDING_CYCLES
    && (!isYourHit(hit) || refKey(l.from) === "me"));
}

const projectilesByTarget = new WeakMap<Session, Map<string, Line[]>>();

/** Projectiles with a launcher, by who they were aimed at, gathered once per session */
function aimedAt(session: Session): Map<string, Line[]> {
  let byTarget = projectilesByTarget.get(session);
  if (!byTarget) {
    byTarget = new Map();
    for (const l of session.lines) {
      if (l.e !== "proj" || !l.from || !l.to) continue;
      const key = refKey(l.to);
      const list = byTarget.get(key) ?? [];
      list.push(l);
      byTarget.set(key, list);
    }
    projectilesByTarget.set(session, byTarget);
  }
  return byTarget;
}
