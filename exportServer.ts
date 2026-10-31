import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { Plugin } from "vite";
import { RECORDING_NAME, withoutEnding } from "./src/packed";

/**
 * Exports a recording's models on demand: POST /export/<file> runs the exporter against a copy of the
 * game cache (refreshed when RuneLite's is newer) and writes assets/cache/<name>.bundle.json, so a new
 * recording opens fully without anyone running anything by hand
 */

const ROOT = resolve(__dirname);
const EXPORTER = join(ROOT, "exporter");
const CACHE_COPY = join(EXPORTER, "build", "cache-live");
const OUT = join(ROOT, "assets", "cache");

/** RuneLite's game cache, from Windows or WSL */
function liveCache(home: string): string | undefined {
  const tail = join(".runelite", "jagexcache", "oldschool", "LIVE");
  const candidates = [process.env.ENCOUNTER_CACHE, join(home, tail)];
  if (existsSync("/mnt/c/Users")) for (const user of readdirSync("/mnt/c/Users")) candidates.push(join("/mnt/c/Users", user, tail));
  return candidates.find((d): d is string => !!d && existsSync(join(d, "main_file_cache.dat2")));
}

/** A Java 11+ runtime: ENCOUNTER_JAVA, then JDKs IntelliJ keeps in ~/.jdks */
export function java(): string | undefined {
  if (process.env.ENCOUNTER_JAVA) return process.env.ENCOUNTER_JAVA;
  const homes = [process.env.USERPROFILE, ...(existsSync("/mnt/c/Users") ? readdirSync("/mnt/c/Users").map((u) => join("/mnt/c/Users", u)) : [])];
  for (const home of homes) {
    const jdks = home && join(home, ".jdks");
    if (!jdks || !existsSync(jdks)) continue;
    for (const jdk of readdirSync(jdks).sort().reverse()) {
      for (const exe of ["java.exe", "java"]) {
        const path = join(jdks, jdk, "bin", exe);
        if (existsSync(path)) return path;
      }
    }
  }
  return undefined;
}

/** Paths as the (Windows) Java runtime needs them when run from WSL */
export function forJava(path: string, javaPath: string): string {
  const m = /^\/mnt\/([a-z])\/(.*)$/.exec(path);
  return javaPath.endsWith(".exe") && m ? `${m[1].toUpperCase()}:\\${m[2].split("/").join("\\")}` : path;
}

const running = new Map<string, Promise<string>>();

export function exportServer(sessionsFolder: () => string | undefined, home: string): Plugin {
  return {
    name: "encounter-export",
    configureServer(server) {
      server.middlewares.use("/export", (req, res) => {
        const name = decodeURIComponent((req.url ?? "/").slice(1).split("?")[0]);
        const reply = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        const dir = sessionsFolder();
        if (req.method !== "POST" || !RECORDING_NAME.test(name) || !dir || !existsSync(join(dir, name))) return reply(404, { error: "No such recording" });
        let job = running.get(name);
        if (!job) {
          job = runExport(plainCopy(join(dir, name)), withoutEnding(name), home).finally(() => running.delete(name));
          running.set(name, job);
        }
        job.then((log) => reply(200, { ok: true, log })).catch((e: Error) => reply(500, { error: e.message }));
      });
    },
  };
}

/** The exporter reads plain JSON lines: a packed recording is unpacked next to it first */
function plainCopy(session: string): string {
  if (!session.endsWith(".gz")) return session;
  const dir = join(EXPORTER, "build", "sessions");
  mkdirSync(dir, { recursive: true });
  const plain = join(dir, withoutEnding(session.split("/").pop()!) + ".jsonl");
  writeFileSync(plain, gunzipSync(readFileSync(session)));
  return plain;
}

async function runExport(session: string, base: string, home: string): Promise<string> {
  const javaPath = java();
  if (!javaPath) throw new Error("No Java found: set ENCOUNTER_JAVA to a Java 11+ runtime");
  const classes = join(EXPORTER, "build", "classes", "java", "main");
  if (!existsSync(classes)) throw new Error("The exporter isn't built: run gradlew compileJava copyDeps in exporter/");
  const live = liveCache(home);
  if (!live) throw new Error("RuneLite's game cache wasn't found: set ENCOUNTER_CACHE");
  // Read from a copy, never the cache RuneLite has open; refreshed when the game has updated it
  const stamp = (d: string) => (existsSync(join(d, "main_file_cache.dat2")) ? statSync(join(d, "main_file_cache.dat2")).mtimeMs : 0);
  if (stamp(live) > stamp(CACHE_COPY)) {
    mkdirSync(CACHE_COPY, { recursive: true });
    cpSync(live, CACHE_COPY, { recursive: true });
  }
  mkdirSync(OUT, { recursive: true });
  const sep = javaPath.endsWith(".exe") ? ";" : ":";
  const cp = [classes, join(EXPORTER, "build", "deps", "*")].map((p) => forJava(p, javaPath)).join(sep);
  const args = ["-Xmx3g", "-cp", cp, "encounterreplay.Exporter", forJava(CACHE_COPY, javaPath), forJava(session, javaPath), forJava(join(OUT, `${base}.bundle.json`), javaPath)];
  return new Promise((ok, fail) => {
    execFile(javaPath, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) fail(new Error(`${err.message}\n${stderr}`.slice(0, 2000)));
      else ok(stdout);
    });
  });
}
