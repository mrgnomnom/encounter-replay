import { describe, expect, it } from "vitest";
import { clickOutcomes } from "./outcomes";
import { Session } from "./session";

const tick = (t: number, prayers: string[]) => ({ t, c: 100 + t * 30, e: "tick", abs: t, ms: 0, npcs: [], me: { prayers } });
const pray = (t: number, c: number, option: string, target: string) => ({ t, c, e: "click", option, target, action: "CC_OP", widget: [541, 20], p0: -1, item: -1, id: 1 });
const session = Session.parse(
  [
    tick(0, []),
    // Clicked mid-tick 1; the server's update arrives before tick 1 ends: on time
    pray(1, 120, "Activate", "Protect from Magic"),
    tick(1, ["PROTECT_FROM_MAGIC"]),
    // Clicked too late in tick 2 for the server's tick: active only from tick 3
    pray(2, 155, "Activate", "Piety"),
    tick(2, ["PROTECT_FROM_MAGIC"]),
    tick(3, ["PROTECT_FROM_MAGIC", "PIETY"]),
    // Flicked on and off within tick 4: the off wins
    pray(4, 175, "Activate", "Smite"),
    pray(4, 182, "Deactivate", "Smite"),
    tick(4, ["PROTECT_FROM_MAGIC", "PIETY"]),
    // Gear: wield at tick 5, equipment update arrives in tick 6
    { t: 5, c: 205, e: "click", option: "Wield", target: "Twisted bow", action: "CC_OP", widget: [149, 0], p0: 3, item: 20997, id: 3 },
    tick(5, ["PROTECT_FROM_MAGIC", "PIETY"]),
    { t: 6, c: 215, e: "items", which: "worn", items: [[-1, 0], [-1, 0], [-1, 0], [20997, 1]] },
    tick(6, ["PROTECT_FROM_MAGIC", "PIETY"]),
    // A click another plugin cancelled
    { t: 7, c: 230, e: "click", option: "Wear", target: "Fire cape", action: "CC_OP", item: 6570, consumed: true },
    tick(7, []),
  ].map((l) => JSON.stringify(l)).join("\n"),
);
const outcomes = clickOutcomes(session);
const by = (target: string) => outcomes.find((o) => o.click.target === target && o.click.option !== "Deactivate")!;

describe("clickOutcomes", () => {
  it("calls a click acted on at the server's next tick on time", () => {
    expect(by("Protect from Magic")).toMatchObject({ status: "on-time", appliedTick: 1, serverTicks: 1 });
  });

  it("calls a click that missed the cut-off late, with how many ticks it took", () => {
    expect(by("Piety")).toMatchObject({ status: "late", appliedTick: 3, serverTicks: 2 });
  });

  it("measures how close to the end of its tick window each click was", () => {
    // Tick 2's window ends at cycle 160; Piety was clicked at 155
    expect(by("Piety").margin).toBe(5);
  });

  it("knows a flick undid itself before the server saw it", () => {
    expect(by("Smite").status).toBe("superseded");
  });

  it("follows gear swaps into the equipment update", () => {
    expect(by("Twisted bow")).toMatchObject({ status: "late", appliedTick: 6, appliedCycle: 215 });
  });

  it("knows a cancelled click never reached the server", () => {
    expect(by("Fire cape").status).toBe("cancelled");
  });
});
