# CrossCode Enhanced

![icon](icon.png)

A large content and quality-of-life mod for CrossCode that brings the world to life.

## Features

- **Day and night, weather, seasons and the moon.** A live clock with weather that changes by area and season. Rest at beds and inns until morning, afternoon, evening, night or a time you pick, and wake up Well Rested.
- **Maps.** True-scale area maps, a minimap, treasure chest markers and a hideout.
- **Monster cards and companions.** Collect cards from enemies, fuse them with Card Fusion, and bring companions along.
- **Orbs, Area Mastery and Medals.** New goals in every area, and each one awards skill points.
- **Five new skill circuits.** These sit beside the game's own circuit board. Each has its own point type and colour, there are 29 glowing special skills, and both trees have a Respec button.
- **Trials, rifts, dungeon replays and boss rematches.** Quit options are on the pause menu.
- **Pocket Forge.** Craft on the go, with a shop helper.
- **Gold restyle.** Menus, HUD and boss bar are restyled in gold. The HUD fades when idle and comes back in combat. Save slots show your progress.

An in-game **Guide** explains everything. Every feature can be toggled in **Options → Mods / Enhanced**.

## Installing

- **CCModManager (recommended):** search for *CrossCode Enhanced* in the mod list and install it.
- **Manually:** download the `.ccmod` file from [Releases](../../releases) and put it in `CrossCode/assets/mods/`. You need [CCLoader](https://github.com/CCDirectLink/CCLoader).

## Building from source

The game-facing scripts are generated from `src/`:

```
python3 build.py
```

This writes `poststart.js`. To make a release, zip everything except `src/` and `build.py` so that `ccmod.json` sits at the root of the archive, then rename the zip to `.ccmod`.

## Compatibility

The mod is built for CrossCode 1.4.x with CCLoader. It works with the DLC areas if you have them installed. Mods that heavily change the circuit menu, the HUD or the save screen may conflict.
