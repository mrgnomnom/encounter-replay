# Encounter Replay

Plays back [Encounter Recorder](../encounter-recorder) sessions in 3D, tick by tick: the map, every
actor's movement, facing and animations, projectiles in flight, hitsplats, overhead text, and the side
panel, clicks and prayers as they were in game. Everything runs in the browser; a session is read in
the page and never uploaded.

## Running it

```
npm install
npm run dev
```

Then open http://127.0.0.1:5180 and pick a recording from **Recordings…**: the dev server lists
Encounter Recorder's sessions folder (`.runelite/plugin-data/encounter-recorder/sessions`, found from
Windows or WSL; set `ENCOUNTER_SESSIONS` to point elsewhere), newest first. **Open session…** starts in that folder
once it's been used from there (the first time, it puts the folder's path on your clipboard to paste into
the dialog). You can also drop a session file onto the page; `?demo` opens a made-up fight. A recording opens with models when
`assets/cache/<recording name>.bundle.json` exists (see "Game models").

**Follow** picks whose view you're watching: you by default, or anyone else present. The camera stays on
them (panning lets go; tick *camera* to come back), and the log keeps to lines about them: what they did,
what was done or aimed at them, and floor effects tied to their attacks. Untick *only lines about* to see
everything while still following. Drag to orbit, right-drag to pan, scroll to zoom. Space plays and pauses, and the
arrow keys step one tick.

For development, sessions copied into the git-ignored `sessions/` folder open straight from the URL,
and `t` jumps to a moment:

```
http://127.0.0.1:5180/?session=sessions/tfa.jsonl&t=60.5
http://127.0.0.1:5180/?demo&t=15.6
```

`npm test` runs the tests, `npm run typecheck` the type checker and `npm run build` a static build.
The project is on a Windows drive, so from WSL the dev server polls for file changes.

## How it works

| File | Does |
|---|---|
| `src/session.ts` | Parses a session and indexes it, so any tick's state can be looked up directly |
| `src/moment.ts` | Where every actor is between two ticks, and the client cycle at that moment |
| `src/projectile.ts` | Projectile flight, following the game client's maths: re-aimed every client cycle so it lands on its end cycle, height on a parabola set by the recorded slope |
| `src/world.ts` | Ground, walls and blocked tiles from the recorded collision map and tile heights |
| `src/stage.ts` | Actors, projectiles, graphics on tiles, walk clicks and the destination flag |
| `src/objects.ts` | Which objects exist at each tick, from map dumps, spawns and removals |
| `src/objectLayer.ts` | Draws them: spawned objects labelled and coloured per ID, map scenery optional |
| `src/hud.ts` | Orbs, side panel, clicks, timeline and event log |
| `src/synthetic.ts` | The synthetic demo fight |

Three.js space is one unit per tile, x east, y up and north towards -z.

## Game models

The exporter in `exporter/` reads the game cache RuneLite keeps on your PC and writes everything a
session uses into one bundle: NPC, object, item, body kit and graphic definitions, their models,
classic animation frames, texture colours and instance ground colours. The replay loads
`assets/cache/<session name>.bundle.json` when it opens a session, or you can drop a bundle onto the
page after the session.

From a Windows command prompt in `exporter`:

```
gradlew.bat compileJava copyDeps
xcopy /E /I /Y %USERPROFILE%\.runelite\jagexcache\oldschool\LIVE build\cache-live
java -Xmx3g -cp build\classes\java\main;build\deps\* encounterreplay.Exporter build\cache-live ..\sessions\tfa.jsonl ..\assets\cache\tfa.bundle.json
```

The cache is copied first so the exporter never touches the one RuneLite is using. It should match the
game version the session was recorded on (the header's `revision`); after a game update, older
sessions need the older cache, which the OpenRS2 archive keeps.

After exporting, check the import before looking at the replay:

```
npm run audit -- sessions/tfa.jsonl
```

It checks for every systemic failure met so far (blank floors, models that won't animate, missing
textures, misplaced objects and more) and fails loudly. What each check guards against, and why, is in
[docs/LESSONS.md](docs/LESSONS.md), a running record to add to whenever a new location turns something up.

**The bundle is made from Jagex's game cache. It stays on this machine: `assets/cache/` is
git-ignored, and it must never be published.**

| File | Does |
|---|---|
| `exporter/.../Exporter.java` | Finds what a session uses and writes the bundle, using RuneLite's cache library |
| `src/cache/bundle.ts` | Loads a bundle, decodes models, and converts the game's 16-bit colours as the client does |
| `src/cache/rig.ts` | Puts models together with their recolours, and poses them on animation frames with a port of the client's frame transforms |
| `src/cache/models.ts` | Builds NPCs, players, objects and graphics from their definitions, times animation frames, and keeps meshes in step |
| `src/cache/skeletal/` | Skeletal animations, which newer content uses (every boss in the Fractured Archive): skeletons, keyframe curves and bone-weighted vertex skinning |

## Not there yet

1. **Player body colours.** Skin, hair and clothing colours are client constants rather than cache
   data, so players show their kit's default colours. Gear is exact.
2. **Terrain outside instances, and overlay shapes.** Ground colours come from the instance's map
   squares; outside instances the floor is plain, and half-tile and diagonal overlays are drawn as
   whole tiles.
3. **Wall decoration offsets and ground contouring.** Decorations sit at their tile's centre rather
   than pushed against their wall, and objects don't bend to fit sloped ground.

## Credits

The skeletal animation code in `src/cache/skeletal/` is ported from
[rs-map-viewer](https://github.com/dennisdev/rs-map-viewer) by dennisdev, under the BSD 2-Clause
licence kept in that folder. The cache is read with RuneLite's cache library (BSD 2-Clause).

