import { describe, expect, it } from "vitest";
import { Bundle } from "./bundle";
import { actionEnded, cycleOfFrame, frameAt, frameFrom, steppedIndex } from "./models";
import { Rig } from "./rig";

const b64 = (a: Int32Array | Int16Array | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(a.buffer)));

// One triangle whose top vertex is in bone group 1, and a two-frame animation that moves group 1
const bundle = new Bundle({
  format: 1,
  npcs: {}, objects: {}, items: {}, kits: {}, spotanims: {}, terrain: [], textures: {},
  models: {
    1: {
      v: b64(new Int32Array([0, 0, 0, 128, 0, 0, 0, -256, 0])),
      f: b64(new Int32Array([0, 1, 2])),
      c: b64(new Int16Array([1000])),
      vg: b64(new Int32Array([0, 0, 1])),
    },
  },
  sequences: { 10: { frames: [65536, 65537], lengths: [4, 6], frameStep: -1, loops: 99 } },
  framemaps: { 5: { types: [0, 1, 2], maps: [[1], [1], [1]] } },
  frames: {
    // Translate group 1 by (10, -20, 30)
    65536: { framemap: 5, index: [1], x: [10], y: [-20], z: [30] },
    // Rotate group 1 a quarter turn (64 * 8 = 512 steps) about z, around the group's own centre
    65537: { framemap: 5, index: [0, 2], x: [0, 0], y: [0, 0], z: [0, 64] },
  },
} as never);

describe("Rig", () => {
  const rig = new Rig([{ model: bundle.model(1)! }], bundle);

  it("moves only the bone group a frame names", () => {
    rig.pose(bundle, 65536);
    expect(Array.from(rig.pos)).toEqual([0, 0, 0, 128, 0, 0, 10, -276, 30]);
  });

  it("rotates around the group's centre, which for one vertex leaves it in place", () => {
    rig.pose(bundle, 65537);
    expect(Array.from(rig.pos.slice(6))).toEqual([0, -256, 0]);
  });

  it("goes back to the resting shape on reset", () => {
    rig.reset();
    expect(Array.from(rig.pos)).toEqual([0, 0, 0, 128, 0, 0, 0, -256, 0]);
  });
});

describe("frame timing", () => {
  it("steps through frames by their lengths and loops", () => {
    expect(frameAt(bundle, 10, 0)).toEqual({ frame: 65536 });
    expect(frameAt(bundle, 10, 3)).toEqual({ frame: 65536 });
    expect(frameAt(bundle, 10, 4)).toEqual({ frame: 65537 });
    expect(frameAt(bundle, 10, 10)).toEqual({ frame: 65536 });
  });

  it("carries on from a recorded frame", () => {
    expect(frameFrom(bundle, 10, 1, 0)).toEqual({ frame: 65537 });
    expect(frameFrom(bundle, 10, 1, 6)).toEqual({ frame: 65536 });
  });

  it("has no frames for animations it doesn't know", () => {
    expect(frameAt(bundle, 99, 0)).toBeUndefined();
  });
});

describe("object animation endings", () => {
  const lengths = [2, 2, 2, 2];

  it("holds the last frame with a frame step of 1", () => {
    expect(steppedIndex(lengths, { frameStep: 1, loops: 99 }, 7)).toBe(3);
    expect(steppedIndex(lengths, { frameStep: 1, loops: 99 }, 500)).toBe(3);
  });

  it("loops the whole animation when the step is the frame count", () => {
    expect(steppedIndex(lengths, { frameStep: 4, loops: 99 }, 8)).toBe(0);
    expect(steppedIndex(lengths, { frameStep: 4, loops: 99 }, 11)).toBe(1);
  });

  it("loops only the tail for a partial step, and stops after its loop limit", () => {
    expect(steppedIndex(lengths, { frameStep: 2, loops: 99 }, 8)).toBe(2);
    expect(steppedIndex(lengths, { frameStep: 2, loops: 2 }, 8 + 4 * 2)).toBe(3);
  });

  it("plays once without a frame step", () => {
    expect(steppedIndex(lengths, { frameStep: -1, loops: 99 }, 100)).toBe(3);
  });
});

describe("player and NPC animation endings", () => {
  const actions = new Bundle({
    format: 1, npcs: {}, objects: {}, items: {}, kits: {}, spotanims: {}, terrain: [], textures: {}, models: {},
    sequences: {
      // A special attack: 40 cycles, played once
      1: { frames: [1, 2, 3, 4], lengths: [10, 10, 10, 10], frameStep: -1, loops: 99 },
      // Its last two frames loop, three times through in all
      2: { frames: [1, 2, 3, 4], lengths: [10, 10, 10, 10], frameStep: 2, loops: 3 },
    },
  } as never);

  it("ends at its length rather than starting over", () => {
    expect(actionEnded(actions, 1, 39)).toBe(false);
    expect(actionEnded(actions, 1, 40)).toBe(true);
    expect(actionEnded(actions, 1, 55)).toBe(true);
  });

  it("ends after its last loop, counting the first time through", () => {
    expect(actionEnded(actions, 2, 40 + 20 + 19)).toBe(false);
    expect(actionEnded(actions, 2, 40 + 20 + 20)).toBe(true);
  });

  it("counts a recorded frame as the cycles before it", () => {
    expect(cycleOfFrame(actions, 1, 2)).toBe(20);
  });
});
