import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Bundle } from "./cache/bundle";
import { frameAt, frameFrom, lengthOf, npcModel, objectFrameAt, objectModel, playerModel, RigMesh, spotModel, type Built, type Pose } from "./cache/models";
import { animateTextures } from "./cache/textures";
import { walkTile, type Target } from "./highlight";
import { isOthersHit, isYourHit } from "./hits";
import { EffectLinks } from "./links";
import { actorsAt, cycleAt, happened, recent, type ActorFrame } from "./moment";
import { projectileAt, type Flight, type Vec3 } from "./projectile";
import { latestAtOrBefore, refKey, type Line, type Ref, type Session } from "./session";
import { toThree, type World } from "./world";

/**
 * Everything that moves: actors, projectiles, graphics on tiles and click markers. With a cache bundle
 * actors, projectiles and graphics use their game models and animations; without one, or for anything
 * the bundle lacks, actors are boxes the size of their footprint.
 */

const COLORS = { me: 0x3ccf7a, npc: 0xf0a531, player: 0x6fa0ea };
const PROJECTILE_COLOR = 0xf05fa0;
const GFX_COLOR = 0xb08cf0;
// Overhead text stays up for about five ticks in game
const SAY_TICKS = 5;
// How long a hitsplat stays when the line has no disappear cycle: about a tick
const HIT_CYCLES = 30;
// An attack animation lights a box actor up for this long, in ticks, so it reads at a glance
const FLASH_TICKS = 0.5;
// How far back to look for the cycle an animation started on
const ANIM_LOOKBACK_TICKS = 12;
// Overhead prayer icons in RuneLite's order, which is the frame order of the game's prayer sprite group
const HEAD_ICONS = ["MELEE", "RANGED", "MAGIC", "RETRIBUTION", "SMITE", "REDEMPTION", "RANGE_MAGE", "RANGE_MELEE",
  "MAGE_MELEE", "RANGE_MAGE_MELEE", "WRATH", "SOUL_SPLIT", "DEFLECT_MELEE", "DEFLECT_RANGE", "DEFLECT_MAGE"];
const PRAYER_SPRITES = 440;
const SKULL_SPRITES = 439;

function element(className: string, parent?: HTMLElement): HTMLDivElement {
  const div = document.createElement("div");
  div.className = className;
  parent?.appendChild(div);
  return div;
}

class ActorView {
  readonly root = new THREE.Group();
  private readonly facing = new THREE.Group();
  private readonly box: THREE.Mesh | undefined;
  private readonly boxMaterial: THREE.MeshLambertMaterial | undefined;
  readonly model: RigMesh | undefined;
  private readonly server: THREE.LineLoop;
  private readonly label: CSS2DObject;
  private readonly say: HTMLDivElement;
  private readonly icons: HTMLDivElement;
  private shownIcons = "";
  private readonly lines: HTMLDivElement;
  private readonly hpBar: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLDivElement;
  private readonly splats: HTMLDivElement;
  private shownSplats = "";
  /** Where the label (and its hitsplats) sits above the ground */
  readonly labelHeight: number;

  constructor(readonly kind: ActorFrame["kind"], readonly size: number, readonly modelKey: string, built: Built | undefined) {
    let height: number;
    if (built) {
      this.model = new RigMesh(built);
      this.facing.add(this.model.mesh);
      this.model.mesh.geometry.computeBoundingBox();
      height = Math.max(0.6, this.model.mesh.geometry.boundingBox?.max.y ?? 1.5);
    } else {
      height = kind === "npc" ? 1 + 0.5 * size : 1.5;
      const width = kind === "npc" ? size * 0.85 : 0.6;
      this.boxMaterial = new THREE.MeshLambertMaterial({ color: COLORS[kind], transparent: true, opacity: 0.9 });
      this.box = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), this.boxMaterial);
      this.box.position.y = height / 2;
      this.box.castShadow = true;
      // A nose on the side the actor faces; at rotation 0 that's south, +z
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, height * 0.75, width / 2 + 0.15);
      this.facing.add(this.box, nose);
    }
    this.root.add(this.facing);

    // Dashed outline on the tile the server has the actor on, while the drawn position catches up
    const s = size;
    const outline = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(s, 0, 0), new THREE.Vector3(s, 0, -s), new THREE.Vector3(0, 0, -s),
    ]);
    this.server = new THREE.LineLoop(outline, new THREE.LineDashedMaterial({ color: COLORS[kind], dashSize: 0.15, gapSize: 0.1 }));
    this.server.computeLineDistances();
    this.server.visible = false;

    const tag = element("tag");
    this.say = element("say", tag);
    this.icons = element("icons", tag);
    this.lines = element("lines", tag);
    this.hpBar = element("hp", tag);
    this.hpFill = element("fill", this.hpBar);
    this.hpText = element("pct", this.hpBar);
    this.splats = element("splats", tag);
    this.label = new CSS2DObject(tag);
    this.labelHeight = height + 0.25;
    this.label.position.y = this.labelHeight;
    this.root.add(this.label);
  }

  attach(parent: THREE.Object3D): void {
    parent.add(this.root, this.server);
  }

  detach(): void {
    this.root.removeFromParent();
    this.server.removeFromParent();
    this.label.element.remove();
    this.box?.geometry.dispose();
    this.boxMaterial?.dispose();
    this.model?.dispose();
  }

  update(frame: ActorFrame, ground: number, world: World, info: { lines: string[]; icons: string[]; hits: Line[]; say?: string; flash: number; pulseHit?: Line }): void {
    toThree(frame.x, frame.y, ground, this.root.position);
    this.facing.rotation.y = (-frame.orientation * Math.PI * 2) / 2048;
    if (this.boxMaterial) {
      this.boxMaterial.emissive.setHex(info.flash > 0 ? 0xffffff : 0x000000);
      this.boxMaterial.emissiveIntensity = info.flash * 0.6;
    }

    const tile = frame.state.tile;
    if (tile && tile.sx != null) {
      const cx = tile.sx + this.size / 2;
      const cy = tile.sy + this.size / 2;
      const behind = Math.abs(cx - frame.x) > 0.05 || Math.abs(cy - frame.y) > 0.05;
      this.server.visible = behind;
      if (behind) toThree(tile.sx, tile.sy, world.groundAt(cx, cy) + 0.02, this.server.position);
    } else {
      this.server.visible = false;
    }

    // Rebuilt only when they change: swapping images every frame would make them flicker
    const iconKey = info.icons.join("|");
    if (iconKey !== this.shownIcons) {
      this.shownIcons = iconKey;
      this.icons.replaceChildren(
        ...info.icons.map((src) => {
          const img = document.createElement("img");
          img.src = src;
          return img;
        }),
      );
    }
    this.say.textContent = info.say ?? "";
    this.say.style.display = info.say ? "" : "none";
    this.lines.textContent = info.lines.join("\n");
    const hp = frame.state.hp;
    this.hpBar.style.display = hp ? "" : "none";
    if (hp) {
      // The game's own bar, as a share of its segments: a percentage, since the exact HP isn't sent
      const share = (100 * hp[0]) / Math.max(1, hp[1]);
      this.hpFill.style.width = `${share}%`;
      // Never 0% while it's alive: the game keeps a sliver of bar until the end
      this.hpText.textContent = `${hp[0] > 0 ? Math.max(1, Math.round(share)) : 0}%`;
    }
    // Rebuilt only when the hitsplats change; the hovered one pulses in size every frame
    const splatKey = info.hits.map((h) => `${h.c}:${h.amount}:${h === info.pulseHit}`).join("|");
    if (splatKey === this.shownSplats) {
      this.pulseSplat();
      return;
    }
    this.shownSplats = splatKey;
    this.splats.replaceChildren(
      ...info.hits.map((h) => {
        // Hits someone else dealt are shifted in hue: the game says whose a hit is, nothing more
        const s = element(`${h.amount === 0 ? "splat block" : h.type === 6 ? "splat heal" : "splat"}${isOthersHit(h) ? " other" : ""}${h === info.pulseHit ? " pulse" : ""}`);
        s.textContent = String(h.amount);
        return s;
      }),
    );
    this.pulseSplat();
  }

  private pulseSplat(): void {
    const splat = this.splats.querySelector<HTMLElement>(".splat.pulse");
    if (!splat) return;
    const wave = 0.5 + 0.5 * Math.sin(performance.now() / 140);
    splat.style.transform = `scale(${1 + wave * 0.5})`;
    splat.style.boxShadow = `0 0 ${4 + wave * 8}px ${1 + wave * 3}px #ffe14d`;
  }
}

export interface Focus {
  /** Whose position this is: the followed actor, or you when they aren't around */
  key: string;
  x: number;
  y: number;
  ground: number;
  plane: number;
}

export class Stage {
  readonly group = new THREE.Group();
  private readonly actors = new Map<string, ActorView>();
  private readonly projectiles: THREE.Mesh[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly crosses: THREE.Group[] = [];
  private readonly flag: THREE.Group;
  private readonly projectileGeometry = new THREE.SphereGeometry(0.16, 12, 8);
  private readonly projectileMaterial = new THREE.MeshBasicMaterial({ color: PROJECTILE_COLOR });
  private readonly ringGeometry = new THREE.RingGeometry(0.3, 0.45, 24).rotateX(-Math.PI / 2);
  /** Models for projectiles and graphics in flight, keyed by the line that launched them */
  private readonly spotMeshes = new Map<Line, RigMesh | null>();
  /** Graphics playing on actors, keyed by actor, graphic and start cycle */
  private readonly actorSpots = new Map<string, RigMesh | null>();
  private readonly looks = new Map<string, Line[]>();
  private readonly animStarts = new Map<string, Line[]>();
  private bundle: Bundle | undefined;
  /** NPC IDs whose definition has no model of its own, mapped to the ID they transform into */
  private readonly transforms = new Map<number, number>();

  constructor() {
    this.flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
    pole.position.y = 0.45;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.22), new THREE.MeshBasicMaterial({ color: 0xe74c3c, side: THREE.DoubleSide }));
    cloth.position.set(0.18, 0.78, 0);
    this.flag.add(pole, cloth);
    this.flag.visible = false;
    this.group.add(this.flag, this.marker);
  }

  /** A pulsing ring under each highlighted actor and a pulsing square on each highlighted tile */
  private drawHighlights(frames: ActorFrame[], world: World): void {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
    const spots: { x: number; y: number; size: number; square: boolean }[] = [];
    for (const target of this.targets) {
      if (target.kind === "actor" || target.kind === "anim") {
        const f = frames.find((a) => a.key === target.key);
        if (f) spots.push({ x: f.x, y: f.y, size: f.size, square: false });
      } else if (target.kind === "tile" && !target.walk && !target.item) {
        spots.push({ x: target.sx + 0.5, y: target.sy + 0.5, size: 1, square: true });
      }
    }
    spots.forEach((s, i) => {
      let ring = this.pointers[i];
      if (!ring) {
        ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, depthTest: false, side: THREE.DoubleSide }));
        ring.renderOrder = 10;
        this.pointers.push(ring);
        this.marker.add(ring);
      }
      ring.visible = true;
      ring.geometry.dispose();
      ring.geometry = (s.square ? new THREE.RingGeometry(0.62, 0.72, 4, 1, Math.PI / 4) : new THREE.RingGeometry(0.42, 0.5, 40)).rotateX(-Math.PI / 2);
      ring.scale.setScalar(s.size * (1 + pulse * 0.25));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + pulse * 0.55;
      toThree(s.x, s.y, world.groundAt(s.x, s.y) + 0.05, ring.position);
    });
    for (let i = spots.length; i < this.pointers.length; i++) this.pointers[i].visible = false;
    this.drawHitSource(frames, world);
    const chest = (f: ActorFrame) => toThree(f.x, f.y, world.standAt(f.x, f.y) + (this.actors.get(f.key)?.labelHeight ?? 1.75) * 0.55);
    this.links = [];
    for (const target of this.targets) {
      if (target.kind !== "link") continue;
      const a = frames.find((f) => f.key === target.from);
      const b = frames.find((f) => f.key === target.to);
      if (a && b) this.links.push([chest(a), chest(b)]);
    }
  }

  /**
   * For a hovered hit of yours, where you stand (chest height), for the overlay's line from you to the
   * hitsplat. The game only says whether a hit is yours, so others' hits get no line
   */
  private drawHitSource(frames: ActorFrame[], world: World): void {
    const hit = (this.targets.find((x) => x.kind === "hit") as { line: Line } | undefined)?.line;
    const from = hit && isYourHit(hit) ? frames.find((f) => f.kind === "me") : undefined;
    const view = from && this.actors.get(from.key);
    this.hitSourcePoint = from ? toThree(from.x, from.y, world.groundAt(from.x, from.y) + (view?.labelHeight ?? 1.75) * 0.55) : undefined;
  }

  /** Indexes a new session's appearances and animation starts, and takes its cache bundle if there is one */
  load(session: Session, bundle: Bundle | undefined): void {
    this.clear();
    this.bundle = bundle;
    this.looks.clear();
    this.animStarts.clear();
    this.transforms.clear();
    for (const l of session.lines) {
      if (l.e === "look") push(this.looks, refKey(l.who), l);
      else if (l.e === "anim" && l.a !== -1) push(this.animStarts, refKey(l.who), l);
      else if (l.e === "npcdef" && l.def.baseId != null) this.transforms.set(l.def.baseId, l.def.id);
    }
  }

  clear(): void {
    for (const view of this.actors.values()) view.detach();
    this.actors.clear();
    for (const m of this.actorSpots.values()) {
      m?.mesh.removeFromParent();
      m?.dispose();
    }
    this.actorSpots.clear();
    for (const m of this.spotMeshes.values()) {
      m?.mesh.removeFromParent();
      m?.dispose();
    }
    this.spotMeshes.clear();
  }

  /** Draws the moment (t + frac) and returns where you are, for the camera to follow */
  /** Follow this actor (as "n<index>" or "p<index>") instead of you */
  followKey: string | undefined;
  /** Show animation and graphic IDs over heads */
  debugLabels = false;
  /** What a hovered log line or click points at, and when the hover started */
  private targets: Target[] = [];
  private targetsSince = 0;
  private readonly marker = new THREE.Group();
  private readonly pointers: THREE.Mesh[] = [];
  /** Where the hovered hit's source is, for the overlay to draw a line from it to the hitsplat */
  hitSourcePoint: THREE.Vector3 | undefined;
  /** Dotted lines between actors for a hovered target or projectile line, chest height to chest height */
  links: [THREE.Vector3, THREE.Vector3][] = [];

  /** Effects learned to come with each animation, for looping them together on hover */
  effectLinks: EffectLinks | undefined;
  private preview: { play: Line; animLength: number; period: number; effects: { line: Line; delay: number; mesh: RigMesh | null }[] } | undefined;

  setHighlight(targets: Target[]): void {
    this.targets = targets;
    this.targetsSince = performance.now();
    this.buildPreview();
  }

  /**
   * For a hovered animation, models for the effects that came with that play of it (its graphics,
   * projectiles and spawned objects), to loop alongside it
   */
  private buildPreview(): void {
    for (const e of this.preview?.effects ?? []) {
      e.mesh?.mesh.removeFromParent();
      e.mesh?.dispose();
    }
    this.preview = undefined;
    const target = this.targets.find((x) => x.kind === "anim") as Extract<Target, { kind: "anim" }> | undefined;
    const bundle = this.bundle;
    if (!target || !bundle || !this.effectLinks) return;
    const animLength = lengthOf(bundle, target.anim) ?? 60;
    const effects = this.effectLinks.effectsOf(target.line).map((line) => {
      const built = line.e === "obj" ? objectModel(bundle, line.id, line.config ?? 10) : spotModel(bundle, line.id);
      const mesh = built ? new RigMesh(built) : null;
      if (mesh) this.group.add(mesh.mesh);
      return { line, delay: line.c - target.line.c, mesh };
    });
    // Long enough for the animation and every effect to finish, plus a breath before it starts again
    let end = animLength;
    for (const e of effects) {
      const def = e.line.e !== "obj" ? bundle.spotanim(e.line.id) : undefined;
      const own = e.line.e === "proj" ? e.line.endCycle - e.line.c : def && def.anim >= 0 ? lengthOf(bundle, def.anim) ?? 30 : 30;
      end = Math.max(end, e.delay + own);
    }
    this.preview = { play: target.line, animLength, period: end + 20, effects };
  }

  /** Holds the hovered animation's loop at this many cycles in (for screenshots) */
  loopAt: number | undefined;

  /** Cycles into the hovered animation's loop */
  private previewTime(): number {
    if (this.loopAt !== undefined) return this.loopAt;
    const elapsed = (performance.now() - this.targetsSince) / 20;
    return this.preview ? elapsed % this.preview.period : elapsed;
  }

  private drawPreview(session: Session, world: World): void {
    const preview = this.preview;
    const bundle = this.bundle;
    if (!preview || !bundle) return;
    const tau = this.previewTime();
    for (const e of preview.effects) {
      const mesh = e.mesh;
      if (!mesh) continue;
      const local = tau - e.delay;
      const l = e.line;
      if (l.e === "gfx") {
        const def = bundle.spotanim(l.id);
        const length = def && def.anim >= 0 ? lengthOf(bundle, def.anim) ?? 30 : 30;
        mesh.mesh.visible = local >= 0 && local <= length;
        if (!mesh.mesh.visible) continue;
        const x = l.lx / 128;
        const y = l.ly / 128;
        toThree(x, y, l.z != null ? -l.z / 128 : world.groundAt(x, y), mesh.mesh.position);
        mesh.pose(bundle, def && def.anim >= 0 ? frameAt(bundle, def.anim, local) : undefined);
      } else if (l.e === "obj") {
        mesh.mesh.visible = local >= 0;
        if (!mesh.mesh.visible) continue;
        mesh.placeAt(l.lx / 128, l.ly / 128, (gx, gy) => world.groundAt(gx, gy));
        const anim = l.anim ?? bundle.object(l.id)?.anim ?? -1;
        mesh.pose(bundle, anim >= 0 ? objectFrameAt(bundle, anim, local) : undefined);
      } else {
        // A projectile flies as it really did, its cycles shifted to the loop
        const p = this.flightAt(session, l, l.c + local, world);
        mesh.mesh.visible = !!p;
        if (!p) continue;
        toThree(p.x / 128, p.y / 128, p.z / 128, mesh.mesh.position);
        const def = bundle.spotanim(l.id);
        mesh.pose(bundle, def && def.anim >= 0 ? frameAt(bundle, def.anim, l.c + local - l.startCycle) : undefined);
      }
    }
  }

  /** Where a projectile is at a client cycle, flown as the client flies it */
  private flightAt(session: Session, l: Line, cycle: number, world: World): Vec3 | null {
    if (l.start?.lx == null) return null;
    const startTile = { x: l.start.lx / 128, y: l.start.ly / 128 };
    const flight: Flight = {
      startCycle: l.startCycle,
      endCycle: l.endCycle,
      start: { x: l.start.lx, y: l.start.ly, z: world.groundAt(startTile.x, startTile.y) * 128 + l.startHeight },
      startPos: l.startPos ?? 0,
      slope: l.slope ?? 0,
    };
    const fallback: Vec3 = {
      x: l.target?.lx ?? l.start.lx,
      y: l.target?.ly ?? l.start.ly,
      z: world.groundAt((l.target?.lx ?? l.start.lx) / 128, (l.target?.ly ?? l.start.ly) / 128) * 128 + l.endHeight,
    };
    const targetAt = (c: number): Vec3 => {
      const pos = l.to ? positionAtCycle(session, l.to, c) : undefined;
      if (!pos) return fallback;
      return { x: pos.x * 128, y: pos.y * 128, z: world.standAt(pos.x, pos.y) * 128 + l.endHeight };
    };
    return projectileAt(flight, cycle, targetAt);
  }

  update(session: Session, t: number, frac: number, world: World): Focus | undefined {
    const frames = actorsAt(session, t, frac);
    const cycle = cycleAt(session, t, frac);
    if (this.bundle) animateTextures(this.bundle, cycle);
    const me = frames.find((f) => f.kind === "me");
    const plane = me?.state.p ?? 0;

    const hits = new Map<string, Line[]>();
    for (const h of happened(session, t, 3, "hit", cycle)) {
      const until = h.until > 0 ? h.until : h.c + HIT_CYCLES;
      if (cycle >= h.c && cycle <= until) push(hits, refKey(h.who), h);
    }
    const says = new Map<string, string>();
    for (const s of happened(session, t, SAY_TICKS, "say", cycle)) says.set(refKey(s.who), s.text);
    const flashes = new Map<string, number>();
    for (const a of recent(session, t, 1, "anim")) if (a.a !== -1) flashes.set(refKey(a.who), a.t);

    const seen = new Set<string>();
    for (const f of frames) {
      if (f.state.p !== plane) continue;
      seen.add(f.key);
      const [modelKey, built] = this.modelFor(f, t);
      let view = this.actors.get(f.key);
      if (!view || view.size !== f.size || view.kind !== f.kind || view.modelKey !== modelKey) {
        view?.detach();
        view = new ActorView(f.kind, f.size, modelKey, built?.());
        view.attach(this.group);
        this.actors.set(f.key, view);
      }
      if (view.model && this.bundle) view.model.pose(this.bundle, this.actorFrame(f, session, t, cycle));
      const started = flashes.get(f.key);
      const age = started == null ? Infinity : t - started + frac;
      view.update(f, world.standAt(f.x, f.y), world, {
        lines: this.describe(session, f, t),
        icons: this.overheadIcons(f),
        hits: hits.get(f.key) ?? [],
        pulseHit: (this.targets.find((x) => x.kind === "hit") as { line: Line } | undefined)?.line,
        say: says.get(f.key),
        flash: age < FLASH_TICKS ? 1 - age / FLASH_TICKS : 0,
      });
    }
    for (const [key, view] of this.actors) {
      if (!seen.has(key)) {
        view.detach();
        this.actors.delete(key);
      }
    }
    this.drawActorSpots(frames, plane, cycle, world);
    this.drawHighlights(frames, world);
    this.drawPreview(session, world);

    const shown = new Set<Line>();
    this.drawProjectiles(session, t, cycle, plane, world, shown);
    this.drawGraphics(session, t, frac, cycle, plane, world, shown);
    for (const [line, m] of this.spotMeshes) {
      if (!shown.has(line)) {
        m?.mesh.removeFromParent();
        m?.dispose();
        this.spotMeshes.delete(line);
      }
    }
    this.drawMarkers(session, t, me, world);
    const followed = (this.followKey && frames.find((f) => f.key === this.followKey)) || me;
    return followed ? { key: followed.key, x: followed.x, y: followed.y, ground: world.groundAt(followed.x, followed.y), plane } : undefined;
  }

  /** Which model an actor should wear now, as a key that changes when the model must be rebuilt */
  private modelFor(f: ActorFrame, t: number): [string, (() => Built | undefined) | undefined] {
    const bundle = this.bundle;
    if (!bundle) return ["box", undefined];
    if (f.kind === "npc") {
      let id = (f.state.who as { id: number }).id;
      const def = bundle.npc(id);
      if ((!def || !def.models.length) && this.transforms.has(id)) id = this.transforms.get(id)!;
      return [`npc:${id}`, () => npcModel(bundle, id)];
    }
    const look = latestAtOrBefore(this.looks.get(f.key) ?? [], t);
    if (!look) return ["box", undefined];
    return [`look:${look.c}:${look.equip.join(",")}`, () => playerModel(bundle, look as never)];
  }

  /**
   * The animation frame an actor shows: its action animation if it has one, timed from the cycle the
   * animation started on, otherwise its stand, walk or run pose
   */
  private actorFrame(f: ActorFrame, session: Session, t: number, cycle: number): Pose | undefined {
    const bundle = this.bundle!;
    const s = f.state;
    // A hovered animation line plays its whole animation on this actor, from the start, on loop; with
    // effects to keep in step, it holds its last frame until they've finished too
    const looped = this.targets.find((x) => x.kind === "anim" && x.key === f.key) as { anim: number } | undefined;
    if (looped) {
      const tau = this.previewTime();
      return frameAt(bundle, looped.anim, this.preview ? Math.min(tau, this.preview.animLength - 1) : tau);
    }
    if (s.a != null && s.a !== -1) {
      const starts = this.animStarts.get(f.key) ?? [];
      for (let i = starts.length - 1; i >= 0; i--) {
        const l = starts[i];
        if (l.t > t) continue;
        if (l.t < t - ANIM_LOOKBACK_TICKS) break;
        if (l.a === s.a) return frameFrom(bundle, s.a, 0, cycle - l.c);
        break;
      }
      // Already playing when the recording started: carry on from the recorded frame
      const tick = session.tickAt(t);
      return frameFrom(bundle, s.a, Math.max(0, s.af), cycle - (tick?.c ?? cycle));
    }
    return s.pose != null && s.pose !== -1 ? frameAt(bundle, s.pose, cycle) : undefined;
  }

  /** Skull above prayer, as the game stacks them: images from the cache bundle */
  private overheadIcons(f: ActorFrame): string[] {
    const s = f.state;
    const bundle = this.bundle;
    if (!bundle) return [];
    const icons: (string | undefined)[] = [];
    if (s.skull != null && s.skull >= 0) icons.push(bundle.sprite(SKULL_SPRITES, s.skull));
    if (typeof s.head === "string") icons.push(bundle.sprite(PRAYER_SPRITES, HEAD_ICONS.indexOf(s.head)));
    else if (Array.isArray(s.head)) for (const [group, frame] of s.head) icons.push(bundle.sprite(group, frame));
    return icons.filter((x): x is string => !!x);
  }

  private describe(session: Session, f: ActorFrame, t: number): string[] {
    const s = f.state;
    const lines: string[] = [];
    if (f.kind === "npc") {
      // NPCs the game never names get no name over their heads, as in game
      const name = session.npcShownName(s.who as { i: number; id: number }, t);
      if (name) lines.push(name);
    }
    // Players by name, as above their heads in game; recordings without names give their index
    else if (f.kind === "player") lines.push(session.label(s.who, t));
    else if (session.you) lines.push(session.you);
    // Animation and graphic IDs are for digging into a fight: only with debug labels on
    if (this.debugLabels && s.a != null && s.a !== -1) lines.push(`anim ${s.a}`);
    // Graphics are drawn as models when there's a bundle; without one their IDs are listed
    if (this.debugLabels && s.spot?.length) lines.push(s.spot.map((x) => `spot ${x.id}`).join(" "));
    // Without the cache's sprites, icons fall back to words
    const sprites = this.bundle?.sprite(PRAYER_SPRITES, 0);
    if (!sprites) {
      if (typeof s.head === "string") lines.push(s.head.toLowerCase());
      else if (s.head?.length) lines.push(`icon ${s.head.map((h) => h[1]).join(",")}`);
      if (s.skull != null) lines.push(`skull ${s.skull}`);
    }
    return lines;
  }

  /**
   * Graphics on actors (a prayer flash, a void effect on a player): the graphic's model stands on the
   * actor at its recorded height and plays its animation once from its start cycle
   */
  private drawActorSpots(frames: ActorFrame[], plane: number, cycle: number, world: World): void {
    const bundle = this.bundle;
    const shown = new Set<string>();
    if (bundle) {
      for (const f of frames) {
        if (f.state.p !== plane || !f.state.spot) continue;
        for (const spot of f.state.spot) {
          const def = bundle.spotanim(spot.id);
          if (!def) continue;
          const since = cycle - spot.start;
          const length = def.anim >= 0 ? lengthOf(bundle, def.anim) ?? 0 : 0;
          if (since < 0 || (length > 0 && since > length)) continue;
          const key = `${f.key}:${spot.id}:${spot.start}`;
          let mesh = this.actorSpots.get(key);
          if (mesh === undefined) {
            const built = spotModel(bundle, spot.id);
            mesh = built ? new RigMesh(built) : null;
            if (mesh) this.group.add(mesh.mesh);
            this.actorSpots.set(key, mesh);
          }
          if (!mesh) continue;
          shown.add(key);
          toThree(f.x, f.y, world.standAt(f.x, f.y) + (spot.h ?? 0) / 128, mesh.mesh.position);
          mesh.mesh.rotation.y = (-f.orientation * Math.PI * 2) / 2048;
          mesh.pose(bundle, def.anim >= 0 ? frameAt(bundle, def.anim, since) : undefined);
        }
      }
    }
    for (const [key, mesh] of this.actorSpots) {
      if (!shown.has(key)) {
        mesh?.mesh.removeFromParent();
        mesh?.dispose();
        this.actorSpots.delete(key);
      }
    }
  }

  private spotMesh(line: Line, id: number): RigMesh | null {
    let m = this.spotMeshes.get(line);
    if (m === undefined) {
      const built = this.bundle ? spotModel(this.bundle, id) : undefined;
      m = built ? new RigMesh(built) : null;
      if (m) this.group.add(m.mesh);
      this.spotMeshes.set(line, m);
    }
    return m;
  }

  private drawProjectiles(session: Session, t: number, cycle: number, plane: number, world: World, shown: Set<Line>): void {
    let used = 0;
    // A projectile can be launched well before it flies: look back far enough to catch long delays
    for (const l of happened(session, t, 15, "proj", cycle)) {
      if (l.start?.lx == null || (l.start.p ?? plane) !== plane) continue;
      const startTile = { x: l.start.lx / 128, y: l.start.ly / 128 };
      const flight: Flight = {
        startCycle: l.startCycle,
        endCycle: l.endCycle,
        start: { x: l.start.lx, y: l.start.ly, z: world.groundAt(startTile.x, startTile.y) * 128 + l.startHeight },
        startPos: l.startPos ?? 0,
        slope: l.slope ?? 0,
      };
      const fallback: Vec3 = {
        x: l.target?.lx ?? l.start.lx,
        y: l.target?.ly ?? l.start.ly,
        z: world.groundAt((l.target?.lx ?? l.start.lx) / 128, (l.target?.ly ?? l.start.ly) / 128) * 128 + l.endHeight,
      };
      const targetAt = (c: number): Vec3 => {
        const pos = l.to ? positionAtCycle(session, l.to, c) : undefined;
        if (!pos) return fallback;
        return { x: pos.x * 128, y: pos.y * 128, z: world.standAt(pos.x, pos.y) * 128 + l.endHeight };
      };
      const p = projectileAt(flight, cycle, targetAt);
      if (!p) continue;
      const model = this.spotMesh(l, l.id);
      if (model && this.bundle) {
        shown.add(l);
        toThree(p.x / 128, p.y / 128, p.z / 128, model.mesh.position);
        // Face along the flight: yaw towards where it will be a cycle later, pitched to match
        const ahead = projectileAt(flight, Math.min(l.endCycle, cycle + 1), targetAt) ?? p;
        const dx = ahead.x - p.x;
        const dy = ahead.y - p.y;
        const dz = ahead.z - p.z;
        // A model's front is +z (south) at rest; in three.js space north is -z
        model.mesh.rotation.set(-Math.atan2(dz, Math.hypot(dx, dy)), Math.atan2(dx, -dy), 0, "YXZ");
        const def = this.bundle.spotanim(l.id);
        model.pose(this.bundle, def && def.anim >= 0 ? frameAt(this.bundle, def.anim, cycle - l.startCycle) : undefined);
        continue;
      }
      const mesh = this.projectiles[used] ?? this.addProjectile();
      mesh.visible = true;
      toThree(p.x / 128, p.y / 128, p.z / 128, mesh.position);
      used++;
    }
    for (let i = used; i < this.projectiles.length; i++) this.projectiles[i].visible = false;
  }

  private addProjectile(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
    this.projectiles.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  private drawGraphics(session: Session, t: number, frac: number, cycle: number, plane: number, world: World, shown: Set<Line>): void {
    let used = 0;
    for (const g of happened(session, t, 4, "gfx", cycle)) {
      if (g.lx == null || g.p !== plane) continue;
      const x = g.lx / 128;
      const y = g.ly / 128;
      const since = cycle - (g.start ?? g.c);
      if (since < 0) continue;
      const def = this.bundle?.spotanim(g.id);
      const model = def ? this.spotMesh(g, g.id) : null;
      if (model && this.bundle && def) {
        // Graphics play their animation once, then vanish
        const length = lengthOf(this.bundle, def.anim) ?? 60;
        if (since > length) continue;
        shown.add(g);
        // A graphic's z is its absolute height (negative going up), already including the ground under it
        toThree(x, y, g.z != null ? -g.z / 128 : world.groundAt(x, y), model.mesh.position);
        model.pose(this.bundle, def.anim >= 0 ? frameAt(this.bundle, def.anim, since) : undefined);
        continue;
      }
      if (t - g.t >= 2) continue;
      const age = t - g.t + frac;
      let ring = this.rings[used];
      if (!ring) {
        ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color: GFX_COLOR, transparent: true, side: THREE.DoubleSide }));
        this.rings.push(ring);
        this.group.add(ring);
      }
      ring.visible = true;
      toThree(x, y, world.groundAt(x, y) + 0.03, ring.position);
      ring.scale.setScalar(1 + age * 0.6);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - age / 2);
      used++;
    }
    for (let i = used; i < this.rings.length; i++) this.rings[i].visible = false;
  }

  private drawMarkers(session: Session, t: number, me: ActorFrame | undefined, world: World): void {
    const dest = me?.state && "dest" in me.state ? (me.state as { dest?: { sx: number; sy: number } }).dest : undefined;
    this.flag.visible = !!dest;
    if (dest) toThree(dest.sx + 0.5, dest.sy + 0.5, world.groundAt(dest.sx + 0.5, dest.sy + 0.5), this.flag.position);

    // Walk clicks: a yellow cross where the walk took you (or, from format 4, the tile clicked)
    let used = 0;
    for (const c of session.events(t)) {
      if (c.e !== "click" || c.action !== "WALK") continue;
      const to = walkTile(session, c);
      if (!to) continue;
      let cross = this.crosses[used];
      if (!cross) {
        cross = new THREE.Group();
        // Drawn over everything, so floors and objects at the same height can't hide it
        const material = new THREE.MeshBasicMaterial({ color: 0xf1c40f, depthTest: false, transparent: true });
        for (const angle of [Math.PI / 4, -Math.PI / 4]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.08), material);
          bar.rotation.y = angle;
          bar.renderOrder = 12;
          cross.add(bar);
        }
        this.crosses.push(cross);
        this.group.add(cross);
      }
      cross.visible = true;
      toThree(to.sx + 0.5, to.sy + 0.5, world.groundAt(to.sx + 0.5, to.sy + 0.5) + 0.04, cross.position);
      // The hovered walk click's cross pulses in size
      const hovered = this.targets.some((x) => x.kind === "tile" && x.walk && x.sx === to.sx && x.sy === to.sy);
      cross.scale.setScalar(hovered ? 1.3 + 0.5 * Math.sin(performance.now() / 140) : 1);
      used++;
    }
    for (let i = used; i < this.crosses.length; i++) this.crosses[i].visible = false;
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** An actor's drawn position at a client cycle, gliding between the tick snapshots around it */
function positionAtCycle(session: Session, who: Ref, cycle: number): { x: number; y: number } | undefined {
  const key = refKey(who);
  let lo = 0;
  let hi = session.lastTick;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const c = session.tickAt(mid)?.c ?? 0;
    if (c <= cycle) lo = mid;
    else hi = mid - 1;
  }
  const find = (t: number) => {
    const line = session.ticks[t];
    if (!line) return undefined;
    return [line.me, ...line.npcs, ...(line.players ?? [])].find((a) => a && refKey(a.who) === key);
  };
  const a = find(lo);
  if (!a || a.lx == null) return undefined;
  const b = find(lo + 1);
  const ca = session.ticks[lo]!.c;
  const cb = session.ticks[lo + 1]?.c;
  if (!b || b.lx == null || cb == null || cb === ca) return { x: a.lx / 128, y: a.ly! / 128 };
  const f = Math.max(0, Math.min(1, (cycle - ca) / (cb - ca)));
  return { x: (a.lx + (b.lx - a.lx) * f) / 128, y: (a.ly! + (b.ly! - a.ly!) * f) / 128 };
}
