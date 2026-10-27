import { closeSync, createReadStream, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { exportServer } from "./exportServer";
import { sortRecordings, TAIL_BYTES, ticksFromTail } from "./src/recordingList";

/**
 * The folder Encounter Recorder writes sessions to. ENCOUNTER_SESSIONS wins; otherwise RuneLite's
 * plugin-data folder in your home, or, from WSL, in each Windows user's home
 */
function sessionsFolder(): string | undefined {
  const tail = join(".runelite", "plugin-data", "encounter-recorder", "sessions");
  const candidates = [process.env.ENCOUNTER_SESSIONS, join(homedir(), tail)];
  if (existsSync("/mnt/c/Users")) {
    for (const user of readdirSync("/mnt/c/Users")) candidates.push(join("/mnt/c/Users", user, tail));
  }
  return candidates.find((dir): dir is string => !!dir && existsSync(dir));
}

/** Lists the recorder's sessions at /recordings and serves them at /recordings/<file> */
/** The end of a file, enough for its last line */
function tail(path: string, size: number): string {
  const length = Math.min(size, TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
}

function recordings(): Plugin {
  return {
    name: "encounter-recordings",
    configureServer(server) {
      server.middlewares.use("/recordings", (req, res) => {
        const dir = sessionsFolder();
        const name = decodeURIComponent((req.url ?? "/").slice(1).split("?")[0]);
        if (!dir) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "No Encounter Recorder sessions folder found; set ENCOUNTER_SESSIONS" }));
          return;
        }
        if (!name) {
          const files = sortRecordings(readdirSync(dir)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => {
              const s = statSync(join(dir, f));
              return { name: f, size: s.size, modified: s.mtimeMs, ticks: ticksFromTail(tail(join(dir, f), s.size)) };
            }));
          res.setHeader("Content-Type", "application/json");
          // The same folder as Windows names it, for pasting into a file dialog
          const drive = /^\/mnt\/([a-z])\/(.*)$/.exec(dir);
          const windows = drive ? `${drive[1].toUpperCase()}:\\${drive[2].split("/").join("\\")}` : dir;
          res.end(JSON.stringify({ folder: dir, windowsFolder: windows, files }));
          return;
        }
        // Only plain file names from that folder
        if (!/^[\w.-]+\.jsonl$/.test(name) || !existsSync(join(dir, name))) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", "application/x-ndjson");
        createReadStream(join(dir, name)).pipe(res);
      });
    },
  };
}

/**
 * Development only: the exporter's copy of the game cache at /dev-cache/<file>?o=<offset>&n=<length>, so
 * a headless browser, which can't be given a folder, can test building bundles in the page (?devCache)
 */
function devCache(): Plugin {
  return {
    name: "encounter-dev-cache",
    configureServer(server) {
      server.middlewares.use("/dev-cache", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const name = url.pathname.slice(1);
        const file = join(__dirname, "exporter", "build", "cache-live", name);
        if (!/^main_file_cache\.(dat2|idx\d+)$/.test(name) || !existsSync(file)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const o = Number(url.searchParams.get("o") ?? 0);
        const n = url.searchParams.get("n");
        const end = n == null ? undefined : o + Number(n) - 1;
        res.setHeader("Content-Type", "application/octet-stream");
        createReadStream(file, { start: o, end }).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [recordings(), devCache(), exportServer(sessionsFolder, homedir())],
  // The bundle builder runs in a module worker
  worker: { format: "es" },
  server: {
    port: 5180,
    host: "127.0.0.1",
    // The project lives on a Windows drive, which sends WSL no file-change events
    watch: { usePolling: true, interval: 300 },
  },
});