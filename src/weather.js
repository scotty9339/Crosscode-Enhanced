// CrossCode Enhanced for CrossCode (CCLoader mod): weather, day and night, seasons and the clock
// Draws inside the game's world render pass (between the map and the GUI), so the
// title screen, HUD and menus are never darkened. Night darkness uses the game's own
// lighting engine, so the player, party members and NPCs can carry real light.

(() => {
  // ---------------- Settings (edit these) ----------------
  const CONFIG = {
    dayLengthMinutes: 24,          // real minutes for one full in-game day
    startHour: 8,                  // hour on first launch
    weatherMinMinutes: 3,          // weather lasts between min and max real minutes
    weatherMaxMinutes: 8,
    freakWeatherChance: 0.05,      // chance each weather change rolls weather from outside the area's
                                   // usual list (snow in Rookie Harbor, sandstorm in Bergen...). 0 = never
    freakWeatherMaxMinutes: 4,     // freak weather is shorter-lived than normal weather

    // Each climate has its own weather odds and keeps its own weather, so Bergen can be
    // snowing while Rookie Harbor is sunny. "areas" are map-name prefixes (first match wins).
    // Weather types: clear, cloudy, rain, storm, fog, snow, blizzard, sandstorm, downpour
    climates: {
      snowy:     { areas: ["bergen"],                                 fireflies: false,
                   weather: { clear: 0.35, cloudy: 0.20, snow: 0.30, blizzard: 0.08, fog: 0.07 } },
      desert:    { areas: ["heat", "arid"],                           fireflies: false,
                   weather: { clear: 0.65, cloudy: 0.12, sandstorm: 0.23 } },
      tropical:  { areas: ["jungle"],                                 fireflies: true,
                   weather: { clear: 0.30, cloudy: 0.15, downpour: 0.30, storm: 0.12, fog: 0.13 } },
      coastal:   { areas: ["rookie-harbor", "cargo-ship", "beach"],   fireflies: false,
                   weather: { clear: 0.40, cloudy: 0.20, rain: 0.20, storm: 0.08, fog: 0.12 } },
      forest:    { areas: ["forest"],                                 fireflies: true,
                   weather: { clear: 0.40, cloudy: 0.15, rain: 0.17, storm: 0.05, fog: 0.23 } },
      temperate: { areas: ["autumn", "rhombus-sqr", "evo-village"],   fireflies: true,     // also the fallback
                   weather: { clear: 0.50, cloudy: 0.17, rain: 0.15, storm: 0.06, fog: 0.12 } }
    },

    nightDarkness: 0.62,           // 0 = no darkness, 1 = pitch black
    weatherIntensity: 0.8,         // scales every weather effect (0.5 = subtle, 1 = full strength)
    lightningFlash: 0.12,          // brightness of lightning in storms (0 = no flashes at all)
    playerLight: true,             // glow around Lea at night
    partyLights: true,             // glow around party members
    npcLanterns: true,             // small warm lights on NPCs (towns feel lived-in)
    fireflies: true,               // drifting fireflies on clear nights

    // Night-time enemies (outdoors only; scales with how dark it is, so dusk/dawn give part of it)
    // Moon phases: one cycle every `cycleDays` in-game days. Full moon: brighter nights and better
    // night loot. New moon: darkest nights and the toughest night enemies.
    moon: { enabled: true, cycleDays: 8, fullLoot: 1.5, newToughness: 1.5, brightness: 0.25 },

    // Seasons: Spring, Summer, Autumn, Winter in turn. They shift every climate's weather odds and
    // the length of the day (long summer days, short winter days).
    seasons: { enabled: true, daysPerSeason: 7, winterSnow: true },

    // Resting at inns (Rookie Harbor, Bergen, the Cave Inn): sleep until the next 08:00 or 20:00
    inns: { enabled: true, cost: 50,
            maps: ["rookie-harbor.inner-inn", "bergen.inn", "forest.interior.inn-01", "forest.interior.inn-og-01", "forest.interior.inn-og-02"] },

    nightEnemies: {
      enabled: true,
      hp: 1.20, attack: 1.15, defense: 1.10, focus: 1.10,   // stat multipliers at full night
      rareDropBonus: 1.75,         // rare drops become this many times more likely
      credits: 1.25, exp: 1.25,    // credits and EXP multipliers for night-time kills
      rareThreshold: 0.12,         // drops with this chance or lower count as rare (most rare drops are 1-12%)
      includeBosses: false         // leave boss fights as designed
    },

    // Weather sounds (uses the game's own ambience files)
    sound: { enabled: true, volume: 1.3, indoorRain: true, thunder: true,
             musicDuck: 0.35 },          // how much to lower the music in heavy weather (0 = never)

    // Weather in combat (outdoors): elemental attacks get stronger or weaker with the weather.
    // Applies to you and to enemies. Values are damage multipliers per element.
    weatherCombat: {
      enabled: true,
      strength: 1.0,               // scales every bonus/penalty (0.5 = half, 2 = double)
      // every weather has a strength and a weakness (opposite pairs: Heat/Cold, Shock/Wave)
      effects: {
        clear:      { HEAT: 1.10, COLD: 0.90 },     // sunny day
        clearNight: { COLD: 1.10, HEAT: 0.90 },     // clear night
        cloudy:     { SHOCK: 1.10, WAVE: 0.90 },
        fog:        { WAVE: 1.10, SHOCK: 0.90 },
        rain:       { WAVE: 1.15, HEAT: 0.90 },
        downpour:   { WAVE: 1.25, HEAT: 0.80 },
        storm:      { SHOCK: 1.25, WAVE: 1.10, HEAT: 0.85 },
        snow:       { COLD: 1.15, HEAT: 0.90 },
        blizzard:   { COLD: 1.25, HEAT: 0.80 },
        sandstorm:  { HEAT: 1.20, COLD: 0.85, WAVE: 0.90 }
      }
    },

    // Effects only show on maps whose name starts with one of these
    // (with logMapNames on, press F12 in game and check the console for map names).
    outdoorPrefixes: [
      "autumn", "rookie-harbor", "bergen", "heat", "jungle", "forest", "beach",
      "arid", "rhombus-sqr", "cargo-ship", "evo-village", "final-dng-outside"
    ],
    // ...unless the name also contains one of these
    indoorKeywords: ["interior", "inside", "house", "shop", "inn", "hotel", "cave", "dng", "dungeon", "temple", "lobby", "office", "room",
                     "pub", "storage", "trader", "guild", "elevator", "mine", "basement", "cellar", "lab", "mall", "store",
                     "questhub", "quest-hub", "faction", "barrack", "smith", "distillery", "hermit", "expo-space", "halloween"],
    // ...but these always count as outdoors (e.g. the courtyard outside a dungeon)
    outdoorKeywords: ["exterior", "rooftop"],

    // Clock style:
    //   "status": plate under the health bar, top left (matches the HP/SP HUD)
    //   "box":    box in the right-hand HUD (matches the money/quest boxes)
    hudStyle: "status",
    // "corner": bottom-right corner of the screen
    // "right":  next to the HP/SP bars (follows SP as it grows)
    // "below":  under the party icons on the left
    statusPlacement: "corner",
    cornerMargin: { x: 4, y: 4 },  // gap from the screen edges in "corner" placement
    statusPos: null,               // e.g. { x: 140, y: 3 } to pin the plate to a fixed spot instead
    // When it shows:
    //   "always": shown during gameplay
    //   "auto":   pops up for a few seconds on each new hour, weather change or area change
    //   "off":    hidden
    hudMode: "always",
    hudAutoSeconds: 6,
    logMapNames: true,             // writes each map name to the dev console (F12), for tuning outdoor areas
    keys: { peek: "F6", hud: "F7", toggle: "F8" }
  };
  // -------------------------------------------------------

  const SAVE_KEY = "cc-weather-daynight-state";
  const WEATHERS = ["clear", "cloudy", "rain", "storm", "fog", "snow", "blizzard", "sandstorm", "downpour"];

  // The clock, day, season and weather belong to each save file (written into it when the game saves),
  // so every save has its own calendar and a new game starts fresh.
  const freshState = () => ({ minutes: CONFIG.startHour * 60, day: 1, climates: {} });
  let state = freshState();
  let climate = "temperate";     // climate of the current (or last outdoor) map
  let weather = "clear";         // its current weather

  let enabled = true;
  let lastTime = performance.now();
  let saveTimer = 0;
  const level = { cloudy: 0, rain: 0, storm: 0, fog: 0, snow: 0, blizzard: 0, sand: 0 }; // smoothed 0..1
  let outdoorFade = 0;
  let darkness = 0;              // current world darkness fed to the game's light engine
  let tint = [0, 0, 0, 0];
  let flash = 0, nextFlash = 4;
  let lastMap = "";

  // ---------- helpers ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const approach = (v, target, rate, dt) => v + (target - v) * Math.min(1, rate * dt);

  // in the world: playing, or in a cutscene / conversation (the night, weather and lights stay as they are
  // while someone talks; only the clock waits)
  function inGameplay() {
    try { return !!(window.sc && sc.model && (sc.model.isGame() || sc.model.isCutscene())); } catch (e) { return false; }
  }
  function inCutscene() { try { return !!(sc.model && sc.model.isCutscene()); } catch (e) { return false; } }
  function inMenuOrPause() {
    try { return sc.model.isMenu() || sc.model.isPaused() || sc.model.isQuickMenu(); } catch (e) { return false; }
  }
  function currentMap() {
    try { return (ig.game && ig.game.mapName) ? String(ig.game.mapName).replace(/\//g, ".") : ""; }
    catch (e) { return ""; }
  }
  // (asked every frame: remembered per map name; cleared when the settings change)
  const outdoorMemo = new Map(), climateMemo = new Map();
  function isOutdoor(map) {
    if (!map) return false;
    if (outdoorMemo.has(map)) return outdoorMemo.get(map);
    const v = isOutdoorNow(map); outdoorMemo.set(map, v); return v;
  }
  function isOutdoorNow(map) {
    const m = map.toLowerCase();
    if (!CONFIG.outdoorPrefixes.some(p => m.startsWith(p))) return false;
    if ((CONFIG.outdoorKeywords || []).some(k => m.includes(k))) return true;
    return !CONFIG.indoorKeywords.some(k => m.includes(k));
  }

  function climateFor(map) {
    const key = map || "";
    if (climateMemo.has(key)) return climateMemo.get(key);
    const v = climateForNow(key); climateMemo.set(key, v); return v;
  }
  function climateForNow(map) {
    const m = (map || "").toLowerCase();
    for (const [name, c] of Object.entries(CONFIG.climates))
      if ((c.areas || []).some(p => m.startsWith(p))) return name;
    return "temperate";
  }
  function climateDef(name) { return CONFIG.climates[name] || CONFIG.climates.temperate; }

  // ---------- seasons ----------
  // mult: weather odds multipliers. rise/set: sunrise and sunset hours. add: weather some climates
  // only get in that season (winter snow in the lowlands).
  const SEASONS = [
    { name: "Spring", rise: 6,   set: 19.5, mult: { rain: 1.5, fog: 1.3, storm: 1.1, clear: 0.9, sandstorm: 0.8 } },
    { name: "Summer", rise: 5,   set: 21,   mult: { clear: 1.4, storm: 1.5, downpour: 1.2, sandstorm: 1.4, rain: 0.7, cloudy: 0.8, fog: 0.5, snow: 0.4, blizzard: 0.3 } },
    { name: "Autumn", rise: 6.5, set: 19,   mult: { fog: 1.6, cloudy: 1.3, rain: 1.3, storm: 1.1, clear: 0.8 } },
    { name: "Winter", rise: 7.5, set: 17.5, mult: { snow: 1.5, blizzard: 2, fog: 1.2, clear: 0.9, rain: 0.6, downpour: 0.6, storm: 0.5, sandstorm: 0.6 },
      add: { snow: 0.18, blizzard: 0.04 }, addTo: ["temperate", "forest", "coastal"] }
  ];
  function seasonsOn() { return CONFIG.seasons && CONFIG.seasons.enabled !== false; }
  function season() {
    const len = Math.max(1, Math.round((CONFIG.seasons && CONFIG.seasons.daysPerSeason) || 7));
    return SEASONS[Math.floor((state.day - 1) / len) % 4];
  }
  // this climate's weather odds right now, with the season applied
  // weather types switched off in the options never come up (clear can't be switched off)
  function typeAllowed(w) { return w === "clear" || !CONFIG.weatherOff || !CONFIG.weatherOff[w]; }
  function climateOdds(name) {
    const out = climateOddsRaw(name), res = {};
    for (const [w, p] of Object.entries(out)) if (typeAllowed(w)) res[w] = p;
    if (!Object.keys(res).length) res.clear = 1;
    return res;
  }
  function climateOddsRaw(name) {
    const base = climateDef(name).weather;
    if (!seasonsOn()) return base;
    const se = season(), out = {};
    for (const [w, p] of Object.entries(base)) out[w] = p * (se.mult[w] === undefined ? 1 : se.mult[w]);
    if (se.add && (se.addTo || []).includes(name) && CONFIG.seasons.winterSnow !== false)
      for (const [w, p] of Object.entries(se.add)) out[w] = (out[w] || 0) + p;
    for (const w in out) if (!(out[w] > 0)) delete out[w];
    return out;
  }
  // Map clock time onto the base day (sunrise 6:00, sunset 19:30) so summer days run long and winter days short.
  // The options' sunrise / sunset shift the day (and each season's sunrise and sunset with it).
  function solarHour(h) {
    const R = 6, S = 19.5;
    const dr = (CONFIG.sunrise === undefined ? 6 : CONFIG.sunrise) - R, ds = (CONFIG.sunset === undefined ? 19.5 : CONFIG.sunset) - S;
    let rise = R + dr, set = S + ds;
    if (seasonsOn()) { const se = season(); rise = se.rise + dr; set = se.set + ds; }
    rise = Math.max(2, Math.min(11, rise)); set = Math.max(Math.max(rise + 4, 14), Math.min(23, set));
    if (rise === R && set === S) return h;
    if (h < rise) return h / rise * R;
    if (h <= set) return R + (h - rise) / (set - rise) * (S - R);
    return S + (h - set) / (24 - set) * (24 - S);
  }

  // Weather a climate never normally gets, e.g. snow in the desert.
  function freakOptions(name) {
    const usual = climateOdds(name);
    return WEATHERS.filter(w => !(w in usual) && typeAllowed(w));
  }
  function pickWeather(name) {
    const odds = climateOdds(name);
    const total = Object.values(odds).reduce((a, b) => a + b, 0) || 1;
    let roll = Math.random() * total;
    for (const [w, chance] of Object.entries(odds)) { roll -= chance; if (roll < 0) return w; }
    return "clear";
  }
  function newWeather(name, w) {
    let freak = false;
    const prev = state.climates[name];
    if (!w) {
      const odd = freakOptions(name);
      // never two freak spells in a row; freak weather can override the forecast (forecasts aren't perfect)
      if (odd.length && !(prev && prev.freak) && Math.random() < CONFIG.freakWeatherChance) {
        w = odd[Math.floor(Math.random() * odd.length)];
        freak = true;
      } else if (prev && prev.next && prev.next in climateOdds(name)) w = prev.next;   // the forecast comes true
      else w = pickWeather(name);
    }
    const maxM = freak ? Math.min(CONFIG.weatherMaxMinutes, CONFIG.freakWeatherMaxMinutes) : CONFIG.weatherMaxMinutes;
    const minM = Math.min(CONFIG.weatherMinMinutes, maxM);
    // decide the following weather now, so the forecast is accurate
    state.climates[name] = { weather: w, left: (minM + Math.random() * (maxM - minM)) * 60, freak, next: pickWeather(name) };
    if (freak) console.log(`[CrossCode Enhanced] freak weather in ${name} climate: ${w}`);
  }
  function climateWeather(name) {
    const c = state.climates[name];
    // a new season can rule out the current weather (no lowland snow in spring): roll again then
    const valid = c && c.weather && (c.weather in climateOdds(name) || (c.freak && WEATHERS.includes(c.weather) && typeAllowed(c.weather)));
    if (!valid) newWeather(name);
    return state.climates[name].weather;
  }
  for (const name of Object.keys(CONFIG.climates)) climateWeather(name);

  // ---------- per-save calendar ----------
  function useState(saved, why) {
    const st = freshState();
    if (saved && typeof saved.minutes === "number" && typeof saved.day === "number") {
      st.minutes = Math.min(1439.99, Math.max(0, saved.minutes));
      st.day = Math.max(1, Math.floor(saved.day));
      if (saved.climates && typeof saved.climates === "object") st.climates = JSON.parse(JSON.stringify(saved.climates));
    }
    state = st;
    for (const name of Object.keys(CONFIG.climates)) climateWeather(name);   // fills in / re-rolls anything missing
    for (const k in level) level[k] = 0;
    console.log(`[CrossCode Enhanced] ${why}: day ${state.day}, ${String(Math.floor(state.minutes / 60)).padStart(2, "0")}:${String(Math.floor(state.minutes % 60)).padStart(2, "0")}`);
  }
  const saveListener = {
    // every save (manual, auto, checkpoint) carries this save's clock and weather
    onStorageSave(save) {
      try { save.wdnWeather = JSON.parse(JSON.stringify(state)); } catch (e) {}
      // for the title screen (its Auto sky and the save summary): the time, season, weather and event of this save
      try {
        const ev = activeEvent(), today = eventOn(state.day);
        save.wdnTitle = { hour: solarHour(state.minutes / 60), season: seasonsOn() ? season().name : "", weather: String(weather || "clear"),
          event: ev ? ev.key : null, today: eventsOn() ? today : null, day: state.day };
      } catch (e) {}
    },
    // loading a save restores its own; saves from before this version start fresh at day 1
    onStoragePreLoad(file) { useState(file && file.wdnWeather, file && file.wdnWeather ? "loaded this save's calendar" : "save has no calendar yet, starting at day 1"); }
  };
  let storageHooked = false, teleportHookedFor = null;
  function hookSaves() {
    if (!storageHooked && window.ig && ig.storage && ig.storage.register) { ig.storage.register(saveListener); storageHooked = true; }
    // a new game starts with a "NEW" teleport: give it a fresh calendar
    const g = window.ig && ig.game;
    if (g && g.teleport && teleportHookedFor !== g) {
      const orig = g.teleport;
      g.teleport = function (map, pos, mode) {
        if (mode === "NEW") useState(null, "new game");
        return orig.apply(this, arguments);
      };
      teleportHookedFor = g;
    }
  }

  // ---------- resting at inns ----------
  function inInn() {
    const ic = CONFIG.inns;
    if (!ic || ic.enabled === false) return false;   // (resting isn't an effect: it works with the effects off too)
    const m = currentMap().toLowerCase();
    return (ic.maps || []).some(n => m === n.toLowerCase());
  }
  // where a rest can end: the next morning (08:00), afternoon (13:00), evening (18:00) or night (22:00), or any
  // hour you pick. Each is the NEXT time that hour comes round: resting at 03:00 "until morning" wakes you at
  // 08:00 the same day, not the day after
  const REST_TIMES = [{ hour: 8, say: "Sleep until morning" }, { hour: 13, say: "Rest until afternoon" }, { hour: 18, say: "Rest until evening" }, { hour: 22, say: "Rest until night" }];
  const hh = h => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  function restTo(hour) {
    hour = ((Math.round(hour * 2) / 2 % 24) + 24) % 24;
    const now = state.minutes / 60;
    return { hour, label: hour >= 5 && hour < 12 ? "morning" : hour < 17 && hour >= 12 ? "afternoon" : hour < 21 && hour >= 17 ? "evening" : "night", nextDay: hour <= now };
  }
  const restWhen = tg => hh(tg.hour) + (tg.nextDay ? ", tomorrow" : "");
  let resting = null;   // the fade-out / sleep / fade-in sequence while it runs
  // the question: which time to rest until (talk: (text, options, onPick(index)), in message boxes or dialogs)
  function askRestTime(talk, intro, cost, after) {
    const opts = REST_TIMES.map(T => restTo(T.hour));
    const names = REST_TIMES.map((T, i) => `${T.say} (${restWhen(opts[i])})`).concat(["Until a time I pick...", "Not now"]);
    talk(intro, names, i => {
      if (opts[i]) { startRest(cost, opts[i]); if (after) after(opts[i]); }
      else if (i === opts.length) setTimeout(() => pickRestHour(talk, cost, after), 650);
    });
  }
  // pick a time: first the part of the day, then the exact time (on the hour or half past)
  const REST_BLOCKS = [["Early hours", 0], ["Morning", 6], ["Afternoon", 12], ["Evening", 18]];
  function pickRestHour(talk, cost, after) {
    const names = REST_BLOCKS.map(([n, h]) => `${n} (${hh(h)}-${hh(h + 5.5)})`).concat(["Back"]);
    talk("Rest until when?", names, i => {
      if (REST_BLOCKS[i]) setTimeout(() => pickRestTime(talk, cost, after, REST_BLOCKS[i][1]), 650);
      else setTimeout(() => askRestTime(talk, "Until when?", cost, after), 650);
    });
  }
  function pickRestTime(talk, cost, after, from) {
    const tgs = []; for (let k = 0; k < 12; k++) tgs.push(restTo(from + k / 2));
    talk("Rest until...", tgs.map(restWhen).concat(["Back"]), i => {
      if (tgs[i]) { startRest(cost, tgs[i]); if (after) after(tgs[i]); }
      else setTimeout(() => pickRestHour(talk, cost, after), 650);
    });
  }
  const dialogTalk = (text, options, onPick) => {
    if (!options) { sc.Dialogs.showInfoDialog(text, true); return; }
    sc.Dialogs.showChoiceDialog(text, sc.DIALOG_INFO_ICON.QUESTION, options, btn => { if (btn && btn.data != null) onPick(btn.data); });
  };
  // talk: (text, options, onPick(index)) from the innkeeper, in the game's message boxes (extras.js); else dialogs
  function askToRest(talk) {
    if (resting || !inInn()) return false;
    const cost = Math.max(0, Math.round(CONFIG.inns.cost || 0));
    const credits = (sc.model.player && sc.model.player.credit) || 0;
    if (cost > credits) {
      if (talk) talk(`A room's \\c[3]${cost}\\c[0] Credits a night, I'm afraid. Come back when you have it.`, null, null);
      else sc.Dialogs.showInfoDialog(`Resting costs \\c[3]${cost}\\c[0] Credits. You have \\c[3]${credits}\\c[0].`, true);
      return true;
    }
    const price = cost ? ` for \\c[3]${cost}\\c[0] Credits` : "";
    askRestTime(talk || dialogTalk, talk ? `Would you like a room${price}? You'll all wake up fully rested. Until when?` : `Rest here${price}?\nYou and your party wake fully healed.`, cost);
    return true;
  }
  function startRest(cost, tg) {
    if (resting) return;
    if (cost) sc.model.player.removeCredit(cost);
    resting = { t: 0, tg, done: false };
    try { ig.overlay.setColor(0, 0, 0, 1, 0.6, false, true); } catch (e) {}
  }
  function healEveryone() {
    const heal = p => { if (p && p.getStat) { p.currentHp = p.getStat("hp"); sc.Model.notifyObserver(p, sc.COMBAT_PARAM_MSG.HP_CHANGED); } };
    try { heal(sc.model.player.params); } catch (e) {}
    try { for (const name of sc.party.currentParty || []) { const m = sc.party.getPartyMemberModel(name); heal(m && m.params); } } catch (e) {}
  }
  function updateRest(dt) {
    if (!resting) return;
    resting.t += dt;
    if (!resting.done && resting.t >= 1.3) {          // the screen is black: time passes
      resting.done = true;
      const from = state.day * 1440 + state.minutes;
      if (resting.tg.nextDay) state.day++;
      state.minutes = resting.tg.hour * 60;
      try { if (window.__wdnRested) setTimeout(() => window.__wdnRested(state.day * 1440 + state.minutes - from), 1800); } catch (e) {}
      for (const name of Object.keys(CONFIG.climates)) newWeather(name);   // the weather has moved on overnight
      for (const k in level) level[k] = 0;
      healEveryone();
      peekTimer = CONFIG.hudAutoSeconds + 2;
      try { ig.overlay.setColor(0, 0, 0, 0, 1.2, false, true); } catch (e) {}
    }
    if (resting.t >= 2.8) resting = null;
  }

  // ---------- forecast ----------
  // { next, minutes }: the next weather for a climate and in-game minutes until it arrives
  function forecast(name) {
    const c = state.climates[name] || {};
    if (!c.next || !(c.next in climateOdds(name))) c.next = pickWeather(name);   // a new season can change it
    const perRealSec = 1440 / (Math.max(1, CONFIG.dayLengthMinutes) * 60);
    return { next: c.next, minutes: Math.max(1, Math.round((c.left || 0) * perRealSec)) };
  }
  function forecastText(name) {
    const f = forecast(name), cur = climateWeather(name);
    const label = { clear: "Clear", cloudy: "Cloudy", rain: "Rain", storm: "Storm", fog: "Fog", snow: "Snow",
                    blizzard: "Blizzard", sandstorm: "Sandstorm", downpour: "Downpour" };
    const t = f.minutes >= 60 ? `${Math.floor(f.minutes / 60)}h ${String(f.minutes % 60).padStart(2, "0")}m` : `${f.minutes}m`;
    return f.next === cur ? `Next: more ${label[cur].toLowerCase()} in ${t}` : `Next: ${label[f.next]} in ${t}`;
  }

  // Over the day: [hour, tintR, tintG, tintB, tintAlpha, darkness(0..1 of nightDarkness)]
  const SKY = [
    [0,    70, 90, 170, 0.45, 1.00],
    [4.5,  70, 90, 170, 0.45, 1.00],
    [6,   255, 150, 110, 0.35, 0.45],
    [7.5, 255, 210, 170, 0.12, 0.05],
    [9,   255, 255, 255, 0.00, 0.00],
    [17,  255, 255, 255, 0.00, 0.00],
    [18.5,255, 160, 90,  0.35, 0.15],
    [20,  170, 110, 170, 0.40, 0.55],
    [21.5, 70, 90, 170, 0.45, 1.00],
    [24,   70, 90, 170, 0.45, 1.00]
  ];
  // night colour choices (Options > Time): moonlit blue, purple, neutral grey, warm
  const NIGHT_TINTS = [[70, 90, 170], [110, 75, 165], [95, 100, 115], [150, 105, 80]];
  const NIGHT_ROWS = [0, 1, 8, 9];   // the SKY rows that are full night
  let nightTintShown = 0;
  function applyNightTint(i) {
    const c = NIGHT_TINTS[i] || NIGHT_TINTS[0];
    if (i === nightTintShown) return;
    nightTintShown = i;
    for (const r of NIGHT_ROWS) { SKY[r][1] = c[0]; SKY[r][2] = c[1]; SKY[r][3] = c[2]; }
  }
  function skyAt(hour) { return skyAtBase(solarHour(hour)); }
  function skyAtBase(hour) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (hour >= a[0] && hour <= b[0]) {
        const t = (hour - a[0]) / (b[0] - a[0] || 1);
        return a.slice(1).map((v, k) => lerp(v, b[k + 1], t));
      }
    }
    return [255, 255, 255, 0, 0];
  }

  // ---------- particles (normalised screen space, shifted with the camera) ----------
  const drops = [];
  for (let i = 0; i < 400; i++) drops.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.6 });
  const flies = [];
  for (let i = 0; i < 26; i++) flies.push({ x: Math.random(), y: Math.random(), a: Math.random() * 6.28, p: Math.random() * 6.28, sp: 0.01 + Math.random() * 0.015 });
  const splashes = [];
  for (let i = 0; i < 60; i++) splashes.push({ x: 0, y: 0, life: 0 });
  const flakes = [];
  for (let i = 0; i < 240; i++) flakes.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 0.9, ph: Math.random() * 6.28 });
  const streaks = [];
  for (let i = 0; i < 140; i++) streaks.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8, len: 4 + Math.random() * 10 });
  let lastCam = null;

  // ---------- seamless world-anchored textures (fog, cloud shadows, sand dust) ----------
  // Tileable value noise, generated once. Drawn as a repeating pattern fixed to the world
  // and drifting with the wind, so it never wraps, pops or bunches up.
  function makeNoiseTile(size, cellSizes, shape, rgb, seed) {
    let st = seed;
    const rand = () => { st = (st * 16807) % 2147483647; return st / 2147483647; };
    const field = new Float32Array(size * size);
    let weight = 0;
    for (const cells of cellSizes) {
      const g = []; for (let i = 0; i < cells * cells; i++) g.push(rand());
      const w = cells;   // finer octaves get more weight, keeps banks soft but textured
      weight += 1 / Math.sqrt(w);
      for (let y = 0; y < size; y++) {
        const gy = y / size * cells, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < size; x++) {
          const gx = x / size * cells, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx);
          const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
          const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c2 = g[y1 * cells + x0], d = g[y1 * cells + x1];
          field[y * size + x] += (a + (b - a) * sx + (c2 - a + (a - b - c2 + d) * sx) * sy) / Math.sqrt(w);
        }
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const cx = canvas.getContext("2d"), img = cx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = shape(field[i] / weight);
      img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = Math.round(255 * clamp01(v));
    }
    cx.putImageData(img, 0, 0);
    return { canvas, size, pattern: null, ctx: null };
  }
  const smooth = (e0, e1) => v => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const TILES = {
    fogA:  makeNoiseTile(256, [3, 6, 12], smooth(0.30, 0.75), [222, 228, 238], 11),
    fogB:  makeNoiseTile(192, [4, 8],     smooth(0.35, 0.80), [214, 220, 232], 23),
    cloud: makeNoiseTile(256, [2, 4, 8],  smooth(0.50, 0.72), [18, 24, 34],    37),
    dust:  makeNoiseTile(256, [3, 6, 12], smooth(0.35, 0.80), [214, 156, 96],  53)
  };
  let windTime = 0;
  // world-locked: offset follows the camera exactly, plus a slow wind drift (px/sec)
  function drawWorldTile(c, tile, alpha, driftX, driftY, W, H) {
    if (alpha <= 0.003) return;
    if (!tile.pattern || tile.ctx !== c) { tile.pattern = c.createPattern(tile.canvas, "repeat"); tile.ctx = c; }
    const S = tile.size;
    const ox = ((ig.game.screen.x - windTime * driftX) % S + S) % S;
    const oy = ((ig.game.screen.y - windTime * driftY) % S + S) % S;
    c.save();
    c.globalAlpha *= alpha;
    c.translate(-ox, -oy);
    c.fillStyle = tile.pattern;
    c.fillRect(0, 0, W + S, H + S);
    c.restore();
  }

  function shiftWithCamera(W, H) {
    const sx = ig.game.screen.x, sy = ig.game.screen.y;
    if (lastCam) {
      let dx = (sx - lastCam.x) / W, dy = (sy - lastCam.y) / H;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        const all = [drops, flies, flakes, streaks];
        for (const list of all) for (const p of list) {
          p.x -= dx; p.y -= dy;
          // keep particles in the band [-0.2, 1.2) around the screen without moving them
          p.x = ((p.x + 0.2) % 1.4 + 1.4) % 1.4 - 0.2;
          p.y = ((p.y + 0.2) % 1.4 + 1.4) % 1.4 - 0.2;
        }
      }
    }
    lastCam = { x: sx, y: sy };
  }

  // ---------- hook into the game's lighting engine ----------
  const darkHandle = { update() { return false; }, getIntensity() { return darkness; } };
  const lights = new Map();     // entity -> ig.LightHandle
  const tmpPos = { x: 0, y: 0, z: 0 };

  function wantedLights() {
    const out = [];
    if (darkness < 0.12 || !ig.game) return out;
    const p = ig.game.playerEntity;
    const k = CONFIG.lightStrength || 1;
    if (CONFIG.playerLight && p) out.push([p, ig.LIGHT_SIZE[CONFIG.leaLightSize || "XL"] || ig.LIGHT_SIZE.XL, Math.min(1, 0.95 * k)]);
    for (const e of ig.game.entities || []) {
      if (!e || e._killed || e === p) continue;
      if (CONFIG.partyLights && window.sc && sc.PartyMemberEntity && e instanceof sc.PartyMemberEntity) out.push([e, ig.LIGHT_SIZE.L, Math.min(1, 0.8 * k)]);
      else if (CONFIG.npcLanterns && ig.ENTITY.NPC && e instanceof ig.ENTITY.NPC) out.push([e, ig.LIGHT_SIZE.L, Math.min(1, 0.6 * k)]);
    }
    return out;
  }

  function resetLights() {
    for (const h of lights.values()) { try { h.stop(); } catch (e) {} }
    lights.clear();
  }
  function syncLights() {
    if (!ig.light || !ig.LightHandle) return;
    const want = new Map(wantedLights().map(w => [w[0], w]));
    for (const [ent, h] of lights) {
      if (!want.has(ent) || !h.targetEntity) { try { h.stop(); } catch (e) {} lights.delete(ent); }
    }
    for (const [ent, w] of want) {
      if (lights.has(ent)) continue;
      try {
        const h = new ig.LightHandle(ent, w[1], 0.8, 0.8, -1, w[2], false);
        ig.light.addLightHandle(h);
        lights.set(ent, h);
      } catch (e) {}
    }
  }

  // ---------- drawing (runs inside the game's world pass) ----------
  // Pass 1: colour tint, drawn before the game's darkness layer.
  const tintPass = {
    midDrawOrder: -1,
    onMidDraw() {
      if (!inGameplay() || outdoorFade < 0.01 || tint[3] < 0.005) return;
      const c = ig.system.context, W = ig.system.width, H = ig.system.height;
      c.save();
      c.globalCompositeOperation = "multiply";
      c.globalAlpha = tint[3] * outdoorFade;
      c.fillStyle = `rgb(${tint[0] | 0},${tint[1] | 0},${tint[2] | 0})`;
      c.fillRect(-8, -8, W + 16, H + 16);
      c.restore();
    }
  };

  // a soft round glow, drawn once per colour and size and reused (making a new gradient for every light,
  // every frame, kept the browser busy cleaning up after it)
  const glowCache = {};
  function glowSprite(rgb, r) {
    const key = rgb + "|" + r;
    if (glowCache[key]) return glowCache[key];
    const c = document.createElement("canvas"); c.width = c.height = r * 2;
    const x = c.getContext("2d"), g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(" + rgb + ",1)"); g.addColorStop(1, "rgba(" + rgb + ",0)");
    x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
    return (glowCache[key] = c);
  }
  // Pass 2: weather and ambient glow, drawn after the game's lights.
  const fxPass = {
    midDrawOrder: 1000,
    onMidDraw() {
      if (!inGameplay() || outdoorFade < 0.01) return;
      const c = ig.system.context, W = ig.system.width, H = ig.system.height;
      const dt = Math.min(0.1, ig.system.actualTick || 1 / 60);
      shiftWithCamera(W, H);
      windTime += dt;
      c.save();
      c.globalAlpha = outdoorFade;

      // drifting cloud shadows
      if (level.cloudy > 0.01) {
        drawWorldTile(c, TILES.cloud, 0.22 * level.cloudy, 9, 3, W, H);
        c.fillStyle = `rgba(60,70,85,${0.10 * level.cloudy + 0.1 * level.storm + 0.05 * level.rain})`;
        c.fillRect(-8, -8, W + 16, H + 16);
      }

      // warm lantern glow around lit characters
      if (darkness > 0.05 && lights.size) {
        c.globalCompositeOperation = "lighter";
        for (const [ent] of lights) {
          try {
            ent.getAlignedPos(ig.ENTITY_ALIGN.CENTER, tmpPos);
            const x = tmpPos.x - ig.game.screen.x, y = tmpPos.y - tmpPos.z - ig.game.screen.y;
            if (x < -60 || y < -60 || x > W + 60 || y > H + 60) continue;
            const r = ent === ig.game.playerEntity ? 56 : 30;
            const a0 = c.globalAlpha;
            c.globalAlpha = a0 * 0.22 * darkness;
            c.drawImage(glowSprite("255,170,80", r), x - r, y - r);
            c.globalAlpha = a0;
          } catch (e) {}
        }
        c.globalCompositeOperation = "source-over";
      }

      // fireflies on calm nights
      const flyAmt = CONFIG.fireflies && wildlifeOn() && climateDef(climate).fireflies
        ? clamp01((darkness - 0.25) * 2.5) * (1 - level.rain) * (1 - level.fog) * (1 - level.snow) * (1 - level.sand) : 0;
      if (flyAmt > 0.01) {
        c.globalCompositeOperation = "lighter";
        const t = performance.now() / 1000;
        for (const f of flies) {
          f.a += (Math.random() - 0.5) * dt * 2;
          f.x += Math.cos(f.a) * f.sp * dt; f.y += Math.sin(f.a) * f.sp * dt;
          const pulse = 0.5 + 0.5 * Math.sin(t * 2 + f.p);
          const x = f.x * W, y = f.y * H;
          const a0 = c.globalAlpha;
          c.globalAlpha = a0 * 0.9 * pulse * flyAmt;
          c.drawImage(glowSprite("220,255,140", 5), x - 5, y - 5);
          c.globalAlpha = a0;
        }
        c.globalCompositeOperation = "source-over";
      }

      // bats at night (silhouettes over the darkness)
      try { drawBats(c, W, H); } catch (e) {}

      // fog: an even base haze plus two layers of rolling banks drifting at different speeds
      if (level.fog > 0.01) {
        c.fillStyle = `rgba(210,215,225,${0.16 * level.fog})`;
        c.fillRect(-8, -8, W + 16, H + 16);
        drawWorldTile(c, TILES.fogA, 0.42 * level.fog, 5, 1.5, W, H);
        drawWorldTile(c, TILES.fogB, 0.30 * level.fog, -3, 1, W, H);
      }

      // sandstorm: warm haze, rolling dust clouds and fast grit streaks
      if (level.sand > 0.01) {
        c.fillStyle = `rgba(196,140,80,${0.16 * level.sand})`;
        c.fillRect(-8, -8, W + 16, H + 16);
        drawWorldTile(c, TILES.dust, 0.34 * level.sand, 45, 5, W, H);
        const count = Math.floor(streaks.length * level.sand);
        c.strokeStyle = `rgba(235,195,140,${0.35 * level.sand})`;
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < count; i++) {
          const st = streaks[i];
          st.x += dt * 0.55 * st.s; st.y += dt * 0.06 * st.s;
          if (st.x > 1.2) { st.x -= 1.4; st.y = Math.random() * 1.2 - 0.1; }
          if (st.y > 1.2) st.y -= 1.4;
          const x = Math.round(st.x * W), y = Math.round(st.y * H);
          c.moveTo(x, y); c.lineTo(x + st.len, y + Math.round(st.len * 0.15));
        }
        c.stroke();
      }

      // rain (pixel-sized streaks at the game's own resolution)
      if (level.rain > 0.01) {
        // the number of drops follows the rain's strength; each drop stays clearly visible
        // (fading in with the rain rather than being faint the whole time)
        const count = Math.floor(drops.length * Math.min(1, level.rain));
        const vis = Math.min(1, level.rain / 0.15);
        c.strokeStyle = `rgba(200,218,255,${(0.42 + 0.2 * Math.min(1, level.rain)) * vis})`;
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < count; i++) {
          const d = drops[i];
          d.y += dt * 1.6 * d.s; d.x += dt * 0.45 * d.s;
          if (d.y > 1.1) { d.y -= 1.25; d.x = Math.random() * 1.2 - 0.2; }
          const x = Math.round(d.x * W), y = Math.round(d.y * H), len = 10 * d.s;
          c.moveTo(x, y); c.lineTo(x + len * 0.3, y + len);
        }
        c.stroke();

        // little splashes on the ground, fixed to the world
        const spawn = 90 * Math.min(1, level.rain) * dt;
        for (let n = Math.floor(spawn + Math.random()); n > 0; n--) {
          const sp = splashes.find(q => q.life <= 0);
          if (!sp) break;
          sp.x = ig.game.screen.x + Math.random() * W; sp.y = ig.game.screen.y + Math.random() * H; sp.life = 0.22;
        }
        c.fillStyle = `rgba(215,228,255,${0.55 * vis})`;
        for (const sp of splashes) {
          if (sp.life <= 0) continue;
          sp.life -= dt;
          const x = Math.round(sp.x - ig.game.screen.x), y = Math.round(sp.y - ig.game.screen.y);
          if (sp.life > 0.11) c.fillRect(x, y, 1, 1);                       // drop hits
          else { c.fillRect(x - 1, y - 1, 1, 1); c.fillRect(x + 1, y - 1, 1, 1); }   // and splashes out
        }
      }

      // snow and blizzards (1-2px flakes that sway; blizzards add wind and white-out)
      if (level.snow > 0.01) {
        if (level.blizzard > 0.01) {
          c.fillStyle = `rgba(232,238,248,${0.16 * level.blizzard})`;
          c.fillRect(-8, -8, W + 16, H + 16);
        }
        const count = Math.floor(flakes.length * level.snow);
        const wind = 0.03 + 0.28 * level.blizzard, fall = 0.08 + 0.17 * level.blizzard;
        const t = performance.now() / 1000;
        c.fillStyle = `rgba(248,250,255,${0.9 * Math.min(1, level.snow * 1.6)})`;
        for (let i = 0; i < count; i++) {
          const f = flakes[i];
          f.y += dt * fall * f.s;
          f.x += dt * (wind * f.s + Math.sin(t * 1.3 + f.ph) * 0.02);
          if (f.y > 1.1) { f.y -= 1.25; f.x = Math.random() * 1.4 - 0.3; }
          if (f.x > 1.2) f.x -= 1.4;
          const size = f.s > 1.05 ? 2 : 1;
          c.fillRect(Math.round(f.x * W), Math.round(f.y * H), size, size);
        }
      }

      // lightning
      if (level.storm > 0.5 * Math.max(0.2, CONFIG.weatherIntensity || 1)) {   // (a storm at any weather strength)
        nextFlash -= dt;
        if (nextFlash <= 0) { flash = 1; nextFlash = 14 + Math.random() * 20; thunderIn = 0.6 + Math.random() * 1.6; }
      }
      if (flash > 0) {
        c.fillStyle = `rgba(225,232,255,${CONFIG.lightningFlash * flash * flash})`;   // eased, no hard pop
        c.fillRect(-8, -8, W + 16, H + 16);
        flash = Math.max(0, flash - dt * 0.9);
      }
      c.restore();
    }
  };

  // ---------- ambient wildlife ----------
  // Outdoors, by day: small flocks of birds land on ground Lea has walked over (so always somewhere they can
  // stand), peck about, and take off when she comes close or runs at them; butterflies drift about on calm
  // days. At night bats flit overhead. Birds and butterflies are drawn into the world before the night tint
  // and darkness, so dusk shades them like everything else; bats are drawn as silhouettes on top.
  const BIRD_LOOKS = {
    temperate: [["#6b4a2e", "#c49a6c", "#3a2818"]], forest: [["#5c4128", "#b8905e", "#2e2014"], ["#2c2c34", "#585866", "#141418"]],
    coastal: [["#e8eef2", "#9aa6b0", "#f0a030"]], desert: [["#5a4636", "#a08060", "#2a1e16"]],
    snowy: [["#d0d8e0", "#8c98a6", "#3c4450"]], tropical: [["#2fa84f", "#e8c020", "#d03020"], ["#3070d0", "#f0f0f0", "#202020"]]
  };
  const FLY_COLOURS = ["#f5f0e0", "#f6c445", "#f08a3c", "#7fb3f0", "#e070c0"];
  const track = [];            // spots Lea has stood on in this map: { x, y } (as drawn)
  let trackT = 0, flocks = [], butterflies = [], bats = [], flockTimer = 3;
  function resetWildlife() { track.length = 0; flocks = []; butterflies = []; bats = []; flockTimer = 3; }
  const wl = (name, def) => { const O = window.wdnOptions; const v = O && O[name]; return v === undefined || v === null ? def : v; };
  function wildlifeOn() { return wl("wildlife", true) !== false; }
  function wildAmount() { return Number(wl("wildlifeAmount", 1)) || 1; }
  function leaSpotNow() {
    const p = ig.game.playerEntity; if (!p || !p.coll) return null;
    const c = p.coll;
    return { x: c.pos.x + c.size.x / 2, y: c.pos.y + c.size.y / 2 - c.pos.z, running: Math.hypot(c.vel.x, c.vel.y) > (c.maxVel || 100) * 0.7, jumping: !!p.jumping || c.pos.z > c.baseZPos + 1 };
  }
  function updateWildlife(dt, W, H) {
    const lea = leaSpotNow();
    if (!lea) return;
    const sx = ig.game.screen.x, sy = ig.game.screen.y;
    // remember where she walks
    trackT -= dt;
    if (trackT <= 0 && !lea.jumping) {
      trackT = 0.35;
      const last = track[track.length - 1];
      if (!last || Math.hypot(last.x - lea.x, last.y - lea.y) > 12) { track.push({ x: lea.x, y: lea.y }); if (track.length > 400) track.shift(); }
    }
    const amt = wildAmount();
    const day = darkness < 0.3, calm = level.rain < 0.25 && level.snow < 0.35 && level.sand < 0.25 && level.storm < 0.2;
    // ---- birds ----
    const wantFlocks = wl("wlBirds", true) !== false && day && calm ? Math.round(2 * amt) : 0;
    flockTimer -= dt;
    if (flocks.length < wantFlocks && flockTimer <= 0 && track.length > 10) {
      flockTimer = 6 + Math.random() * 8;
      // a spot on screen, well away from Lea
      const spots = track.filter(t => t.x > sx + 16 && t.y > sy + 16 && t.x < sx + W - 16 && t.y < sy + H - 16 && Math.hypot(t.x - lea.x, t.y - lea.y) > 130
        && !flocks.some(f => Math.hypot(f.x - t.x, f.y - t.y) < 60));
      if (spots.length) {
        const sp = spots[Math.floor(Math.random() * spots.length)];
        const looks = BIRD_LOOKS[climate] || BIRD_LOOKS.temperate, look = looks[Math.floor(Math.random() * looks.length)];
        const n = 3 + Math.floor(Math.random() * 4), birds = [];
        const fromX = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const tx = sp.x + (Math.random() - 0.5) * 28, ty = sp.y + (Math.random() - 0.5) * 16;
          const x0 = tx + fromX * (W * 0.7 + Math.random() * 40), y0 = ty - 120 - Math.random() * 60;
          birds.push({ x: x0, y: y0, tx, ty, z: 0, state: "in", t: 2 + Math.random() * 0.8, peck: Math.random() * 3, face: fromX > 0 ? -1 : 1, flap: Math.random() * 6 });
        }
        flocks.push({ x: sp.x, y: sp.y, birds, look, scared: false });
      }
    }
    for (const f of flocks) {
      let dLea = Math.hypot(f.x - lea.x, f.y - lea.y);
      if (!f.scared && (dLea < 56 || (lea.running && dLea < 96) || !calm || !day)) {
        f.scared = true;
        for (const b of f.birds) {
          const ax = b.x - lea.x, ay = b.y - lea.y, l = Math.hypot(ax, ay) || 1;
          const sp = 110 + Math.random() * 60;
          b.state = "out"; b.vx = ax / l * sp * 0.8 + (Math.random() - 0.5) * 40; b.vy = ay / l * sp * 0.4 - 70 - Math.random() * 40;
          b.face = b.vx < 0 ? -1 : 1; b.t = Math.random() * 0.25;
        }
      }
      for (const b of f.birds) {
        b.flap += dt * 14;
        if (b.state === "in") {
          // glide in and land
          b.t -= dt;
          const k = Math.min(1, dt * 1.6);
          b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k;
          if (Math.hypot(b.tx - b.x, b.ty - b.y) < 2 || b.t <= 0) { b.x = b.tx; b.y = b.ty; b.state = "ground"; }
        } else if (b.state === "ground") {
          b.peck -= dt;
          if (b.peck <= 0) {
            b.peck = 0.8 + Math.random() * 2.5;
            if (Math.random() < 0.35) { b.hop = 0.25; b.face = Math.random() < 0.5 ? -1 : 1; b.x += b.face * (2 + Math.random() * 4); }
          }
          if (b.hop > 0) b.hop -= dt;
        } else {
          if (b.t > 0) { b.t -= dt; continue; }   // a short, staggered delay so they don't all leave at once
          b.vy -= 30 * dt;
          b.x += b.vx * dt; b.y += b.vy * dt;
        }
      }
      if (f.scared) f.birds = f.birds.filter(b => b.x > sx - 80 && b.x < sx + W + 80 && b.y > sy - 120 && b.y < sy + H + 80);
    }
    flocks = flocks.filter(f => f.birds.length && !(f.x < sx - 300 || f.x > sx + W + 300 || f.y < sy - 300 || f.y > sy + H + 300));
    // ---- butterflies ----
    const okClimate = climate !== "snowy" && climate !== "desert";
    const wantFlies = wl("wlButterflies", true) !== false && day && okClimate && level.rain < 0.05 && level.fog < 0.5 && level.snow < 0.05 && level.sand < 0.05 && level.storm < 0.05 ? Math.round(5 * amt) : 0;
    while (butterflies.length < wantFlies && track.length > 4) {
      const t = track[Math.floor(Math.random() * track.length)];
      butterflies.push({ x: t.x + (Math.random() - 0.5) * 60, y: t.y + (Math.random() - 0.5) * 40, a: Math.random() * 6.28, sp: 12 + Math.random() * 10,
        col: FLY_COLOURS[Math.floor(Math.random() * FLY_COLOURS.length)], ph: Math.random() * 6.28, hover: 8 + Math.random() * 8, fade: 0 });
    }
    if (butterflies.length > wantFlies) butterflies.length = wantFlies;
    for (const b of butterflies) {
      b.a += (Math.random() - 0.5) * dt * 3;
      const dx = b.x - lea.x, dy = b.y - lea.y, d = Math.hypot(dx, dy);
      if (d < 30) b.a = Math.atan2(dy, dx);                 // flutter away from Lea
      b.x += Math.cos(b.a) * b.sp * dt; b.y += Math.sin(b.a) * b.sp * 0.6 * dt;
      b.ph += dt * 16; b.fade = Math.min(1, b.fade + dt);
      if (Math.hypot(b.x - (sx + W / 2), b.y - (sy + H / 2)) > Math.max(W, H)) b.dead = true;
    }
    butterflies = butterflies.filter(b => !b.dead);
    // ---- bats ----
    const wantBats = wl("wlBats", true) !== false && darkness > 0.45 && level.rain < 0.4 && level.snow < 0.4 && level.sand < 0.3 ? Math.round(4 * amt) : 0;
    while (bats.length < wantBats) {
      const side = Math.random() < 0.5;
      bats.push({ x: sx + (side ? -20 : W + 20), y: sy + Math.random() * H * 0.7, a: side ? 0 : Math.PI, sp: 60 + Math.random() * 40, ph: Math.random() * 6.28, turn: 0 });
    }
    if (bats.length > wantBats) bats.length = wantBats;
    for (const b of bats) {
      b.turn -= dt;
      if (b.turn <= 0) { b.turn = 0.3 + Math.random() * 0.8; b.da = (Math.random() - 0.5) * 5; }
      b.a += b.da * dt;
      // stay around the screen
      const cx = sx + W / 2, cy = sy + H * 0.4;
      if (Math.hypot(b.x - cx, b.y - cy) > Math.max(W, H) * 0.6) b.a = Math.atan2(cy - b.y, cx - b.x) + (Math.random() - 0.5);
      b.x += Math.cos(b.a) * b.sp * dt; b.y += Math.sin(b.a) * b.sp * 0.7 * dt;
      b.ph += dt * 22;
    }
  }
  function drawBird(c, b, look, sx, sy) {
    const x = Math.round(b.x - sx), y = Math.round(b.y - sy);
    if (b.state === "ground") {
      const bob = b.peck < 0.25 ? 1 : 0, up = b.hop > 0 ? -1 : 0;
      c.fillStyle = look[0]; c.fillRect(x - 2, y - 2 + up, 4, 2);                    // body
      c.fillStyle = look[1]; c.fillRect(x - 1, y - 1 + up, 2, 1);                    // belly
      c.fillStyle = look[0]; c.fillRect(x + (b.face > 0 ? 2 : -3), y - 3 + bob + up, 1, 1);   // head
      c.fillStyle = look[2]; c.fillRect(x + (b.face > 0 ? 3 : -4), y - 3 + bob + up, 1, 1);   // beak
      c.fillRect(x + (b.face > 0 ? -3 : 2), y - 2 + up, 1, 1);                         // tail
    } else {
      const up = Math.sin(b.flap) > 0;
      c.fillStyle = look[0];
      c.fillRect(x - 1, y - 1, 3, 2);
      if (up) { c.fillRect(x - 3, y - 3, 2, 1); c.fillRect(x + 2, y - 3, 2, 1); c.fillRect(x - 2, y - 2, 1, 1); c.fillRect(x + 2, y - 2, 1, 1); }
      else { c.fillRect(x - 3, y, 2, 1); c.fillRect(x + 2, y, 2, 1); }
      c.fillStyle = look[2]; c.fillRect(x + (b.face > 0 ? 2 : -2), y - 1, 1, 1);
    }
  }
  const lifePass = {
    midDrawOrder: -2,
    onMidDraw() {
      if (!inGameplay() || !wildlifeOn() || outdoorFade < 0.5 || !enabled) return;
      try {
        const c = ig.system.context, W = ig.system.width, H = ig.system.height;
        const dt = Math.min(0.1, ig.system.actualTick || 1 / 60);
        if (!sc.model.isPaused() && !sc.model.isMenu()) updateWildlife(dt, W, H);
        const sx = ig.game.screen.x, sy = ig.game.screen.y;
        c.save();
        c.globalAlpha = outdoorFade;
        for (const f of flocks) for (const b of f.birds) drawBird(c, b, f.look, sx, sy);
        for (const b of butterflies) {
          const x = Math.round(b.x - sx), y = Math.round(b.y - sy - b.hover - Math.sin(b.ph * 0.25) * 2);
          const open = Math.sin(b.ph) > 0;
          c.globalAlpha = outdoorFade * b.fade;
          c.fillStyle = "rgba(0,0,0,0.18)"; c.fillRect(x, Math.round(b.y - sy), 2, 1);    // a faint shadow
          c.fillStyle = b.col;
          if (open) { c.fillRect(x - 1, y, 1, 2); c.fillRect(x + 2, y, 1, 2); c.fillRect(x - 2, y - 1, 2, 1); c.fillRect(x + 2, y - 1, 2, 1); }
          else { c.fillRect(x, y - 1, 1, 2); c.fillRect(x + 1, y - 1, 1, 2); }
          c.fillStyle = "#2a2018"; c.fillRect(x, y, 2, 1);
        }
        c.restore();
      } catch (e) {}
    }
  };
  function drawBats(c, W, H) {
    if (!bats.length || !wildlifeOn()) return;
    const sx = ig.game.screen.x, sy = ig.game.screen.y;
    for (const b of bats) {
      const x = Math.round(b.x - sx), y = Math.round(b.y - sy), up = Math.sin(b.ph) > 0;
      if (x < -6 || y < -6 || x > W + 6 || y > H + 6) continue;
      c.fillStyle = "#1c1426"; c.fillRect(x - 1, y - 1, 2, 2);
      c.fillStyle = "#4a3c62";
      if (up) { c.fillRect(x - 3, y - 2, 2, 1); c.fillRect(x + 1, y - 2, 2, 1); c.fillRect(x - 4, y - 3, 1, 1); c.fillRect(x + 3, y - 3, 1, 1); }
      else { c.fillRect(x - 3, y, 2, 1); c.fillRect(x + 1, y, 2, 1); c.fillRect(x - 4, y + 1, 1, 1); c.fillRect(x + 3, y + 1, 1, 1); }
    }
  }

  let installedFor = null;
  function install() {
    const g = window.ig && ig.game;
    if (!g || !g.addons || !g.addons.midDraw || !ig.light) return false;
    if (installedFor !== g) {
      const md = g.addons.midDraw;
      if (!md.includes(tintPass)) md.unshift(tintPass);   // before the light engine's darkness
      if (!md.includes(lifePass)) md.unshift(lifePass);   // wildlife: in the world, before the tint
      if (!md.includes(fxPass)) md.push(fxPass);          // after everything else in the world
      installedFor = g;
    }
    if (!ig.light.darknessHandles.includes(darkHandle)) ig.light.addDarknessHandle(darkHandle);
    return true;
  }

  // ---------- weather sounds ----------
  // Looping layers fade with the weather; thunder rumbles a moment after each lightning flash.
  const SND = "media/sound/";
  const LAYERS = {
    rain:       { path: "background/rain.ogg", vol: 0.7 },
    rainStrong: { path: "background/rain-strong.ogg", vol: 0.7 },
    rainInside: { path: "background/rain-inside.ogg", vol: 0.8 },
    snowWind:   { path: "background/bergen-trail/bergen-wind-subtle.ogg", vol: 0.7 },
    coldWind:   { path: "background/bergen-trail/cold-wind.ogg", vol: 0.38 },
    strongWind: { path: "background/strong-wind.ogg", vol: 0.28 },
    sand:       { path: "background/desert/sandstorm-ambient.ogg", vol: 0.8 },
    breeze:     { path: "background/wind.ogg", vol: 0.35 }
  };
  const THUNDER = ["battle/heavy-thunder.ogg", "battle/heavy-thunder-2.ogg"];
  let soundsReady = false, thunderSounds = [], thunderIn = 0;
  function initSounds() {
    if (soundsReady || !window.ig || !ig.Sound || !ig.soundManager) return soundsReady;
    try {
      for (const k in LAYERS) Object.assign(LAYERS[k], { sound: new ig.Sound(SND + LAYERS[k].path, 1), handle: null, level: 0, base: 0 });
      thunderSounds = THUNDER.map(p => new ig.Sound(SND + p, 1));
      soundsReady = true;
    } catch (e) { console.error("[CrossCode Enhanced] sounds", e); }
    return soundsReady;
  }
  // music ducking: always computed from the player's own music setting, so it returns exactly to it
  let duck = 1, duckApplied = 1;
  function applyMusicDuck() {
    if (!ig.music || !sc.options) return;
    const userVol = sc.options.get("volume-music");
    if (typeof userVol !== "number") return;
    const target = userVol * duck;
    if (Math.abs(target - ig.music.volume) > 0.004 || (duck === 1 && duckApplied !== 1)) {
      ig.music.volume = duck > 0.999 ? userVol : target;
      duckApplied = duck > 0.999 ? 1 : duck;
    }
  }

  // indoors in a town/area that has weather (e.g. a Rookie Harbor house): hear that area's rain on the roof
  function indoorWeather(map) {
    const m = (map || "").toLowerCase();
    if (!m || isOutdoor(map) || !CONFIG.outdoorPrefixes.some(p => m.startsWith(p))) return null;
    return climateWeather(climateFor(map));
  }
  function updateSounds(dt, map, outside, playing) {
    if (!initSounds()) return;
    const sc_ = CONFIG.sound || {};
    const on = sc_.enabled !== false && enabled && playing;
    // full volume in play, quieter in menus, silent when paused or the window is hidden
    let master = on ? (sc_.volume === undefined ? 1.3 : sc_.volume) : 0;
    try { if (sc.model.isPaused() || document.hidden) master = 0; else if (sc.model.isMenu() || sc.model.isQuickMenu()) master *= 0.4; } catch (e) {}
    const out = outdoorFade, inW = sc_.indoorRain === false ? null : indoorWeather(map), inFade = 1 - out;
    // which layers fit the weather; the smoothed levels make them fade in and out with it
    const I = Math.max(0.05, CONFIG.weatherIntensity);
    const heavy = weather === "storm" || weather === "downpour";
    const rainAmt = clamp01(level.rain / (0.55 * I));
    const want = {
      rain:       out * rainAmt * (heavy ? 0.4 : 0.75),   // light rain a little softer so it matches what you see
      rainStrong: heavy ? out * rainAmt : 0,
      rainInside: inFade * ((inW === "rain" ? 0.6 : 0) + (inW === "storm" || inW === "downpour" ? 1 : 0)),
      snowWind:   out * clamp01(level.snow / (0.55 * I)) * (1 - clamp01(level.blizzard / I)),
      coldWind:   out * clamp01(level.blizzard / I),
      strongWind: out * Math.max(clamp01(level.blizzard / I) * 0.6, clamp01(level.sand / I) * 0.7),
      sand:       out * clamp01(level.sand / I),
      breeze:     out * clamp01(level.fog / I)
    };
    for (const k in LAYERS) {
      const L = LAYERS[k];
      L.level = approach(L.level, clamp01(want[k] || 0) * master, 1.2, dt);
      if (L.level > 0.005 && !L.handle) {
        try {
          L.handle = L.sound.play(true, { fadeDuration: 0.6 });
          if (L.handle) L.base = L.handle._volume;    // includes the game's own sound volume setting
        } catch (e) { L.handle = null; }
      }
      if (L.handle) {
        const v = L.base * L.vol * L.level;
        L.handle._volume = v;
        if (L.handle._nodeSource && !L.handle._fadeTimer) L.handle._nodeSource.setVolume(v * v);
        if (L.level <= 0.005) { try { L.handle.pause(); } catch (e) {} L.handle = null; }
      }
    }
    // lower the music a little while heavy weather is audible, so it doesn't drown the weather out
    const heaviness = clamp01(Math.max(
      want.rainStrong, want.coldWind, want.sand, want.rain * 0.55, want.snowWind * 0.45, want.breeze * 0.3, want.rainInside * 0.4));
    const duckTarget = on && master > 0 ? 1 - clamp01(sc_.musicDuck === undefined ? 0.35 : sc_.musicDuck) * heaviness : 1;
    duck = approach(duck, duckTarget, 0.8, dt);
    applyMusicDuck();

    // thunder after lightning (outdoors), or a distant rumble when you're indoors in a storm
    if (thunderIn > 0) {
      thunderIn -= dt;
      if (thunderIn <= 0 && sc_.thunder !== false && master > 0) {
        const vol = (outside ? 0.55 : 0.2) * master;
        try {
          const h = thunderSounds[Math.floor(Math.random() * thunderSounds.length)].play(false);
          if (h && h._nodeSource) { h._volume *= vol; h._nodeSource.setVolume(h._volume * h._volume); }
          else if (h) h._volume *= vol;
        } catch (e) {}
      }
    }
    if (!outside && inW === "storm" && Math.random() < dt / 25) thunderIn = 0.1;   // muffled storm overhead
  }

  // ---------- weather in combat: elemental damage follows the weather ----------
  const ELEMENT_NAMES = { 1: "HEAT", 2: "COLD", 3: "SHOCK", 4: "WAVE" };
  // damage multiplier for an element right now (1 = no change)
  // clear weather favours Heat by day and Cold by night
  function combatWeatherKey() {
    if (weather !== "clear") return weather;
    return skyAt(state.minutes / 60)[4] > 0.5 ? "clearNight" : "clear";
  }
  function weatherElementFactor(element) {
    const wc = CONFIG.weatherCombat;
    if (!wc || !wc.enabled || !enabled || !element || outdoorFade < 0.5) return 1;
    const fx = wc.effects[combatWeatherKey()];
    const name = ELEMENT_NAMES[element];
    if (!fx || !name || fx[name] === undefined) return 1;
    return Math.max(0, 1 + (fx[name] - 1) * (wc.strength === undefined ? 1 : wc.strength));
  }
  // short text for the current weather's effects, e.g. "Wave+ Heat-"
  function weatherCombatSummary() {
    const wc = CONFIG.weatherCombat;
    if (!wc || !wc.enabled || !enabled || outdoorFade < 0.5) return "";
    const fx = wc.effects[combatWeatherKey()];
    if (!fx) return "";
    const nice = n => n.charAt(0) + n.slice(1).toLowerCase();
    return Object.entries(fx).filter(([, v]) => v !== 1).sort((a, b) => b[1] - a[1])
      .map(([n, v]) => nice(n) + (v > 1 ? "+" : "-")).join(" ");
  }
  function installWeatherCombat() {
    if (!window.sc || !sc.CombatParams || sc.CombatParams.prototype.__wdnWeather) return;
    const proto = sc.CombatParams.prototype;
    proto.__wdnWeather = true;
    const orig = proto.getDamage;
    // getDamage(attackInfo, ...) on the target: scale this hit's damage factor, then restore it
    proto.getDamage = function (attackInfo) {
      let f = 1;
      try { f = attackInfo ? weatherElementFactor(attackInfo.element) : 1; } catch (e) {}
      if (f === 1) return orig.apply(this, arguments);
      const before = attackInfo.damageFactor;
      attackInfo.damageFactor = before * f;
      try { return orig.apply(this, arguments); }
      finally { attackInfo.damageFactor = before; }
    };
    console.log("[CrossCode Enhanced] weather combat active");
  }

  // ---------- night-time enemies: tougher, better rare drops ----------
  // ---------- moon phases ----------
  const MOON_NAMES = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous",
                      "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  // A night belongs to the evening it started on, so the phase doesn't flip at midnight.
  function moonPhase() {
    const m = CONFIG.moon, days = Math.max(1, Math.round((m && m.cycleDays) || 8));
    const nightDay = state.day - (state.minutes < 12 * 60 ? 1 : 0);
    const pos = (((nightDay - 1) % days) + days) % days / days;      // 0 = new, 0.5 = full
    return { index: Math.round(pos * 8) % 8, light: (1 - Math.cos(pos * 2 * Math.PI)) / 2 };   // light: 0 new .. 1 full
  }
  function moonOn() { return CONFIG.moon && CONFIG.moon.enabled !== false; }
  // multipliers on the night bonuses: loot grows towards full moon, toughness towards new moon
  function moonLoot() { return moonOn() ? 1 + ((CONFIG.moon.fullLoot || 1) - 1) * moonPhase().light : 1; }
  function moonTough() { return moonOn() ? 1 + ((CONFIG.moon.newToughness || 1) - 1) * (1 - moonPhase().light) : 1; }
  // darkness multiplier: full moon lightens the night, new moon deepens it
  function moonDark() { return moonOn() ? 1 + (CONFIG.moon.brightness || 0) * (0.5 - moonPhase().light) : 1; }

  // ---------- weather events: now and then a day brings something rare ----------
  //  Blood Moon (19:00 - 05:00): a red night; enemies are fiercer (+25% HP and attack) but give double EXP and
  //    Credits, double rare drops, and shinies turn up twice as often.
  //  Eclipse (11:00 - 14:00): the sun goes dark at midday; it counts as night (night enemies and all), and
  //    shinies are three times as likely.
  //  Tempest (06:00 - 24:00): wild weather in every area (storms, blizzards, sandstorms, downpours), so the
  //    weather's elements matter all day; +50% EXP and Credits.
  // Which days have one is fixed by the day number (never two days running, none on the first days), so the
  // forecast can tell you a day ahead.
  const EVENTS = {
    bloodMoon: { name: "Blood Moon", from: 19, to: 29, desc: "Fiercer enemies tonight, but double EXP, Credits and rare drops, and twice the shinies" },
    eclipse: { name: "Eclipse", from: 11, to: 14, desc: "Midday darkness: night enemies come out, and shinies are three times as likely" },
    tempest: { name: "Tempest", from: 6, to: 24, desc: "Wild weather everywhere all day, and +50% EXP and Credits" }
  };
  const TEMPEST_W = { snowy: "blizzard", desert: "sandstorm", tropical: "downpour", coastal: "storm", forest: "storm", temperate: "storm" };
  const eventsOn = () => wl("weatherEvents", true) !== false;
  function eventRoll(day) {
    if (day < 3) return null;
    // two numbers from the day (mulberry32): one for whether, one for which
    const rand = n => { let t = (day * 0x9E3779B1 + n * 0x85EBCA6B) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const chance = (Number(wl("eventChance", 0.15)) || 0.15) + (window.wdnPerk && window.wdnPerk("s1") ? 0.05 : 0);   // (skill: Storm Chaser)
    if (rand(1) >= chance) return null;
    const t = rand(2);
    return t < 0.4 ? "bloodMoon" : t < 0.7 ? "eclipse" : "tempest";
  }
  function eventOn(day) { const e = eventRoll(day); return e && !eventRoll(day - 1) ? e : null; }
  // the event happening now (or null), with k = 0..1, fading in and out over its first and last half hour
  // (looked up many times a frame by the sky, the stats and the loot, so worked out at most ten times a second)
  let evCache = { t: -1e9, v: null };
  function activeEvent() {
    const now = performance.now();
    if (now - evCache.t < 100) return evCache.v;
    evCache.t = now;
    return (evCache.v = activeEventNow());
  }
  function activeEventNow() {
    if (!eventsOn() || !enabled) return null;
    const h = state.minutes / 60, ramp = (a, b) => clamp01(Math.min(a, b) / 0.5);
    const today = eventOn(state.day), yday = eventOn(state.day - 1);
    if (yday === "bloodMoon" && h < 5) return { key: yday, day: state.day - 1, k: ramp(h + 5, 5 - h) };
    if (!today) return null;
    const E = EVENTS[today];
    if (h < E.from || h > E.to) return null;
    return { key: today, day: state.day, k: ramp(h - E.from, Math.min(24, E.to) - h + (E.to > 24 ? 5 : 0)) };
  }
  const eventK = key => { const e = activeEvent(); return e && e.key === key && isOutdoor(currentMap()) ? e.k : 0; };
  window.wdnEvent = () => { const e = activeEvent(); return e && isOutdoor(currentMap()) ? Object.assign({ name: EVENTS[e.key].name, desc: EVENTS[e.key].desc }, e) : null; };
  window.wdnEventNext = () => { if (!enabled) return null; for (let d = state.day; d <= state.day + 1; d++) { const e = eventOn(d); if (e && d === state.day && state.minutes / 60 > EVENTS[e].to) continue; if (e && eventsOn()) return { key: e, day: d, name: EVENTS[e].name, from: EVENTS[e].from }; } return null; };
  window.wdnHour = () => state.minutes / 60;
  // (for the hideout's windows: the sky outside, wherever Lea is)
  window.wdnSolarHour = () => solarHour(state.minutes / 60);
  window.wdnEventKey = () => { const e = activeEvent(); return e ? e.key : null; };
  // sleeping in Lea's own bed (her hideout): free, always till the next morning
  window.wdnSleep = kind => {
    if (resting) return false;
    if (kind === "evening" && state.minutes / 60 >= 8 && state.minutes / 60 < 20) startRest(0, { hour: 20, label: "evening", nextDay: false });
    else startRest(0, { hour: 8, label: "morning", nextDay: state.minutes / 60 >= 8 });
    return true;
  };
  // Lea's bed (extras.js): the same choice of times, free. after(target) runs once she's settled on one
  window.wdnBedRest = (talk, intro, after) => { if (resting) return false; askRestTime(talk, intro, 0, after); return true; };
  window.wdnAbsMinutes = () => (state.day - 1) * 1440 + state.minutes;   // in-game minutes since day 1
  window.wdnAreaWeather = area => { try { const cl = climateForNow(area); return { climate: cl, weather: climateWeather(cl) }; } catch (e) { return null; } };
  window.wdnEventShiny = () => 1 + eventK("bloodMoon") + 2 * eventK("eclipse");

  // 0..1: how much "night" applies right now (0 in daytime, indoors, or with the mod switched off)
  function nightFactor() {
    const ne = CONFIG.nightEnemies;
    if (!ne || !ne.enabled || !enabled) return 0;
    if (!isOutdoor(currentMap())) return 0;
    return clamp01(Math.max(skyAt(state.minutes / 60)[4], eventK("eclipse")));
  }
  const NIGHT_STATS = ["hp", "attack", "defense", "focus"];
  function nightScaleParams(params, k) {
    const ne = CONFIG.nightEnemies, out = Object.assign({}, params);
    for (const st of NIGHT_STATS)
      if (typeof out[st] === "number" && ne[st]) out[st] = Math.round(out[st] * (1 + (ne[st] - 1) * k * moonTough()));
    return out;
  }
  function installNightEnemies() {
    if (!window.sc || !sc.EnemyType || sc.EnemyType.prototype.__wdnNight) return;
    const proto = sc.EnemyType.prototype;
    proto.__wdnNight = true;

    // Stats: the game rebuilds an enemy's stats from its type data on spawn, so scaling the
    // result here never stacks up. Element-mode variants are scaled the same way.
    const origUpdate = proto.updateParams;
    proto.updateParams = function (enemy) {
      origUpdate.apply(this, arguments);
      try {
        const k = nightFactor();
        enemy.__wdnNight = 0;
        // a Blood Moon: +25% HP and attack on top of anything else
        const bk = eventK("bloodMoon");
        enemy.__wdnBlood = 0;
        if (bk > 0.05 && !this.boss) {
          const bp = Object.assign({}, enemy.params.baseParams);
          for (const st of ["hp", "attack"]) if (typeof bp[st] === "number") bp[st] = Math.round(bp[st] * (1 + 0.25 * bk));
          enemy.params.setBaseParams(bp, true);
          enemy.__wdnBlood = bk;
        }
        if (k < 0.05 || (this.boss && !CONFIG.nightEnemies.includeBosses)) return;
        if (enemy.elementModes && enemy.elementModes.modes)
          enemy.elementModes.modes = enemy.elementModes.modes.map(m => m ? nightScaleParams(m, k) : m);
        enemy.params.setBaseParams(nightScaleParams(enemy.params.baseParams, k), true);
        enemy.__wdnNight = k;
      } catch (e) { console.error("[CrossCode Enhanced] night stats", e); }
    };

    // Drops: briefly raise the chance of rare drops for this roll, then put it back.
    const origDrops = proto.resolveItemDrops;
    proto.resolveItemDrops = function (enemy) {
      const k = Math.max(nightFactor(), (enemy && enemy.__wdnNight) || 0);
      const ne = CONFIG.nightEnemies, changed = [];
      let f = k >= 0.05 && ne.enabled && (!this.boss || ne.includeBosses) ? (1 + (ne.rareDropBonus - 1) * k * moonLoot()) * (window.wdnPerk && window.wdnPerk("s2") ? 1.25 : 1) : 1;
      const bk = Math.max(eventK("bloodMoon"), (enemy && enemy.__wdnBlood) || 0);
      if (bk > 0.05 && !this.boss) f *= 1 + bk;   // Blood Moon: double rare drops
      if (f > 1.001) {
        for (const d of this.itemDrops || []) {
          if (typeof d.prob === "number" && d.prob > 0 && d.prob <= ne.rareThreshold) {
            changed.push([d, d.prob]);
            d.prob = Math.min(0.99, d.prob * f);
          }
        }
      }
      try { return origDrops.apply(this, arguments); }
      finally { for (const [d, p] of changed) d.prob = p; }
    };
    // Credits and EXP: raise them just for this kill, then restore the enemy type's values.
    const origDefeat = proto.resolveDefeat;
    proto.resolveDefeat = function (enemy) {
      const k = Math.max(nightFactor(), (enemy && enemy.__wdnNight) || 0);
      const ne = CONFIG.nightEnemies, credit = this.credit, exp = this.exp;
      if (k >= 0.05 && ne.enabled && (!this.boss || ne.includeBosses)) {
        const owl = window.wdnPerk && window.wdnPerk("s2") ? 1.25 : 1;   // (skill: Night Owl)
        if (this.credit) this.credit = Math.round(this.credit * (1 + ((ne.credits || 1) - 1) * k * moonLoot()) * owl);
        if (this.exp) this.exp = Math.round(this.exp * (1 + ((ne.exp || 1) - 1) * k * moonLoot()) * owl);
      }
      // events: Blood Moon doubles EXP and Credits, a Tempest adds half again
      const ev = (1 + Math.max(eventK("bloodMoon"), (enemy && enemy.__wdnBlood) || 0)) * (1 + 0.5 * eventK("tempest"));
      if (ev > 1.001) { if (this.credit) this.credit = Math.round(this.credit * ev); if (this.exp) this.exp = Math.round(this.exp * ev); }
      try { return origDefeat.apply(this, arguments); }
      finally { this.credit = credit; this.exp = exp; }
    };
    console.log("[CrossCode Enhanced] night enemies active");
  }

  // ---------- HUD clock box (built from the game's own GUI classes) ----------
  const WEATHER_LABEL = { clear: "Clear", cloudy: "Cloudy", rain: "Rain", storm: "Storm", fog: "Fog",
                          snow: "Snow", blizzard: "Blizzard", sandstorm: "Sandstorm", downpour: "Downpour" };
  const HUD_MODES = ["always", "auto", "off"];
  let hudMode = HUD_MODES.includes(CONFIG.hudMode) ? CONFIG.hudMode : "always";
  try { const m = localStorage.getItem(SAVE_KEY + "-hud"); if (HUD_MODES.includes(m)) hudMode = m; } catch (e) {}
  let ClockBox = null, clockBox = null, clockPanel = null;
  let autoTimer = 0, lastHourShown = -1, lastWeatherShown = "", lastAreaShown = null, lastMapShown = null;

  function phaseName(clockHour) {
    const hour = solarHour(clockHour);
    if (hour >= 5 && hour < 8) return "Dawn";
    if (hour >= 8 && hour < 12) return "Morning";
    if (hour >= 12 && hour < 17) return "Afternoon";
    if (hour >= 17 && hour < 20) return "Dusk";
    return moonOn() ? MOON_NAMES[moonPhase().index] : "Night";
  }

  function defineClockBox() {
    if (ClockBox || !window.sc || !sc.RightHudBoxGui || !sc.TextGui) return !!ClockBox;
    ClockBox = sc.RightHudBoxGui.extend({
      textGui: null, titleText: "", bodyText: "",
      init() {
        this.parent("Day 1");
        const holder = new ig.GuiElementBase();
        this.textGui = new sc.TextGui("\\c[3]00:00\\c[0]  Afternoon · Storm");
        holder.setSize(this.textGui.hook.size.x, this.textGui.hook.size.y);
        holder.addChildGui(this.textGui);
        this.pushContent(holder);
      },
      setInfo(title, body) {
        if (title !== this.titleText) {
          this.titleText = title;
          try { this.titleGui.hook.children[0].gui.setText(title); } catch (e) {}
        }
        if (body !== this.bodyText) { this.bodyText = body; this.textGui.setText(body); }
      }
    });
    return true;
  }

  function ensureClockBox() {
    if (!defineClockBox() || !sc.gui || !sc.gui.rightHudPanel) return false;
    if (clockPanel !== sc.gui.rightHudPanel || !clockBox) {
      clockPanel = sc.gui.rightHudPanel;
      clockBox = new ClockBox();
      clockPanel.addHudBox(clockBox, 0);   // top of the right-hand HUD stack
    }
    return true;
  }

  // ---------- status-style clock plate (top left, under the health bar) ----------
  // Sprite sheet shipped in the mod's assets folder (CCLoader serves it at this path).
  const PLATE_W = 84, PLATE_H = 15, TAB_X = 14, TAB_W = 41;
  const ICON = { sun: [88, 0], dusk: [98, 0], moon: [108, 0], cloudy: [118, 0], rain: [88, 10], storm: [98, 10], fog: [108, 10],
                 snow: [88, 20], blizzard: [98, 20], sandstorm: [108, 20], downpour: [118, 20] };
  // Day-progress bar colour over the day: [hour, r, g, b]
  const BAR = [[0, 74, 100, 184], [5, 74, 100, 184], [6.5, 255, 159, 122], [8, 242, 200, 75], [17, 242, 200, 75],
               [19, 255, 138, 61], [21, 120, 96, 180], [24, 74, 100, 184]];
  function barColor(hour) {
    for (let i = 0; i < BAR.length - 1; i++) {
      const a = BAR[i], b = BAR[i + 1];
      if (hour >= a[0] && hour <= b[0]) {
        const t = (hour - a[0]) / (b[0] - a[0] || 1);
        return `rgb(${lerp(a[1], b[1], t) | 0},${lerp(a[2], b[2], t) | 0},${lerp(a[3], b[3], t) | 0})`;
      }
    }
    return "rgb(242,200,75)";
  }
  function phaseIcon(clockHour) {
    const hour = solarHour(clockHour);
    if (hour >= 8 && hour < 17.5) return ICON.sun;
    if ((hour >= 5.5 && hour < 8) || (hour >= 17.5 && hour < 20)) return ICON.dusk;
    return moonOn() ? [moonPhase().index * 10, 48] : ICON.moon;    // the moon's current phase
  }

  let StatusClock = null, statusClock = null, statusParent = null;

  // the event badge on the clock: a little 11 x 11 plate with a pulsing ring, the event drawn in it
  let lastEventShown = null;
  function drawEventBadge(r, x, y, key) {
    const t = performance.now() / 1000, p = 0.5 + 0.5 * Math.sin(t * 4), o = "rgb(14,12,18)";
    const ring = key === "bloodMoon" ? "rgb(230,60,60)" : key === "eclipse" ? "rgb(255,214,96)" : "rgb(150,170,230)";
    // plate with cut corners, and a ring that breathes
    r.addColor(o, x + 1, y, 9, 11); r.addColor(o, x, y + 1, 11, 9);
    r.addColor(ring, x + 1, y, 9, 1).setAlpha(0.4 + 0.6 * p); r.addColor(ring, x + 1, y + 10, 9, 1).setAlpha(0.4 + 0.6 * p);
    r.addColor(ring, x, y + 1, 1, 9).setAlpha(0.4 + 0.6 * p); r.addColor(ring, x + 10, y + 1, 1, 9).setAlpha(0.4 + 0.6 * p);
    const cx = x + 5, cy = y + 5, disc = (rad, col, a) => { for (let dy = -rad; dy <= rad; dy++) { const hw = Math.round(Math.sqrt(rad * rad - dy * dy)); r.addColor(col, cx - hw, cy + dy, hw * 2 + 1, 1).setAlpha(a == null ? 1 : a); } };
    if (key === "bloodMoon") { disc(3, "rgb(200,36,44)"); r.addColor("rgb(120,14,22)", cx, cy, 2, 2); r.addColor("rgb(255,150,140)", cx - 2, cy - 2, 1, 1); }
    else if (key === "eclipse") { disc(3, "rgb(255,226,120)"); disc(2, o); r.addColor("#fff", cx + 2, cy - 3, 1, 1).setAlpha(p); }
    else {   // tempest: cloud and bolt
      r.addColor("rgb(120,128,156)", cx - 3, cy - 2, 7, 3); r.addColor("rgb(150,158,186)", cx - 1, cy - 3, 3, 1);
      if (p > 0.35) { r.addColor("rgb(255,226,90)", cx, cy + 1, 2, 1); r.addColor("rgb(255,226,90)", cx - 1, cy + 2, 2, 1); r.addColor("rgb(255,226,90)", cx, cy + 3, 1, 1); }
    }
  }
  function defineStatusClock() {
    if (StatusClock || !window.sc || !sc.NumberGui || !sc.TextGui || !ig.ImageGui) return !!StatusClock;
    StatusClock = ig.GuiElementBase.extend({
      gfx: new ig.Image("media/gui/wdn-clock.png"),
      basic: new ig.Image("media/gui/basic.png"),
      hours: null, minutes: null, colon: null, dayText: null,
      hidden: true, hourF: 12, icon: ICON.sun, weatherIcon: null, dayShown: -1, eventKey: null,
      init() {
        // slide in from the nearest screen edge
        this.transitions = {
          DEFAULT: { state: {}, time: 0.2, timeFunction: KEY_SPLINES.EASE_OUT },
          HIDDEN: { state: { alpha: 0, offsetX: rootPlaced() ? 16 : -16 }, time: 0.2, timeFunction: KEY_SPLINES.EASE_IN }
        };
        this.parent();
        this.setSize(PLATE_W, PLATE_H + 8);
        this.hours = new sc.NumberGui(99, { leadingZeros: 2 });
        this.hours.setPos(21, 1);
        this.addChildGui(this.hours);
        this.colon = new ig.ImageGui(this.gfx, 120, 10, 3, 8);   // two-dot ":" in the digit font style
        this.addChildGui(this.colon);
        this.minutes = new sc.NumberGui(99, { leadingZeros: 2 });
        this.addChildGui(this.minutes);
        this.dayText = new sc.TextGui("DAY 1", { font: sc.fontsystem.tinyFont });
        this.dayText.setPos(TAB_X + 4, PLATE_H);
        this.addChildGui(this.dayText);
        this.setTime(0, 0);
        this.doStateTransition("HIDDEN", true);
      },
      setTime(h, m) {
        this.hours.setNumber(h, true);
        this.minutes.setNumber(m, true);
        const cx = 21 + Math.max(14, this.hours.hook.size.x) + 1;
        this.colon.setPos(cx, 1);
        this.minutes.setPos(cx + 4, 1);
      },
      setInfo(hour, minutes, day, weather, ev) {
        this.eventKey = ev || null;
        const h = Math.floor(hour), m = Math.floor(minutes % 60);
        const h12 = CONFIG.clock12h ? (h % 12 || 12) : h;
        if (h12 !== this._h || m !== this._m) { this._h = h12; this._m = m; this.setTime(h12, m); }
        this.dayText.hook.localAlpha = CONFIG.clockDay === false ? 0 : 1;
        if (day !== this.dayShown) {
          this.dayShown = day; this.dayText.setText(String(day));
          this.tabW = Math.max(TAB_W, this.dayText.hook.size.x + 15);
        }
        this.hourF = hour;
        this.icon = phaseIcon(hour);
        this.weatherIcon = weather && CONFIG.clockWeatherIcon !== false ? ICON[weather] || null : null;
        // colon blinks once a second, like a digital clock
        this.colon.hook.localAlpha = (performance.now() % 1000) < 600 ? 1 : 0.35;
      },
      show() { if (this.hidden) { this.hidden = false; this.doStateTransition("DEFAULT"); } },
      hide(instant) { if (!this.hidden) { this.hidden = true; this.doStateTransition("HIDDEN", !!instant); } },
      updateDrawables(r) {
        r.addGfx(this.gfx, 0, 0, 0, 0, PLATE_W, PLATE_H);           // black slanted plate
        // "DAY n" tab, stretched by overlapping copies when the label is longer
        const tw = this.tabW || TAB_W;
        if (CONFIG.clockDay !== false) {
          for (let x = TAB_X + tw - TAB_W; x > TAB_X; x -= 20) r.addGfx(this.gfx, x, PLATE_H, 0, 16, TAB_W, 8);
          r.addGfx(this.gfx, TAB_X, PLATE_H, 0, 16, TAB_W, 8);
        }
        r.addGfx(this.gfx, 9, 0, this.icon[0], this.icon[1], 9, 9);  // sun / dusk / moon
        if (this.weatherIcon) r.addGfx(this.gfx, 64, 0, this.weatherIcon[0], this.weatherIcon[1], 9, 9);
        // a weather event on: its badge just right of the day tab
        if (this.eventKey) drawEventBadge(r, TAB_X + (this.tabW || TAB_W) + 2, PLATE_H - 2, this.eventKey);
        // day-progress bar in the plate's slanted track, coloured by time of day
        const len = CONFIG.clockBar === false ? 0 : Math.round(64 * clamp01(this.hourF / 24));
        if (len > 0) {
          const col = barColor(this.hourF);
          for (let row = 9; row <= 11; row++) r.addColor(col, row + 3, row, len, 1);
        }
      }
    });
    return true;
  }

  function ensureStatusClock() {
    if (!defineStatusClock() || !sc.gui || !sc.gui.statusHud) return false;
    if (rootPlaced()) {
      // its own HUD element, anchored to the bottom-right corner of the screen (or under the minimap)
      if (!statusClock || !ig.gui.guiHooks.includes(statusClock.hook)) {
        statusClock = new StatusClock();
        statusClock.setAlign(ig.GUI_ALIGN.X_RIGHT, ig.GUI_ALIGN.Y_BOTTOM);
        statusClock.setPos(CONFIG.cornerMargin.x, CONFIG.cornerMargin.y);
        statusClock.hook.zIndex = 1201;
        statusClock.hook.pauseGui = true;   // keep animating while the game is paused (like the status HUD)
        ig.gui.addGuiElement(statusClock);
      }
      return true;
    }
    if (statusParent !== sc.gui.statusHud || !statusClock) {
      statusParent = sc.gui.statusHud;
      statusClock = new StatusClock();
      statusParent.addChildGui(statusClock);
      statusClock.setPos(4, 66);
    }
    return true;
  }
  // In the corner the clock isn't part of the status HUD, so mirror its visibility (hidden in cutscenes etc).
  function statusHudHidden() {
    try { return sc.gui.statusHud.hook.currentStateName === "HIDDEN"; } catch (e) { return false; }
  }

  // Where the plate goes. "right": just past the end of the SP gauge on the HP row
  // (SP sits 55px right of the HP bar; it's a 19px label plus 30px per block of 4 pips and a 6px cap).
  // "below": tucked under whatever is in the left column (party members 26px apart from y=39, keys at y=53).
  let plateX = -1, plateY = -1;
  function plateTarget() {
    const hud = sc.gui.statusHud;
    const visible = g => g && g.hook && g.hook.currentStateName !== "HIDDEN";
    if (CONFIG.statusPlacement !== "below") {
      const maxSp = (sc.model.player.params && sc.model.player.params.maxSp) || 0;
      const hasSp = maxSp > 0 && sc.model.player.getCore(sc.PLAYER_CORE.SPECIAL);
      const x = hasSp ? 24 + 55 + 19 + Math.ceil(maxSp / 4) * 30 + 6 + 3 : 24 + 68 + 3;
      return [x, 3];
    }
    let y = 40;
    if (visible(hud.partyGui)) {
      const n = (hud.partyGui.memberGuis || []).length;
      if (n > 0) y = Math.max(y, 39 + 26 * n + 2);
    }
    if (visible(hud.keyHud)) y = Math.max(y, 53 + 14);
    return [4, y];
  }
  const barLift = () => { try { return window.wdnBottomBarLift ? window.wdnBottomBarLift() : 0; } catch (e) { return 0; } };
  function placeStatusClock() {
    if (CONFIG.statusPlacement === "minimap") {
      // hangs under the minimap, lined up with its outer edge; bottom right if the minimap is off
      const r = window.ccMinimapRect;
      if (r) {
        statusClock.setAlign(ig.GUI_ALIGN.X_LEFT, ig.GUI_ALIGN.Y_TOP);
        statusClock.setPos(r.right ? r.x + r.w - PLATE_W : r.x, r.y + r.h + 1);
      } else {
        statusClock.setAlign(ig.GUI_ALIGN.X_RIGHT, ig.GUI_ALIGN.Y_BOTTOM);
        statusClock.setPos(CONFIG.cornerMargin.x, CONFIG.cornerMargin.y + barLift());
      }
      return;
    }
    if (CONFIG.statusPlacement === "corner") {
      // up out of the way of the game's pop-ups (see the minimap code), else in the corner
      const y = CONFIG.cornerMargin.y + barLift();   // (above any big health bar along the bottom)
      if (statusClock.hook.pos.y !== y) statusClock.setPos(CONFIG.cornerMargin.x, y);
      return;
    }
    if (CONFIG.statusPos) { statusClock.setPos(CONFIG.statusPos.x, CONFIG.statusPos.y); return; }
    let x, y;
    try { [x, y] = plateTarget(); } catch (e) { [x, y] = [140, 3]; }
    if (x !== plateX || y !== plateY) {
      if (plateY < 0) statusClock.setPos(x, y);
      else statusClock.doPosTranstition(x, y, 0.2, KEY_SPLINES.EASE_IN_OUT);
      plateX = x; plateY = y;
    }
  }
  // The stat panel (level/HP/ATK/DEF/FOC) slides out over the HP row during element switches and level-ups.
  function statPanelOut() {
    try {
      const hud = sc.gui.statusHud;
      return (hud.paramGui && hud.paramGui._isOut) || sc.model.isLevelUp() || sc.model.isQuickMenu();
    } catch (e) { return false; }
  }

  // Remove the current clock so it gets rebuilt (used when its position or style changes in the settings).
  function teardownClock() {
    try { if (statusClock) statusClock.doStateTransition("HIDDEN", true, true); } catch (e) {}
    try { if (clockBox) clockBox.remove(); } catch (e) {}
    statusClock = null; statusParent = null; clockBox = null; clockPanel = null;
    plateX = -1; plateY = -1;
  }

  // ---------- in-game settings (CCModManager: Options > Mods > CrossCode Enhanced) ----------
  const PLACES = [["status", "corner"], ["status", "right"], ["status", "below"], ["box", "corner"], ["status", "minimap"]];
  // the clock is its own HUD element (not part of the status HUD) in the corner and under the minimap
  function rootPlaced() { return CONFIG.statusPlacement === "corner" || CONFIG.statusPlacement === "minimap"; }
  // for the minimap: where the clock is on screen (so the minimap can keep clear of it), and whether it's
  // meant to hang under the minimap. Space is kept while the clock is in use, even between pop-ups.
  window.wdnClockAttached = () => CONFIG.hudStyle !== "box" && CONFIG.statusPlacement === "minimap" && hudMode !== "off" && enabled;
  window.wdnClockRect = () => {
    try {
      if (hudMode === "off" || !enabled || !window.ccScreenRect) return null;
      const g = CONFIG.hudStyle === "box" ? clockBox : statusClock;
      if (!g || !g.hook || !g.hook.parentHook) return null;
      return window.ccScreenRect(g.hook);
    } catch (e) { return null; }
  };
  // for the bestiary's notes (extras)
  window.wdnDay = () => state.day;
  // the world right now, for the pause menu's info strip and the menus' tint (extras)
  window.wdnNow = () => {
    try {
      const ev = activeEvent(), today = eventOn(state.day);
      return { minutes: state.minutes, hour: solarHour(state.minutes / 60), season: seasonsOn() ? season().name : "", weather: String(weather || "clear"),
        event: ev ? ev.key : null, today: eventsOn() ? today : null, day: state.day, outdoor: isOutdoor(currentMap()), on: !!enabled };
    } catch (e) { return null; }
  };
  window.wdnInnRest = talk => askToRest(talk);   // the innkeepers (extras.js)
  window.wdnNightNow = () => { try { return nightFactor(); } catch (e) { return 0; } };
  window.wdnNightInfo = () => ({ ne: CONFIG.nightEnemies, moon: CONFIG.moon, moonOn: moonOn() });
  window.wdnWheelHook = () => (wheel && wheel.hook) || null;
  window.wdnClockHook = () => { try { const g = CONFIG.hudStyle === "box" ? clockBox : statusClock; return g && g.hook; } catch (e) { return null; } };
  let optionSyncTimer = 0, triedLateRegister = false, lastEffectsOpt;
  function syncOptions(dt) {
    if (!window.wdnOptions && !triedLateRegister && window.wdnRegisterOptions) {
      triedLateRegister = true;
      try { window.wdnRegisterOptions(); } catch (e) {}
    }
    const O = window.wdnOptions;
    if (!O || (optionSyncTimer -= dt) > 0) return;
    optionSyncTimer = 0.5;
    try {
      const num = (v, d) => (typeof v === "number" && !isNaN(v)) ? v : d;
      CONFIG.dayLengthMinutes = num(O.dayLength, 24) || 24;
      CONFIG.nightDarkness = num(O.nightDarkness, 0.6);
      CONFIG.weatherIntensity = num(O.weatherIntensity, 0.8);
      CONFIG.lightningFlash = num(O.lightningFlash, 0.12);
      CONFIG.weatherMinMinutes = num(O.weatherMin, 3);
      CONFIG.weatherMaxMinutes = Math.max(num(O.weatherMax, 8), CONFIG.weatherMinMinutes);
      CONFIG.freakWeatherChance = num(O.freakChance, 0.05);
      CONFIG.playerLight = O.playerLight; CONFIG.partyLights = O.partyLights;
      CONFIG.npcLanterns = O.npcLanterns; CONFIG.fireflies = O.fireflies;

      const place = PLACES[num(O.clockPlace, 0)] || PLACES[0];
      if (place[0] !== CONFIG.hudStyle || place[1] !== CONFIG.statusPlacement) {
        teardownClock();
        CONFIG.hudStyle = place[0]; CONFIG.statusPlacement = place[1];
      }
      CONFIG.hudAutoSeconds = num(O.popupSeconds, 6);
      const mode = HUD_MODES[num(O.clockMode, 0)] || "always";
      if (mode !== hudMode) { hudMode = mode; if (mode === "auto") autoTimer = CONFIG.hudAutoSeconds; }

      const ne = CONFIG.nightEnemies, t = num(O.toughness, 1);
      ne.enabled = O.nightEnemies;
      ne.hp = 1 + 0.20 * t; ne.attack = 1 + 0.15 * t; ne.defense = 1 + 0.10 * t; ne.focus = 1 + 0.10 * t;
      ne.rareDropBonus = num(O.rareDrops, 1.75);
      ne.credits = num(O.credits, 1.25); ne.exp = num(O.exp, 1.25);
      ne.includeBosses = O.bosses;
      const mo = CONFIG.moon;
      if (O.moonPhases !== undefined) mo.enabled = O.moonPhases;
      mo.cycleDays = num(O.moonCycle, 8);
      const se = CONFIG.seasons;
      if (O.seasons !== undefined) se.enabled = O.seasons;
      se.daysPerSeason = num(O.seasonDays, 7);
      if (O.winterSnow !== undefined) se.winterSnow = O.winterSnow;
      if (O.forecast !== undefined) CONFIG.forecast = O.forecast;
      if (O.inns !== undefined) CONFIG.inns.enabled = O.inns;
      CONFIG.inns.cost = num(O.innCost, 50);
      const wc = CONFIG.weatherCombat;
      if (O.weatherCombat !== undefined) wc.enabled = O.weatherCombat;
      wc.strength = num(O.weatherCombatStrength, 1);
      const so = CONFIG.sound;
      if (O.sound !== undefined) so.enabled = O.sound;
      so.volume = num(O.soundVolume, 1.3);
      so.musicDuck = num(O.musicDuck, 0.35);
      if (O.indoorRain !== undefined) so.indoorRain = O.indoorRain;
      if (O.thunder !== undefined) so.thunder = O.thunder;

      // added in the settings redesign
      if (O.effects !== undefined && O.effects !== lastEffectsOpt) { lastEffectsOpt = O.effects; enabled = !!O.effects; }
      applyNightTint(num(O.nightTint, 0));
      CONFIG.sunrise = num(O.sunrise, 6); CONFIG.sunset = num(O.sunset, 19.5);
      CONFIG.startHour = num(O.startHour, 8);
      CONFIG.timeIndoors = O.timeIndoors !== false;
      mo.brightness = num(O.moonBright, 0.25);
      mo.fullLoot = O.moonCombat === false ? 1 : 1.5; mo.newToughness = O.moonCombat === false ? 1 : 1.5;
      const off = {};
      for (const w of ["cloudy", "rain", "downpour", "storm", "fog", "snow", "blizzard", "sandstorm"]) {
        const k = "w" + w[0].toUpperCase() + w.slice(1);
        if (O[k] === false) off[w] = true;
      }
      CONFIG.weatherOff = off;
      const sizes = ["S", "M", "L", "XL"];
      const ls = sizes[num(O.leaLightSize, 3)] || "XL", lsMul = num(O.lightStrength, 1);
      if (ls !== CONFIG.leaLightSize || lsMul !== CONFIG.lightStrength) { CONFIG.leaLightSize = ls; CONFIG.lightStrength = lsMul; resetLights(); }
      CONFIG.clock12h = !!O.clock12h;
      CONFIG.clockDay = O.clockDay !== false;
      CONFIG.clockWeatherIcon = O.clockWeatherIcon !== false;
      CONFIG.clockBar = O.clockBar !== false;
    } catch (e) { console.error("[CrossCode Enhanced] settings", e); }
  }

  function dayLabel() { return (seasonsOn() ? season().name.toUpperCase() + " " : "") + "DAY " + state.day; }

  function updateHud(dt, hour, map, outside, playing) {
    const useStatus = CONFIG.hudStyle !== "box";
    if (useStatus ? !ensureStatusClock() : !ensureClockBox()) return;
    const hh = String(CONFIG.clock12h ? (Math.floor(hour) % 12 || 12) : Math.floor(hour)).padStart(2, "0");
    const mm = String(Math.floor(state.minutes % 60)).padStart(2, "0");
    const evNow = outside && activeEvent();
    const area = evNow ? EVENTS[evNow.key].name : outside ? WEATHER_LABEL[weather] : "Indoors";
    if (useStatus) {
      statusClock.setInfo(hour, state.minutes, dayLabel(), outside && weather !== "clear" ? weather : null, evNow ? evNow.key : null);
      placeStatusClock();
    } else {
      const fcBox = CONFIG.forecast !== false ? "\n" + forecastText(climateFor(map) || climate) : "";
      clockBox.setInfo(seasonsOn() ? `${season().name}, day ${state.day}` : `Day ${state.day}`, `\\c[3]${hh}:${mm}\\c[0]  ${phaseName(hour)} · ${area}${fcBox}`);
    }
    const box = useStatus ? statusClock : clockBox;

    // things worth popping up for in "auto" mode
    const h = Math.floor(hour);
    // pop up on: a new in-game hour, a weather change, or entering any new area
    const evKey = evNow ? evNow.key : null;
    if (h !== lastHourShown || weather !== lastWeatherShown || outside !== lastAreaShown || map !== lastMapShown || evKey !== lastEventShown) {
      if (lastHourShown !== -1 && map) autoTimer = CONFIG.hudAutoSeconds;
      lastHourShown = h; lastWeatherShown = weather; lastAreaShown = outside; lastMapShown = map; lastEventShown = evKey;
    }
    if (autoTimer > 0 && playing) autoTimer -= dt;

    let cutscene = false;
    try { cutscene = sc.model.isCutscene(); } catch (e) {}
    const corner = useStatus && rootPlaced();
    const allowed = playing && enabled && !cutscene && !inMenuOrPause()
      && !(useStatus && CONFIG.statusPlacement === "below" && statPanelOut())   /* (only "below" sits where the stats panel slides out: changing element, level ups) */ && !(corner && statusHudHidden());
    // ...and on demand: while the shortcut wheel is open, or after the "Show clock" key
    const peeking = (wheel && wheel.open) || peekTimer > 0;
    if (peekTimer > 0) peekTimer -= dt;
    const want = allowed && (hudMode === "always" || (hudMode === "auto" && (autoTimer > 0 || peeking)));
    if (want && box.hidden) box.show();
    else if (!want && !box.hidden) box.hide(inMenuOrPause());   // menus/pause: vanish at once, no fade
  }

  // ---------- main tick ----------
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    hookSaves();
    installNightEnemies();
    installWeatherCombat();
    syncOptions(dt);
    if (!install()) return;

    const playing = inGameplay();
    const paused = !playing || inCutscene() || inMenuOrPause() || document.hidden || !!(wheel && wheel.open);

    if (!paused && (CONFIG.timeIndoors !== false || isOutdoor(currentMap()))) {
      state.minutes += dt * (1440 / (CONFIG.dayLengthMinutes * 60));
      while (state.minutes >= 1440) { state.minutes -= 1440; state.day++; }
      for (const name of Object.keys(CONFIG.climates)) {
        climateWeather(name);
        state.climates[name].left -= dt;
        if (state.climates[name].left <= 0) newWeather(name);
      }
    }

    const map = currentMap();
    if (map !== lastMap) {
      lastMap = map; lastCam = null; lights.clear(); resetWildlife();
      if (CONFIG.logMapNames && map) console.log("[CrossCode Enhanced] map: " + map + (isOutdoor(map) ? " (outdoor, " + climateFor(map) + ")" : " (indoor)"));
    }
    const outside = enabled && playing && isOutdoor(map);
    outdoorFade = approach(outdoorFade, outside ? 1 : 0, 3, dt);
    if (outside) {
      const cl = climateFor(map);
      if (cl !== climate) {
        // new climate: switch straight to its weather instead of slowly morphing (e.g. snow -> sand)
        climate = cl;
        for (const k in level) level[k] = 0;
      }
    }
    const tk = eventK("tempest");
    const w = weather = tk > 0.3 ? (TEMPEST_W[climate] || "storm") : climateWeather(climate);
    const T = (cond, v) => cond ? v * CONFIG.weatherIntensity : 0;
    level.cloudy = approach(level.cloudy, T(w === "cloudy" || w === "rain" || w === "storm" || w === "downpour" || w === "blizzard", 1) + T(w === "snow", 0.6), 0.4, dt);
    level.rain = approach(level.rain, T(w === "rain", 0.55) + T(w === "storm", 0.8) + T(w === "downpour", 1), 0.4, dt);
    level.storm = approach(level.storm, T(w === "storm", 1), 0.4, dt);
    level.fog = approach(level.fog, T(w === "fog", 1), 0.3, dt);
    level.snow = approach(level.snow, T(w === "snow", 0.55) + T(w === "blizzard", 1), 0.4, dt);
    level.blizzard = approach(level.blizzard, T(w === "blizzard", 1), 0.4, dt);
    level.sand = approach(level.sand, T(w === "sandstorm", 1), 0.4, dt);

    const hour = state.minutes / 60;
    const sky = skyAt(hour);
    tint = sky.slice(0, 4);
    const weatherDark = 0.08 * level.cloudy + 0.08 * level.storm + 0.05 * level.blizzard + 0.05 * level.sand;
    darkness = clamp01((sky[4] * CONFIG.nightDarkness * moonDark() + weatherDark) * outdoorFade);
    // events colour the sky: a deep red Blood Moon night, the midday dark of an eclipse
    const bk = eventK("bloodMoon"), ek = eventK("eclipse");
    if (bk > 0) { const t = bk * clamp01(sky[4] * 1.5); tint = [lerp(tint[0], 170, t), lerp(tint[1], 24, t), lerp(tint[2], 36, t), lerp(tint[3], 0.5, t)]; }
    if (ek > 0) {
      tint = [lerp(tint[0], 40, ek), lerp(tint[1], 44, ek), lerp(tint[2], 96, ek), lerp(tint[3], 0.5, ek)];
      darkness = Math.max(darkness, clamp01(ek * CONFIG.nightDarkness * 1.1 * outdoorFade));
    }

    // the lanterns: matched to who's in the room four times a second (looking through every entity each frame
    // made a lot of throwaway lists)
    if (playing && now - lightsSyncedAt > 250) { lightsSyncedAt = now; syncLights(); }
    try { updateRest(dt); } catch (e) { console.error("[CrossCode Enhanced] rest", e); resting = null; }
    try { updateHud(dt, hour, map, outside, playing); } catch (e) { console.error("[CrossCode Enhanced] HUD error", e); }
    try { updateSounds(dt, map, outside, playing); } catch (e) { console.error("[CrossCode Enhanced] sound error", e); }
  }

  let peekTimer = 0, lightsSyncedAt = 0;   // "Show clock" key: a quick look in Pop up mode

  // ---------- hotkeys ----------
  // With CCModManager these are rebindable under Options > Mods (Keys tab); otherwise F7-F10.
  const actions = {
    toggle() {
      enabled = !enabled;
      try { if (window.wdnOptions) { window.wdnOptions.effects = enabled; lastEffectsOpt = enabled; } } catch (e) {}
    },
    clock() {
      hudMode = HUD_MODES[(HUD_MODES.indexOf(hudMode) + 1) % HUD_MODES.length];
      if (hudMode === "auto") autoTimer = CONFIG.hudAutoSeconds;
      if (window.wdnOptions) { window.wdnOptions.clockMode = HUD_MODES.indexOf(hudMode); optionSyncTimer = 0.5; }
      else try { localStorage.setItem(SAVE_KEY + "-hud", hudMode); } catch (e) {}
    },
    peek() { peekTimer = CONFIG.hudAutoSeconds; }
  };
  window.wdnActions = Object.assign(window.wdnActions || {}, actions);

  // ---------- controller shortcut wheel: hold R3 ----------
  // Hold R3 and the wheel opens around Lea with the game paused, like the L2 quick ring. Point the left stick
  // at an option and press X (the confirm button) to use it. Once you've pointed at one, R3 can
  // be let go and the wheel stays; Circle (or R3 again) closes it. Let go of R3 before pointing: it closes.
  // A quick tap of R3 is passed on to the game as normal.
  const R3 = () => (window.ig && ig.BUTTONS ? ig.BUTTONS.RIGHT_STICK : 11);
  const pad = { held: false, heldTime: 0, replay: false, block: 0, paused: false, sel: -1, latched: false, ignoreHold: false };
  function padButton() { return wheelEnabled() ? R3() : null; }
  const padReady = () => window.ig && ig.gamepad && inGameplay() && !inCutscene() && !inMenuOrPause();
  // the four options: 0 up, 1 left, 2 down, 3 right
  // each option sits in one of eight directions: 0 up, 1 up-right, 2 right ... 7 up-left
  const WHEEL_OPTS = [
    { id: "companion", dir: 7, run: () => window.wdnToggleCompanion && window.wdnToggleCompanion(), ok: () => { const c = window.wdnCompanionInfo && window.wdnCompanionInfo(); return !!(c && (c.out || c.canSummon)); } },
    { id: "ping", dir: 1, run: () => window.wdnPingOrbs && window.wdnPingOrbs(), ok: () => !!(window.wdnPingOrbs && window.wdnPingOrbs.on()) },
    { id: "stance", dir: 3, keepOpen: true, run: () => window.wdnCycleStance && window.wdnCycleStance(), ok: () => !!(window.wdnCompanionInfo && window.wdnCompanionInfo()) },
    { id: "enhanced", dir: 5, run: () => window.wdnOpenMenu && window.wdnOpenMenu("enhanced"), ok: () => !!(window.wdnOpenMenu && window.wdnOpenMenu.has("enhanced")) }
  ];
  // the option the stick points at: the nearest one round the ring (so a gap snaps to its neighbour)
  function wheelPick(x, y) {
    const ang = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    let best = -1, bd = 999;
    WHEEL_OPTS.forEach((o, i) => { let d = Math.abs(ang - o.dir * 45); d = Math.min(d, 360 - d); if (d < bd) { bd = d; best = i; } });
    return bd <= 40 ? best : -1;
  }
  function openWheel() {
    if (!ensureWheel()) return;
    pad.sel = -1;
    wheel.open_();
    if (ig.game && !ig.game.paused) { ig.game.setPaused(true); pad.paused = true; }
  }
  function closeWheel() {
    if (wheel) wheel.close();
    if (pad.paused) { pad.paused = false; try { ig.game.setPaused(false); } catch (e) {} }
  }
  const padUpdater = {
    preUpdateOrder: 0,
    onPreUpdate() {
      const dt = ig.system.actualTick || 1 / 60;
      if (pad.block > 0) pad.block -= dt;
      if (!wheelEnabled() || !ig.gamepad) { if (wheel && wheel.open) closeWheel(); pad.held = false; return; }
      const down = ig.gamepad.isButtonDown(R3()), open = !!(wheel && wheel.open);
      if (down && !pad.held) {
        pad.held = true; pad.heldTime = 0;
        // R3 again while the wheel is staying open by itself: close it
        if (open && pad.latched) { closeWheel(); pad.latched = false; pad.ignoreHold = true; return; }
      }
      if (down) pad.heldTime += dt;
      if (!down && pad.held) {
        pad.held = false;
        if (pad.ignoreHold) pad.ignoreHold = false;
        else if (open) { if (!pad.latched) { closeWheel(); return; } }   // let go before choosing: closed
        else if (pad.heldTime <= 0.15) pad.replay = true;                 // a quick tap: the game gets it now
      }
      if (!(wheel && wheel.open)) {
        if (down && !pad.ignoreHold && pad.heldTime > 0.15 && padReady()) { openWheel(); pad.latched = false; }
        return;
      }
      const hit = b => ig.gamepad.isButtonPressed(b);
      // Circle / B closes it
      if (hit(ig.BUTTONS.FACE1)) { try { sc.BUTTON_SOUND.back.play(); } catch (e) {} closeWheel(); pad.latched = false; pad.block = 0.3; return; }
      // choose: the left stick points at an option; once you've pointed, R3 can be let go (the D-pad is left to the game)
      const x = ig.gamepad.getAxesValue(ig.AXES.LEFT_STICK_X, true), y = ig.gamepad.getAxesValue(ig.AXES.LEFT_STICK_Y, true);
      let sel = pad.sel;
      if (Math.hypot(x, y) > 0.5) { const p = wheelPick(x, y); if (p >= 0) sel = p; }
      if (sel !== pad.sel) { pad.sel = sel; pad.latched = true; try { sc.BUTTON_SOUND.toggle.play(); } catch (e) {} }
      wheel.select(pad.sel);
      if (hit(ig.BUTTONS.FACE0) && pad.sel >= 0) {
        const o = WHEEL_OPTS[pad.sel];
        if (!o.ok()) { try { sc.BUTTON_SOUND.denied.play(); } catch (e) {} return; }
        try { sc.BUTTON_SOUND.submit.play(); } catch (e) {}
        closeWheel(); pad.latched = false; pad.block = 0.3;
        try { o.run(); } catch (e) { console.error("[CrossCode Enhanced] wheel", e); }
      }
    }
  };
  // keep the game from also reacting to R3 while it's the wheel button, and to X while the wheel is up
  function installPadFilter() {
    if (!window.sc || !sc.control || sc.control.__wdnPad) return;
    sc.control.__wdnPad = true;
    const ctl = sc.control;
    for (const name in ctl) {
      const fn = ctl[name];
      if (typeof fn !== "function") continue;
      const src = Function.prototype.toString.call(fn);
      const usesR3 = src.includes("ig.BUTTONS.RIGHT_STICK"), usesX = src.includes("ig.BUTTONS.FACE0") || src.includes("ig.BUTTONS.FACE1");
      if (!usesR3 && !usesX) continue;
      ctl[name] = function () {
        try {
          if ((wheel && wheel.open) || pad.block > 0) { if (usesX || usesR3) return false; }
          if (usesR3 && wheelEnabled() && inGameplay() && !inMenuOrPause()) {
            if (pad.replay) { pad.replay = false; return true; }
            if (ig.gamepad && ig.gamepad.isButtonDown(R3())) return false;
          }
        } catch (e) {}
        return fn.apply(this, arguments);
      };
    }
  }
  // ---------- shortcut wheel: shown around Lea while the shortcut button is held ----------
  // Same pieces as the game's L2 quick ring (media/gui/menu.png): the ring, diamond buttons, orange highlight.
  // Order: 0 up, 1 left, 2 down, 3 right (like the quick ring's 0/90/180/270 degree layout).
  const WHEEL_ICON = [-1, 32, -1, -1];       // only the clock comes from our sheet (x, y = 32); the rest are drawn
  // The wheel labels, as lines: { t: text, big: use the main font (which has the element icons) }.
  // Colours: main font \c[3] yellow, \c[2] green, \c[1] red. Small font: \c[5] orange, \c[4] grey, \c[2] green, \c[1] red.
  function weatherElementIcons() {
    const wc = CONFIG.weatherCombat;
    if (!wc || !wc.enabled || !enabled || outdoorFade < 0.5) return "";
    const fx = wc.effects[combatWeatherKey()];
    if (!fx) return "";
    return Object.entries(fx).filter(([, v]) => v !== 1).sort((a, b) => b[1] - a[1])
      .map(([n, v]) => `\\i[element-${n.toLowerCase()}]${v > 1 ? "\\c[2]+" : "\\c[1]-"}\\c[0]`).join(" ");
  }
  function wheelLabels() {
    const modeName = { always: "Always", auto: "Pop up", off: "Off" }[hudMode] || "Always";
    const eq = window.wdnEquipName ? window.wdnEquipName() : "";
    const c = window.wdnCompanionInfo ? window.wdnCompanionInfo() : null;
    const comp = !c ? [{ t: "\\c[4]Summon companion\\c[0]" }, { t: "\\c[4]no companion card equipped\\c[0]" }]
      : c.out ? [{ t: "\\c[3]Dismiss\\c[0]", big: true }, { t: "\\c[5]" + c.name + "\\c[0] \\c[4]Bond " + c.bond + "\\c[0]" }]
      : c.canSummon ? [{ t: "\\c[3]Summon\\c[0]", big: true }, { t: "\\c[5]" + c.name + "\\c[0] \\c[4]Bond " + c.bond + "\\c[0]" }]
      : [{ t: "\\c[4]Summon\\c[0]", big: true }, { t: c.rest ? "\\c[1]" + c.name + " resting " + c.rest + "s\\c[0]" : "\\c[4]" + c.name + " can't come here\\c[0]" }];
    const orbs = window.wdnPingOrbs ? window.wdnPingOrbs.left() : null;
    const L = {
      companion: comp,
      ping: [{ t: "\\c[3]Ping orbs\\c[0]", big: true }, { t: orbs == null ? "\\c[4]orbs are off\\c[0]" : orbs ? "\\c[5]" + orbs + " left in this room\\c[0]" : "\\c[4]none left in this room\\c[0]" }],
      stance: (() => { const st = window.wdnCompStance ? window.wdnCompStance() : { i: 0, name: "Attack" };
        return c ? [{ t: "\\c[3]Stance\\c[0] \\c[5]" + st.name + "\\c[0]", big: true }, { t: "\\c[4]" + ["fights anything near you", "guards you, stays close", "stays out of fights"][st.i] + "\\c[0]" }, { t: "\\c[4]press to change\\c[0]" }]
          : [{ t: "\\c[4]Stance\\c[0]", big: true }, { t: "\\c[4]no companion card equipped\\c[0]" }]; })(),
      enhanced: [{ t: "\\c[3]Enhanced\\c[0]", big: true }]
    };
    return WHEEL_OPTS.map(o => L[o.id]);
  }
  // the option icons, drawn in a 16 x 16 square: a paw, the clock (from our sheet), a card, the gold rhombus
  // the ring icons (media/gui/wdn-ring-icons.png, 16 x 16 each; top row lit, bottom row greyed out):
  // items, analysis, party, map, companion, ping, stance attack / guard / passive, enhanced
  let ringIcons = null;
  const RING_ICON = { companion: 4, ping: 5, enhanced: 9 };
  function ringIconSheet() { return ringIcons || (ringIcons = new ig.Image("media/gui/wdn-ring-icons.png")); }
  function drawRingIcon(r, idx, on, x, y) { const g = ringIconSheet(); if (g.loaded !== false) r.addGfx(g, x, y, idx * 16, on ? 0 : 16, 16, 16); }
  function drawWheelIcon(r, i, on, ox, oy) {
    const id = WHEEL_OPTS[i].id;
    const idx = id === "stance" ? 6 + ((window.wdnCompStance && window.wdnCompStance().i) || 0) : RING_ICON[id];
    if (idx != null) drawRingIcon(r, idx, on, ox || 0, oy || 0);
  }
  let WheelGui = null, wheel = null, WheelLabelCls = null, WheelButtonCls = null;
  function defineWheel() {
    if (WheelGui || !window.sc || !sc.TextGui) return !!WheelGui;
    const menuGfx = new ig.Image("media/gui/menu.png"), ourGfx = new ig.Image("media/gui/wdn-clock.png");
    const WheelButton = ig.GuiElementBase.extend({
      transitions: {
        HIDDEN: { state: { alpha: 0 }, time: 0.2, timeFunction: KEY_SPLINES.LINEAR },
        DEFAULT: { state: {}, time: 0.2, timeFunction: KEY_SPLINES.LINEAR }
      },
      icon: 0, flash: 0, active: true, endX: 0, endY: 0, sel: false, idx: 0,
      init(icon, x, y) {
        this.parent();
        this.setSize(32, 32); this.setPivot(16, 16);
        this.icon = icon; this.endX = x; this.endY = y;
        this.setPos(this.startX || 40, this.startY || 40);
        this.doStateTransition("HIDDEN", true);
      },
      update() { if (this.flash > 0) this.flash = Math.max(0, this.flash - (ig.system.actualTick || 1 / 60) * 2.5); },
      updateDrawables(r) {
        r.addGfx(menuGfx, 0, 0, 400, 304, 32, 32);                                   // diamond
        if (this.sel || this.flash > 0) r.addGfx(menuGfx, 0, 0, 400, 336, 32, 32).setAlpha(this.sel ? 1 : this.flash); // orange highlight
        if (this.icon >= 0) r.addGfx(ourGfx, 8, 8, this.icon + (this.active ? 0 : 64), 32, 16, 16);   // icon (grey when off)
        else drawWheelIcon(r, this.idx, this.active, 8, 8);
      },
      show() { this.doStateTransition("DEFAULT"); this.doPosTranstition(this.endX, this.endY, 0.2, KEY_SPLINES.EASE_OUT); },
      hide() { this.doStateTransition("HIDDEN"); this.doPosTranstition(this.startX == null ? 40 : this.startX, this.startY == null ? 40 : this.startY, 0.2, KEY_SPLINES.LINEAR); }
    });
    // label plate: black like the HUD with a grey underline; lines can mix the main font (element icons) and small font
    const WheelLabel = ig.GuiElementBase.extend({
      transitions: {
        HIDDEN: { state: { alpha: 0 }, time: 0.15, timeFunction: KEY_SPLINES.LINEAR },
        DEFAULT: { state: {}, time: 0.2, timeFunction: KEY_SPLINES.LINEAR }
      },
      texts: null, side: 0, anchorX: 0, anchorY: 0, shown: "",
      init(side, ax, ay) {
        this.parent();
        this.side = side; this.anchorX = ax; this.anchorY = ay;
        const v = typeof side === "number" ? [[0, -1], [-1, 0], [0, 1], [1, 0]][side] : side;   // quick ring: 0-3; wheel: a direction
        this.vx = v[0]; this.vy = v[1];
        this.texts = [];
        this.doStateTransition("HIDDEN", true);
      },
      setText(lines) {
        const key = JSON.stringify(lines);
        if (key === this.shown) return;
        this.shown = key;
        // rebuild the text rows only when their number or fonts change
        const fonts = lines.map(l => !!l.big);
        if (this.texts.length !== lines.length || this.texts.some((t, i) => t.big !== fonts[i])) {
          for (const t of this.texts) this.removeChildGui(t.gui);
          this.texts = lines.map(l => {
            const gui = new sc.TextGui("", { font: l.big ? sc.fontsystem.font : sc.fontsystem.smallFont });
            this.addChildGui(gui);
            return { gui, big: !!l.big };
          });
        }
        let w = 0, rowY = 2;
        const rows = [];
        lines.forEach((l, i) => {
          const g = this.texts[i].gui;
          g.setText(l.t);
          rows.push(rowY);
          rowY += g.hook.size.y;
          w = Math.max(w, g.hook.size.x);
        });
        // centre each row within the plate
        this.texts.forEach((t, i) => t.gui.setPos(4 + Math.floor((w - t.gui.hook.size.x) / 2), rows[i]));
        w += 8; const h = rowY + 3;
        this.setSize(w, h);
        // place beside its button: up/down centred, left/right pushed outward
        const x = this.vx < -0.3 ? this.anchorX - w : this.vx > 0.3 ? this.anchorX : this.anchorX - Math.round(w / 2);
        const y = this.vy < -0.3 ? this.anchorY - h : this.vy > 0.3 ? this.anchorY : this.anchorY - Math.round(h / 2);
        this.setPos(x, y);
      },
      updateDrawables(r) {
        const w = this.hook.size.x, h = this.hook.size.y;
        r.addColor("#000", 0, 0, w, h).setAlpha(0.78);
        r.addColor("rgb(77,77,77)", 2, h - 2, w - 4, 1);        // grey stripe, like the HP plate's track
        r.addColor("rgb(156,156,156)", 0, 0, 2, h).setAlpha(0.6); // light edge facing the button
      }
    });
    WheelLabelCls = WheelLabel; WheelButtonCls = WheelButton;
    // the wheel: up to eight options on a ring round the clock (WS = its size, WR = the ring's radius)
    const WS = 150, WC = 75, WR = 46;
    WheelGui = ig.GuiElementBase.extend({
      transitions: {
        HIDDEN: { state: { alpha: 0, scaleX: 0.5, scaleY: 0.5, angle: 1 }, time: 0.2, timeFunction: KEY_SPLINES.LINEAR },
        PRE_DEFAULT: { state: { alpha: 0, scaleX: 0.5, scaleY: 0.5, angle: -1 }, time: 0.2, timeFunction: KEY_SPLINES.LINEAR },
        DEFAULT: { state: {}, time: 0.2, timeFunction: KEY_SPLINES.EASE_OUT }
      },
      buttons: [], labels: [], open: false, hours: null, minutes: null, colon: null, phase: null, wIcon: null,
      init() {
        this.parent();
        this.setSize(WS, WS); this.setPivot(WC, WC);
        this.hook.zIndex = 1300;
        this.hook.pauseGui = true;   // it runs while the game is paused
        this.buttons = []; this.labels = [];
        // the time in the middle of the ring, in the HUD's digit font
        this.hours = new sc.NumberGui(99, { leadingZeros: 2 });
        this.minutes = new sc.NumberGui(99, { leadingZeros: 2 });
        this.colon = new ig.ImageGui(ourGfx, 120, 10, 3, 8);
        for (const g of [this.hours, this.colon, this.minutes]) this.addChildGui(g);
        WHEEL_OPTS.forEach((o, i) => {
          const d = o.dir * 45 * Math.PI / 180, vx = Math.sin(d), vy = -Math.cos(d);
          const cx = WC + WR * vx, cy = WC + WR * vy;
          const btn = new WheelButton(o.id === "clock" ? 32 : -1, Math.round(cx - 16), Math.round(cy - 16));
          btn.idx = i; btn.startX = WC - 16; btn.startY = WC - 16; btn.setPos(WC - 16, WC - 16);
          this.addChildGui(btn); this.buttons.push(btn);
          // label just outside the button, away from the centre
          const lab = new WheelLabel([vx, vy], Math.round(cx + vx * 17), Math.round(cy + vy * 17));
          this.addChildGui(lab); this.labels.push(lab);
        });
        this.doStateTransition("HIDDEN", true);
      },
      update() {
        // follow Lea, like the quick ring does
        const p = ig.game && ig.game.playerEntity, h = this.hook;
        if (p && ig.system.getScreenFromMapPos) {
          const c = p.coll, out = { x: 0, y: 0 };
          ig.system.getScreenFromMapPos(out, Math.round(c.pos.x + c.size.x / 2), Math.round(c.pos.y - c.pos.z - c.size.z / 2 + c.size.y / 2));
          h.pos.x = Math.max(0, Math.min(ig.system.width - h.size.x, out.x - h.size.x / 2));
          h.pos.y = Math.max(0, Math.min(ig.system.height - h.size.y, out.y - h.size.y / 2));
        }
        if (this.open) {
          const t = wheelLabels();
          for (let i = 0; i < WHEEL_OPTS.length; i++) { this.labels[i].setText(t[i]); this.buttons[i].active = WHEEL_OPTS[i].ok(); }
          // centre: HH:MM, with the sun/moon above and the current weather below
          const hour = state.minutes / 60;
          this.hours.setNumber(Math.floor(hour), true);
          this.minutes.setNumber(Math.floor(state.minutes % 60), true);
          const hw = Math.max(14, this.hours.hook.size.x), total = hw + 4 + Math.max(14, this.minutes.hook.size.x);
          const x0 = Math.round(WC - total / 2);
          this.hours.setPos(x0, WC - 4); this.colon.setPos(x0 + hw + 1, WC - 4); this.minutes.setPos(x0 + hw + 4, WC - 4);
          this.colon.hook.localAlpha = (performance.now() % 1000) < 600 ? 1 : 0.35;
          this.phase = phaseIcon(hour);
          this.wIcon = outdoorFade >= 0.5 && weather !== "clear" ? ICON[weather] : null;
        }
      },
      updateDrawables(r) {
        // the ring: a white band with a dark edge, like the quick ring's, sized for eight
        for (const [rad, th, col, al] of [[WR, 2.6, "rgb(14,12,18)", 0.55], [WR, 1.4, "#fff", 0.9]]) {
          for (let dy = -Math.ceil(rad + th); dy <= Math.ceil(rad + th); dy++) {
            const ro = rad + th, ri = rad - th;
            if (Math.abs(dy) > ro) continue;
            const wo = Math.sqrt(ro * ro - dy * dy), wi = Math.abs(dy) < ri ? Math.sqrt(ri * ri - dy * dy) : 0;
            const a0 = Math.round(WC - wo), a1 = Math.round(WC - wi), b0 = Math.round(WC + wi), b1 = Math.round(WC + wo);
            if (wi === 0) r.addColor(col, a0, WC + dy, b1 - a0, 1).setAlpha(al);
            else { if (a1 > a0) r.addColor(col, a0, WC + dy, a1 - a0, 1).setAlpha(al); if (b1 > b0) r.addColor(col, b0, WC + dy, b1 - b0, 1).setAlpha(al); }
          }
        }
        if (this.phase) r.addGfx(ourGfx, WC - 4, WC - 15, this.phase[0], this.phase[1], 9, 9);
        if (this.wIcon) r.addGfx(ourGfx, WC - 4, WC + 7, this.wIcon[0], this.wIcon[1], 9, 9);
      },
      select(i) { for (let k = 0; k < this.buttons.length; k++) this.buttons[k].sel = k === i; },
      open_() {
        if (this.open) return;
        this.open = true;
        this.update();
        this.doStateTransition("PRE_DEFAULT", true); this.doStateTransition("DEFAULT");
        for (const b of this.buttons) b.show();
        for (const l of this.labels) l.doStateTransition("DEFAULT");
      },
      close() {
        if (!this.open) return;
        this.open = false;
        this.doStateTransition("HIDDEN");
        for (const b of this.buttons) { b.hide(); b.sel = false; }
        for (const l of this.labels) l.doStateTransition("HIDDEN");
      }
    });
    return true;
  }
  function ensureWheel() {
    if (!defineWheel() || !ig.gui) return false;
    if (!wheel || !ig.gui.guiHooks.includes(wheel.hook)) { wheel = new WheelGui(); ig.gui.addGuiElement(wheel); }
    return true;
  }
  const wheelEnabled = () => false;   // (the R3 wheel's options moved onto the L2 quick ring)
  function wheelHide() { if (wheel) wheel.close(); }
  function wheelFlash(i) { if (wheel && wheel.open) wheel.buttons[i].flash = 1; }

  // ---------- the game's L2 quick ring, in the style of the shortcut wheel ----------
  // Each of its four buttons gets a label plate like the shortcut wheel's (with something useful on it), and
  // the time sits in the middle with the sun / moon and the weather.
  function quickRingLabels(ring) {
    const g = (b, txt) => (b && b.active === false ? "\\c[4]" + txt.replace(/\\c\[\d\]/g, "") + "\\c[0]" : txt);
    let hp = "";
    try { const P = sc.model.player.params; hp = `\\c[4]HP\\c[0] ${Math.round(P.currentHp)}\\c[4]/${Math.round(P.getStat("hp"))}\\c[0]`; } catch (e) {}
    let cool = 0;
    try { cool = Math.ceil(sc.model.player.itemBlockTimer || 0); } catch (e) {}
    let party = [];
    try {
      party = (sc.party.currentParty || []).map(n => {
        try { const m = sc.party.getPartyMemberModel ? sc.party.getPartyMemberModel(n) : sc.party.models[n]; return (m && m.getName && m.getName()) || n; } catch (e) { return n; }
      });
    } catch (e) {}
    let area = "", dest = "";
    try { const ap = sc.map.currentPlayerArea && sc.map.currentPlayerArea.path; area = ap ? String(sc.map.getAreaName(ap) || "") : ""; } catch (e) {}
    try { dest = window.wdnRouteDest ? String(window.wdnRouteDest() || "").trim() : ""; } catch (e) {}
    const items = [{ t: g(ring.items, "\\c[3]Items\\c[0]"), big: true }];
    if (cool > 0) items.push({ t: `\\c[1]Wait ${cool}s\\c[0]` }); else if (hp) items.push({ t: hp });
    const wx = weatherCombatSummary();
    const check = [{ t: g(ring.check, "Analysis") }, { t: wx ? "\\c[4]Weather:\\c[0] " + wx : "\\c[4]Scan enemies\\c[0]" }];
    const partyL = [{ t: g(ring.party, "Party") }, { t: party.length ? "\\c[5]" + party.join(", ") + "\\c[0]" : "\\c[4]On your own\\c[0]" }];
    const mapL = [{ t: g(ring.map, "Map") }];
    if (area) mapL.push({ t: "\\c[4]" + area + "\\c[0]" });
    if (dest) mapL.push({ t: "\\c[5]" + dest + "\\c[0]" });
    // the ring's order: up items, left analysis, down party, right map
    return [items, check, partyL, mapL];
  }
  function quickRingSubOpen() {
    try { const q = sc.quickmodel; return !!(q && ((q.isQuickItems && q.isQuickItems()) || (q.isQuickParty && q.isQuickParty()) || (q.isQuickCheck && q.isQuickCheck()))); } catch (e) { return false; }
  }
  // a round tile on the L2 ring (24 x 24): dark with a white rim, orange when chosen, the icon in the middle
  let QuickTile = null;
  function quickTile() {
    if (QuickTile) return QuickTile;
    QuickTile = ig.GuiElementBase.extend({
      transitions: {
        HIDDEN: { state: { alpha: 0 }, time: 0.2, timeFunction: KEY_SPLINES.LINEAR },
        DEFAULT: { state: {}, time: 0.2, timeFunction: KEY_SPLINES.LINEAR }
      },
      idx: 0, endX: 0, endY: 0, sel: false, active: true,
      init(i, x, y) { this.parent(); this.setSize(24, 24); this.idx = i; this.endX = x; this.endY = y; this.setPos(45, 45); this.doStateTransition("HIDDEN", true); },
      show() { this.doStateTransition("DEFAULT"); this.doPosTranstition(this.endX, this.endY, 0.2, KEY_SPLINES.EASE_OUT); },
      hide() { this.doStateTransition("HIDDEN"); this.doPosTranstition(45, 45, 0.2, KEY_SPLINES.LINEAR); },
      updateDrawables(r) {
        const o = "rgb(14,12,18)", pulse = this.sel ? 0.75 + 0.25 * Math.sin(performance.now() / 160) : 1;
        const disc = (rad, col, a) => { for (let dy = -rad; dy < rad; dy++) { const yy = dy + 0.5, hw = Math.sqrt(Math.max(0, rad * rad - yy * yy)); const x0 = Math.round(12 - hw), x1 = Math.round(12 + hw); if (x1 > x0) r.addColor(col, x0, 12 + dy, x1 - x0, 1).setAlpha(a == null ? 1 : a); } };
        disc(12, o);
        disc(11, this.sel ? "rgb(255,160,60)" : this.active ? "rgb(220,224,232)" : "rgb(120,122,130)", pulse);
        disc(10, o);
        disc(9.5, this.sel ? "rgb(60,44,34)" : "rgb(30,32,40)");
        drawWheelIcon(r, this.idx, this.active, 4, 4);
      }
    });
    return QuickTile;
  }
  function decorateQuickRing(ring) {
    if (ring.wdnDeco !== undefined || !defineWheel() || !WheelLabelCls) return;
    try {
      const ourGfx = new ig.Image("media/gui/wdn-clock.png");
      const deco = ring.wdnDeco = { labels: [], hours: new sc.NumberGui(99, { leadingZeros: 2 }), minutes: new sc.NumberGui(99, { leadingZeros: 2 }),
        colon: new ig.ImageGui(ourGfx, 120, 10, 3, 8), gfx: ourGfx, phase: null, wIcon: null, shown: false };
      for (const x of [deco.hours, deco.colon, deco.minutes]) { x.hook.localAlpha = 0; ring.addChildGui(x); }
      for (let i = 0; i < 4; i++) {
        const d = i * 90 * Math.PI / 180, cx = 56 - 35 * Math.sin(d), cy = 56 - 35 * Math.cos(d);
        const ax = [cx, cx - 17, cx, cx + 17][i], ay = [cy - 17, cy, cy + 17, cy][i];
        const lab = new WheelLabelCls(i, Math.round(ax), Math.round(ay));
        ring.addChildGui(lab); deco.labels.push(lab);
      }
      // our options on the diagonals: round tiles, further out, so they sit clear of the game's diamonds
      deco.ours = []; deco.ourLabels = []; deco.sel = -1;
      WHEEL_OPTS.forEach((o, i) => {
        const d = o.dir * 45 * Math.PI / 180, vx = Math.sin(d), vy = -Math.cos(d), R = 50;
        const cx = 57 + R * vx, cy = 57 + R * vy;
        const tile = new (quickTile())(i, Math.round(cx - 12), Math.round(cy - 12));
        ring.addChildGui(tile); deco.ours.push(tile);
        const lab = new WheelLabelCls([vx, vy], Math.round(cx + vx * 12), Math.round(cy + vy * 12));
        ring.addChildGui(lab); deco.ourLabels.push(lab);
      });
    } catch (e) { ring.wdnDeco = null; console.error("[CrossCode Enhanced] quick ring", e); }
  }
  let quickRing = null;
  const quickRingOn = () => !window.wdnOptions || window.wdnOptions.quickRingStyle !== false;
  if (window.sc && sc.QuickRingMenu) sc.QuickRingMenu.inject({
    update() {
      this.parent();
      quickRing = this;   // (the game makes its ring before mods load, so it's picked up here)
      try {
        if (!quickRingOn()) { if (this.wdnDeco && this.wdnDeco.shown) hideRingDeco(this); return; }
        decorateQuickRing(this);
        const deco = this.wdnDeco;
        if (!deco) return;
        const want = !!(sc.model && sc.model.isQuickMenu && sc.model.isQuickMenu()) && !quickRingSubOpen() && this.hook.currentStateName !== "HIDDEN";
        if (want && !deco.shown) {
          deco.shown = true; deco.sel = -1;
          for (const l of deco.labels.concat(deco.ourLabels)) { l._vis = false; l.doStateTransition("HIDDEN", true); }
          for (const b of deco.ours) { b.sel = false; b.show(); }
        }
        if (!want && deco.shown) hideRingDeco(this);
        if (!deco.shown) return;
        const t = quickRingLabels(this);
        for (let i = 0; i < 4; i++) { deco.labels[i].setText(t[i]); labelVis(deco.labels[i], deco.sel < 0 && !!(this.buttons[i] && this.buttons[i].focus)); }
        try { quickRingPick(this, deco); } catch (e) {}
        if (!deco.shown) return;
        const ours = wheelLabels();
        for (let i = 0; i < deco.ours.length; i++) { deco.ourLabels[i].setText(ours[i]); deco.ours[i].active = WHEEL_OPTS[i].ok(); deco.ours[i].sel = deco.sel === i; labelVis(deco.ourLabels[i], deco.sel === i); }
        const hour = state.minutes / 60;
        deco.hours.setNumber(CONFIG.clock12h ? (Math.floor(hour) % 12 || 12) : Math.floor(hour), true);
        deco.minutes.setNumber(Math.floor(state.minutes % 60), true);
        const hw = Math.max(14, deco.hours.hook.size.x), total = hw + 4 + Math.max(14, deco.minutes.hook.size.x), x0 = Math.round(56 - total / 2);
        deco.hours.setPos(x0, 52); deco.colon.setPos(x0 + hw + 1, 52); deco.minutes.setPos(x0 + hw + 4, 52);
        for (const x of [deco.hours, deco.minutes]) x.hook.localAlpha = 1;
        deco.colon.hook.localAlpha = (performance.now() % 1000) < 600 ? 1 : 0.35;
        deco.phase = phaseIcon(hour);
        deco.wIcon = outdoorFade >= 0.5 && weather !== "clear" ? ICON[weather] : null;
      } catch (e) {}
    },
    updateDrawables(r) {
      this.parent(r);
      try {
        const deco = this.wdnDeco;
        if (!deco || !deco.shown) return;
        if (deco.phase) r.addGfx(deco.gfx, 52, 41, deco.phase[0], deco.phase[1], 9, 9);
        if (deco.wIcon) r.addGfx(deco.gfx, 52, 63, deco.wIcon[0], deco.wIcon[1], 9, 9);
      } catch (e) {}
    },
    exit() { this.parent(); try { if (this.wdnDeco) hideRingDeco(this); } catch (e) {} }
  });
  function quickDir() {
    // the left stick's direction in eighths (0 up, clockwise), or -1 near the middle; arrow keys work too
    let x = 0, y = 0;
    try { if (ig.gamepad) { x = ig.gamepad.getAxesValue(ig.AXES.LEFT_STICK_X, true); y = ig.gamepad.getAxesValue(ig.AXES.LEFT_STICK_Y, true); } } catch (e) {}
    if (Math.hypot(x, y) < 0.5) {
      try { x = (sc.control.rightDown() ? 1 : 0) - (sc.control.leftDown() ? 1 : 0); y = (sc.control.downDown() ? 1 : 0) - (sc.control.upDown() ? 1 : 0); } catch (e) {}
      if (!x && !y) return -1;
    }
    return Math.round(((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360) / 45) % 8;
  }
  // the game's own button traversal stands aside while one of ours is chosen
  if (window.sc && sc.QuickMenuButtonGroup) sc.QuickMenuButtonGroup.inject({
    doButtonTraversal(a) {
      const deco = quickRing && quickRing.wdnDeco;
      if (deco && deco.shown && deco.sel >= 0 && quickRingOn()) return;
      return this.parent(a);
    }
  });
  // choosing ours: every frame while the ring is up (the stick's diagonals are ours, its four straight
  // directions the game's), confirm uses it
  function quickRingPick(ring, deco) {
    const dir = quickDir(), grp = ring.buttongroup;
    if (dir >= 0 && dir % 2 === 1) {
      const i = WHEEL_OPTS.findIndex(o => o.dir === dir);
      if (i >= 0 && i !== deco.sel) {
        deco.sel = i;
        for (const b of ring.buttons || []) { try { b.focusLost(); } catch (e) {} }
        try { grp.sounds.focus.play(); } catch (e) {}
      }
    } else if (dir >= 0 && deco.sel >= 0) {
      deco.sel = -1;   // back to the game's four: make it refocus
      try { grp.current.x = 0; grp.current.y = 0; } catch (e) {}
    }
    if (deco.sel < 0) return;
    let confirm = false;
    try { confirm = sc.control.menuConfirm() || (ig.gamepad && ig.gamepad.isButtonPressed(ig.BUTTONS.FACE0)); } catch (e) {}
    if (!confirm) return;
    const o = WHEEL_OPTS[deco.sel];
    if (!o.ok()) { try { sc.BUTTON_SOUND.denied.play(); } catch (e) {} return; }
    try { sc.BUTTON_SOUND.submit.play(); } catch (e) {}
    if (o.keepOpen) { try { o.run(); } catch (e) {} return; }   // (stance: the ring stays up, press again for the next)
    deco.sel = -1;
    try { sc.quickmodel.skipActiveState = true; } catch (e) {}   // the ring stays shut until L2 is let go and pressed again
    if (o.id === "equip" || o.id === "enhanced") {
      // a page: opened from the ring the way the game opens the map
      if (window.wdnOpenMenu && window.wdnOpenMenu(o.id)) sc.model.prevSubState = sc.GAME_MODEL_SUBSTATE.RUNNING;
    } else {
      try { sc.model.enterRunning(); sc.BUTTON_SOUND.quickHide.play(); } catch (e) {}
      try { o.run(); } catch (e) { console.error("[CrossCode Enhanced] quick ring", e); }
    }
  }
  // a label shows only while its button is the one chosen
  function labelVis(l, on) { if (l._vis === on) return; l._vis = on; l.doStateTransition(on ? "DEFAULT" : "HIDDEN"); }
  // the game's four ring buttons, drawn as our round tiles too (their own icons from menu.png, in the middle)
  if (window.sc && sc.RingMenuButton) sc.RingMenuButton.inject({
    updateDrawables(r) {
      if (!quickRingOn()) return this.parent(r);
      const o = "rgb(14,12,18)", hot = this.active && (this.focus || this.pressed), pulse = this.focus ? 0.55 + 0.45 * this.alpha : 1;
      const disc = (rad, col, a) => { for (let dy = -rad; dy < rad; dy++) { const yy = dy + 0.5, hw = Math.sqrt(Math.max(0, rad * rad - yy * yy)); const x0 = Math.round(16 - hw), x1 = Math.round(16 + hw); if (x1 > x0) r.addColor(col, x0, 16 + dy, x1 - x0, 1).setAlpha(a == null ? 1 : a); } };
      disc(12, o);
      disc(11, hot ? "rgb(255,160,60)" : this.active ? "rgb(220,224,232)" : (this.focus ? "rgb(170,90,90)" : "rgb(120,122,130)"), pulse);
      disc(10, o);
      disc(9.5, hot ? "rgb(60,44,34)" : "rgb(30,32,40)");
      drawRingIcon(r, this.state - 1, this.active, 8, 8);   // (our redrawn icons, same order as the game's)
    }
  });
  function hideRingDeco(ring) {
    const deco = ring.wdnDeco;
    deco.shown = false;
    for (const l of deco.labels.concat(deco.ourLabels || [])) { l._vis = false; l.doStateTransition("HIDDEN"); }
    for (const b of deco.ours || []) { b.sel = false; b.hide(); }
    deco.sel = -1;
    for (const x of [deco.hours, deco.colon, deco.minutes]) x.hook.localAlpha = 0;
  }

  window.addEventListener("keydown", e => {
    if (window.wdnOptionsHaveKeys) return;   // the mod manager handles (rebindable) keys
    if (e.key === CONFIG.keys.toggle) actions.toggle();
    else if (e.key === CONFIG.keys.hud) actions.clock();
    else if (e.key === CONFIG.keys.peek) actions.peek();
  });

  requestAnimationFrame(tick);
  console.log("[CrossCode Enhanced] loaded");
})();
