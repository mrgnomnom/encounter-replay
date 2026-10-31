import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/** A recording's text, from a plain .jsonl or a packed .jsonl.gz, as the recorder now saves them */
export function readRecordingSync(path: string): string {
  const bytes = readFileSync(path);
  return (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString("utf8");
}
