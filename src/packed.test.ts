import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isGzip, pack, RECORDING_NAME, recordingText, ticksFromHeader, withoutEnding } from "./packed";
import { shownName } from "./recordingList";

const LINES = '{"t":0,"c":1,"e":"header"}\n{"t":0,"c":2,"e":"tick"}\n{"t":1,"c":32,"e":"tick"}\n';

describe("packed recordings", () => {
  it("packs as the recorder does: a gzip anything can unpack, with the length in its header", async () => {
    const bytes = new Uint8Array(await (await pack(LINES, 2)).arrayBuffer());
    expect(isGzip(bytes)).toBe(true);
    expect(gunzipSync(bytes).toString("utf8")).toBe(LINES);
    expect(ticksFromHeader(bytes.subarray(0, 512))).toBe(2);
    expect(await recordingText(new Blob([bytes]))).toBe(LINES);
  });

  it("reads the recorder's own header, byte for byte", () => {
    // What Compressed.gzip writes in front of the deflated lines for a 2,598-tick recording
    const head = new Uint8Array([0x1f, 0x8b, 8, 16, 0, 0, 0, 0, 0, 255, ...new TextEncoder().encode('{"ticks":2598}'), 0, 0x55]);
    expect(ticksFromHeader(head)).toBe(2598);
  });

  it("has no length for a gzip made by something else, and opens it all the same", async () => {
    const other = gzipSync(Buffer.from(LINES));
    expect(ticksFromHeader(new Uint8Array(other))).toBeUndefined();
    expect(await recordingText(new Blob([new Uint8Array(other)]))).toBe(LINES);
  });

  it("opens plain recordings as they are", async () => {
    expect(await recordingText(new Blob([LINES]))).toBe(LINES);
    expect(ticksFromHeader(new TextEncoder().encode(LINES))).toBeUndefined();
  });

  it("keeps the whole lines of a gzip cut off partway", async () => {
    let long = "";
    for (let t = 0; t < 5000; t++) long += `{"t":${t},"c":${t * 30},"e":"tick","pad":"${"x".repeat(t % 89)}"}\n`;
    const bytes = new Uint8Array(await (await pack(long, 5000)).arrayBuffer());
    const text = await recordingText(new Blob([bytes.subarray(0, Math.floor(bytes.length * 0.6))]));
    expect(text.length).toBeGreaterThan(0);
    expect(text.endsWith("\n")).toBe(true);
    expect(long.startsWith(text)).toBe(true);
  });

  it("names packed recordings as the plugin does, and only plain file names", () => {
    expect(shownName("20261027-025914-TFA-5man.jsonl.gz")).toBe("TFA 5man");
    expect(shownName("20261027-025914-TFA_1.jsonl.gz")).toBe("TFA-1");
    expect(shownName("shared-clip.jsonl.gz")).toBe("shared-clip");
    expect(withoutEnding("20261027-TFA.jsonl.gz")).toBe("20261027-TFA");
    expect(withoutEnding("clip.gz")).toBe("clip");
    expect(RECORDING_NAME.test("20261027-025914-TFA.jsonl.gz")).toBe(true);
    expect(RECORDING_NAME.test("20261027-025914-TFA.jsonl")).toBe(true);
    expect(RECORDING_NAME.test("20261027-025914-TFA.jsonl.gz.part")).toBe(false);
    expect(RECORDING_NAME.test("../secret.jsonl")).toBe(false);
  });
});
