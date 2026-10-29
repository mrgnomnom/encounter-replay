import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import "./style.css";
import { Bundle } from "./cache/bundle";
import type { BuildMessage, BuildRequest } from "./cache/build/worker";
import { Hud } from "./hud";
import { cycleAt } from "./moment";
import { clickPoints, hasAccuracyData } from "./accuracy";
import { clickOutcomes } from "./outcomes";
import { refOfKey } from "./relevance";
import { refKey } from "./session";
import { EffectLinks } from "./links";
import { lengthOf } from "./cache/models";
import { ObjectLayer } from "./objectLayer";
import { GroundItemLayer } from "./groundItems";
import { ObjectTimeline } from "./objects";
import { Session } from "./session";
import { Stage } from "./stage";
import { FolderUi } from "./folderUi";
import { addSupport } from "./support";
import { Tour, tutorialDone } from "./tutorial";
import { Notes } from "./notes";
import { NotesUi } from "./notesUi";
import { listSessions, noteRead, readSession } from "./runeliteFolder";
import { VIEWS } from "./timelineViews";
import { describeRecording, type RecordingFile } from "./recordingList";
import { preloadTextures } from "./cache/textures";
import { toThree, World } from "./world";

// One game tick is 600 ms
const TICK_MS = 600;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

const view = $("view");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
view.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.className = "labels";
view.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2430);
scene.fog = new THREE.Fog(0x1b2430, 40, 90);
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x3a3226, 1.6));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// Without a bias, big flat floors shadow themselves in stripes that shift as the camera moves
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
camera.position.set(52, 14, -40);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
// Panning slides the point the camera orbits along the floor. Panning in screen space would lift it into
// the air or sink it underground, so the camera would zoom towards a point it isn't looking at
controls.screenSpacePanning = false;
// The middle button orbits too, like the left; the wheel zooms (below)
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
controls.enableZoom = false;
controls.target.set(52, 0, -52);

// Zoom without limits. The wheel scales the distance to the orbit point. Closer in than MIN_ORBIT the
// camera walks forward instead and carries the point with it, so zooming never stalls against it
const MIN_ORBIT = 1.5;
renderer.domElement.addEventListener("wheel", (e) => {
  e.preventDefault();
  const pixels = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  const factor = Math.exp(pixels * 0.0015);
  const offset = camera.position.clone().sub(controls.target);
  const d = offset.length();
  if (d * factor >= MIN_ORBIT) {
    camera.position.copy(controls.target).addScaledVector(offset, factor);
  } else {
    const forward = offset.normalize().negate();
    controls.target.addScaledVector(forward, Math.max(d, 4) * (1 - factor));
    camera.position.copy(controls.target).addScaledVector(forward, -MIN_ORBIT);
  }
}, { passive: false });

/** Keeps the fog and the far plane beyond the orbit point, however far out the camera is */
function fitViewDistance(): void {
  const d = camera.position.distanceTo(controls.target);
  const fog = scene.fog as THREE.Fog;
  fog.near = Math.max(40, d + 25);
  fog.far = Math.max(90, d + 75);
  const far = Math.max(400, d * 4);
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}

const world = new World();
const stage = new Stage();
const objectLayer = new ObjectLayer();
const itemLayer = new GroundItemLayer();
scene.add(world.group, stage.group, objectLayer.group, itemLayer.group);

const hud = new Hud(() => session && hud.showTick(session, clock.t, showVars()));
// The summary's tick links jump there
hud.onJump = (t) => seek(t);

// Notes on ticks and markers, and exporting the timeline's view with them
const notes = new Notes();
const notesUi = new NotesUi(notes, {
  tick: () => clock.t,
  cycle: () => (session ? Math.floor(cycleAt(session, clock.t, clock.frac)) : 0),
  range: () => (session ? hud.view(session) : { from: 0, to: 0, zoomed: false }),
  changed() {
    if (!session) return;
    hud.drawTimeline(session);
    hud.showTick(session, clock.t, showVars());
  },
  baseName: () => sessionBase || "recording",
  pause() {
    clock.playing = false;
    updatePlay();
  },
});
let session: Session | undefined;
let objects: ObjectTimeline | undefined;
let bundle: Bundle | undefined;
const clock = { t: 0, frac: 0, playing: false, speed: 1 };
const followMe = () => $<HTMLInputElement>("follow").checked;
const showVars = () => $<HTMLInputElement>("showVars").checked;
const lastFocus = new THREE.Vector3();
let cameraDistance = 17;
let hasFocus = false;

let sessionText = "";
let sessionBase = "";

function open(text: string, name: string): void {
  session = Session.parse(text);
  sessionText = text;
  notes.load(session, text, name);
  notesUi.reset();
  objects = new ObjectTimeline(session);
  hud.setOutcomes(clickOutcomes(session));
  hud.setAccuracy(hasAccuracyData(session) ? clickPoints(session) : undefined);
  // A new recording starts out following you, unless the address asked for someone else
  follow(pendingFocus ?? "me");
  pendingFocus = undefined;
  bundle = undefined;
  stage.load(session, undefined);
  objectLayer.load(undefined);
  // Models come from a cache bundle exported for this session, if there is one next to the page
  const base = name.replace(/\.jsonl$/, "");
  sessionBase = base;
  const opened = session;
  // With the game cache connected, models come straight from it
  if (folderUi.folders.cache) void buildFromCache(folderUi.folders.cache);
  // ?devCache builds from the dev server's copy of the cache, for testing in a headless browser
  else if (import.meta.env.DEV && params.has("devCache")) void buildFromCache(new URL("dev-cache/", location.href).href);
  else if (import.meta.env.DEV) devBundle(name, base, opened);
  else $("bundleStatus").textContent = "boxes for now: connect the game cache to see game models";
  hasFocus = false;
  Object.assign(clock, { t: 0, frac: 0, playing: false });
  $("drop").classList.add("hidden");
  hud.showMeta(session, name);
  hud.drawTimeline(session);
  seek(0);
  updatePlay();
}

/** Builds the open session's bundle from the game cache, in a worker so the replay keeps running */
async function buildFromCache(cache: BuildRequest["cache"]): Promise<void> {
  const opened = session;
  const base = sessionBase;
  const started = performance.now();
  $("bundleStatus").textContent = "reading the game cache…";
  try {
    // ?devCache=inline builds on the page instead, where a headless screenshot waits for it to finish
    const raw = typeof cache === "string" && params.get("devCache") === "inline" ? await buildInline(cache) : await new Promise<Record<string, unknown>>((resolve, reject) => {
      const worker = new Worker(new URL("./cache/build/worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<BuildMessage>) => {
        const m = e.data;
        for (const [file, bytes] of m.files) noteRead(file, bytes);
        if ("progress" in m) {
          if (session === opened) $("bundleStatus").textContent = `reading the game cache: ${m.progress}…`;
          return;
        }
        worker.terminate();
        if ("bundle" in m) resolve(m.bundle);
        else reject(new Error(m.error));
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message));
      };
      worker.postMessage({ cache, session: sessionText } satisfies BuildRequest);
    });
    if (session !== opened) return;
    const built = new Bundle(raw as never);
    await preloadTextures(built);
    if (session !== opened) return;
    useBundle(built, base);
    console.info(`Bundle built from the game cache in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  } catch (e) {
    if (session !== opened) return;
    $("bundleStatus").textContent = `couldn't read the game cache: ${e instanceof Error ? e.message : e}`;
  }
}

async function buildInline(url: string): Promise<Record<string, unknown>> {
  const [{ buildBundle }, { CacheStore }, { devSource }] = await Promise.all([
    import("./cache/build/buildBundle"), import("./cache/store/store"), import("./cache/build/devSource"),
  ]);
  return buildBundle(await CacheStore.open(devSource(url)), sessionText, (step) => ($("bundleStatus").textContent = `reading the game cache: ${step}…`));
}

/** In development: a bundle the Java exporter wrote next to the page, exported on demand */
function devBundle(name: string, base: string, opened: Session): void {
  $("bundleStatus").textContent = "looking for models…";
  Bundle.fetch(`assets/cache/${base}.bundle.json`).then(async (b) => {
    if (session !== opened) return;
    // No models yet for a recording in the sessions folder: export them now, then load
    let failure: string | undefined;
    if (!b && /^[\w.-]+\.jsonl$/.test(name)) {
      $("bundleStatus").textContent = "exporting models from the game cache…";
      const r = await fetch(`export/${encodeURIComponent(name)}`, { method: "POST" }).catch(() => undefined);
      if (session !== opened) return;
      if (r?.ok) b = await Bundle.fetch(`assets/cache/${base}.bundle.json?${Date.now()}`);
      // 404 is a file from somewhere else: nothing to export it from
      else if (r && r.status !== 404) failure = (await r.json().catch(() => ({}))).error ?? `export failed (${r.status})`;
      if (session !== opened) return;
    }
    if (b) await preloadTextures(b);
    if (session !== opened) return;
    useBundle(b, base);
    if (failure) $("bundleStatus").textContent = `export failed: ${failure.split("\n")[0]}`;
  });
}

function useBundle(b: Bundle | undefined, base: string): void {
  if (!session) return;
  bundle = b;
  // Open-world map loads take their objects from the cache, by way of the bundle
  if (b && objects) {
    session.scenes.forEach((scene, i) => {
      const placed = scene.instance ? undefined : b.mapObjects(scene.t);
      const next = session!.scenes[i + 1]?.t ?? Infinity;
      if (placed) objects!.addMapObjects(scene, next, placed, (id) => {
        const def = b.object(id);
        return [def?.sizeX ?? 1, def?.sizeY ?? 1];
      });
    });
  }
  stage.load(session, bundle);
  objectLayer.load(bundle);
  itemLayer.load(session, bundle);
  world.clearLifts();
  $<HTMLInputElement>("collision").checked = !bundle;
  // With models the scene speaks for itself; debug labels are one click away
  $<HTMLInputElement>("labels").checked = !bundle;
  document.body.classList.toggle("no-object-labels", !!bundle);
  stage.debugLabels = !bundle;
  // Once loaded, the scene speaks for itself: the status only says something while loading or when it failed
  $("bundleStatus").textContent = bundle ? "" : import.meta.env.DEV ? `no models: export assets/cache/${base}.bundle.json` : "";
  // Which effects come with which animations, learned from this recording's repetitions
  const links = new EffectLinks(session, (anim) => (bundle ? lengthOf(bundle, anim) : undefined));
  stage.effectLinks = links;
  hud.setLinks(links);
  hud.setBundle(bundle);
  hud.showTick(session, clock.t, showVars());
}

/** Follows someone: the camera centres on them and the log keeps to lines about them */
function follow(key: string): void {
  stage.followKey = key === "me" ? undefined : key;
  hud.followKey = key;
  $<HTMLInputElement>("follow").checked = true;
  hasFocus = false;
  refreshFollowList(true);
  filterLabelFor = "";
  updateFilterLabel();
  if (session) {
    hud.drawTimeline(session);
    hud.showTick(session, clock.t, showVars());
  }
}

let followListKey = "";
let filterLabelFor = "";
/** Names whoever is followed in the log filter, once they're on screen to be named */
function updateFilterLabel(): void {
  if (!session || filterLabelFor === hud.followKey) return;
  if (hud.followKey === "me") {
    $("filterWho").textContent = "you";
    filterLabelFor = "me";
    return;
  }
  const ref = refOfKey(hud.followKey, session, clock.t);
  if (!ref) return;
  $("filterWho").textContent = session.label(ref, clock.t);
  filterLabelFor = hud.followKey;
}
let pendingFocus: string | undefined;
/** The dropdown lists everyone present now, keeping whoever is followed even after they've gone */
function refreshFollowList(force = false): void {
  if (!session) return;
  const select = $<HTMLSelectElement>("followWho");
  // Rebuilding while it's open would snap it shut
  if (!force && document.activeElement === select) return;
  const tick = session.tickAt(clock.t);
  const keys = ["me", ...(tick?.players ?? []).map((a) => refKey(a.who)), ...(tick?.npcs ?? []).map((a) => refKey(a.who))];
  if (!keys.includes(hud.followKey)) keys.push(hud.followKey);
  const listKey = keys.join(",") + "|" + hud.followKey;
  if (!force && listKey === followListKey) return;
  followListKey = listKey;
  const s = session;
  select.replaceChildren(...keys.map((key) => {
    const o = document.createElement("option");
    o.value = key;
    const ref = refOfKey(key, s, clock.t);
    o.textContent = key === "me" ? `you${s.you ? ` (${s.you})` : ""}` : ref ? s.label(ref, clock.t) : `${key} (gone)`;
    return o;
  }));
  select.value = hud.followKey;
}

function seek(t: number): void {
  if (!session) return;
  clock.t = Math.max(0, Math.min(session.lastTick, t));
  clock.frac = 0;
  hud.showTick(session, clock.t, showVars());
  refreshFollowList();
}

function updatePlay(): void {
  $("play").textContent = clock.playing ? "❚❚ Pause" : "▶ Play";
}

function resize(): void {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  if (session) hud.drawTimeline(session);
}

let last = performance.now();
function frame(now: number): void {
  const dt = now - last;
  last = now;
  if (session) {
    if (clock.playing) {
      clock.frac += (dt / TICK_MS) * clock.speed;
      while (clock.frac >= 1) {
        if (clock.t >= session.lastTick) {
          clock.playing = false;
          clock.frac = 0;
          updatePlay();
          break;
        }
        clock.frac -= 1;
        clock.t++;
        hud.showTick(session, clock.t, showVars());
        refreshFollowList();
      }
    }
    const t = clock.t;
    const tickScene = session.sceneAt(t);
    const plane = session.tickAt(t)?.me?.p ?? 0;
    world.show(tickScene, plane, {
      terrain: tickScene && bundle ? (p) => bundle?.terrain(tickScene.t, p) : undefined,
      textureColor: (id) => bundle?.textureColor(id),
      collision: $<HTMLInputElement>("collision").checked,
      heights: tickScene && bundle && !tickScene.heights ? bundle.mapHeights(tickScene.t) : undefined,
      below: tickScene && bundle && !tickScene.instance ? bundle.mapBelow(tickScene.t) : undefined,
    });
    if (objects) {
      const next = session.scenes.find((s) => s.t > (tickScene?.t ?? -1));
      objectLayer.show(objects, t, plane, world, $<HTMLInputElement>("scenery").checked, tickScene?.t ?? 0, next?.t ?? Infinity);
      objectLayer.animate(cycleAt(session, t, clock.frac));
    }
    itemLayer.show(t, plane, world);
    const focus = stage.update(session, t, $<HTMLInputElement>("smooth").checked ? clock.frac : 0, world);
    if (focus) {
      const target = toThree(focus.x, focus.y, focus.ground);
      if (!hasFocus) {
        // Put the camera behind them, looking north; until whoever is followed appears, wait on you
        controls.target.copy(target);
        camera.position.copy(target).add(new THREE.Vector3(0, 11, 13).multiplyScalar(cameraDistance / 17));
        hasFocus = focus.key === hud.followKey;
      } else if (followMe()) {
        const delta = target.clone().sub(lastFocus);
        controls.target.add(delta);
        camera.position.add(delta);
      }
      lastFocus.copy(target);
      sun.position.copy(target).add(new THREE.Vector3(-12, 25, 8));
      sun.target.position.copy(target);
    }
    hud.drawCursor(session, clock.t + clock.frac);
    notesUi.update();
    updateFilterLabel();
  }
  controls.update();
  fitViewDistance();
  renderer.render(scene, camera);
  labels.render(scene, camera);
  drawHitLine();
  requestAnimationFrame(frame);
}

/**
 * A dashed line on screen from whoever dealt a hovered hit to its pulsing hitsplat. Drawn over the view
 * rather than in the scene, so it lands exactly on the hitsplat, which is part of the page
 */
const hitLine = document.createElementNS("http://www.w3.org/2000/svg", "svg");
hitLine.classList.add("hit-line");
view.appendChild(hitLine);
/**
 * Dotted lines on screen: from you to a hovered hit of yours, and between actors for a hovered target
 * or projectile line. Each starts with a dot and ends with an arrowhead pointing the way it goes
 */
function drawHitLine(): void {
  const box = view.getBoundingClientRect();
  const screen = (v: THREE.Vector3): [number, number] => {
    const p = v.clone().project(camera);
    return [((p.x + 1) / 2) * box.width, ((1 - p.y) / 2) * box.height];
  };
  const segments: [number, number, number, number][] = [];
  const splat = view.querySelector<HTMLElement>(".splat.pulse");
  if (splat && stage.hitSourcePoint) {
    const s = splat.getBoundingClientRect();
    segments.push([...screen(stage.hitSourcePoint), s.left + s.width / 2 - box.left, s.top + s.height / 2 - box.top]);
  }
  for (const [a, b] of stage.links) segments.push([...screen(a), ...screen(b)]);
  hitLine.style.display = segments.length ? "" : "none";
  hitLine.innerHTML = segments.map(([x1, y1, x2, y2]) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = (d: number) => `${x2 - 10 * Math.cos(angle + d)},${y2 - 10 * Math.sin(angle + d)}`;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffe14d" stroke-width="2" stroke-dasharray="6 5" />` +
      `<circle cx="${x1}" cy="${y1}" r="4" fill="#ffe14d" /><polygon points="${x2},${y2} ${head(0.45)} ${head(-0.45)}" fill="#ffe14d" />`;
  }).join("");
}

// Controls

$("play").onclick = () => {
  if (!session) return;
  if (clock.t >= session.lastTick) seek(0);
  clock.playing = !clock.playing;
  updatePlay();
};
$("prev").onclick = () => { clock.playing = false; updatePlay(); seek(clock.t - 1); };
$("next").onclick = () => { clock.playing = false; updatePlay(); seek(clock.t + 1); };
$<HTMLSelectElement>("speed").onchange = (e) => { clock.speed = Number((e.target as HTMLSelectElement).value); };
$<HTMLInputElement>("showVars").onchange = () => session && hud.showTick(session, clock.t, showVars());
$<HTMLSelectElement>("followWho").onchange = (e) => follow((e.target as HTMLSelectElement).value);
$<HTMLInputElement>("logFilter").onchange = (e) => {
  hud.filterLog = (e.target as HTMLInputElement).checked;
  if (session) hud.showTick(session, clock.t, showVars());
};
// Ticking "Follow me" again puts the camera back behind you at its starting distance
$<HTMLInputElement>("follow").onchange = (e) => {
  if ((e.target as HTMLInputElement).checked) hasFocus = false;
};
// Panning (right-drag, or shift-drag) is looking somewhere else: stop following until asked again
let panFrom: { x: number; y: number } | undefined;
renderer.domElement.addEventListener("pointerdown", (e) => {
  const panning = e.button === 2 || (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey));
  panFrom = panning ? { x: e.clientX, y: e.clientY } : undefined;
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (panFrom && Math.hypot(e.clientX - panFrom.x, e.clientY - panFrom.y) > 3) {
    $<HTMLInputElement>("follow").checked = false;
    panFrom = undefined;
  }
});
renderer.domElement.addEventListener("pointerup", () => { panFrom = undefined; });
const hpBarsBox = $<HTMLInputElement>("hpBars");
hpBarsBox.checked = stage.hpBars = recallText("replay.hpBars") !== "off";
hpBarsBox.onchange = () => {
  stage.hpBars = hpBarsBox.checked;
  rememberText("replay.hpBars", hpBarsBox.checked ? "on" : "off");
};
$<HTMLInputElement>("labels").onchange = (e) => {
  const on = (e.target as HTMLInputElement).checked;
  document.body.classList.toggle("no-object-labels", !on);
  stage.debugLabels = on;
};
// Hovering a log line or click points at what it refers to in the scene and the side panel
hud.onHover = (targets) => {
  stage.setHighlight(targets);
  const item = targets.find((x) => x.kind === "tile" && x.item) as { sx: number; sy: number } | undefined;
  itemLayer.pulseTile = item;
};

document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "SELECT" || !session) return;
  if (e.key === " ") { e.preventDefault(); $("play").click(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); $("prev").click(); }
  else if (e.key === "ArrowRight") { e.preventDefault(); $("next").click(); }
  else if (e.key === "Escape") hud.setZoom(session, null);
});

// The timeline: click to jump, drag out a stretch to zoom into it, drag the playhead to scrub
const timeline = $<HTMLCanvasElement>("timeline");
let press: { x: number; tick: number; scrub: boolean; selecting: boolean } | undefined;
timeline.addEventListener("pointerdown", (e) => {
  if (!session) return;
  timeline.setPointerCapture(e.pointerId);
  const onPlayhead = Math.abs(e.clientX - hud.xOfTick(session, clock.t + clock.frac)) <= 6;
  press = { x: e.clientX, tick: hud.tickAtX(session, e.clientX), scrub: onPlayhead, selecting: false };
});
timeline.addEventListener("pointermove", (e) => {
  if (!session) return;
  // Hovering (not dragging): what the mark under the pointer is, and its lines lit in the log
  if (!press) {
    hud.showMarkHover(session, hud.markUnder(session, e.clientX, e.clientY), e.clientX, e.clientY);
    return;
  }
  hud.showMarkHover(session, undefined, 0, 0);
  if (press.scrub) {
    seek(hud.tickAtX(session, e.clientX));
    return;
  }
  if (!press.selecting && Math.abs(e.clientX - press.x) > 4) press.selecting = true;
  if (press.selecting) hud.showSelection(session, press.tick, hud.tickAtX(session, e.clientX));
});
timeline.addEventListener("pointerup", (e) => {
  if (!session || !press) return;
  const end = hud.tickAtX(session, e.clientX);
  if (press.selecting) {
    hud.showSelection(session, null);
    const [a, b] = [Math.min(press.tick, end), Math.max(press.tick, end)];
    if (b - a >= 2) hud.setZoom(session, a, b);
  } else if (!press.scrub) {
    // Clicking a mark jumps to its tick and picks out its lines; anywhere else just jumps
    const mark = hud.markUnder(session, e.clientX, e.clientY);
    seek(mark?.t ?? end);
    if (mark) hud.selectLines(mark.lines);
  }
  press = undefined;
});
timeline.addEventListener("pointerleave", () => session && hud.showMarkHover(session, undefined, 0, 0));
$("zoomReset").onclick = () => session && hud.setZoom(session, null);

// What the timeline shows, kept between visits; ?view=damage picks one, e.g. for screenshots
const viewPicker = $<HTMLSelectElement>("timelineView");
for (const v of VIEWS) viewPicker.append(new Option(v.name, v.id));
viewPicker.value = VIEWS.find((v) => v.id === (params.get("view") ?? recallText("replay.timelineView")))?.id ?? VIEWS[0].id;
hud.setView(session, viewPicker.value);
viewPicker.onchange = () => {
  hud.setView(session, viewPicker.value);
  rememberText("replay.timelineView", viewPicker.value);
};
function rememberText(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: the choice just won't be kept */ }
}
function recallText(key: string): string | undefined {
  try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; }
}

let sessionsFolder: string | undefined;

/**
 * Open session: Chromium's file picker remembers the folder it was last used in (by this id), so after
 * the first pick it opens in the sessions folder. Pages can't point it at a folder themselves, so the
 * first time the folder's path goes on the clipboard, ready to paste into the dialog
 */
type FilePicker = (o: { id?: string; startIn?: FileSystemDirectoryHandle; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ getFile(): Promise<File> }[]>;
async function openWithPicker(): Promise<void> {
  const picker = (window as unknown as { showOpenFilePicker?: FilePicker }).showOpenFilePicker;
  if (!picker) {
    $<HTMLInputElement>("file").click();
    return;
  }
  let learned = false;
  try { learned = localStorage.getItem("replay.pickerLearned") === "1"; } catch { /* storage blocked */ }
  // Until the dialog has learned the folder, its path goes on the clipboard (see the button's tooltip)
  if (!learned && sessionsFolder) await navigator.clipboard.writeText(sessionsFolder).catch(() => undefined);
  try {
    // Starts in the recordings folder when it's connected
    const startIn = folderUi.folders.sessions;
    const [handle] = await picker({ id: "encounter-sessions", ...(startIn ? { startIn } : {}), types: [{ description: "Encounter Recorder sessions", accept: { "application/x-ndjson": [".jsonl"] } }] });
    openFile(await handle.getFile());
    try { localStorage.setItem("replay.pickerLearned", "1"); } catch { /* storage blocked */ }
  } catch {
    // Cancelled
  }
}

// The two folders the page reads, once connected: recordings, and the game cache to draw them with
const folderUi = new FolderUi((kind) => {
  if (kind === "sessions") void listRecordings().then(() => openFromHash());
  else if (session && !bundle && folderUi.folders.cache) void buildFromCache(folderUi.folders.cache);
  // Arrived from the plugin's Open replay button: once the game cache is set up, open its recording;
  // otherwise, the first time, the tutorial
  else if (!linkedSession() && !tutorialDone()) void tour.start();
});

/** Whether the page was opened on a recording (#session=<file>), and if so opens it, or asks for the folder it's in */
function linkedSession(): boolean {
  const linked = new URLSearchParams(location.hash.slice(1)).has("session");
  return openFromHash() || linked;
}

// The tutorial, on the demo recording that ships with the page
const tour = new Tour({
  async openDemo() {
    const text = await (await fetch("demo/demo.jsonl")).text();
    open(text, "demo.jsonl");
  },
  seek,
  pause() {
    clock.playing = false;
    updatePlay();
  },
  follow(who) {
    if (who === "me") return follow("me");
    refreshFollowList(true);
    const option = [...$<HTMLSelectElement>("followWho").options].find((o) => o.text.includes(who));
    if (option) follow(option.value);
  },
  pickTab(tab) {
    hud.pinTab(tab);
    if (session) hud.showTick(session, clock.t, showVars());
  },
  followGameTab() {
    const box = $<HTMLInputElement>("followTab");
    box.checked = true;
    box.dispatchEvent(new Event("change"));
  },
  lateMark(t) {
    if (!session) return undefined;
    // Late clicks are drawn in the tick events view
    if (hud.viewId !== "events") {
      viewPicker.value = "events";
      hud.setView(session, "events");
    }
    const r = timeline.getBoundingClientRect();
    const x0 = hud.xOfTick(session, t);
    const x1 = hud.xOfTick(session, t + 1);
    return new DOMRect(x0, r.top, Math.max(8, x1 - x0), Math.max(10, r.height * 0.3));
  },
  importRecording: () => void openWithPicker(),
  setDirectory: () => folderUi.open(),
});
$("tutorialOpen").onclick = () => void tour.start();
$("dropSetup").onclick = () => folderUi.open();
addSupport(document.querySelector("header")!);

/** #session=<file> opens a recording from the connected folder: the recorder's Replay button links here */
function openFromHash(): boolean {
  const name = new URLSearchParams(location.hash.slice(1)).get("session");
  if (!name || !/^[\w.-]+\.jsonl$/.test(name)) return false;
  // The landing page sets up the game cache first
  if (!folderUi.folders.cache) return false;
  const sessions = folderUi.folders.sessions;
  if (!sessions) {
    folderUi.open(`To open ${name} from the plugin, the replay needs to know where your recordings are.`);
    return false;
  }
  history.replaceState(null, "", location.pathname + location.search);
  readSession(sessions, name).then((text) => open(text, name), () => ($("drop").textContent = `${name} isn't in your recordings folder`));
  return true;
}
window.addEventListener("hashchange", () => void openFromHash());

// The recorder's own sessions folder: connected, or in development listed by the dev server. Newest
// first, refreshed on open
async function listRecordings(): Promise<void> {
  const select = $<HTMLSelectElement>("recordings");
  const sessions = folderUi.folders.sessions;
  if (sessions || !import.meta.env.DEV) {
    const files = sessions ? await listSessions(sessions).catch(() => []) : [];
    select.title = sessions ? "Your recordings, newest first" : "Connect your recordings folder to list them here";
    const keep = select.value;
    select.replaceChildren(new Option(!sessions ? "Recordings…" : files.length ? "Recordings…" : "No recordings yet", ""), ...files.map((f) =>
      new Option(describeRecording(f), f.name)));
    select.value = keep;
    return;
  }
  try {
    const r = await fetch("recordings/");
    if (!r.ok) throw new Error(await r.text());
    const { folder, windowsFolder, files } = (await r.json()) as { folder: string; windowsFolder: string; files: RecordingFile[] };
    sessionsFolder = windowsFolder;
    select.title = `Recordings in ${folder}, newest first`;
    const keep = select.value;
    select.replaceChildren(new Option(files.length ? "Recordings…" : "No recordings yet", ""), ...files.map((f) =>
      new Option(describeRecording(f), f.name)));
    select.value = keep;
  } catch {
    select.replaceChildren(new Option("Recordings folder not found", ""));
    select.title = "The dev server couldn't find Encounter Recorder's sessions folder; set ENCOUNTER_SESSIONS";
  }
}
$<HTMLSelectElement>("recordings").onfocus = () => void listRecordings();
$<HTMLSelectElement>("recordings").onmousedown = (e) => {
  // Nothing to list until the folder is connected: ask for it instead
  if (!folderUi.folders.sessions && !import.meta.env.DEV) {
    e.preventDefault();
    folderUi.open();
  }
};
$<HTMLSelectElement>("recordings").onchange = async (e) => {
  const name = (e.target as HTMLSelectElement).value;
  if (!name) return;
  const sessions = folderUi.folders.sessions;
  const text = sessions ? await readSession(sessions, name) : await (await fetch(`recordings/${encodeURIComponent(name)}`)).text();
  open(text, name);
};
// In development, ?session, ?demo, ?devCache and ?skipLanding open straight into the replay, past the landing page
const skipLanding = import.meta.env.DEV && ["session", "demo", "devCache", "skipLanding", "tour"].some((p) => params.has(p));
void folderUi.restore(skipLanding).then(() => {
  void listRecordings();
  if (!linkedSession() && folderUi.folders.cache && !skipLanding && !tutorialDone()) void tour.start();
});

// Files: the session is read in the page and never leaves it

function openFile(file: File): void {
  // A cache bundle dropped on its own goes with the session already open
  if (file.name.endsWith(".bundle.json")) {
    file.text().then(async (text) => {
      const dropped = new Bundle(JSON.parse(text));
      await preloadTextures(dropped);
      useBundle(dropped, file.name.replace(/\.bundle\.json$/, ""));
    });
    return;
  }
  file.text().then((text) => open(text, file.name));
}
$("openSession").onclick = () => void openWithPicker();
$<HTMLInputElement>("file").onchange = (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) openFile(file);
};
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) openFile(file);
});

window.addEventListener("resize", resize);
// Whatever changes the view's size (window, panel edges) re-fits the renderer
new ResizeObserver(() => resize()).observe(view);
resize();

/**
 * The side and bottom panels resize by dragging their edges. Sizes are kept between visits; the side
 * panel's in-game interface scales to fill its width
 */
const root = document.documentElement;
const SIDE_MIN = 220;
const FOOT_MIN = 120;
function setSide(px: number): void {
  const w = Math.max(SIDE_MIN, Math.min(window.innerWidth * 0.6, px));
  root.style.setProperty("--side-w", `${Math.round(w)}px`);
  // 249 is the interface's own width; leave room for the panel's padding and scrollbar
  root.style.setProperty("--ui-scale", String(Math.max(0.7, (w - 36) / 249)));
}
function setFoot(px: number): void {
  root.style.setProperty("--foot-h", `${Math.round(Math.max(FOOT_MIN, Math.min(window.innerHeight * 0.7, px)))}px`);
}
function remember(key: string, value: number): void {
  try { localStorage.setItem(key, String(Math.round(value))); } catch { /* storage blocked: sizes just won't be kept */ }
}
function recall(key: string): number | undefined {
  try { const v = Number(localStorage.getItem(key)); return v > 0 ? v : undefined; } catch { return undefined; }
}
// ?side=420&foot=320 set the panel sizes, e.g. for screenshots
const sizes = new URLSearchParams(location.search);
setSide(Number(sizes.get("side")) || recall("replay.sideWidth") || 288);
setFoot(Number(sizes.get("foot")) || recall("replay.footHeight") || 230);
function dragEdge(handle: HTMLElement, onMove: (e: PointerEvent) => number, store: string): void {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
    document.body.classList.add("resizing");
    let last = 0;
    const move = (ev: PointerEvent) => { last = onMove(ev); };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.classList.remove("dragging");
      document.body.classList.remove("resizing");
      if (last) remember(store, last);
      if (session) hud.drawTimeline(session);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}
dragEdge($("sideResizer"), (e) => {
  const w = window.innerWidth - e.clientX;
  setSide(w);
  return w;
}, "replay.sideWidth");
dragEdge($("footResizer"), (e) => {
  const h = window.innerHeight - e.clientY;
  setFoot(h);
  if (session) hud.drawTimeline(session);
  return h;
}, "replay.footHeight");

/**
 * The timeline's height: short by default, taller for views with more to show. The bottom panel grows
 * with it when it has to, so the log keeps a few lines
 */
const TIMELINE_SHORT = 34;
const TIMELINE_TALL = 140;
const TIMELINE_MAX = 360;
// The bottom panel's room besides the timeline: the controls above it and a few lines of log below
const FOOT_BESIDES_TIMELINE = 130;
function setTimelineHeight(px: number): number {
  const h = Math.round(Math.max(TIMELINE_SHORT, Math.min(TIMELINE_MAX, px)));
  root.style.setProperty("--timeline-h", `${h}px`);
  const foot = $("timelineWrap").closest("footer")!.getBoundingClientRect().height;
  if (foot < h + FOOT_BESIDES_TIMELINE) setFoot(h + FOOT_BESIDES_TIMELINE);
  if (session) hud.drawTimeline(session);
  return h;
}
setTimelineHeight(Number(sizes.get("timeline")) || recall("replay.timelineHeight") || TIMELINE_SHORT);
dragEdge($("timelineGrip"), (e) => setTimelineHeight(e.clientY - timeline.getBoundingClientRect().top), "replay.timelineHeight");
// From the top, the timeline grows upwards: the bottom panel grows by as much, so the log keeps its size
let topDrag: { y: number; timeline: number; foot: number } | undefined;
$("timelineGripTop").addEventListener("pointerdown", (e) => {
  topDrag = { y: e.clientY, timeline: timeline.getBoundingClientRect().height, foot: $("timelineWrap").closest("footer")!.getBoundingClientRect().height };
});
dragEdge($("timelineGripTop"), (e) => {
  if (!topDrag) return 0;
  const h = setTimelineHeight(topDrag.timeline + topDrag.y - e.clientY);
  setFoot(topDrag.foot + h - topDrag.timeline);
  remember("replay.footHeight", topDrag.foot + h - topDrag.timeline);
  if (session) hud.drawTimeline(session);
  return h;
}, "replay.timelineHeight");
for (const grip of ["timelineGrip", "timelineGripTop"]) {
  $(grip).ondblclick = () => {
    const now = timeline.getBoundingClientRect().height;
    remember("replay.timelineHeight", setTimelineHeight(now > TIMELINE_SHORT + 10 ? TIMELINE_SHORT : TIMELINE_TALL));
  };
}
// ?demo opens the demo recording; ?t=12.5 jumps to a moment in it, e.g. for screenshots; ?focus=n123
// follows that actor instead of you and ?zoom=8 sets how far away the camera starts
pendingFocus = params.get("focus") ?? undefined;
cameraDistance = Number(params.get("zoom")) || cameraDistance;
function jumpTo(at: number): void {
  if (at > 0) {
    seek(Math.floor(at));
    clock.frac = at - Math.floor(at);
  }
}
// ?demo opens the demo recording that ships with the page (public/demo/demo.jsonl)
if (params.has("demo")) {
  fetch("demo/demo.jsonl").then((r) => r.text()).then((text) => {
    open(text, "demo.jsonl");
    jumpTo(Number(params.get("t")));
  });
}
// ?session=sessions/name.jsonl opens a recording from the git-ignored sessions folder next to this page
const sessionPath = params.get("session");
if (import.meta.env.DEV && sessionPath && /^sessions\/[\w.-]+\.jsonl$/.test(sessionPath)) {
  // ?accuracy turns the click accuracy view on, e.g. for screenshots
  if (params.has("accuracy")) $<HTMLInputElement>("accuracy").checked = true;
  fetch(sessionPath).then((r) => r.text()).then((text) => {
    // The dev server answers a missing file with this page instead of an error
    if (text.trimStart().startsWith("<")) {
      $("drop").textContent = `${sessionPath} isn't there`;
      return;
    }
    open(text, sessionPath.slice("sessions/".length));
    jumpTo(Number(params.get("t")));
    // ?loopAt=100 holds a hovered animation's loop at that many cycles in, e.g. for screenshots
    if (params.has("loopAt")) stage.loopAt = Number(params.get("loopAt"));
    // ?markAt=127:hit hovers that timeline mark (rows: click, hit, anim, mark), e.g. for screenshots
    const markAt = params.get("markAt")?.split(":");
    if (markAt && session) {
      const s = session;
      setTimeout(() => {
        const r = timeline.getBoundingClientRect();
        const y = r.top + r.height * ({ click: 0.1, hit: 0.45, anim: 0.8, mark: 0.5 } as Record<string, number>)[markAt[1]];
        timeline.dispatchEvent(new PointerEvent("pointermove", { clientX: hud.xOfTick(s, Number(markAt[0])), clientY: y }));
      }, 1500);
    }
    // ?addNote=text adds a note at the tick shown, e.g. for screenshots
    const noteText = params.get("addNote");
    if (noteText && session) {
      notes.add(clock.t, Math.floor(cycleAt(session, clock.t, 0)), noteText);
      hud.drawTimeline(session);
    }
    // ?tab=6 shows that side panel tab
    if (params.has("tab")) hud.pinTab(Number(params.get("tab")));
    // ?range=40-120 zooms the timeline into those ticks
    const range = params.get("range")?.split("-").map(Number);
    if (range?.length === 2 && session) hud.setZoom(session, range[0], range[1]);
    // ?hover=text hovers the first log line or click containing that text, e.g. for screenshots
    const hoverText = params.get("hover");
    if (hoverText) {
      setTimeout(() => {
        const row = [...document.querySelectorAll<HTMLElement>("#clicks .hoverable, #log .hoverable")].find((r) => r.textContent?.includes(hoverText));
        row?.dispatchEvent(new MouseEvent("mouseenter"));
      }, 1500);
    }
  });
}
// Works offline after the first visit (public/sw.js); not in development, where files change constantly
if (!import.meta.env.DEV && "serviceWorker" in navigator) void navigator.serviceWorker.register("sw.js").catch(() => undefined);
// ?dialog=connect, ?dialog=privacy or ?dialog=kofi opens that dialog, e.g. for screenshots
if (import.meta.env.DEV && params.get("dialog") === "connect") setTimeout(() => folderUi.open(), 500);
if (import.meta.env.DEV && params.get("dialog") === "privacy") setTimeout(() => folderUi.showPrivacy(), 500);
// ?tour=3 opens the tutorial at that step (0 first), e.g. for screenshots with ?devCache=inline
if (import.meta.env.DEV && params.has("tour")) setTimeout(() => void tour.start(Number(params.get("tour"))), 300);
if (import.meta.env.DEV && params.get("dialog") === "export") setTimeout(() => $("exportOpen").click(), 2500);
if (import.meta.env.DEV && params.get("dialog") === "kofi") setTimeout(() => document.querySelector<HTMLElement>(".kofi-pill")?.click(), 500);
requestAnimationFrame(frame);
