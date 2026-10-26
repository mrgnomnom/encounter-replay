import { describe, expect, it } from "vitest";
import { projectileAt, type Flight, type Vec3 } from "./projectile";

const still = (v: Vec3) => () => v;

describe("projectileAt", () => {
  const flat: Flight = { startCycle: 100, endCycle: 160, start: { x: 0, y: 0, z: 172 }, startPos: 0, slope: 0 };

  it("is hidden before launch and after landing", () => {
    expect(projectileAt(flat, 99, still({ x: 1280, y: 0, z: 124 }))).toBeNull();
    expect(projectileAt(flat, 161, still({ x: 1280, y: 0, z: 124 }))).toBeNull();
  });

  it("arrives at its target on its end cycle", () => {
    const end = projectileAt(flat, 160, still({ x: 1280, y: 0, z: 124 }))!;
    // The client aims to land one cycle after the end cycle, so it's a step short on the last frame
    expect(end.x).toBeGreaterThan(1280 - 1280 / 60);
    expect(end.x).toBeLessThanOrEqual(1280);
    expect(end.z).toBeCloseTo(124, -1);
  });

  it("flies higher than both ends when launched at an angle", () => {
    const lob: Flight = { ...flat, slope: 64 };
    let peak = -Infinity;
    for (let c = 100; c <= 160; c++) peak = Math.max(peak, projectileAt(lob, c, still({ x: 1280, y: 0, z: 124 }))!.z);
    expect(peak).toBeGreaterThan(172);
  });

  it("follows a target that moves", () => {
    const moving = (c: number): Vec3 => ({ x: 1280, y: (c - 100) * 4, z: 124 });
    const end = projectileAt(flat, 160, moving)!;
    expect(end.y).toBeGreaterThan(200);
  });

  it("starts startPos along the launch direction", () => {
    const offset: Flight = { ...flat, startPos: 64 };
    const first = projectileAt(offset, 100, still({ x: 1280, y: 0, z: 124 }))!;
    expect(first.x).toBeGreaterThan(64);
  });
});
