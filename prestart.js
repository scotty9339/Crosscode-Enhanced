// CrossCode Enhanced: in-game settings via CCModManager (Options > Mods).
// Runs at prestart so the rebindable keys are added to the game's controls list in time.
// If CCModManager isn't installed, the mod falls back to the CONFIG block in poststart.js.

(() => {
  const range = (min, max, step) => { const d = {}; let i = 0; for (let v = min; v <= max + 1e-9; v += step) d[i++] = Math.round(v * 100) / 100; return d; };
  const show = fmt => function (i) { return fmt(this.data[i]); };
  const pct = v => Math.round(v * 100) + "%";
  const times = v => "x" + v.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  const plus = v => (v >= 1 ? "+" : "") + Math.round((v - 1) * 100) + "%";
  const mins = v => v + " min";
  const act = name => function () { window.wdnActions && window.wdnActions[name] && window.wdnActions[name](); };

  // every option, grouped as they used to be (the menu layout is built from LAYOUT below)
  const POOL = {
    weather: {
      settings: { title: "Weather", tabIcon: "general" },
      headers: {
        "Day and night": {
          info: { type: "INFO", name: "Every tab starts with its own On / Off switches (weather in Weather, cards in Cards, the minimap in Minimap...), with the finer settings below. Settings apply straight away. Hover an option for details." },
          dayLength: { type: "OBJECT_SLIDER", data: { 0: 6, 1: 12, 2: 18, 3: 24, 4: 36, 5: 48, 6: 60 }, init: 24, customNumberDisplay: show(mins),
            name: "Day length", description: "Real-time minutes for one full in-game day." },
          nightDarkness: { type: "OBJECT_SLIDER", data: range(0, 1, 0.05), init: 0.6, customNumberDisplay: show(pct),
            name: "Night darkness", description: "How dark nights get outdoors. 0% turns darkness off." }
        },
        "Seasons": {
          seasons: { type: "CHECKBOX", init: true, name: "Seasons",
            description: "Spring: more rain and fog. Summer: clear, storms, long days. Autumn: fog and cloud. Winter: snow and blizzards, short days." },
          seasonDays: { type: "OBJECT_SLIDER", data: range(3, 15, 1), init: 7, customNumberDisplay: show(v => v + " days"),
            name: "Season length", description: "In-game days per season. A year is four seasons." },
          winterSnow: { type: "CHECKBOX", init: true, name: "Lowland snow",
            description: "In winter, snow can also fall in Autumn's Rise, Rookie Harbor and Sapphire Ridge." },
        },
        "Inns": {
          inns: { type: "CHECKBOX", init: true, name: "Rest at inns",
            description: "In the inns at Rookie Harbor, Bergen and the Cave Inn, talk to the innkeeper to rest until 08:00 or 20:00, fully healed." },
          innCost: { type: "OBJECT_SLIDER", data: range(0, 500, 25), init: 50, customNumberDisplay: show(v => v ? v + " Credits" : "Free"),
            name: "Rest cost", description: "Credits to rest at an inn." }
        },
        "Moon": {
          moonPhases: { type: "CHECKBOX", init: true, name: "Moon phases",
            description: "Full moon: brighter nights, night loot bonus x1.5. New moon: darkest nights, night enemy toughness x1.5. The clock shows the phase at night." },
          moonCycle: { type: "OBJECT_SLIDER", data: range(4, 16, 1), init: 8, customNumberDisplay: show(v => v + " days"),
            name: "Moon cycle", description: "In-game days from one new moon to the next." }
        },
        "Weather": {
          weatherIntensity: { type: "OBJECT_SLIDER", data: range(0.2, 1.5, 0.1), init: 0.8, customNumberDisplay: show(pct),
            name: "Weather strength", description: "Scales rain, snow, fog, sandstorms and clouds." },
          lightningFlash: { type: "OBJECT_SLIDER", data: range(0, 0.3, 0.03), init: 0.12, customNumberDisplay: show(v => v ? pct(v / 0.3) : "Off"),
            name: "Lightning flashes", description: "Brightness of storm lightning. Off keeps the storm without any flashes." },
          weatherMin: { type: "OBJECT_SLIDER", data: range(1, 15, 1), init: 3, customNumberDisplay: show(mins),
            name: "Shortest weather", description: "Minimum real-time minutes before the weather changes." },
          weatherMax: { type: "OBJECT_SLIDER", data: range(2, 20, 1), init: 8, customNumberDisplay: show(mins),
            name: "Longest weather", description: "Maximum real-time minutes before the weather changes." },
          forecast: { type: "CHECKBOX", init: true, name: "Weather forecast",
            description: "Show the next weather and when it arrives (in the Box clock position). Freak weather can still surprise you." },
          freakChance: { type: "OBJECT_SLIDER", data: range(0, 0.3, 0.01), init: 0.05, customNumberDisplay: show(v => v ? pct(v) : "Never"),
            name: "Freak weather", description: "Chance a weather change brings weather an area never normally gets (snow in Rookie Harbor...)." },
          weatherEvents: { type: "CHECKBOX", init: true, name: "Weather events",
            description: "Now and then a day brings a Blood Moon (a red night: fiercer enemies, double EXP, Credits and rare drops, more shinies), an Eclipse (midday darkness: night enemies, triple shinies) or a Tempest (wild weather everywhere, +50% EXP and Credits). You get a heads-up before it starts." },
          eventChance: { type: "OBJECT_SLIDER", data: range(0.05, 0.4, 0.05), init: 0.15, customNumberDisplay: show(v => pct(v) + " of days"),
            name: "Event days", description: "How often a day has a weather event (never two days running)." }
        },
        "Sound": {
          sound: { type: "CHECKBOX", init: true, name: "Weather sounds", description: "Rain, wind, sandstorms and thunder, using the game's own ambience sounds." },
          soundVolume: { type: "OBJECT_SLIDER", data: range(0, 2, 0.1), init: 1.3, customNumberDisplay: show(pct),
            name: "Weather volume", description: "Volume of the weather sounds. Above 100% makes them louder than the game's own ambience." },
          musicDuck: { type: "OBJECT_SLIDER", data: range(0, 0.7, 0.05), init: 0.35, customNumberDisplay: show(v => v ? "-" + pct(v) : "Off"),
            name: "Lower music", description: "Turns the music down by this much in heavy weather (less in light rain or snow), so the weather can be heard. Returns to normal when it clears." },
          indoorRain: { type: "CHECKBOX", init: true, name: "Rain indoors", description: "Hear muffled rain on the roof when it's raining outside a building you're in." },
          thunder: { type: "CHECKBOX", init: true, name: "Thunder", description: "Thunder rumbles a moment after lightning in storms." }
        },
        "Night ambience": {
          playerLight: { type: "CHECKBOX", init: true, name: "Lea's light", description: "A warm glow around Lea at night." },
          partyLights: { type: "CHECKBOX", init: true, name: "Party lights", description: "A glow around party members at night." },
          npcLanterns: { type: "CHECKBOX", init: true, name: "NPC lanterns", description: "Small warm lights on townsfolk at night." },
          fireflies: { type: "CHECKBOX", init: true, name: "Fireflies", description: "Fireflies on calm nights in forests, jungles and temperate areas." }
        }
      }
    },
    clock: {
      settings: { title: "Clock", tabIcon: "interface" },
      headers: {
        "Clock": {
          clockPlace: { type: "BUTTON_GROUP", enum: { CORNER: 0, HP: 1, PARTY: 2, BOX: 3, MINIMAP: 4 }, init: 0,
            buttonNames: ["Corner", "By HP", "Left", "Box", "Minimap"],
            name: "Position", description: "Corner: bottom right. By HP: next to the HP/SP bars. Left: under the party. Box: right-hand HUD box. Minimap: attached under the minimap, wherever it is (bottom right if the minimap is off)." },
          clockMode: { type: "BUTTON_GROUP", enum: { ALWAYS: 0, AUTO: 1, OFF: 2 }, init: 0,
            buttonNames: ["Always", "Pop up", "Off"],
            name: "Show clock", description: "Pop up: appears for a few seconds now and then (see below)." },
          popupSeconds: { type: "OBJECT_SLIDER", data: range(3, 15, 1), init: 6, customNumberDisplay: show(v => v + " s"),
            name: "Pop-up time", description: "How long the clock stays up in Pop up mode." },
          popupInfo: { type: "INFO", name: "Pop up shows the clock on each new in-game hour, weather change and new area, and when you press the Show clock key." }
        }
      }
    },
    maps: {
      settings: { title: "Area map", tabIcon: "general" },
      headers: {
          "Treasure": {
            mapInfo: { type: "INFO", name: "Brown chest: normal treasure. Padlock chests (bronze, silver, gold) need the matching key, shown with the padlock from the game's own sprites. White key: holds a dungeon key. Gold crystal: holds a master key. Grey chest: already opened. Lea's head: where you are." },
            mapChests: { type: "CHECKBOX", init: true, name: "Show chests on the map", description: "Mark treasure chests on the area map." },
            showOpened: { type: "CHECKBOX", init: true, name: "Show opened chests", description: "Keep chests you've already opened on the map, greyed out. Off shows only what's left." },
            mapTrueScale: { type: "CHECKBOX", init: true, name: "True-scale maps", description: "Redraw the area map with every room at its real size and shape, joined at its real doorways (every area). Takes effect the next time an area loads, or after a restart." },
            mapDetail: { type: "CHECKBOX", init: true, name: "Detailed rooms", description: "Draw every room you've visited in detail on the area map (buildings, paths, water in their real colours)." },
            mapDetailStrength: { type: "OBJECT_SLIDER", data: range(0.3, 1, 0.05), init: 1, customNumberDisplay: show(pct),
              name: "Detail strength", description: "How strongly the room detail is drawn over the area map." },
            closeupPad: { type: "CHECKBOX", init: true, name: "Close-up with R3", description: "On the area map, press R3 on a controller to see the room under the cursor full screen (keyboard: R, changeable in Controls)." },
            mapOutline: { type: "CHECKBOX", init: true, name: "Gold outline", description: "A gold line around the outside edge of the area (the rooms you've visited) on the area map and the minimap." },
            mapSharpen: { type: "CHECKBOX", init: true, name: "Sharpen detail", description: "Crisp up the shrunken room pictures on the area map and minimap." },
            questGivers: { type: "CHECKBOX", init: true, name: "Quest givers", description: "A yellow ! marks people with a quest you can take (on the area map, minimap and close-up). It goes once you've taken or finished the quest." },
            showLea: { type: "CHECKBOX", init: true, name: "Show Lea on the map", description: "Mark where you are in the current room with Lea's head." },
            reveal: { type: "BUTTON_GROUP", enum: { ALL: 0, VISITED: 1, NEARBY: 2 }, init: 2,
              buttonNames: ["All", "Visited", "Nearby"],
              name: "Which chests", description: "All: every chest. Visited: chests in rooms you've been to. Nearby: a chest appears once you've been close to it (or opened it)." },
            range: { type: "OBJECT_SLIDER", data: range(3, 20, 1), init: 8, customNumberDisplay: show(v => v + " tiles"),
              name: "Discovery range", description: "How close you need to get to a chest for it to appear on the map in Nearby mode." }
          }
        }
    },
    minimap: {
      settings: { title: "Minimap", tabIcon: "interface" },
      headers: {
          "Minimap": {
            minimap: { type: "CHECKBOX", init: true, name: "Show minimap", description: "A small map in the corner of the screen: the area map around you, with the rooms drawn in detail." },
            mmPos: { type: "BUTTON_GROUP", enum: { TOP_RIGHT: 0, TOP_LEFT: 1, BOTTOM_LEFT: 2, BOTTOM_RIGHT: 3 }, init: 0,
              buttonNames: ["Top right", "Top left", "Bottom left", "Bottom right"],
              name: "Position", description: "Corner of the screen. Top left sits under the health bar. If the clock is in the same corner, the minimap moves out of its way." },
            mmSize: { type: "BUTTON_GROUP", enum: { SMALL: 0, MEDIUM: 1, LARGE: 2, HUGE: 3 }, init: 1,
              buttonNames: ["Small", "Medium", "Large", "Huge"], name: "Size", description: "How big the minimap is." },
            mmZoom: { type: "BUTTON_GROUP", enum: { X1: 0, X2: 1, X3: 2 }, init: 1,
              buttonNames: ["Far", "Normal", "Close"], name: "Zoom", description: "Far shows more rooms around you, Close shows more detail in your room." },
            mmOpacity: { type: "OBJECT_SLIDER", data: range(0.4, 1, 0.1), init: 1, customNumberDisplay: show(v => Math.round(v * 100) + "%"),
              name: "Opacity", description: "How see-through the minimap is." },
            mmDetail: { type: "OBJECT_SLIDER", data: range(0, 1, 0.1), init: 0.9, customNumberDisplay: show(v => Math.round(v * 100) + "%"),
              name: "Room detail", description: "How strongly the room detail is drawn. 0% shows the plain area-map rooms instead." },
            mmName: { type: "CHECKBOX", init: true, name: "Show area name", description: "The area's name on a tab under the minimap." },
            mmCompass: { type: "CHECKBOX", init: true, name: "Chest compass", description: "When the nearest unopened chest is off the minimap, a glowing marker on the minimap's border shows which way it is: your equipped element's icon, or a blue square in Neutral." },
            mmCompassRange: { type: "OBJECT_SLIDER", data: { 0: 25, 1: 50, 2: 75, 3: 100, 4: 150, 5: 200, 6: 300, 7: 0 }, init: 0, customNumberDisplay: show(v => v ? v + " tiles" : "Whole area"),
              name: "Compass range", description: "How far away a chest can be for the compass to point to it." },
            mmCompassHide: { type: "OBJECT_SLIDER", data: { 0: -1, 1: 0, 2: 10, 3: 20, 4: 30, 5: 50 }, init: 0, customNumberDisplay: show(v => v === -1 ? "Never" : v === 0 ? "On the minimap" : "Within " + v + " tiles"),
              name: "Compass turns off", description: "When the compass hides: never (it keeps pointing even when the chest is on the minimap), once the chest is on the minimap, or once you're within this many tiles of it." },
            mmCompassFind: { type: "BUTTON_GROUP", enum: { ANY: 0, MAP: 1 }, init: 0, buttonNames: ["Any chest", "On the map"],
              name: "Compass finds", description: "Any chest: the nearest unopened chest in the area, found or not. On the map: only chests the map shows (see Which chests)." },
            mmCompassSkip: { type: "CHECKBOX", init: false, name: "Skip marked chests",
              description: "The compass ignores chests that already have a marker on the minimap and only leads to ones you haven't found yet. Works best with Which chests set to Nearby (Area map tab) and Compass finds set to Any chest." },
            mmEnemies: { type: "CHECKBOX", init: true, name: "Show enemies", description: "Mark enemies in your current room." },
            mmCardPlayers: { type: "CHECKBOX", init: true, name: "Show card players", description: "Mark townspeople who play cards with a small gold card, on the minimap and the area map." },
            shinyMarkers: { type: "CHECKBOX", init: true, name: "Shiny enemy markers", description: "Shiny enemies in your room show as a gold enemy icon on the minimap and area map; when one is off the minimap, the same gold icon on its border points the way, like the chest compass." },
            champMarkers: { type: "CHECKBOX", init: true, name: "Champion markers", description: "Champion enemies show on the minimap and area map as an enemy icon in their modifier's colour (blue Armoured, red Mighty, green Regenerating); when one is off the minimap, the same icon on its border points the way." },
            mmIcons: { type: "CHECKBOX", init: true, name: "Show map icons", description: "Shops, quests, stairs and area exits, as on the area map." }
          }
      }
    },
    extras: {
      settings: { title: "Extras", tabIcon: "general" },
      headers: {
        "Jumping": {
          highJump: { type: "CHECKBOX", init: true, name: "High jumps", description: "Lea can jump up taller ledges (walk into them as usual) and hops further off edges. Can let you reach places the game didn't intend." },
          highJumpTiles: { type: "OBJECT_SLIDER", data: range(1, 6, 1), init: 3, customNumberDisplay: show(v => v + (v === 1 ? " tile" : " tiles")),
            name: "Jump height", description: "The tallest ledge Lea will jump up onto. Normally about 1 tile." },
          gapJump: { type: "OBJECT_SLIDER", data: range(1, 2, 0.05), init: 1.25, customNumberDisplay: show(times),
            name: "Jump distance", description: "How much stronger her hop off an edge is, for clearing wider gaps. x1 is normal." },
          keyUnstick: { type: "CONTROLS", init: { key1: ig.KEY.U }, pressEvent: act("unstick"),
            name: "Back to safe ground", description: "Send Lea back to where her last high jump took off (or the last safe spot), in case she ends up somewhere she can't get out of. Boosted jumps that land off the map do this by themselves." }
        }
      }
    },
    night: {
      settings: { title: "Combat", tabIcon: "arena" },
      headers: {
        "Night-time enemies": {
          nightEnemies: { type: "CHECKBOX", init: true,
            name: "Night enemies", description: "Outdoors at night, enemies are tougher but give better rewards. Dusk and dawn give part of it." },
          toughness: { type: "OBJECT_SLIDER", data: range(0, 3, 0.25), init: 1, customNumberDisplay: show(v => v ? times(v) : "Off"),
            name: "Toughness", description: "x1 = +20% HP, +15% attack, +10% defence and focus at full night. x2 doubles that." },
          rareDrops: { type: "OBJECT_SLIDER", data: range(1, 3, 0.25), init: 1.75, customNumberDisplay: show(times),
            name: "Rare drops", description: "How much more likely rare drops (1-12% chance) are at night." },
          credits: { type: "OBJECT_SLIDER", data: range(1, 2, 0.05), init: 1.25, customNumberDisplay: show(plus),
            name: "Credits", description: "Extra Credits from night-time kills." },
          exp: { type: "OBJECT_SLIDER", data: range(1, 2, 0.05), init: 1.25, customNumberDisplay: show(plus),
            name: "EXP", description: "Extra EXP from night-time kills." },
          bosses: { type: "CHECKBOX", init: false,
            name: "Include bosses", description: "Also apply the night bonuses to boss fights." }
        },
        "Weather in combat": {
          weatherCombat: { type: "CHECKBOX", init: true,
            name: "Weather in combat", description: "Outdoors, every weather makes one element stronger and another weaker, for you and enemies." },
          weatherCombatStrength: { type: "OBJECT_SLIDER", data: range(0.5, 2, 0.25), init: 1, customNumberDisplay: show(times),
            name: "Weather effect", description: "x1: clear day Heat+ Cold-, clear night Cold+ Heat-, cloudy Shock+ Wave-, fog Wave+ Shock-, rain/downpour Wave+ Heat-, storm Shock+ Heat-, snow/blizzard Cold+ Heat-, sandstorm Heat+ Cold-." },
        }
      }
    },
    keys: {
      settings: { title: "Keys", tabIcon: "controls" },
      headers: {
        "Controller": {
          quickRingStyle: { type: "CHECKBOX", init: true, name: "Restyled quick ring (L2)",
            description: "The game's L2 quick ring gets four more options on its diagonals (point the stick between the game's buttons and press confirm): up-left summon or dismiss your companion, up-right ping the orbs left in the room, down-right your companion's stance (Attack, Guard or Passive), down-left the Enhanced page. All eight are round tiles, and each shows a label plate while you point at it (Items with your HP, Analysis with the elements the weather favours, Party with who's with you, Map with the area and where the route leads) and the time in the middle." },
        },
        "Keyboard": {
          keyClock: { type: "CONTROLS", init: { key1: ig.KEY.F7 }, pressEvent: act("clock"),
            name: "Clock mode", description: "Switch the clock between Always, Pop up and Off." },
          keyToggle: { type: "CONTROLS", init: { key1: ig.KEY.F8 }, pressEvent: act("toggle"),
            name: "Effects on/off", description: "Turn all weather and night effects on or off." },
          keyPeek: { type: "CONTROLS", init: { key1: ig.KEY.F6 }, pressEvent: act("peek"),
            name: "Show clock", description: "In Pop up mode, show the clock for a few seconds." },
          keyRoomView: { type: "CONTROLS", init: { key1: ig.KEY.R }, pressEvent: () => {},
            name: "Room close-up", description: "On the area map (pause menu), open the room under the cursor full screen in high detail. Press again to close." }
        },
        "Clear keyboard keys": {
          clearClock: { type: "BUTTON", onPress: () => clearKeys(["keyClock"]), name: "Clear: Clock mode", description: "Remove the keyboard keys for Clock mode." },
          clearToggle: { type: "BUTTON", onPress: () => clearKeys(["keyToggle"]), name: "Clear: Effects on/off", description: "Remove the keyboard keys for Effects on/off." },
          clearPeek: { type: "BUTTON", onPress: () => clearKeys(["keyPeek"]), name: "Clear: Show clock", description: "Remove the keyboard keys for Show clock." },
          clearRoomView: { type: "BUTTON", onPress: () => clearKeys(["keyRoomView"]), name: "Clear: Room close-up", description: "Remove the keyboard keys for Room close-up." },
          clearUnstick: { type: "BUTTON", onPress: () => clearKeys(["keyUnstick"]), name: "Clear: Back to safe ground", description: "Remove the keyboard keys for Back to safe ground." },
          clearAll: { type: "BUTTON", onPress: () => clearKeys(["keyClock", "keyToggle", "keyPeek", "keyRoomView", "keyUnstick"]), name: "Clear all", description: "Remove every keyboard key this mod uses." }
        }
      }
    }
  };

  const hhmm = v => String(Math.floor(v)).padStart(2, "0") + ":" + (v % 1 ? "30" : "00");
  const NEW = {
    hudFade: { type: "CHECKBOX", init: true, name: "HUD fades when calm",
      description: "The HP, SP and level display in the corner fades away out of combat at full health, and comes straight back when anything happens." },
    effects: { type: "CHECKBOX", init: true, name: "Weather & night effects",
      description: "All weather, night darkness, tint and lights. The same as the Effects on/off key (F8)." },

    presetLight: { type: "BUTTON", name: "Preset: Light touch",
      description: "Gentle weather, lighter nights, no combat changes or high jumps. Everything else at its default.",
      onPress() { preset("Light touch", { nightDarkness: 0.4, weatherIntensity: 0.6, lightningFlash: 0.06, freakChance: 0, musicDuck: 0.15,
        nightEnemies: false, weatherCombat: false, moonCombat: false, highJump: false, mmCompass: false, mmEnemies: false }); } },
    presetDefault: { type: "BUTTON", name: "Preset: Default",
      description: "Every setting back to how the mod comes (your keys are kept).",
      onPress() { preset("Default", {}); } },
    presetEverything: { type: "BUTTON", name: "Preset: Everything",
      description: "Every feature on and turned up: dark nights, strong weather, tougher night enemies, higher jumps.",
      onPress() { preset("Everything", { nightDarkness: 0.75, weatherIntensity: 1, lightningFlash: 0.18, freakChance: 0.1,
        toughness: 1.5, rareDrops: 2, credits: 1.5, exp: 1.5, bosses: true, weatherCombatStrength: 1.5, highJumpTiles: 4, gapJump: 1.4,
        mmSize: 2, mmCompassFind: 0, mmCompassRange: 0 }); } },

    nightTint: { type: "BUTTON_GROUP", enum: { BLUE: 0, PURPLE: 1, NEUTRAL: 2, WARM: 3 }, init: 0,
      buttonNames: ["Moonlit", "Purple", "Grey", "Warm"], name: "Night colour", description: "The colour of the night-time tint." },
    sunrise: { type: "OBJECT_SLIDER", data: range(4, 8, 0.5), init: 6, customNumberDisplay: show(hhmm),
      name: "Sunrise", description: "When the sun comes up. With seasons on, each season's sunrise moves by the same amount." },
    sunset: { type: "OBJECT_SLIDER", data: range(17, 22, 0.5), init: 19.5, customNumberDisplay: show(hhmm),
      name: "Sunset", description: "When the sun goes down. With seasons on, each season's sunset moves by the same amount." },
    startHour: { type: "OBJECT_SLIDER", data: range(0, 23, 1), init: 8, customNumberDisplay: show(hhmm),
      name: "New game time", description: "The time of day a new game (or a save that's never had the clock) starts at." },
    timeIndoors: { type: "CHECKBOX", init: true, name: "Time passes indoors",
      description: "Off: the clock stops while you're inside buildings and dungeons, and starts again outdoors." },
    moonBright: { type: "OBJECT_SLIDER", data: range(0, 0.5, 0.05), init: 0.25, customNumberDisplay: show(v => v ? pct(v / 0.5) : "Off"),
      name: "Moonlight", description: "How much brighter full-moon nights are (and new-moon nights darker)." },
    moonCombat: { type: "CHECKBOX", init: true, name: "Moon affects enemies",
      description: "Full moon: better night loot. New moon: tougher night enemies. Off: the moon only changes the light." },

    wCloudy: { type: "CHECKBOX", init: true, name: "Cloudy", description: "Allow cloudy weather." },
    wRain: { type: "CHECKBOX", init: true, name: "Rain", description: "Allow rain." },
    wDownpour: { type: "CHECKBOX", init: true, name: "Downpour", description: "Allow heavy jungle rain." },
    wStorm: { type: "CHECKBOX", init: true, name: "Storms", description: "Allow thunderstorms." },
    wFog: { type: "CHECKBOX", init: true, name: "Fog", description: "Allow fog." },
    wSnow: { type: "CHECKBOX", init: true, name: "Snow", description: "Allow snow." },
    wBlizzard: { type: "CHECKBOX", init: true, name: "Blizzards", description: "Allow blizzards." },
    wSandstorm: { type: "CHECKBOX", init: true, name: "Sandstorms", description: "Allow sandstorms." },

    leaLightSize: { type: "BUTTON_GROUP", enum: { S: 0, M: 1, L: 2, XL: 3 }, init: 3,
      buttonNames: ["Small", "Medium", "Large", "Huge"], name: "Lea's light size", description: "How far the glow around Lea reaches at night." },
    lightStrength: { type: "OBJECT_SLIDER", data: range(0.3, 1.5, 0.1), init: 1, customNumberDisplay: show(pct),
      name: "Light brightness", description: "How bright the lights on Lea, the party and townsfolk are." },

    clock12h: { type: "CHECKBOX", init: false, name: "12-hour clock", description: "Show 1-12 instead of 0-23 (the sun and moon icon shows day or night)." },
    clockDay: { type: "CHECKBOX", init: true, name: "Show day and season", description: "The tab under the clock with the season and day number." },
    clockWeatherIcon: { type: "CHECKBOX", init: true, name: "Show weather icon", description: "The small icon for the current weather on the clock." },
    clockBar: { type: "CHECKBOX", init: true, name: "Show day bar", description: "The coloured bar that fills up over the day." },

    chestNormal: { type: "CHECKBOX", init: true, name: "Normal chests", description: "Show brown chests (ordinary treasure)." },
    chestLocked: { type: "CHECKBOX", init: true, name: "Locked chests", description: "Show bronze, silver and gold padlock chests." },
    chestKey: { type: "CHECKBOX", init: true, name: "Key chests", description: "Show chests holding a dungeon key or master key." },
    markerSize: { type: "BUTTON_GROUP", enum: { SMALL: 0, NORMAL: 1, LARGE: 2, HUGE: 3 }, init: 1,
      buttonNames: ["Small", "Normal", "Large", "Huge"], name: "Marker size", description: "Size of the chest and quest markers on the area map, minimap and close-up." },

    mmFrame: { type: "BUTTON_GROUP", enum: { CLASSIC: 0, BLUE: 1, GOLD: 2, SILVER: 3 }, init: 0,
      buttonNames: ["Classic", "Blue", "Gold", "Silver"], name: "Frame", description: "Colour of the minimap's frame and name tab. Classic matches the health bar." },
    mmBg: { type: "BUTTON_GROUP", enum: { NAVY: 0, BLACK: 1, GREY: 2, CLEAR: 3 }, init: 0,
      buttonNames: ["Navy", "Black", "Grey", "See-through"], name: "Background", description: "What shows where there's no room." },
    mmGrid: { type: "CHECKBOX", init: true, name: "Grid", description: "Faint grid lines of the area map's squares behind the rooms." },
    mmChests: { type: "CHECKBOX", init: true, name: "Show chests", description: "Chest markers on the minimap (same rules as the area map)." },
    mmQuests: { type: "CHECKBOX", init: true, name: "Show quest markers", description: "Quest givers' ! on the minimap." },
    mmLea: { type: "CHECKBOX", init: true, name: "Show Lea", description: "Lea's head in the middle of the minimap." },

    hairElement: { type: "CHECKBOX", init: true, name: "Elemental hair",
      description: "Lea's hair takes the colour of the element she has equipped: Heat red-orange, Cold icy blue, Shock purple, Wave green. Neutral keeps her own blue." },
    hairStrength: { type: "OBJECT_SLIDER", data: range(0.25, 1, 0.05), init: 1, customNumberDisplay: show(pct),
      name: "Hair colour strength", description: "100%: the element's full colour. Lower blends it with her own blue." },
    hairPortraits: { type: "CHECKBOX", init: true, name: "Portraits too",
      description: "Also recolour Lea's hair in her dialogue portraits, the main menu, the status screen, the party heads on the HUD and the save files." },
    restartButton: { type: "CHECKBOX", init: true, name: "Restart button",
      description: "A Restart game button in the pause menu and on the title screen: reloads the game (and every mod) without closing it, for trying out mod updates." },
    restartResume: { type: "CHECKBOX", init: true, name: "Save my spot first",
      description: "When you restart, save your exact spot to the autosave first, so Continue on the title screen picks up right there. (Not in cutscenes.)" },
    titleElement: { type: "CHECKBOX", init: true, name: "Element button on title screen",
      description: "A button on the title screen that switches Lea's element, recolouring her hair in the title picture." },
    mastery: { type: "CHECKBOX", init: true, name: "Elemental Mastery",
      description: "Every hit with Heat, Cold, Shock or Wave trains that element. Each mastery level (up to 10) adds a little damage to that element. Shown on the status screen." },
    masteryBonus: { type: "OBJECT_SLIDER", data: range(0.01, 0.05, 0.01), init: 0.02, customNumberDisplay: show(v => "+" + (v * 100).toFixed(1).replace(/\.0$/, "") + "%"),
      name: "Bonus per level", description: "Extra damage for that element at each mastery level (level 10 gives ten times this)." },
    masterySpeed: { type: "OBJECT_SLIDER", data: range(0.5, 3, 0.25), init: 1, customNumberDisplay: show(times),
      name: "Training speed", description: "How fast mastery grows. x1: about 50 hits for level 1 and 2750 for level 10." },
    weakIcons: { type: "CHECKBOX", init: true, name: "Weaknesses on health bars",
      description: "A small copy of the element's icon next to an enemy's health bar for each element it's weak to." },
    wildlife: { type: "CHECKBOX", init: true, name: "Wildlife",
      description: "Birds, butterflies and bats outdoors. Birds land where you've walked and fly off when you get close." },
    wlBirds: { type: "CHECKBOX", init: true, name: "Birds", description: "Small flocks by day that scatter when you come near or run at them." },
    wlButterflies: { type: "CHECKBOX", init: true, name: "Butterflies", description: "On calm, clear days (not in snowy or desert areas)." },
    wlBats: { type: "CHECKBOX", init: true, name: "Bats", description: "Flitting about at night." },
    wildlifeAmount: { type: "OBJECT_SLIDER", data: range(0.5, 2, 0.25), init: 1, customNumberDisplay: show(times),
      name: "How many", description: "More or fewer animals around." },
    questRoute: { type: "CHECKBOX", init: true, name: "Quest route",
      description: "A dotted line on the minimap and area map from Lea to where your favourite quest (or else the main story) needs her next (a tracked Bounty comes first). Goals elsewhere lead to the exit on the way." },
    routeSource: { type: "BUTTON_GROUP", enum: { STORY: 0, FAVOURITES: 1, NEAREST: 2 }, init: 0,
      buttonNames: ["Story", "Starred only", "Nearest"],
      name: "Route without a star", description: "The route always goes to your starred quests first (star a quest in the quest log; with several, the one on your HUD). With none starred: Story - the main story's next step. Starred only - no route. Nearest - the closest step of any quest you're on." },
    routeWorld: { type: "CHECKBOX", init: true, name: "Gold pin on world map", description: "On the world map, the area the route leads to gets a glowing gold pin." },
    routeMap: { type: "CHECKBOX", init: true, name: "Route on area map", description: "Show the route on the pause-menu area map, including on other areas and floors as you browse them (the part of the way that crosses them)." },
    mmDest: { type: "CHECKBOX", init: true, name: "Show destination", description: "Where the route leads, after the area's name on the minimap's name tab (another area, or the room in this one)." },
    enemyNotebook: { type: "CHECKBOX", init: true, name: "Enemy notebook", description: "The first time you meet an enemy type, a card slides in with its name, level, HP, weaknesses and resistances." },
    monsterCards: { type: "CHECKBOX", init: true, name: "Monster cards", description: "Earn a collectible card for every enemy you defeat for the first time, with shiny enemies (1 in 50), medals, area-set rewards, card levels (every card is always at Lea's level, gaining arrows and stats as she levels) and an equippable card with its own unique abilities. View them in Menu > Records > Cards. Takes effect after a restart." },
    cardDuels: { type: "CHECKBOX", init: true, name: "Card games and trades", description: "Some townspeople (a little card floats over their heads) play an arrow card game with your monster cards and trade cards. Spare copies drop from enemies whose card you have. Takes effect after a restart." },
    champions: { type: "CHECKBOX", init: true, name: "Champion enemies", description: "About 1 in 25 ordinary enemies is a champion: Armoured, Mighty or Regenerating (sometimes two), with a coloured aura and a name tag. Beat one for bonus Credits and a spare card with extra arrows." },
    cardTourneys: { type: "CHECKBOX", init: true, name: "Card tournaments", description: "Three card players host a cup once a day: three no-stakes rounds against stronger and stronger players, the last against the host. Win for Credits, a trophy and a card with top arrows." },
    elementOrbs: { type: "CHECKBOX", init: true, name: "Element orbs", description: "About a hundred glowing orbs wait around the world near treasure; touch one in its own element mode to take it. Menu > Enhanced > Orbs lists them by area. Every 10 of an element: +2% damage in that mode. A full area: Credits and an orb frame for its cards. Half of an element unlocks its orb ability, all of it doubles it. All of them: a prismatic shiny card. An orb trader turns up somewhere new each day and marks an orb on your map for Credits. Takes effect after a restart." },
    orbCompass: { type: "CHECKBOX", init: true, name: "Orbs on the minimap", description: "The minimap shows element orbs still waiting in your room as small coloured dots, once Lea has been near them (see Orb discovery range). Orbs you have been near stay marked on the area map too, until you pick them up." },
    orbRange: { type: "OBJECT_SLIDER", data: range(3, 30, 1), init: 8, customNumberDisplay: show(v => v + " tiles"), name: "Orb discovery range", description: "How close Lea needs to get to an element orb for it to appear on the minimap." },
    orbEdge: { type: "CHECKBOX", init: false, name: "Orb edge marker", description: "When the nearest orb in your room is off the minimap, a coloured orb on the minimap's border points the way to it." },
    orbMagnet: { type: "OBJECT_SLIDER", data: range(0, 5, 1), init: 3, customNumberDisplay: show(v => v ? v + (v === 1 ? " tile" : " tiles") : "Off"),
      name: "Orb magnetism", description: "How close you need to be (in its element mode, on its floor) for an orb to drift over to you. Off: walk right up to it." },
    orbLabels: { type: "CHECKBOX", init: true, name: "Element hints", description: "When you're near an orb in the wrong element mode, a label over it says which mode it needs." },
    orbAreaMap: { type: "CHECKBOX", init: false, name: "Show orbs left on the area map", description: "The area map also shows the orbs you haven't found yet, as unlit orbs. Off keeps the hunt a surprise." },
    orbFoundMap: { type: "CHECKBOX", init: false, name: "Show found orbs on the area map", description: "The area map marks where you found each orb, as a lit orb. Off keeps the map clear." },
    orbWorldMap: { type: "CHECKBOX", init: true, name: "Finished areas on the world map", description: "Areas where you've found every orb get a small gold orb on their world map pin." },
    orbDoneLast: { type: "CHECKBOX", init: false, name: "Finished areas last", description: "On the Orbs page, areas with every orb found move to the end of the list (otherwise areas are in the order you usually reach them)." },
    cardCompanion: { type: "CHECKBOX", init: true, name: "Companions", description: "The monster of your equipped card fights beside you in the wilds, at your level. Its health shows under your party; if it's beaten it rests for a minute. (The card's abilities still apply.)" },
    cardCollector: { type: "CHECKBOX", init: true, name: "Card collector", description: "A collector on Rookie Harbor's plaza rewards every 25 cards you collect (Credits and packs), and makes you a Master Collector at all of them: 20000 Credits and a gold frame on every card." },
    cardRival: { type: "CHECKBOX", init: true, name: "Card rival", description: "Ryder, your card rival, waits in the newest town you've reached for your level and gets stronger every time you beat them. Marked on your maps." },
    orbTrials: { type: "CHECKBOX", init: true, name: "Trial Fountain", description: "Find every orb of one element in an area to open its trial at the fountain in Rookie Harbor's plaza: an arena with three waves of enemies in 3 minutes, with some health back between waves. Fight in that element for extra damage. The first clear pays Credits and a rare card with top arrows; replays pay a little and keep your best time." },
    hideout: { type: "CHECKBOX", init: true, name: "Lea's hideout", description: "The old storeroom in north Rookie Harbor is Lea's own room: a bed to sleep till morning for free, a desk, a TV with the news, trophies for what you've done and your favourite companions hanging out. Go there from Menu > Enhanced > Hideout. Off: the menu entry and everything in the room that you can use are gone (the furniture stays)." },
    skipBeginning: { type: "CHECKBOX", init: true, name: "Offer to skip the beginning", description: "When you start a New Game, ask whether to play from the start or skip the opening story (the hideout and the cargo ship tutorial) and begin outside the first dungeon at Rhombus Square, which you still play. Off: New Game just starts as normal." },
    skipIntro: { type: "CHECKBOX", init: true, name: "Skip intro", description: "Go straight to the title menu when the game starts: no logos, no opening animation, no Press Start." },
    bestiaryNotes: { type: "CHECKBOX", init: true, name: "Bestiary field notes", description: "Adds a Field notes page to every enemy in Menu > Enemies: where it lives, how to beat it, its night form and your record against it. Takes effect after a restart." },
    mmRoute: { type: "CHECKBOX", init: true, name: "Show quest route", description: "Show the tracked quest's route on the minimap." },
    autoUnstick: { type: "CHECKBOX", init: true, name: "Auto rescue",
      description: "If a high jump or long hop lands Lea off the map, send her straight back to where she took off." },
    wellRested: { type: "CHECKBOX", init: true, name: "Well Rested", description: "A full night's sleep in the hideout bed gives +10% EXP for the whole next in-game day." },
    areaMastery: { type: "CHECKBOX", init: true, name: "Area Mastery", description: "Every area has up to four stars: all its chests, all its orbs, its whole card set and a champion beaten there. Each star pays Credits; all of an area's stars make it your home turf (+10% damage, -10% damage taken there). Menu > Enhanced > Area Mastery." },
    aimAssist: { type: "OBJECT_SLIDER", data: { 0: 0, 1: 1, 2: 2, 3: 3 }, init: 2, customNumberDisplay: show(v => ["Off", "Light", "Medium", "Strong"][v]),
      name: "Aim assist", description: "While aiming, the crosshair is gently pulled onto the nearest enemy close to where you're pointing. Only enemies: puzzles and switches aim as normal." },
    aimAssistMouse: { type: "CHECKBOX", init: false, name: "Aim assist with the mouse", description: "Also pull the crosshair when aiming with the mouse. Off: aim assist only helps the controller's right stick." },
    goldMenus: { type: "CHECKBOX", init: true, name: "Gold menus", description: "The game's buttons, boxes and panels get the mod's gold trim, and the orange highlight on whatever's selected turns bright gold. Takes effect the next time the game starts." },
    menuFx: { type: "CHECKBOX", init: true, name: "Lively buttons", description: "The selected button gets a shimmer sweeping across it and a few gold motes drifting off it; pressing a button gives it a little squash and a gold flash; menus slide their buttons in one after another." },
    menuTint: { type: "CHECKBOX", init: true, name: "Menus follow the sky", description: "The dark backdrop behind the pause menu and the main menu takes a faint tint from the world: warm at sunrise and sunset, deep blue at night, grey-blue in the rain, red under a Blood Moon." },
    pauseInfo: { type: "CHECKBOX", init: true, name: "Pause menu info", description: "A slim strip at the bottom left of the pause menu with the day, season, time, weather and your Credits." },
    whatsNew: { type: "CHECKBOX", init: true, name: "What's new after updates", description: "After each update of the mod, the Guide opens once on the title screen at its What's new page." },
    titleIntro: { type: "CHECKBOX", init: true, name: "Logo intro", description: "When the game starts (with Skip intro on), the logo builds in on the title screen: a gold line draws its outline, it fills in, then ENHANCED fades in and the buttons slide in one by one." },
    titleMood: { type: "CHECKBOX", init: true, name: "Music follows the sky", description: "The title music takes the sky's mood: softer and muffled at night, darker with an echo under the Blood Moon, hazy in the Eclipse, a little rough in a Tempest." },
    titleSeasons: { type: "CHECKBOX", init: true, name: "Seasons on the title", description: "The title screen shows your last save's season: blossom drifting in spring, pollen in summer, falling leaves in autumn, a light snowfall in winter." },
    circuitBoard: { type: "CHECKBOX", init: true, name: "One big circuit board", description: "The Circuit menu shows all five element trees joined together as one board: once you've picked a tree, move anywhere on the board with the left stick (or drag with the mouse) and the tree under the cursor becomes the active one. Off: one tree at a time, as in the game." },
    equipCompare: { type: "CHECKBOX", init: true, name: "Compare new gear", description: "When you pick up equipment (chests, drops, rewards), its item pop-up shows how it compares with what Lea is wearing: green for better stats, red for worse, and UPGRADE when it's better all round." },
    walkSpeed: { type: "OBJECT_SLIDER", data: range(0.8, 1.6, 0.05), init: 1, customNumberDisplay: show(times),
      name: "Walking speed", description: "How fast Lea moves. x1 is normal." }
  };

  // the menu: tab -> section -> options, in order
  // every tab starts with its own on/off switches, in a gold "On / Off" section, so they're easy to find
  const ON = "\\c[3]On / Off\\c[0]";
  const LAYOUT = [
    ["general", "General", "general", {
      [ON]: ["info", "skipIntro", "skipBeginning"],
      "Presets": ["presetLight", "presetDefault", "presetEverything"],
      "Restart": ["restartButton", "restartResume"],
      "Look": ["goldMenus", "menuFx", "menuTint", "pauseInfo", "hudFade"],
      "Title screen": ["titleIntro", "titleMood", "titleSeasons", "whatsNew"]
    }],
    ["time", "Time", "general", {
      [ON]: ["seasons", "moonPhases", "inns"],
      "Day and night": ["dayLength", "nightDarkness", "nightTint", "sunrise", "sunset", "timeIndoors", "startHour"],
      "Seasons": ["seasonDays", "winterSnow"],
      "Moon": ["moonCycle", "moonBright", "moonCombat"],
      "Inns": ["innCost"]
    }],
    ["weather", "Weather", "general", {
      [ON]: ["effects", "weatherEvents", "forecast", "sound"],
      "Weather": ["weatherIntensity", "lightningFlash", "weatherMin", "weatherMax", "freakChance"],
      "Weather events": ["eventChance"],
      "Weather types": ["wCloudy", "wRain", "wDownpour", "wStorm", "wFog", "wSnow", "wBlizzard", "wSandstorm"],
      "Sound": ["soundVolume", "musicDuck", "indoorRain", "thunder"]
    }],
    ["night", "Ambience", "general", {
      [ON]: ["wildlife"],
      "Night lights": ["playerLight", "leaLightSize", "partyLights", "npcLanterns", "lightStrength"],
      "Wildlife": ["wlBirds", "wlButterflies", "wlBats", "fireflies", "wildlifeAmount"]
    }],
    ["clock", "Clock", "interface", {
      [ON]: ["clockMode"],
      "Clock": ["clockPlace", "popupSeconds", "popupInfo"],
      "Look": ["clock12h", "clockDay", "clockWeatherIcon", "clockBar"]
    }],
    ["maps", "Area map", "general", {
      [ON]: ["mapChests", "questGivers", "questRoute"],
      "Treasure": ["mapInfo", "reveal", "range", "showOpened", "chestNormal", "chestLocked", "chestKey"],
      "Rooms": ["mapTrueScale", "mapDetail", "mapDetailStrength", "mapSharpen", "mapOutline"],
      "Markers": ["showLea", "markerSize", "routeMap", "routeWorld", "routeSource"],
      "Close-up": ["closeupPad"]
    }],
    ["minimap", "Minimap", "interface", {
      [ON]: ["minimap"],
      "Layout": ["mmPos", "mmSize", "mmZoom"],
      "Look": ["mmFrame", "mmBg", "mmGrid", "mmOpacity", "mmDetail", "mmName"],
      "Shows": ["mmChests", "mmQuests", "mmRoute", "mmDest", "mmLea", "mmEnemies", "shinyMarkers", "champMarkers", "orbCompass", "orbRange", "orbEdge", "mmCardPlayers", "mmIcons"],
      "Chest compass": ["mmCompass", "mmCompassRange", "mmCompassHide", "mmCompassFind", "mmCompassSkip"]
    }],
    ["cards", "Cards", "general", {
      [ON]: ["monsterCards", "cardCompanion", "cardCollector", "cardDuels", "cardTourneys", "cardRival"]
    }],
    ["extras", "Lea", "general", {
      [ON]: ["hairElement", "highJump", "autoUnstick", "elementOrbs", "orbTrials", "hideout", "areaMastery", "wellRested"],
      "Hair": ["hairStrength", "hairPortraits", "titleElement"],
      "Jumping": ["highJumpTiles", "gapJump"],
      "Walking": ["walkSpeed"],
      "Element orbs": ["orbMagnet", "orbLabels", "orbAreaMap", "orbFoundMap", "orbWorldMap", "orbDoneLast"]
    }],
    ["combat", "Combat", "arena", {
      [ON]: ["mastery", "nightEnemies", "weatherCombat", "champions", "weakIcons", "enemyNotebook", "bestiaryNotes"],
      "Elemental Mastery": ["masteryBonus", "masterySpeed"],
      "Night-time enemies": ["toughness", "rareDrops", "credits", "exp", "bosses"],
      "Weather in combat": ["weatherCombatStrength"],
      "Aiming": ["aimAssist", "aimAssistMouse"],
      "Gear": ["equipCompare"],
      "Circuits": ["circuitBoard"]
    }],
    ["keys", "Controls", "controls", {
      [ON]: ["quickRingStyle"],
      "Keyboard": ["keyClock", "keyToggle", "keyPeek", "keyRoomView", "keyUnstick"],
      "Clear keyboard keys": ["clearClock", "clearToggle", "clearPeek", "clearRoomView", "clearUnstick", "clearAll"]
    }]
  ];
  function findOption(id) {
    if (NEW[id]) return NEW[id];
    for (const tab of Object.values(POOL)) for (const h of Object.values(tab.headers)) if (h[id]) return h[id];
    return null;
  }
  function buildOptions(withKeys) {
    const out = {}, used = new Set();
    for (const [key, title, icon, sections] of LAYOUT) {
      const headers = {};
      for (const [hname, ids] of Object.entries(sections)) {
        const h = {};
        for (const id of ids) {
          const o = findOption(id);
          if (!o) { console.warn("[CrossCode Enhanced] no option " + id); continue; }
          if (!withKeys && o.type === "CONTROLS") continue;
          h[id] = o; used.add(id);
        }
        if (Object.keys(h).length) headers[hname] = h;
      }
      out[key] = { settings: { title, tabIcon: icon }, headers };
    }
    // anything not placed still works: put it at the end of General so it can't get lost
    const rest = {};
    for (const tab of Object.values(POOL)) for (const h of Object.values(tab.headers)) for (const [id, o] of Object.entries(h))
      if (!used.has(id) && !(o.type === "CONTROLS" && !withKeys)) rest[id] = o;
    if (Object.keys(rest).length) out.general.headers["Other"] = rest;
    return out;
  }
  // presets: everything back to its default, then the preset's own values (keys are left alone)
  function preset(name, values) {
    const O = window.wdnOptions;
    if (!O || !window.sc || !sc.Dialogs) return;
    sc.Dialogs.showYesNoDialog("Apply the \\c[3]" + name + "\\c[0] preset? This changes all of this mod's settings (not your keys).",
      sc.DIALOG_INFO_ICON.QUESTION, btn => {
        if (btn.data !== 0) return;
        try {
          for (const [id, o] of Object.entries(O.flatOpts || {})) {
            if (o.type === "INFO" || o.type === "BUTTON" || o.type === "CONTROLS" || !("init" in o) || o.init === undefined) continue;
            O[id] = o.init;
          }
          for (const [id, v] of Object.entries(values)) O[id] = v;
          try { modmanager.gui.optionsMenu.reopenMenu(); } catch (e) {}
        } catch (e) { console.error("[CrossCode Enhanced] preset", e); }
      });
  }

  // The game's key binder can replace a key but never remove one, so do it here:
  // unbind the key from the input system and mark both slots empty (the binder shows them as "None").
  function clearKeys(names) {
    try {
      for (const n of names) {
        const id = "keys-cc-weather-daynight-" + n, v = sc.options.values[id];
        if (!v) continue;
        for (const slot of ["key1", "key2"]) {
          const code = v[slot];
          if (code !== undefined && code !== null && ig.input.bindings[code] === id.substr(5)) ig.input.unbind(code);
          v[slot] = undefined;
        }
      }
      sc.options.hasChanged = true;
      sc.options.persistOptions();
      try { modmanager.gui.optionsMenu.reopenMenu(); } catch (e) {}
    } catch (e) { console.error("[CrossCode Enhanced] couldn't clear keys", e); }
  }

  function register(withKeys) {
    if (window.wdnOptions) return true;
    const mm = window.modmanager;
    if (!mm || typeof mm.registerAndGetModOptions !== "function") return false;
    const opts = buildOptions(withKeys);
    window.wdnOptions = mm.registerAndGetModOptions({ modId: "cc-weather-daynight", title: "Enhanced" }, opts);
    window.treasureMapOptions = window.wdnOptions;   // the map and minimap settings live in the same menu
    window.wdnOptionsHaveKeys = withKeys;
    console.log("[CrossCode Enhanced] settings added to the mod manager" + (withKeys ? "" : " (keys use F6-F8)"));
    return true;
  }
  // If the mod manager wasn't ready yet, poststart.js tries again (without rebindable keys this session).
  window.wdnRegisterOptions = () => register(false);
  try { register(true); } catch (e) { console.error("[CrossCode Enhanced] couldn't add settings", e); }

  // "Gold menus": the game's two menu sprite sheets swapped for gold-trimmed copies as they load (the game loads
  // its pictures after this runs, so every menu, the title screen and the pause menu all get them)
  try {
    const GOLD = {};
    for (const f of ["buttons", "menu", "message", "status-gui", "arena-gui", "circuit", "map-icon"]) GOLD["media/gui/" + f + ".png"] = "media/gui/wdn-gold/" + f + ".png";
    window.wdnGoldSheets = Object.keys(GOLD);
    const on = !(window.wdnOptions && window.wdnOptions.goldMenus === false);
    window.wdnGoldOn = on;
    if (on && window.ig && ig.Image) ig.Image.inject({
      loadInternal(a) {
        const p = this.path, g = GOLD[p];
        if (!g) return this.parent(a);
        this.path = g;
        try { return this.parent(a); } finally { this.path = p; }
      }
    });
  } catch (e) { console.error("[CrossCode Enhanced] gold menus", e); }

  // The loading screen before the title: the mod's logo saying ENHANCING, filling up with white as the game
  // loads, then a flash and a glow before the title comes up (the pictures are built in, as the game can't load
  // pictures of its own while it's still loading)
  try {
    if (window.sc && sc.StartLoader && !sc.StartLoader.prototype.__wdnBar && !(window.wdnOptions && window.wdnOptions.goldMenus === false)) {
      sc.StartLoader.prototype.__wdnBar = true;
      const pic = d => { const im = new Image(); im.src = "data:image/png;base64," + d; return im; };
      const BASE = pic("iVBORw0KGgoAAAANSUhEUgAAAPIAAAA3CAYAAAA2TRejAAAFHUlEQVR42u2dMW4jMQxFtYaOsI0NpJmbpMkhfAO72MbnSOPCuUEOkSY3CbAwkDS+Q7ZIlFUmoxEpkSPO+D8gwC6EkURSlCiJ43EOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFjh95/XU005AMCAE//5+/6ectZcOQDX6DPhr6Q8hy/p0Paw3j09O7c9rHeP7tU559zluNlTyqVX/j5xP1Jl3LZq6pR+jqtLDT1o26nflnUZqD4T/v/oXn/IN1au4sgxwVlTjefKKYaIBaQQJo6h58b60FemRJ1j9ZY+x9FlSdvcdjXsFLdlXQbKhBIWtkBY4GL5UuUqjhw3+rK/+XDW0/lb47ly7gCMBaQw9lyqD0PKrK0zV2/pc1RdlrTNbVfLTkPjyaoMlAkl9ofu0x8o5Sor8lCjzn38u4ucdayc2054nhUlnM7u7nb42afTOav8/jP9vsflHLmoz6X0zJVjTCYJPWjaaUg/VmXgrp4v+5v/z92/PYyWM+pd1W7iu0+DDHWqX84JQ172N2zFfini2RU9a+FAJOfEsYzbw3rX4kBRwk7WdF0z1lJ2uBw3+8f7t4e72++TSPxcrpxq31XNAIudNFfOdeLaiSU1q7d0AElqZKnVg4SdWsovJQNnfGvjLTgxRWFUQrhGCm0KTgdb0Z3Ooo6joQdJO81Fhtz4vhw3+6+9fmTDfog9Wk6QzTvjIWUX7aVIJ4mfSllSWB108CTszCUswU6SMlAmjymc2VtejXP7b6mZfNbhdcWKJKUHLTtZl0EiAoj7X2NjbzmkLr18dwuCu0q0Zgl20thupVbloSilJPLypQdPUx94jBm+RPG5awDtDDQuNUaeUg/NIxNBGaTHnGaI7UvDj6FQQGs1zu2lSg86cmGNVP+krp2mcIQlbDMkzyykx5xWiO0th9Sh87UZNtonv9yEjNb75M7AoZm1U3xOdlhpGqVmiO3dDGZax8iwyUUTfeUERyjdh2o6hMYhkpYeWpwbaMlAiY5qDhk1QuwVJRulv9rmylsmB7iFZnOFmTqV7AJ0r6amSC6qyZJccQdW6/1cLUOOYD2tc3tY78LfNevBmgzSzpxbkMba8y0TvSUzbWpD0FLD5/pXM6BSe/B+nZL6n/veuVYGrdsB7Vsh3yqlTPoONYQbuZlR0lCU/tW2ozWYphiw2mjJENc75SRXcyvk52IwyUt86QEw1r9cOy23KXDm/GGU5KSseSvkWyZ6t862ccrZQFNmLy0l7dSSPWM9SpxPaF7trkYFmehdyiZGMn4C3J3O2b9r0ENLGS7HzX4ub8f5lone177K1L6FYyUkXoKdtGXQTrTyLRO9Ke1wU++oJ9cU2SyfDUhdRXH1kLK3lp0sy2DFiUkrsoX9MjUVkjvALTozxXipLUvpywNSetCykxUZSuqc6gUkb+FdSoohqEIGIyzhPtTN8KSYY6eW6aASMrS6air+zS7KgYLEgUOLw5eWBz6ls7BGnzl1Wj0km1qGnLNN+QKSt/Au5Vg7riBtL16ZpTO1OuF6JRxBo88kRxCwE7V/VmWw8MN71aF1UFQqPbJfThU4dSHPOUQZ/DpBog+59krqzNU79ptVFF3l6qaUl+ghfk7LTnOSgbNdHJoAcuXUvvyq2byHWTVuNFeu/asbc/r20xTfdpriu0nSdpqbDOxvP/X8IVfupvga45ACcuUAOHyN0Ul+jRHfRwYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICf/APdUJ24/az7AQAAAABJRU5ErkJggg=="), FILL = pic("iVBORw0KGgoAAAANSUhEUgAAAPIAAAA3CAYAAAA2TRejAAACfUlEQVR42u3c226EIBAAUCX7/79sX7rJttnWFRgZ8ZxX42UGuQTQZQEAAAAAAAAAAAAAAAAAyGX7Vnsc1Jd+9WWtfagfF1nX9cjxlnvtBvRyr5rnOBLbkbhqzvsr9qP5jMjD2eWUPYbW8q99r55Ka0uzd9PaSlzbQj3PufpoYK/1vkpPM0Nv2aMc/mu4PjnevSJHtyytL+rznp+06rNW9Mhzs+QzQwwtI83eHtkqcXTCtm3bMhXAkRz0rDgReTg7r1eL4bUM3z373vHQoXV0S3vFSheVg0y5mKGcRsQQNcQumXvjqMTOMsRujaNXHkZW4qvHsPf8n8ZXMg+pkc87lmnIrHWvFmO23myWij3D6OSKMfQeYpcMS01egLHPpDLnf/694yXzkLp34YzqzSJfspprzzBcv0MMR2J8zNDSfhLw68zv6zVblzAiK2nEyxqVhxEVIDqG/8q254RujyWpUru5Ykm0LHK3WWgTYNeZTT6rhy53nOj6a//03T7ymCEPI2PofY+W+vbosYMmclh2Vu9TWyi9N+J/ktff1+yZfxNfMTvphq4jR2/0Hr1d7oxrtN5ne8Ok0TkxrL9knvwqy2JhPsN9RvaEKvMyfNWjdVWojP78ChN+dy+vHku7JcO3lNYj94d17+iVF7P5LUPrs2az79LL1H6Fk+XFNUE2/pv+km175t5vg7TkOfIwopxmiCFqt2TJ8C1lhtYyS2Uevcss6y63DDFEfzbacv3HEviHhtr1zXdreEd3PZn8GfPXkqvtTmuJIdOnjCXLz/YyFPSIe7a+NJH7sa8+WRgdQ6a/aK7ZxvqwWG5ap95UDgAAAAAAAAAAAAAAAABcyRePO/RFzkPbZwAAAABJRU5ErkJggg=="), GLOW = pic("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");
      const LW = 242, LH = 55, END = 1.6;
      const ready = () => BASE.complete && FILL.complete && GLOW.complete && BASE.naturalWidth > 0;
      // (and the mod loader's own "Loading Game" line under the game is hidden: the logo says it)
      const hideStatus = () => { for (const w of [window, window.parent, window.top]) { try { const el = w && w.document && w.document.getElementById("status"); if (el) el.style.visibility = "hidden"; } catch (e) {} } };
      hideStatus();
      sc.StartLoader.inject({
        draw() {
          hideStatus();
          if (!ready()) return this.parent();
          try {
            this._drawStatus = this._drawStatus + (this.status - this._drawStatus) / 5;
            const g = ig.system.scale, C = ig.system.context, W = ig.system.width, H = ig.system.height;
            const x = Math.floor((W - LW) / 2), y = Math.floor((H - LH) / 2);
            ig.Timer.step(); const dt = this.timer.tick();
            let p = this.prevResourcesCnt ? 0.6 + 0.4 * this._drawStatus : 0.6 * this._drawStatus;
            const t = this.endTimer > 0 ? END - this.endTimer : -1;   // (the finish: fill, flash, glow, fade)
            if (t >= 0) p = Math.max(p, Math.min(1, p + t / 0.25));
            C.save(); C.imageSmoothingEnabled = false;
            C.globalAlpha = 1; C.globalCompositeOperation = "source-over";
            C.fillStyle = "#000"; C.fillRect(0, 0, ig.system.contextWidth, ig.system.contextHeight);
            C.drawImage(BASE, x * g, y * g, LW * g, LH * g);
            const fw = Math.round(LW * Math.max(0, Math.min(1, p)));
            if (fw > 0) C.drawImage(FILL, 0, 0, fw, LH, x * g, y * g, fw * g, LH * g);
            if (t >= 0.2) {
              const f = Math.max(0, 1 - (t - 0.2) / 0.35), pulse = 0.55 + 0.45 * Math.sin(Math.min(1, (t - 0.2) / 0.8) * Math.PI);
              C.globalCompositeOperation = "lighter";
              const s = 1 + 0.06 * Math.min(1, (t - 0.2) / 0.8);
              C.globalAlpha = Math.min(1, pulse);
              const GP = 24, gw = (LW + GP * 2) * s, gh = (LH + GP * 2) * s;   // (the glow has room round it)
              C.drawImage(GLOW, (x + LW / 2 - gw / 2) * g, (y + LH / 2 - gh / 2) * g, gw * g, gh * g);
              if (f > 0) { C.globalAlpha = f; C.drawImage(FILL, x * g, y * g, LW * g, LH * g); C.globalAlpha = f * 0.18; C.fillStyle = "#fff"; C.fillRect(0, 0, ig.system.contextWidth, ig.system.contextHeight); }
              C.globalCompositeOperation = "source-over";
            }
            if (t >= 1.1) { C.globalAlpha = Math.min(1, (t - 1.1) / 0.5); C.fillStyle = "#000"; C.fillRect(0, 0, ig.system.contextWidth, ig.system.contextHeight); }
            C.restore();
            if (this.endTimer > 0) { this.endTimer -= dt; if (this.endTimer <= 0) this.finalize(); }
          } catch (e) { console.error("[CrossCode Enhanced] loading screen", e); this.endTimer = 0; this.finalize && this.done && this.finalize(); }
        },
        onEnd() { if (!ready()) return this.parent(); this.gameObjectCreated ? (this.endTimer = END) : this.finalize(); }
      });
    }
  } catch (e) { console.error("[CrossCode Enhanced] loading screen", e); }

  // "Skip intro": set up here, before the game starts, so the studio logo never gets a frame on screen.
  // The logo sequence ends on its first update (before anything is drawn); poststart.js then fast-forwards
  // the title animation and presses start.
  try {
    if (window.ig && ig.GUI && ig.GUI.IntroScreen && !ig.GUI.IntroScreen.prototype.__wdnSkip) {
      ig.GUI.IntroScreen.prototype.__wdnSkip = true;
      ig.GUI.IntroScreen.inject({
        update() {
          const O = window.wdnOptions;
          if (!(O && O.skipIntro === false) && this.timer >= 0) {
            window.wdnAutoStart = true;
            try { this.end(); return; } catch (e) {}
          }
          this.parent();
        },
        updateDrawables(r) {   // and draws nothing while it's being skipped
          const O = window.wdnOptions;
          if (!(O && O.skipIntro === false)) return;
          this.parent(r);
        }
      });
    }
  } catch (e) { console.error("[CrossCode Enhanced] skip intro", e); }

  // The title screen's logo gets the mod's name under it: "ENHANCED" in the logo's own style, added to the
  // title animation (it fades in, rises and fades out exactly with the CrossCode logo)
  try {
    if (window.ig && ig.Parallax && !ig.Parallax.prototype.__wdnTitle) {
      ig.Parallax.prototype.__wdnTitle = true;
      ig.Parallax.inject({
        onload(data) {
          try {
            if (data && data.entries && data.sequence && data.entries.some(e => e && e.name === "logoFill") && !data.entries.some(e => e && e.name === "wdnSub")) {
              const at = data.entries.findIndex(e => e && e.name === "logoFill");
              data.entries.splice(at + 1, 0, { name: "wdnSub", gfx: "media/gui/wdn-title-sub.png", align: { x: "CENTER", y: "CENTER" }});
              const seq = [];
              for (const st of data.sequence) { seq.push(st); if (st && st.entry === "logoFill") seq.push(Object.assign(JSON.parse(JSON.stringify(st)), { entry: "wdnSub" })); }
              data.sequence = seq;
              // the title's sky theme (Classic, Blood Moon, Sunset or Night): the one picked last time is drawn from
              // the start; poststart.js changes it live when the picker or the Auto setting asks for another
              let theme = "classic";
              try { theme = localStorage.getItem("wdn-title-theme-now") || "red"; } catch (e) {}
              if (!/^(classic|red|sunset|night|eclipse|tempest)$/.test(theme)) theme = "classic";
              const LAYER = { sky: "sky", clouds1: "clouds-1", clouds2: "clouds-2", ground: "ground", railings: "railings", planet: "planet" };
              if (theme !== "classic") for (const e of data.entries) if (e && LAYER[e.name]) e.gfx = "media/parallax/title/wdn-" + theme + "/" + LAYER[e.name] + ".png";
              // two extra layers that move with Lea: a soft glow behind her in her element's colour, and the sky's
              // light on her (a see-through tint over her picture; her own picture is untouched, so her elemental
              // hair colours still work)
              const li = data.entries.findIndex(e => e && e.name === "lea");
              if (li >= 0 && !data.entries.some(e => e && e.name === "wdnLeaGlow")) {
                const glow = JSON.parse(JSON.stringify(data.entries[li])), aura = JSON.parse(JSON.stringify(data.entries[li]));
                glow.name = "wdnLeaGlow"; glow.gfx = "media/parallax/title/wdn-" + theme + "/lea-glow.png"; delete glow.renderMode;
                aura.name = "wdnAura"; aura.gfx = "media/parallax/title/wdn-aura.png"; aura.renderMode = "lighter";
                data.entries.splice(li + 1, 0, glow);
                data.entries.splice(li, 0, aura);
                const seq2 = [];
                for (const st of data.sequence) {
                  if (st && st.entry === "lea") seq2.push(Object.assign(JSON.parse(JSON.stringify(st)), { entry: "wdnAura" }));
                  seq2.push(st);
                  if (st && st.entry === "lea") seq2.push(Object.assign(JSON.parse(JSON.stringify(st)), { entry: "wdnLeaGlow" }));
                }
                data.sequence = seq2;
              }
              window.wdnTitleThemed = theme;
            }
          } catch (e) { console.error("[CrossCode Enhanced] title logo", e); }
          return this.parent(data);
        }
      });
    }
  } catch (e) { console.error("[CrossCode Enhanced] title logo", e); }
})();

// ---------- the Chef's Vault: the mod's own gear and food (data/wdn-shop.json) ----------
// They're added to the end of the game's item list as it loads, so they work like any other item (each
// carries a wdnKey so the mod can find it again). The food uses a few buff types the game doesn't have.
(() => {
  try {
    if (!window.sc || !sc.STAT_CHANGE_SETTINGS || !sc.STAT_PARAM_TYPE) return;
    const T = sc.STAT_PARAM_TYPE, S = sc.STAT_CHANGE_SETTINGS, MOD = sc.STAT_CHANGE_TYPE.MODIFIER;
    for (const k of ["CRITICAL_DMG", "DASH_INVINC", "DROP_CHANCE", "MONEY_PLUS", "XP_PLUS"]) if (!T[k]) T[k] = { key: k };
    const add = (id, type, value, icon, grade) => { if (!S[id]) S[id] = { change: MOD, type: T[type], value, icon, grade }; };
    add("WDN-CRIT-2", "CRITICAL_DMG", 0.25, "stat-focus", "stat-rank-2");
    add("WDN-CRIT-3", "CRITICAL_DMG", 0.4, "stat-focus", "stat-rank-3");
    add("WDN-DASH-3", "DASH_INVINC", 0.4, "stat-dash", "stat-rank-3");
    add("WDN-DROP-3", "DROP_CHANCE", 0.5, "stat-default", "stat-rank-3");
    add("WDN-MONEY-3", "MONEY_PLUS", 0.5, "stat-money", "stat-rank-3");
    add("WDN-XP-3", "XP_PLUS", 0.5, "stat-default", "stat-rank-3");
  } catch (e) { console.error("[CrossCode Enhanced] vault buffs", e); }
  try {
    if (!window.sc || !sc.Inventory || sc.Inventory.prototype.__wdnVault) return;
    sc.Inventory.prototype.__wdnVault = true;
    sc.Inventory.inject({
      onload(b) {
        try {
          if (b && Array.isArray(b.items) && !b.items.some(it => it && it.wdnKey)) {
            $.ajax({ dataType: "json", async: false, url: ig.getFilePath(ig.root + "data/wdn-shop.json" + ig.getCacheSuffix()),
              success: d => {
                const start = b.items.length;
                for (const it of (d && d.items) || []) b.items.push(it);
                // room for more of the mod's items later (so the spare entries below never move), then the
                // Pocket Forge's spare entries: each forged copy of a piece becomes one of these
                const blank = extra => Object.assign({ type: "KEY", name: { en_US: "" }, description: { en_US: "" }, icon: "item-key", order: 99999, rarity: 0, level: 1, cost: 0, noTrack: true, noCount: true, effect: { sheet: "", name: null } }, extra);
                while (b.items.length < start + 250) b.items.push(blank({ wdnPad: true }));
                for (let k = 0; k < 160; k++) b.items.push(blank({ wdnForgeSlot: k }));
              },
              error: e => console.error("[CrossCode Enhanced] couldn't load the Chef's Vault items", e) });
          }
        } catch (e) { console.error("[CrossCode Enhanced] vault items", e); }
        return this.parent(b);
      }
    });
  } catch (e) { console.error("[CrossCode Enhanced] vault", e); }
})();
