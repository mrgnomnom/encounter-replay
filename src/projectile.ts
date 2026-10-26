/**
 * Projectile flight, following the game client: each client cycle (20 ms) the projectile re-aims at
 * its target so it arrives on its end cycle, its height following a parabola whose launch angle is
 * the recorded slope. Positions are local units (128 per tile): x east, y north, z up.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Flight {
  startCycle: number;
  endCycle: number;
  /** Launch point and height above the ground */
  start: Vec3;
  /** How far along the launch direction it appears, in local units */
  startPos: number;
  /** Launch angle in the client's 2048-step circle: 0 is flat */
  slope: number;
}

// The client's angle unit: 2048 steps to a full turn
const ANGLE_TO_RADIANS = (Math.PI * 2) / 2048;

class Projectile {
  x = 0;
  y = 0;
  z = 0;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private az = 0;
  private moving = false;

  constructor(private readonly f: Flight) {}

  aim(cycle: number, target: Vec3): void {
    if (!this.moving) {
      const dx = target.x - this.f.start.x;
      const dy = target.y - this.f.start.y;
      const dist = Math.hypot(dx, dy) || 1;
      this.x = this.f.start.x + (dx * this.f.startPos) / dist;
      this.y = this.f.start.y + (dy * this.f.startPos) / dist;
      this.z = this.f.start.z;
    }
    const remaining = this.f.endCycle + 1 - cycle;
    this.vx = (target.x - this.x) / remaining;
    this.vy = (target.y - this.y) / remaining;
    if (!this.moving) {
      this.vz = Math.hypot(this.vx, this.vy) * Math.tan(this.f.slope * ANGLE_TO_RADIANS);
    }
    this.az = (2 * (target.z - this.z - this.vz * remaining)) / (remaining * remaining);
  }

  advance(cycles: number): void {
    this.moving = true;
    this.x += this.vx * cycles;
    this.y += this.vy * cycles;
    this.z += this.vz * cycles + 0.5 * this.az * cycles * cycles;
    this.vz += this.az * cycles;
  }
}

/**
 * Where a projectile is at a (possibly fractional) client cycle, or null before launch and after
 * landing. targetAt gives the target's position at a cycle, so tracking projectiles follow a moving
 * target the way the client's do.
 */
export function projectileAt(f: Flight, cycle: number, targetAt: (cycle: number) => Vec3): Vec3 | null {
  if (cycle < f.startCycle || cycle > f.endCycle) return null;
  const p = new Projectile(f);
  p.aim(f.startCycle, targetAt(f.startCycle));
  const whole = Math.floor(cycle);
  for (let c = f.startCycle; c <= whole; c++) {
    if (c > f.startCycle) p.aim(c, targetAt(c));
    p.advance(1);
  }
  // Ease into the next cycle so playback is smooth between client cycles
  const part = cycle - whole;
  if (part > 0 && whole < f.endCycle) {
    const next = new Projectile(f);
    next.aim(f.startCycle, targetAt(f.startCycle));
    for (let c = f.startCycle; c <= whole + 1; c++) {
      if (c > f.startCycle) next.aim(c, targetAt(c));
      next.advance(1);
    }
    return { x: p.x + (next.x - p.x) * part, y: p.y + (next.y - p.y) * part, z: p.z + (next.z - p.z) * part };
  }
  return { x: p.x, y: p.y, z: p.z };
}
