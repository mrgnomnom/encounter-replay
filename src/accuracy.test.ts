import { describe, expect, it } from "vitest";
import { clickPoints, hasAccuracyData, spread } from "./accuracy";
import { Session } from "./session";

// Protect from Magic is component 20 at (600, 300), 37 pixels square; inventory slot 5 at (560, 250)
const session = Session.parse(
  [
    { t: 0, c: 10, e: "ui_layout", prayer: [[600, 300, 37, 37, 20]], inv: [[560, 250, 36, 32, 5]], worn: [] },
    // Dead-centre hit
    { t: 1, c: 40, e: "press", mx: 618, my: 318, button: 1 },
    { t: 1, c: 40, e: "click", option: "Activate", target: "Protect from Magic", widget: [541, 20], wb: [600, 300, 37, 37], mx: 618, my: 318, p0: -1 },
    // Top-left corner hit
    { t: 2, c: 70, e: "press", mx: 601, my: 301, button: 1 },
    { t: 2, c: 70, e: "click", option: "Deactivate", target: "Protect from Magic", widget: [541, 20], wb: [600, 300, 37, 37], mx: 601, my: 301, p0: -1 },
    // A press just below the button that did nothing: a miss
    { t: 3, c: 100, e: "press", mx: 610, my: 343, button: 1 },
    // A press far from any button: meant for something else
    { t: 3, c: 110, e: "press", mx: 200, my: 200, button: 1 },
    // Inventory hit, right edge
    { t: 4, c: 130, e: "click", option: "Eat", target: "Shark", widget: [149, 0], wb: [560, 250, 36, 32], mx: 595, my: 266, p0: 5 },
  ].map((l) => JSON.stringify(l)).join("\n"),
);
const points = clickPoints(session);

describe("clickPoints", () => {
  it("knows when a recording has the data", () => {
    expect(hasAccuracyData(session)).toBe(true);
    expect(hasAccuracyData(Session.parse('{"t":0,"c":1,"e":"click","option":"Walk here"}'))).toBe(false);
  });

  it("places hits inside their button", () => {
    const magic = points.filter((p) => p.button === "prayer:PROTECT_FROM_MAGIC" && p.hit);
    expect(magic[0].x).toBeCloseTo(0.486, 2);
    expect(magic[1].x).toBeCloseTo(0.027, 2);
    const shark = points.find((p) => p.button === "inv:5")!;
    expect(shark.x).toBeCloseTo(0.972, 2);
  });

  it("puts a miss next to the button it was aimed at", () => {
    const miss = points.find((p) => !p.hit)!;
    expect(miss.button).toBe("prayer:PROTECT_FROM_MAGIC");
    expect(miss.y).toBeGreaterThan(1);
  });

  it("leaves out presses nowhere near a button", () => {
    expect(points.filter((p) => !p.hit)).toHaveLength(1);
  });

  it("measures how far off centre hits landed", () => {
    const s = spread(points.filter((p) => p.button.startsWith("prayer")));
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.meanOffCentre).toBeGreaterThan(0.4);
  });
});

describe("pairing clicks with their presses", () => {
  const layout = { t: 0, c: 10, e: "ui_layout", prayer: [[600, 300, 37, 37, 20]], inv: [[560, 250, 36, 32, 5]], worn: [] };
  const press = (c: number, mx: number, my: number) => ({ t: 1, c, e: "press", mx, my, button: 1 });
  const drink = (c: number, mx: number, my: number) => ({ t: 1, c, e: "click", option: "Drink", target: "Brew", widget: [149, 0], wb: [560, 250, 36, 32], mx, my, p0: 5 });
  const pray = (c: number, mx: number, my: number) => ({ t: 1, c, e: "click", option: "Activate", target: "Protect from Magic", widget: [541, 20], wb: [600, 300, 37, 37], mx, my, p0: -1 });
  const cancel = (c: number, mx: number, my: number) => ({ t: 1, c, e: "click", option: "Cancel", target: "", mx, my, p0: 0 });
  const pointsOf = (...lines: object[]) => clickPoints(Session.parse([layout, ...lines].map((l) => JSON.stringify(l)).join("\n")));

  it("waits for an inventory click, which only arrives when the button comes up", () => {
    const [point, ...rest] = pointsOf(press(100, 570, 260), drink(105, 570, 260));
    expect(point.hit).toBe(true);
    expect(rest).toEqual([]);
  });

  it("places a click where you pressed, even if the mouse left the button before it arrived", () => {
    const [point, ...rest] = pointsOf(press(100, 578, 266), drink(105, 640, 266));
    expect(point.hit).toBe(true);
    expect(point.x).toBeCloseTo(0.5, 2);
    expect(rest).toEqual([]);
  });

  it("doesn't call a click a miss because the mouse moved a pixel", () => {
    expect(pointsOf(press(100, 618, 318), pray(101, 619, 318)).filter((p) => !p.hit)).toEqual([]);
  });

  it("gives every click of a quick run its own press", () => {
    const run = [0, 8, 16, 24].flatMap((c) => [press(100 + c, 570, 260), drink(104 + c, 570, 260)]);
    const points = pointsOf(...run);
    expect(points.filter((p) => p.hit)).toHaveLength(4);
    expect(points.filter((p) => !p.hit)).toEqual([]);
  });

  it("still counts a press that did nothing beside one that worked", () => {
    const misses = pointsOf(press(100, 570, 260), press(108, 570, 260), drink(112, 570, 260)).filter((p) => !p.hit);
    expect(misses.map((p) => p.c)).toEqual([100]);
  });

  it("still counts a press that only cancelled, just off a button", () => {
    const misses = pointsOf(press(100, 597, 260), cancel(101, 597, 260)).filter((p) => !p.hit);
    expect(misses.map((p) => p.button)).toEqual(["inv:5"]);
  });
});
