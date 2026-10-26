import { refKey, type Line, type Session } from "./session";

/**
 * What the game says about who dealt a hit: only whether it was yours. A hitsplat carries a "mine" flag
 * and nothing more, so the replay doesn't guess at anyone else; hits that aren't yours are shown in a
 * slightly different hue instead.
 */

/** True for a hit you dealt to something else */
export function isYourHit(hit: Line): boolean {
  return !!hit.mine && refKey(hit.who) !== "me";
}

/** True for a hit on something other than you that someone else dealt */
export function isOthersHit(hit: Line): boolean {
  return !hit.mine && refKey(hit.who) !== "me";
}

// A projectile's hitsplat appears on the cycle it lands, give or take a couple
const LANDING_CYCLES = 2;

/**
 * The projectile that landed on a hit's target on the same cycle as the hit, if one did. The projectile
 * line names who fired it and at whom, so this is recorded fact, not inference; hits with no such
 * projectile (melee, floor effects) get no source
 */
export function landedProjectile(session: Session, hit: Line): Line | undefined {
  const target = refKey(hit.who);
  return (aimedAt(session).get(target) ?? []).find((l) => l.c <= hit.c && Math.abs(hit.c - l.endCycle) <= LANDING_CYCLES);
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
