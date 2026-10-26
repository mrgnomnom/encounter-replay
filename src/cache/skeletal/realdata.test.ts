import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Bundle } from "../bundle";
import { frameAt, npcModel, playerModel } from "../models";

// Runs against a real exported bundle when one is present; bundles are local-only and never committed
const path = "assets/cache/tfa.bundle.json";
const run = existsSync(path) ? describe : describe.skip;

run("skeletal animations in a real bundle", () => {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const bundle = new Bundle(raw);

  it("decodes every skeletal animation", () => {
    const ids = Object.keys(raw.skeletalAnimations ?? {}).map(Number);
    expect(ids.length).toBeGreaterThan(0);
    const failed = ids.filter((id) => !bundle.skeletalAnimation(id));
    expect(failed).toEqual([]);
  });

  it("moves boss models by plausible amounts", () => {
    const report: string[] = [];
    for (const [id, npc] of Object.entries(raw.npcs) as [string, { name: string; anims: number[] }][]) {
      const stand = npc.anims[0];
      if (!raw.sequences[stand]?.skeletal) continue;
      const built = npcModel(bundle, Number(id));
      if (!built?.rig.skeletal) continue;
      const rig = built.rig;
      rig.reset();
      const rest = Int32Array.from(rig.pos);
      let restSize = 0;
      for (const v of rest) restSize = Math.max(restSize, Math.abs(v));
      let maxMove = 0;
      for (const cycles of [0, 10, 25, 40]) {
        const pose = frameAt(bundle, stand, cycles);
        if (!pose || "frame" in pose) continue;
        rig.poseSkeletal(bundle.skeletalAnimation(pose.skeletal)!, pose.tick);
        for (let i = 0; i < rig.pos.length; i++) {
          expect(Number.isFinite(rig.pos[i])).toBe(true);
          maxMove = Math.max(maxMove, Math.abs(rig.pos[i] - rest[i]));
        }
      }
      report.push(`${npc.name} (${id}): model reaches ${restSize}, stand moves vertices up to ${maxMove}`);
      // A stand pose shifts things; it doesn't fling vertices several model-sizes away
      expect(maxMove).toBeLessThan(restSize * 3 + 256);
    }
    console.log(report.join("\n"));
    expect(report.length).toBeGreaterThan(0);
  });

  it("animates players with classic frames", () => {
    // The cache loader drops per-vertex bone labels after loading; the exporter has to rebuild them
    const look = readFileSync("sessions/tfa.jsonl", "utf8").split("\n").find((l) => l.includes('"e":"look"'));
    if (!look) return;
    const built = playerModel(bundle, JSON.parse(look))!;
    const pose = frameAt(bundle, 808, 7);
    expect(pose && "frame" in pose).toBe(true);
    built.rig.reset();
    const rest = Int32Array.from(built.rig.pos);
    built.rig.pose(bundle, (pose as { frame: number }).frame);
    expect(built.rig.pos.some((v, i) => v !== rest[i])).toBe(true);
  });
});
