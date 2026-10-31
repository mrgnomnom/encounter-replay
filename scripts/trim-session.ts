/**
 * Cuts a recording down to a span of ticks (see src/trim.ts), renaming players on the way.
 *
 *   npx vite-node scripts/trim-session.ts <in.jsonl> <from> <to> <out.jsonl> ["Old name=New name" ...]
 */
import { writeFileSync } from "node:fs";
import { namePattern, toJsonl, trimLines, type RawLine } from "../src/trim";
import { readRecordingSync } from "./recordingFile";

const [input, fromArg, toArg, output, ...renameArgs] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: trim-session.ts <in.jsonl> <from> <to> <out.jsonl> ["Old name=New name" ...]');
  process.exit(2);
}
const from = Number(fromArg);
const to = Number(toArg);
const lines: RawLine[] = readRecordingSync(input).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const renames = renameArgs.map((r) => r.split("=") as [string, string]);
const out = trimLines(lines, from, to, { renames });
const text = toJsonl(out);
writeFileSync(output, text);
const left = renames.map(([old]) => old).filter((old) => namePattern(old).test(text));
console.log(`${output}: ticks ${from}-${to} as 0-${to - Math.max(0, from)}, ${out.length} lines, ${(text.length / 1024).toFixed(0)} KB${left.length ? `; STILL CONTAINS ${left.join(", ")}` : ""}`);
