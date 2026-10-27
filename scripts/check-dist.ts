/**
 * Fails the build if anything that must never be published ended up in dist: game cache files or
 * bundles (Jagex's data), recordings (players' sessions), or anything big enough to be either.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const DIST = resolve(__dirname, "..", "dist");
const FORBIDDEN = [/main_file_cache/i, /\.bundle\.json$/i, /\.jsonl$/i, /\.dat2?$/i, /\.idx\d+$/i, /^sessions\//, /^assets\/cache\//];
// The demo recording that ships with the page: trimmed, with other players renamed (scripts/trim-session.ts)
const ALLOWED = new Set(["demo/demo.jsonl"]);
// The whole site is under 2 MB; a single file over this is something else
const MAX_FILE = 3 * 1024 * 1024;

const problems: string[] = [];
let total = 0;
function walk(dir: string): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(DIST, path).split("\\").join("/");
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    total += stat.size;
    if (FORBIDDEN.some((re) => re.test(rel)) && !ALLOWED.has(rel)) problems.push(`${rel}: must never be published`);
    else if (stat.size > MAX_FILE) problems.push(`${rel}: ${(stat.size / 1048576).toFixed(1)} MB is too big for this site`);
  }
}
walk(DIST);
if (problems.length) {
  console.error(`dist isn't safe to publish:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`dist is safe to publish: ${(total / 1024).toFixed(0)} KB, no game data or recordings`);
