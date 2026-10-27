# Lessons from importing locations

A running record of what went wrong turning a recording into a replay, where it really broke, and what
stops it coming back. Add to it every time a new location turns something up.

**Systemic** means it will happen again with any new location unless guarded; **one-off** means it was
particular to one place or one mistake. The **guard** is what catches it next time: a test, a check in
`npm run audit`, or a rule written into the code.

Run the audit on every new import before looking at the replay:

```
npm run audit -- sessions/<name>.jsonl
```

## Where things break

Most problems came from three places, roughly equally:

1. **RuneLite's cache library** reads the current cache format slightly wrong in ways that don't throw:
   values come back plausible but wrong, or quietly missing. Treat its output as untrusted and check it.
2. **Our own misreadings of what a recorded value means** (absolute or relative, signed or not, which
   floor). The recorder writes what the client API returns; the API's meaning isn't always the obvious
   one.
3. **Rendering rules the client follows that a generic 3D engine doesn't** (painter's order between
   floors, animation endings, hidden faces).

## The record

| # | Symptom | Root cause | Layer | Kind | Fix | Guard |
|---|---|---|---|---|---|---|
| 1 | Summariser crashed on the first real session | Gson leaves out null fields, so a sound with no source has no `from` key | Recorder format | Systemic | Readers treat every field as optional | Summariser uses `.get`; replay types mark fields optional |
| 2 | Every object type seemed to "spawn" at a map reload | After a map load the server re-sends objects that were already there | Game protocol | Systemic | Spawns on a map-load tick are re-sends, not mechanics | Summariser leaves them out; object timeline restarts at each `scene` line |
| 3 | Floors blank in every instance | Current caches no longer name map squares (`m50_50`); each is archive `regionX << 8 \| regionY` with terrain as file 0 | Cache library / cache format | Systemic | Exporter reads the numbered archive, falls back to names for old caches | Audit fails an instance map load with no ground tiles |
| 4 | Players and older NPCs never animated | The library's loader calls `computeAnimationTables()`, which turns per-vertex bone labels into lists and then nulls the per-vertex array | Cache library | Systemic | Exporter rebuilds labels from `getVertexGroups()` | Real-bundle test poses a player; audit fails if animated models have no labels |
| 5 | Bosses never animated | Newer content uses skeletal animations, which the library doesn't decode | Cache library | Systemic | Raw skeletal files passed through; decoder ported from rs-map-viewer | Real-bundle test decodes every skeletal animation; audit fails any that don't decode |
| 6 | Half a platform and the agility islands missing | Object offsets are signed 16-bit; the library reads them unsigned, so -10 became 65526 and threw models ~512 tiles away | Cache library | Systemic | Exporter casts to `short`; replay corrects old bundles too | Audit warns about bundles with unsigned offsets |
| 7 | Objects from other floors stacked onto yours | Recorder stamped every object with the floor you stood on (`wv.getPlane()`), not the object's | Recorder | Systemic | Format 3 records `pl`; older recordings get floors from the map dump's order | Object timeline test; audit warns when floors had to be inferred |
| 8 | Lower floors missing under gaps | Replay drew only your floor; the client draws every floor up to yours | Replay | Systemic | Ground and objects drawn for all floors up to yours, floors above hidden | — |
| 9 | Overlapping floors flickered | The client paints lower floors first, so coplanar surfaces never fight; a depth buffer does | Replay | Systemic | Lower floors pushed back in depth, ground pushed behind objects | — |
| 10 | Floors striped and blinking as the camera moved | Shadow acne: no shadow bias | Replay | One-off | Shadow bias and normal bias | — |
| 11 | Objects on slopes sank or floated | Misread the contour flag: 0 and up means "follow the ground", only -1 means "don't" | Replay | Systemic | Contoured objects take the ground height under each vertex | Comment at `contoured: def.contoured >= 0` |
| 12 | Coloured squares where nothing should be | Fallback markers drawn for objects with no model for their shape; the game draws nothing | Replay | Systemic | With models loaded, model-less objects are invisible | — |
| 13 | Floor effects floating high above the arena | A graphic's `z` is its absolute height; it was added to the ground again (projectile heights, by contrast, are offsets) | Replay (our reading) | Systemic | Graphics placed at `-z / 128` | Audit warns if graphics sit far from their tile's height |
| 14 | Void effects black and starless | Textured faces drawn in the texture's average colour; the void texture is mostly black | Exporter + replay | Systemic | Texture images and per-face coordinates exported; textures rendered and scrolled | Audit fails textures used without an image, warns on textured models without coordinates |
| 15 | Effects on players and bosses missing | Graphics on actors (`spot`) were only listed as text, never drawn | Replay | Systemic | Actor graphics drawn at their height, played once from their start | Audit warns about graphics with no definition or model |
| 16 | A collapse animation kept replaying | Object animations looped from the start; the game steps back by the animation's frame step (1 holds the last frame) | Replay | Systemic | Game's frame-step rule for object animations | Unit tests for hold, full loop, tail loop and play-once |
| 17 | "melee" written over heads | Prayer icons shown as words | Replay | One-off | Prayer and skull sprites from the cache | Contact-sheet check that RuneLite's head icon order matches the sprite frames |
| 19 | Every inventory icon failed to render | The library's item icon renderer (`ItemSpriteFactory`) can't take gaps in the texture list it's given; texture IDs have gaps | Cache library | Systemic | Exporter passes only the textures that exist | Audit fails held items without icons |
| 20 | Following the camera didn't re-centre after panning | Re-ticking "Follow me" kept the panned offset | Replay | One-off | Re-ticking re-centres and re-zooms; right-drag panning unticks it | — |
| 21 | Couldn't tell a click from the server acting on it | Every line carries the label of the tick that *ends* its window, so a click and the server's response normally share a label; the difference is in cycles, and in which state change follows | Replay (our reading) | Systemic | Click outcomes: each click matched to the server change it caused (on time, late, ignored, superseded, cancelled) | Outcome tests; audit reports the breakdown; recorder notes clicks other plugins cancel (format 4) |
| 22 | Couldn't measure where on a button a click landed | Clicks recorded the mouse position but not where the button was; presses that hit nothing weren't recorded | Recorder | Systemic | Format 4: clicked button's rectangle, every mouse press, button layouts | Accuracy tests; the accuracy view says when a recording lacks the data |
| 23 | Hits credited to guessed attackers | A hitsplat only says whether it was yours (`mine`); sources worked out from projectiles and attack animations were guesses presented as facts | Replay (our reading) | Systemic | Show only what's known: a line from you to your own hits, and others' hits in a shifted hue | Rule in `hits.ts`: no inference beyond the `mine` flag |
| 24 | Walk clicks drawn nowhere | A walk click's menu params are the mouse position, not the tile; they were read as a scene tile | Replay (our reading) | Systemic | Format 4 records the clicked tile; older recordings use where your server tile settled | Highlight tests for both |
| 25 | Floor effects not tied to the attack that caused them | The game sends an animation and its graphics, projectiles and spawned objects separately, with no link | Game protocol | Systemic | Links learned per recording by repetition: an effect that follows at least 3/4 of 3+ plays at an agreed delay, projectiles only from the animating actor | Link tests; audit lists what was tied |
| 26 | Ground items never drawn, and ones already lying there at a map load missing | The replay had no ground item layer; the recorder paused item recording during map loads (as for objects), but items aren't in the map dump, so ones already on the ground were lost | Replay + recorder | Systemic | Ground items drawn with their inventory model, stacked per tile; recorder keeps item spawns during loads | Audit: held items have icons; ground items need definitions in the bundle |
| 27 | Player arrows, spells and chinchompas never drawn; floor effects and hitsplats a tick late | Lines are labelled with the tick that *ends* their window, so the events playing between snapshot t and t + 1 are labelled t + 1; the replay only looked up to t. Short flights (10-30 cycles) began and ended unseen | Replay (our reading) | Systemic | Event lookups include the next tick's lines up to the current cycle (`happened`) | Unit test in `moment.test.ts` |
| 28 | New recordings opened as boxes, with the plain side panel | Exporting models was a manual step; a recording with no export falls back to boxes and plain icons | Workflow | Systemic | The dev server exports automatically the first time a recording is opened (copying the game cache first if RuneLite's is newer) | Status line says when it's exporting or why it failed |
| 29 | Open-world places (Edgeville) flat and empty | The recorder leaves terrain and objects out of open-world map loads "because the cache has them", but nothing read them from the cache | Exporter | Systemic | Exporter builds ground colours, heights and objects for open-world map loads from the cache's map squares (bridges moved down a floor) | Audit fails open-world map loads with no ground or objects |
| 30 | Inside a player-owned house: a roof over you, then you under the floor | Instance positions carry the *template's* floor; every floor of a house comes from template floor 2, so the floor alone can't say which scene floor you're on | Recorder + replay (our reading) | Systemic | Replay maps positions back to scene floors by matching the template chunk too; format 5 records the scene floor (`pl`) and each actor's own floor | Session tests for both cases |
| 31 | Combat options and spellbook couldn't be drawn faithfully | Attack style names and which spells are lit are decided at runtime by the game's interface scripts (weapon type, runes, staves, rune pouch, quests); the cache has the pieces but not the answer | Recorder | Systemic | Format 5 snapshots what the combat and spellbook interfaces show (sprites, text, items, boxes, fades) when it changes; the replay draws that. Older recordings get the cache's spell list, lit by magic level only and marked approximate | Widget drawing test |
| 32 | Players standing inside the Grand Exchange floor | Not heights (cache heights match the client's exactly, 7,168 of 7,168 tiles checked): the GE floor is slab objects about 0.4 tiles thick. The game draws a tile's floor objects before the actors on it (painter's order), so actors always look on top; a depth buffer sinks them in | Replay | Systemic | Thin floor objects (under 24 units thick, within 96 of the ground) lift actors, items, graphics and projectile targets on their tile to their top | — |
| 33 | Walking over a bridge put you on the riverbed below | A bridge tile (floor-1 setting flag 2) is drawn a floor down: the game shows its floor-1 ground, heights and objects on floor 0, and draws the original floor-0 tile underneath. Only objects had been moved | Exporter | Systemic | Open-world bridge tiles take the floor above's ground and heights; what was under them becomes floor -1, drawn below the deck | — (instances don't apply the bridge flag yet) |
| 34 | Bundles built in the browser read nothing ("No config archive 9") although Node read the same files fine | A worker resolves relative URLs against its own script's address, not the page's, so `dev-cache/` pointed into `src/cache/build/` and came back as the page's HTML | Browser | One-off | Pass the worker absolute URLs | Parity script (`scripts/parity.ts`) checks the builder in Node; the `?devCache=inline` screenshot checks it in a browser |
| 35 | An exported stretch of an instance was missing most of its floors and scenery | Export carries in what the replay needs from before the stretch, but dropped `obj`, `obj_gone` and `objdef` as "moments". Inside instances those lines are the map: the recorder lists every object when it loads (46,000 in a TFA raid), so a stretch starting after the load kept 76 of them | Replay (export) | Systemic | Carry in the objects still standing when the stretch starts, in their listed order, and every object definition | `src/trim.test.ts` |
| 36 | A hit the game marked as yours was credited to another player's projectile | Projectile attribution matched any projectile landing on the target within 2 cycles, so a friend's arrow landing beside your hit claimed it | Replay | Systemic | A hit marked as yours only matches your own projectiles | `src/timelineViews.test.ts` (hit sources) |
| 37 | Ocellus's void puddles and orbs looked only pink; the void was hidden | The game draws only the side a face points to. These effects are a pink dome over a void dome, with the pink faces pointing down, so from above the game skips them and shows the void. The page drew every face from both sides | Replay | Systemic | Models draw front faces only; mirrored objects show the other side (merged ones have their corners reversed) | Screenshot of a void puddle and an open-world scene |
| 38 | The floor-wide "Obliteration" void (graphic 4320) never showed | Graphics were only looked for 4 ticks back, so anything playing longer vanished: this one lasts about 6 | Replay | Systemic | Look back a minute and let each graphic's animation length decide; graphics gathered per tick once per recording | — |
| 39 | Textured faces sometimes missing from screenshots, and for a moment in the browser | Texture pictures load asynchronously and a texture still loading draws nothing (cut out by alpha test) | Replay | Systemic | Every texture is decoded before a bundle is used | Repeated headless screenshots of a textured cape agree |
| 40 | The Obliteration void floor was turned a quarter turn off the arena | A graphic's definition can rotate its model (90, 180 or 270 degrees); graphic 4320 says 270 and the page ignored it | Replay | Systemic | Graphics take their definition's rotation, in quarter turns as objects do | Screenshot: the void fills the platform edge to edge |
| 18 | Code changes not showing in the browser | Vite's file watcher gets no events from Windows drives under WSL | Environment | Systemic | Polling watcher | Comment in `vite.config.ts` |

## Findings about the game

- **The server's cut-off for a tick moves.** Measured on the TFA recording's gear and prayer clicks:
  clicks in the last ~8 client cycles (about 160 ms) before a tick's update arrived were a coin flip,
  49 on time and 57 a tick late; earlier clicks almost always made it. The window is network jitter, so
  it will differ by connection and world. Each click's margin is shown in the replay.
- **"Late" has two causes.** A click that misses the cut-off lands exactly one tick later. Anything
  three or more ticks later is the game holding it (potion and food delays, walking into range), shown
  as "held". Clicking what you're already attacking changes nothing and is shown as "already".

## Known gaps

Things the recording or the replay can't do yet, which a new location may expose:

- **Object animation changes without a respawn.** The recorder logs an object's animation only when it
  appears. If the server later switches it (common for things that change state in place), the replay
  keeps the first animation. Fix: track object animations per tick in the recorder.
- **When stand, walk and run animations start.** Not recorded, so a walk cycle's phase is guessed from a
  shared clock. Fix: log pose changes with their cycle.
- **Player body colours.** Client constants, not cache data; bodies show default colours.
- **Terrain outside instances, overlay shapes, wall decoration offsets.** Plain floors outside instances,
  half and diagonal tiles drawn whole, decorations at their tile's centre.
- **Bridges inside instances.** Open-world bridges are handled; an instance with bridge tiles would still
  draw them on their stored floor.

## Habits that would have caught these sooner

- **Record the game's answer rather than re-deriving it.** Where the client works something out from many
  inputs (a lit spell, an attack style's name), snapshot what it shows instead of re-implementing it.
- **Show what's recorded, not what's likely.** When the data doesn't say something (who dealt a hit),
  mark the difference rather than infer it. A confident guess looks the same as a fact on screen.

- **Check exported data against the session before looking at pictures.** Most of these showed up as
  numbers first (zero labelled models, offsets above 32767, z equal to tile height) and were only noticed
  as pictures much later.
- **Before recording more, check the data you have against the client.** "Should we record heights?" was
  answered by comparing cache heights to client-recorded ones: identical, so the bug was elsewhere.
- **When something is invisible, count before guessing.** "Every tile anyone stood on has a floor under
  it" and "how many objects have no model for their shape" found real bugs; guessing at causes from
  screenshots cost several rounds.
- **Read cache values as the client does, not as the library returns them.** Signedness, nulled arrays and
  renamed archives were all invisible until checked against expected ranges.
