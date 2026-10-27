# OSRS Encounter Replay

**Watch your Old School RuneScape fights again, tick by tick, in 3D.**

![A 5-man Fractured Archive raid against Ocellus, played back tick by tick](docs/images/bossing.webp)

*Bossing: a 5-man Fractured Archive raid, switching who to follow, with player names hidden.*

## Why

A boss fight is over in seconds, and when it goes wrong you rarely know why. Was the prayer switch
late? Where was everyone standing when the special attack landed? What did you actually click?

The [Encounter Recorder](https://github.com/mrgnomnom/encounter-recorder) RuneLite plugin writes down
what your game client knew on every tick. Encounter Replay plays that back in your browser at
https://encounter-replay.pages.dev:
- **The scene in 3D:** the map, every player and NPC with their animations, projectiles in flight,
  hitsplats and overhead text.
- **Your side panel as it was:** HP, prayer, inventory, gear, prayers and the tab you had open.
- **Each click, timed to the tick,** so a late switch shows up as late.
- **A summary of any stretch you pick:** damage taken, late prayer and gear switches, and click accuracy.
- **A log of everything that happened,** filtered to whoever you're following.

You can scrub to any moment, play at a quarter speed, and follow any player. Boss fights, raids, PvP,
a skilling trip: anything you can see in game, you can watch again.

![A PK fight played back tick by tick](docs/images/pvp.webp)

*PVP: epic flicks never missin ticks (except ticks 80, 83, 85...)*

## Your files never leave your computer

- **It reads only what it needs, view-only:** your recordings folder, and the game cache's own files
  (`main_file_cache`). Not the rest of the cache's folder, which can hold your game settings and a
  remembered username, and never your whole `.runelite` folder, which also holds your logins.
- **It can't send anything anywhere.** The page's security policy tells your browser to block every
  connection except loading the page itself, so nothing is ever uploaded.
- **It draws the game from your own game files.** No game data is downloaded or hosted.
- **"What this page can see"** in the header lists what it can read and every file it has read.
- **It's free.** There are no accounts, no ads and no analytics. It even works offline after your first
  visit.

## Share a fight

Say you run a clan and you're teaching a new team the Fractured Archive. Encounter Recorder saves every
attempt.

After the raid you open the wipe here and drag across the timeline to pick out the 20 seconds that went
wrong. You press **N** to pin notes to the ticks that matter, like "binders spawn here: north one
first". **Export** gives you just that stretch, with your notes, as one small file. Tick **Hide player
names** and everyone becomes "You", "Player 1", "Player 2". Post the file in Discord.

Everyone who drags it onto this page sees the same fight, drawn from their own game files. Each of them
can follow any player, slow it down and read your notes as they come up.

Streamers can do the same thing:
- **With chat:** walk through a kill after it happens, one tick at a time, showing exactly where the
  damage came from.
- **With viewers:** hand out the file so people can scrub through it themselves.

## Getting started

1. **Record** something with the [Encounter Recorder plugin](https://runelite.net/plugin-hub/show/encounter-recorder) from the RuneLite Plugin Hub.
2. **Open** https://encounter-replay.pages.dev, or press **Open replay** in the plugin's panel.
3. **Set up the game cache once.** The page walks you through it, then shows you around with a short
   tutorial on a demo fight.
4. **Watch.** Drag a recording onto the page, or choose a default recording folder so the plugin can
   open recordings straight here.

It needs a Chromium browser (Chrome, Edge, Brave or Opera) to read the folders.

**Controls:**
- **Space** plays and pauses, and the **arrow keys** step one tick.
- **Drag** to orbit, **right-drag** to pan and **scroll** to zoom.
- **N** adds a note at the tick shown.

## For developers

How to run it, how it's built and how the game cache is read: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Credits

- **Skeletal animation:** the code in `src/cache/skeletal/` is ported from
  [rs-map-viewer](https://github.com/dennisdev/rs-map-viewer) by dennisdev, under the BSD 2-Clause
  licence kept in that folder.
- **Cache reading:** the cache reader, loaders and item icon renderer in `src/cache/` are ported from
  [RuneLite](https://github.com/runelite/runelite)'s cache library, under the BSD 2-Clause licence kept
  in `src/cache/store/LICENSE`.

Not affiliated with or endorsed by Jagex. RuneScape and Old School RuneScape are trademarks of Jagex Ltd.
This repository contains no game data: models and maps are read from each player's own game cache.
