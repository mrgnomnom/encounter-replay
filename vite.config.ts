import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { exportServer } from "./exportServer";

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
          const files = readdirSync(dir)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => {
              const s = statSync(join(dir, f));
              return { name: f, size: s.size, modified: s.mtimeMs };
            })
            .sort((a, b) => b.modified - a.modified);
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

export default defineConfig({
  base: "./",
  plugins: [recordings(), exportServer(sessionsFolder, homedir())],
  server: {
    port: 5180,
    host: "127.0.0.1",
    // The project lives on a Windows drive, which sends WSL no file-change events
    watch: { usePolling: true, interval: 300 },
  },
});
