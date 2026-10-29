import { describe, expect, it } from "vitest";
import { describeRecording, shownName, shownTime, sortRecordings, ticksFromTail } from "./recordingList";

describe("recording list", () => {
  it("names recordings as the plugin's panel does", () => {
    expect(shownName("20261027-025914-TFA-5man.jsonl")).toBe("TFA 5man");
    expect(shownName("20261027-025914-TFA-5man_1.jsonl")).toBe("TFA 5man-1");
    expect(shownName("20261027-004905-.jsonl")).toBe("session");
    expect(shownName("shared-clip.jsonl")).toBe("shared-clip");
  });

  it("puts the newest first by its time stamp, whatever the file's date", () => {
    const sorted = sortRecordings([
      { name: "20261026-120000-old.jsonl", size: 1, modified: 9e12 },
      { name: "20261027-120000-new.jsonl", size: 1, modified: 1 },
      { name: "20261027-120000-new_1.jsonl", size: 1, modified: 1 },
    ]);
    expect(sorted.map((f) => shownName(f.name))).toEqual(["new", "new-1", "old"]);
  });

  it("reads the length from the last whole line, even mid-write", () => {
    // Stopped: the end line has the count
    expect(ticksFromTail('{"t":2597,"c":1,"e":"tick"}\n{"t":2598,"c":2,"e":"end","ticks":2598}\n')).toBe(2598);
    expect(ticksFromTail('ut off line"}\n{"t":40,"c":1,"e":"tick"}\n{"t":41,"c":2,"e":"an')).toBe(41);
    expect(ticksFromTail("")).toBeUndefined();
  });

  it("shows name, size and ticks", () => {
    const now = new Date(2026, 9, 28).getTime();
    expect(describeRecording({ name: "20261027-025914-TFA-5man_1.jsonl", size: 32074250, modified: 0, ticks: 2599 }, now)).toBe("TFA 5man-1 · 27 Oct, 02:59 · 30.6 MB · 2,599 ticks");
  });

  it("shows the year only when it isn't this one", () => {
    expect(shownTime(new Date(2025, 11, 31, 23, 5).getTime(), new Date(2026, 0, 1).getTime())).toBe("31 Dec 2025, 23:05");
  });
});
