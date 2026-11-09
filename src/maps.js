// CrossCode Enhanced: treasure and quest markers on the area map, true-scale detailed maps and the minimap
// Marks every treasure chest on the area map, and adds a minimap to the HUD.
// Chest positions come from the game's own map files (gathered into CHESTS below); each marker sits at the
// chest's relative spot inside its room, snapped onto that room's shape on the map. Opened chests are read
// from your save.

(() => {
  // map path -> { w, h: map size in pixels, x: DLC extension (if any), c: [{ id, x, y, t: chest type, v: custom variable, n: untracked }] }
  // t: chests holding a dungeon's key or master key are typed Key / MasterKey (the game decides that from the item inside)
/*CHESTS*/
  const SHEET = "media/gui/treasure-map.png";
  // small icons (our sheet, 7x7 at x = slot * 8): brown chest for normal treasure, white key / gold crystal for
  // chests holding a dungeon key / master key, grey chest once opened, red monster for enemies
  const TYPE_ICON = { Default: 0, Key: 32, MasterKey: 40 };
  const OPENED_ICON = 48, ENEMY_ICON = 56;
  // Lea's head (16x11) from the game's floor-selector bubble, copied into our sheet at (0, 8)
  const LEA = { x: 0, y: 8, w: 16, h: 11 };
  // chests that need a bronze / silver / gold key use the padlock body (with keyhole) from the game's own
  // padlock-chest sprites (media/entity/objects/treasure.png, 24px frames at y=56): the full 13x11 padlock body
  const LOCK_SPRITE = {
    Bronze: { x: 3 * 24 + 5, y: 56 + 13, w: 13, h: 11 },
    Silver: { x: 2 * 24 + 5, y: 56 + 13, w: 13, h: 11 },
    Gold:   { x: 0 * 24 + 5, y: 56 + 13, w: 13, h: 11 }
  };

  function opt(name, def) {
    const O = window.treasureMapOptions;
    if (!O) return def;
    const v = O[name];
    return v === undefined || v === null ? def : v;
  }
  function hasExt(x) { try { return !x || ig.extensions.hasExtension(x); } catch (e) { return true; } }
  // map vars live under the room's path in camelCase with slashes, e.g. "rookieHarbor/center";
  // the game counts a room as visited once it has an entry there
  function roomVars(path) { return ig.vars.storage.maps[path.toCamel().toPath("", "")] || null; }
  function isOpened(path, chest) {
    try {
      if (chest.v) return !!ig.vars.get(chest.v);
      const vars = roomVars(path);
      return !!(vars && vars["chest_" + chest.id]);
    } catch (e) { return false; }
  }

  // ---------- discovered chests (for "Nearby" mode), kept per save file ----------
  // a chest is discovered once Lea comes within range of it; opened chests always count
  let found = {};
  const chestKey = (map, idOrVar, isVar) => map + "#" + (isVar ? "v:" + idOrVar : idOrVar);
  const dataKey = (map, ch) => chestKey(map, ch.v || ch.id, !!ch.v);
  const saveListener = {
    onStorageSave(save) { try { save.treasureMapFound = Object.assign({}, found); } catch (e) {} },
    onStoragePreLoad(file) { found = Object.assign({}, file && file.treasureMapFound || {}); }
  };
  try { ig.storage.register(saveListener); } catch (e) { console.error("[CrossCode Enhanced] couldn't hook saves", e); }
  // a new game starts with nothing discovered
  let teleportHookedFor = null;
  function hookNewGame() {
    const g = window.ig && ig.game;
    if (!g || !g.teleport || teleportHookedFor === g) return;
    const orig = g.teleport;
    g.teleport = function (map, pos, mode) { if (mode === "NEW") found = {}; return orig.apply(this, arguments); };
    teleportHookedFor = g;
  }
  hookNewGame(); setInterval(hookNewGame, 2000);
  // each chest in the current map checks its distance to Lea
  if (window.ig && ig.ENTITY && ig.ENTITY.Chest) ig.ENTITY.Chest.inject({
    update() {
      this.parent();
      try {
        const map = sc.map && sc.map.currentMap, player = ig.game.playerEntity;
        if (!map || !player) return;
        if (this._tmapKey === undefined) {
          const v = this.chestVariable || "";
          this._tmapKey = v.indexOf("map.chest_") === 0 ? chestKey(map, this.mapId, false) : chestKey(map, v, true);
          if (found[this._tmapKey]) this._tmapFound = true;
        }
        if (this._tmapFound) return;
        const range = opt("range", 8) * 16, a = this.coll, b = player.coll;
        const dx = (a.pos.x + a.size.x / 2) - (b.pos.x + b.size.x / 2);
        const dy = (a.pos.y + a.size.y / 2) - (b.pos.y + b.size.y / 2);
        if (dx * dx + dy * dy <= range * range && Math.abs(a.pos.z - b.pos.z) <= range) {
          found[this._tmapKey] = true; this._tmapFound = true;
        }
      } catch (e) { this._tmapFound = true; }
    }
  });

  // ---------- where things go on the area map ----------
  function cellOf(tiles, x, y) {
    const row = tiles[Math.floor(y)]; if (!row) return 0;
    let v = row[Math.floor(x)] || 0; if (v > 10000) v -= 10000;
    return v;
  }
  // nearest map cell that belongs to this room, from a point inside the room's bounding box
  function snapToRoom(tiles, room, fx, fy) {
    let best = null, bestD = Infinity;
    for (let y = room.min.y; y < room.max.y; y++) {
      const row = tiles[y]; if (!row) continue;
      for (let x = room.min.x; x < room.max.x; x++) {
        let v = row[x]; if (v > 10000) v -= 10000;
        if (v !== room.id) continue;
        const d = (x + 0.5 - fx) ** 2 + (y + 0.5 - fy) ** 2;
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    return best;
  }
  // a point in a map (pixels, map size w x h) -> its spot in the room on the area map (in map cells,
  // fractional), kept inside the room's drawn shape. Once the room's map file has been read, the doorways are
  // lined up with the area map's connections (see roomWarp); until then it's a plain stretch over the box.
  function toFloor(floor, room, x, y, w, h) {
    const tiles = floor.tiles, rw = room.max.x - room.min.x, rh = room.max.y - room.min.y;
    const wp = roomWarp(floor, room);
    let fx, fy;
    if (wp) { const q = wp.map(x, y); fx = q.x / 8; fy = q.y / 8; }
    else {
      fx = room.min.x + Math.min(0.999, Math.max(0, x / w)) * rw;
      fy = room.min.y + Math.min(0.999, Math.max(0, y / h)) * rh;
    }
    fx = Math.min(room.max.x - 0.001, Math.max(room.min.x, fx));
    fy = Math.min(room.max.y - 0.001, Math.max(room.min.y, fy));
    if (cellOf(tiles, fx, fy) !== room.id) {
      const cell = snapToRoom(tiles, room, fx, fy);
      if (!cell) return null;
      fx = cell.x + 0.5; fy = cell.y + 0.5;
    }
    return { x: fx, y: fy };
  }

  // chest kinds switched off in the options (Area map > Treasure)
  function chestTypeShown(t) {
    if (t === "Bronze" || t === "Silver" || t === "Gold") return opt("chestLocked", true) !== false;
    if (t === "Key" || t === "MasterKey") return opt("chestKey", true) !== false;
    return opt("chestNormal", true) !== false;
  }
  // which chests to show: rules shared by the area map and the minimap
  // returns [{ ch, opened, cx, cy }] with cx/cy the marker's centre in area-map pixels (8 per cell)
  // (asked for every room on every frame by the minimap and the compass: each answer is kept for a third of a
  // second, so drawing doesn't build new lists 60 times a second)
  const spotMemo = new WeakMap();
  function memoSpots(kind, floor, room, extra, make) {
    let m = spotMemo.get(floor); if (!m) { m = new Map(); spotMemo.set(floor, m); }
    const key = kind + "|" + room.name + "|" + extra, t = performance.now(), e = m.get(key);
    if (e && t - e.t < 330) return e.v;
    const v = make(); m.set(key, { t, v }); return v;
  }
  function chestSpots(floor, room, all) { return memoSpots("c", floor, room, all ? 1 : 0, () => chestSpotsNow(floor, room, all)); }
  function chestSpotsNow(floor, room, all) {
    if (!all && !opt("mapChests", true)) return [];
    const out = interiorChestSpots(floor, room, all);
    const data = CHESTS[room.name];
    if (!data || !hasExt(data.x)) return out;
    const showOpened = all ? false : opt("showOpened", true);
    // 0 all, 1 rooms you've visited, 2 only chests you've been near (or opened)
    const reveal = all ? 0 : Number(opt("reveal", 2)) || 0;
    if (reveal >= 1 && !roomVars(room.name)) return out;
    const used = {};
    for (const ch of data.c) {
      if (!all && !chestTypeShown(ch.t)) continue;
      const opened = isOpened(room.name, ch);
      if (opened && !showOpened) continue;
      if (reveal === 2 && !opened && !found[dataKey(room.name, ch)]) continue;
      const info = mapInfo(room.name, true);
      const at = info && info.chests[ch.v ? "v:" + ch.v : ch.id];
      const p = at ? toFloor(floor, room, at.x, at.y, info.w, info.h) : toFloor(floor, room, ch.x, ch.y, data.w, data.h);
      if (!p) continue;
      const cell = { x: Math.floor(p.x), y: Math.floor(p.y) };
      // spread several chests in one cell so they don't hide each other
      const key = cell.x + "," + cell.y, n = used[key] = (used[key] || 0) + 1;
      const spread = [[0, 0], [3, -2], [-3, 2], [3, 2], [-3, -2]][(n - 1) % 5];
      out.push({ ch, opened, cx: cell.x * 8 + 4 + spread[0], cy: cell.y * 8 + 4 + spread[1] });
    }
    return out;
  }

  // true-scale maps show interiors as an icon on their building's door: their chests go beside that door
  function interiorChestSpots(floor, room, all) {
    const list = floor.wdnByParent && floor.wdnByParent[room.name];
    if (!list) return [];
    const out = [], showOpened = all ? false : opt("showOpened", true), reveal = all ? 0 : Number(opt("reveal", 2)) || 0;
    for (const [ip, x, y] of list) {
      const data = CHESTS[ip];
      if (!data || !hasExt(data.x) || (reveal >= 1 && !roomVars(ip))) continue;
      let n = 0;
      for (const ch of data.c) {
        if (!all && !chestTypeShown(ch.t)) continue;
        const opened = isOpened(ip, ch);
        if (opened && !showOpened) continue;
        if (reveal === 2 && !opened && !found[dataKey(ip, ch)]) continue;
        out.push({ ch, opened, cx: x + 10 + n * 8, cy: y - 6 }); n++;
      }
    }
    return out;
  }

  // ---------- quest givers ----------
  // data/wdn-quest-givers.json (made from the game's quests and maps): quest -> where its giver stands,
  // [[map, x, y, map width, map height], ...]. A marker shows wherever a quest is open to take: the same test
  // as the quest hub's "Open" tab (not taken, not finished, its unlock condition met).
  const QUEST_BUBBLE = { x: 20, y: 8, w: 9, h: 10 };
  let GIVERS_BY_MAP = {};
  try {
    $.ajax({
      dataType: "json", async: false,
      url: ig.getFilePath(ig.root + "data/wdn-quest-givers.json" + ig.getCacheSuffix()),
      success: d => {
        try {
          // "_npcs": people who aren't quest-hub givers but whom the game itself marks with its quest icon
          // at some point (a quest step to talk to them, a quest they hand out on the road...):
          // [map, x, y, map width, map height, [[state condition, quest icon?, hidden?], ...]]
          for (const sp of (d && d._npcs) || []) {
            if (!Array.isArray(sp)) continue;
            const [map, x, y, w, h, states] = sp;
            const local = (states || []).some(st => /\b(map|tmp)\./.test(st[0] || ""));
            (GIVERS_BY_MAP[map] = GIVERS_BY_MAP[map] || []).push({ qid: null, x, y, w, h, states, local, map });
          }
          for (const [qid, spots] of Object.entries(d || {}))
            if (qid !== "_npcs" && Array.isArray(spots)) for (const sp of spots) {
              if (!Array.isArray(sp)) continue;
              const [map, x, y, w, h] = sp;
              (GIVERS_BY_MAP[map] = GIVERS_BY_MAP[map] || []).push({ qid, x, y, w, h });
            }
        } catch (e) { GIVERS_BY_MAP = {}; }
      },
      error: () => {}
    });
  } catch (e) {}
  const questCond = window.ig && ig.VarCondition ? new ig.VarCondition("") : null;
  let questCache = {}, questCacheAt = 0;
  function questOpen(id) {
    const now = Date.now();
    if (now - questCacheAt > 1000) { questCache = {}; questCacheAt = now; }
    if (id in questCache) return questCache[id];
    let open = false;
    try {
      const q = sc.quests && sc.quests.staticQuests && sc.quests.staticQuests[id];
      if (q && q.hubSettings && !q.noTrack && (!q.extension || ig.extensions.hasExtension(q.extension))
          && !sc.quests.isQuestActive(id) && !sc.quests.isQuestSolved(id)) {
        open = true;
        if (q.hubSettings.condition && questCond) { questCond.setCondition(q.hubSettings.condition); open = !!questCond.evaluate(); }
      }
    } catch (e) { open = false; }
    return (questCache[id] = open);
  }
  // does the game show its quest icon over this person right now? Like the game: the last page whose
  // condition holds is the active one. Pages that test the map's own variables can only be judged there.
  const condCache = {};
  function npcQuestNow(g) {
    if (g.local && !(ig.game && String(ig.game.mapName).replace(/\//g, ".") === g.map)) return false;
    try {
      for (let i = g.states.length; i--;) {
        const [c, q, hidden] = g.states[i];
        let ok = true;
        if (c) { const vc = condCache[c] || (condCache[c] = new ig.VarCondition(c)); ok = !!vc.evaluate(); }
        if (ok) return !!q && !hidden;
      }
    } catch (e) {}
    return false;
  }
  let npcCache = new Map(), npcCacheAt = 0;
  function giverActive(g) {
    if (!g.states) return questOpen(g.qid);
    const now = Date.now();
    if (now - npcCacheAt > 1000) { npcCache = new Map(); npcCacheAt = now; }
    if (!npcCache.has(g)) npcCache.set(g, npcQuestNow(g));
    return npcCache.get(g);
  }
  // open quests' givers in a room, as area-map pixel spots { cx, cy, qid, x, y }; givers inside a building that
  // the true-scale map shows as an icon stand beside its door
  function giverSpots(floor, room) { return memoSpots("g", floor, room, 0, () => giverSpotsNow(floor, room)); }
  function giverSpotsNow(floor, room) {
    if (!opt("questGivers", true)) return [];
    const out = [];
    for (const g of GIVERS_BY_MAP[room.name] || []) {
      if (!giverActive(g)) continue;
      const p = toFloor(floor, room, g.x, g.y, g.w, g.h);
      if (p) out.push({ cx: p.x * 8, cy: p.y * 8, qid: g.qid, x: g.x, y: g.y });
    }
    const inside = floor.wdnByParent && floor.wdnByParent[room.name];
    if (inside) for (const [ip, x, y] of inside) {
      if ((GIVERS_BY_MAP[ip] || []).some(giverActive)) out.push({ cx: x - 10, cy: y - 6, qid: null });
    }
    return out;
  }
  function drawQuestBubble(r, cx, cy) { scaled(r, cx, cy, (x, y) => drawQuestBubble1(r, x, y)); }
  function drawQuestBubble1(r, cx, cy) {
    // the bubble's tail points at the giver
    r.addGfx(gfx, Math.round(cx - 4), Math.round(cy - QUEST_BUBBLE.h - 1), QUEST_BUBBLE.x, QUEST_BUBBLE.y, QUEST_BUBBLE.w, QUEST_BUBBLE.h);
  }

  // ---------- gold outline around the area ----------
  // A gold line around the outside edge of everything the map shows for a floor (the rooms you've visited, as
  // drawn), on the pause map and the minimap. Worked out from the room pictures at 2 pixels per area-map pixel:
  // a pixel is "inside" if any room draws something there (pure black filler counts as empty), and the line
  // is drawn on the outside pixels next to it that can be reached from the edge of the map (so lakes and
  // courtyards inside the area get no line of their own).
  const OUTLINE_M = 2;
  const outlines = new WeakMap();   // floor -> { key, at, img, w, h }
  const outlineWait = new WeakMap();   // floor -> { key, since }: how long the outline has been waiting for pictures
  function floorOutline(floor) {
    if (!opt("mapOutline", true) || !floor || !floor.rooms || !floor.tiles) return null;
    const now = Date.now(), have = outlines.get(floor);
    if (have && now - have.at < 1500) return have.img ? have : null;
    try {
      const rooms = floor.rooms.filter(r => r && roomVars(r.name));
      // only rebuild when the set of rooms changed. On true-scale maps every room is drawn from its picture, so
      // the outline waits until all of them are in (drawing a missing one as its grid squares put gold lines
      // through the middle of the map), and pictures dropped from memory later don't cause a rebuild.
      const trueScale = !!floor.wdnPos;
      const key = rooms.map(r => r.id).join(",");
      if (have && have.key === key) { have.at = now; return have.img ? have : null; }
      let missing = 0;
      const infosNow = rooms.map(r => {
        let i = mapInfo(r.name, true);
        const needPic = trueScale && floor.wdnPos[r.name] && PRE[r.name];
        if (needPic && !(i && i.pic)) {
          const st = infos.get(r.name);
          if (st && st.state === "failed") return i;   // (can't be read: drawn as its squares)
          missing++;
          if (i && i.dropped) { infos.delete(r.name); mapInfo(r.name); }
        }
        return i;
      });
      // (but never wait more than 15 seconds)
      const W8 = outlineWait.get(floor) || outlineWait.set(floor, { key, since: now }).get(floor);
      if (W8.key !== key) { W8.key = key; W8.since = now; }
      if (missing && now - W8.since < 15000) { if (have) have.at = now; return have && have.img ? have : null; }
      // while rooms are still being read, keep the old outline and wait (one rebuild once they're in)
      if (have && have.img && (queue.length || loadingMap)) { have.at = now; return have; }
      if (have && have.job) { have.at = now; return have.img ? have : null; }
      const M = OUTLINE_M, W = floor.tiles[0].length * 8 * M + 4, H = floor.tiles.length * 8 * M + 4;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const cx = c.getContext("2d");
      cx.imageSmoothingEnabled = false;
      rooms.forEach((r, i) => {
        const info = infosNow[i], pos = floor.wdnPos && floor.wdnPos[r.name];
        if (info && info.pic && pos) {
          const sc_ = floor.wdnScale || 20;
          cx.drawImage(info.pic, 2 + pos[0] * M, 2 + pos[1] * M, info.w / sc_ * M, info.h / sc_ * M);
        } else {
          cx.fillStyle = "#808080";      // no picture (yet), or a squeezed map: the room's squares
          for (let y = r.min.y; y < r.max.y; y++) for (let x = r.min.x; x < r.max.x; x++)
            if (cellOf(floor.tiles, x, y) === r.id) cx.fillRect(2 + x * 8 * M, 2 + y * 8 * M, 8 * M, 8 * M);
        }
      });
      // the pixel work is spread over frames (a few milliseconds each), keeping the old outline meanwhile
      const res = have || { key: "", at: now, img: null, w: W, h: H };
      res.at = now; outlines.set(floor, res);
      res.job = true;
      runSliced(outlineSteps(c, cx, W, H), () => {
        const img = new ig.Image({}); img.data = c; img.loaded = true; img.width = W; img.height = H;
        Object.assign(res, { key, img, w: W, h: H, job: false });
      });
      return res.img ? res : null;
    } catch (e) { outlines.set(floor, { key: "", at: now, img: null }); return null; }
  }
  function* outlineSteps(c, cx, W, H) {
    const id = cx.getImageData(0, 0, W, H), px = id.data, N = W * H;
    yield;
    const CH = 60000;   // pixels per slice
    const solid = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (px[o + 3] > 40 && px[o] + px[o + 1] + px[o + 2] > 24) solid[i] = 1;
      if (i % CH === 0) yield;
    }
    const touches = (arr, i) => { const x = i % W; return (x > 0 && arr[i - 1]) || (x < W - 1 && arr[i + 1]) || (i >= W && arr[i - W]) || (i < N - W && arr[i + W]); };
    // close hairline gaps between neighbouring rooms' pictures (2 pixels), so seams get no line
    // (one spare buffer, reused, so a rebuild doesn't leave lots of big arrays for the browser to clean up)
    // (closing: grown out by 5 pixels then shrunk back by 5, so gaps up to 10 pixels between rooms fill in while
    // the outer edge stays where it is)
    const grow = new Uint8Array(N);
    const all4 = (arr, i) => { const x = i % W; return (x === 0 || arr[i - 1]) && (x === W - 1 || arr[i + 1]) && (i < W || arr[i - W]) && (i >= N - W || arr[i + W]); };
    for (let pass = 0; pass < 5; pass++) {
      grow.set(solid);
      for (let i = 0; i < N; i++) { if (!solid[i] && touches(solid, i)) grow[i] = 1; if (i % CH === 0) yield; }
      solid.set(grow);
    }
    for (let pass = 0; pass < 5; pass++) {
      grow.set(solid);
      for (let i = 0; i < N; i++) { if (solid[i] && !all4(solid, i)) grow[i] = 0; if (i % CH === 0) yield; }
      solid.set(grow);
    }
    // the outside: empty pixels reachable from the canvas edge (a flood fill; each pixel is put on the
    // stack at most once, so a fixed-size stack does)
    const out = grow; out.fill(0);
    const stack = new Int32Array(N); let sp = 0;
    const push = i => { if (!out[i] && !solid[i]) { out[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    let n = 0;
    while (sp) {
      const i = stack[--sp], x = i % W;
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (i >= W) push(i - W);
      if (i < N - W) push(i + W);
      if (++n % CH === 0) yield;
    }
    // gold on outside pixels touching the area, a darker gold one step further out
    const ring = new Uint8Array(N);
    for (let i = 0; i < N; i++) { if (out[i] && touches(solid, i)) ring[i] = 1; if (i % CH === 0) yield; }
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      px[o + 3] = 0;
      if (ring[i]) { px[o] = 246; px[o + 1] = 200; px[o + 2] = 72; px[o + 3] = 255; }
      else if (out[i] && touches(ring, i)) { px[o] = 120; px[o + 1] = 84; px[o + 2] = 20; px[o + 3] = 200; }
      if (i % CH === 0) yield;
    }
    cx.putImageData(id, 0, 0);
  }
  // runs a generator a few milliseconds per frame until it's done
  function runSliced(gen, done) {
    const step = () => {
      const until = performance.now() + 3;
      try {
        while (performance.now() < until) { if (gen.next().done) { done(); return; } }
      } catch (e) { log("sliced job: " + e); done(); return; }
      (window.requestAnimationFrame || (f => setTimeout(f, 16)))(step);
    };
    step();
  }
  // draw it with the floor's top-left at (x, y), zoom Z (area-map pixels to GUI pixels)
  function drawOutline(r, o, x, y, Z) {
    if (!o || !o.img) return;
    const k = Z / OUTLINE_M;
    r.addTransform().setTranslate(x - 2 * k, y - 2 * k).setScale(k, k);
    r.addGfx(o.img, 0, 0, 0, 0, o.w, o.h);
    r.undoTransform();
  }

  // ---------- quest route ----------
  // A dotted line from Lea to where the tracked quest (the one shown on the HUD) needs her next: the person to
  // talk to, the place to search, the spot to reach. data/wdn-quest-steps.json (made from the game's maps)
  // lists where each quest step is solved: { quest: { step label: [[map, x, y, map w, map h], ...] } }.
  // The line follows the rooms' doorways on the area map; it's drawn when the goal is on Lea's floor.
  let QUEST_STEPS = {};
  try {
    $.ajax({ dataType: "json", async: false, url: ig.getFilePath(ig.root + "data/wdn-quest-steps.json" + ig.getCacheSuffix()),
      success: d => { QUEST_STEPS = d || {}; }, error: () => {} });
  } catch (e) {}
  // every map's walkable exits (edge transitions, doors, stairs): { map: [w, h, [[to map, x, y], ...]] }, for
  // goals in another area or on another floor: the route then leads to the exit on the way there
  let MAP_LINKS = {};
  try {
    $.ajax({ dataType: "json", async: false, url: ig.getFilePath(ig.root + "data/wdn-map-links.json" + ig.getCacheSuffix()),
      success: d => { MAP_LINKS = d || {}; }, error: () => {} });
  } catch (e) {}
  // the main story: data/wdn-story.json lists every spot whose event moves the story on, with the story
  // stage (plot.line) it moves it to: [[stage, map, x, y, w, h], ...]. The next story step is the spot that
  // moves it to the smallest stage after the current one.
  let STORY = [], storyLogged = null;
  try {
    $.ajax({ dataType: "json", async: false, url: ig.getFilePath(ig.root + "data/wdn-story.json" + ig.getCacheSuffix()),
      success: d => { STORY = Array.isArray(d) ? d : []; }, error: () => {} });
  } catch (e) {}
  function storyGoals() {
    try {
      const now = Number(ig.vars.get("plot.line")) || 0;
      let next = Infinity;
      for (const e of STORY) if (e[0] > now && e[0] < next) next = e[0];
      if (now !== storyLogged) { storyLogged = now; log("story stage " + now + ", next " + next); }
      return next === Infinity ? [] : STORY.filter(e => e[0] === next).map(e => e.slice(1));
    } catch (e) { return []; }
  }
  // fewest maps from one map to another: [from, ..., to] or null. A map you can't walk into (reached by a
  // cutscene or teleport) is aimed for by its area instead: the path then ends in the nearest map of that area.
  function mapPath(from, to) {
    return mapPathExact(from, to) || mapPathToArea(from, MAP_LINKS[to] && MAP_LINKS[to][3]);
  }
  function mapPathToArea(from, area) {
    if (!area) return null;
    if (MAP_LINKS[from] && MAP_LINKS[from][3] === area) return null;   // already there: nothing better to aim for
    const prev = { [from]: null }, q = [from];
    for (let i = 0; i < q.length && i < 4000; i++) {
      const m = q[i], L = MAP_LINKS[m];
      if (!L) continue;
      for (const [t] of L[2]) {
        if (t in prev) continue;
        prev[t] = m;
        if (MAP_LINKS[t] && MAP_LINKS[t][3] === area) { const path = [t]; for (let c = m; c !== null; c = prev[c]) path.push(c); return path.reverse(); }
        q.push(t);
      }
    }
    return null;
  }
  function mapPathExact(from, to) {
    if (from === to) return [from];
    const prev = { [from]: null }, q = [from];
    for (let i = 0; i < q.length && i < 4000; i++) {
      const m = q[i], L = MAP_LINKS[m];
      if (!L) continue;
      for (const [t] of L[2]) {
        if (t in prev) continue;
        prev[t] = m;
        if (t === to) { const path = [t]; for (let c = m; c !== null; c = prev[c]) path.push(c); return path.reverse(); }
        q.push(t);
      }
    }
    return null;
  }
  let routeLogged = "";
  // one quest's open steps (its current task's unsolved labelled steps) that have a known spot
  function questGoalsFor(qid) {
    try {
      const Q = sc.quests, steps = QUEST_STEPS[qid];
      if (!Q || !steps) return [];
      const stat = Q.staticQuests[qid];
      const ai = stat ? Q.getActiveQuestID(stat) : undefined, aq = ai !== undefined ? Q.activeQuests[ai] : null;
      if (!aq) return [];
      const raw = (ig.database && ig.database.get && (ig.database.get("quests") || {})[qid]) || stat;
      const task = raw && raw.tasks && raw.tasks[aq.currentTask];
      if (!task) return [];
      const out = [];
      (task.subtasks || []).forEach((st, i) => {
        if (!st || !st.label) return;
        if (aq.labels && aq.labels[st.label]) return;
        try { if (aq.isSubTaskSolved && aq.isSubTaskSolved(i)) return; } catch (e) {}
        for (const sp of steps[st.label] || []) out.push(sp);
      });
      return out;
    } catch (e) { return []; }
  }
  function activeQuestIds() {
    try { return (sc.quests.activeQuests || []).map(a => a && a.quest && a.quest.id).filter(Boolean); } catch (e) { return []; }
  }
  // what the route leads to: your favourite quest shown on the HUD; else all your favourites (the nearest step
  // wins); else, as set in the options, the main story's next step (default), the nearest step of any quest
  // you have on, or nothing
  // a tracked bounty (see the bounties): its hunting grounds you can reach, as route goals
  function bountyGoals() {
    try {
      const spots = window.wdnBountySpots ? window.wdnBountySpots() : [];
      const locked = window.wdnLockedAreas ? window.wdnLockedAreas() : [];
      const out = [];
      for (const sp of spots) {
        const L = MAP_LINKS[sp.map];
        if (!L || (L[3] && locked.indexOf(L[3]) >= 0)) continue;
        out.push([sp.map, sp.x, sp.y, L[0], L[1]]);
      }
      return out;
    } catch (e) { return []; }
  }
  window.wdnBountyGoals = bountyGoals;
  function questGoals() {
    const bg = bountyGoals();
    if (bg.length) return bg;   // a tracked bounty leads the route (and the world map's gold pin)
    try {
      const Q = sc.quests;
      if (!Q) return [];
      let ids;
      if (Q.focusQuest >= 0 && Q.markedQuests[Q.focusQuest]) ids = [Q.markedQuests[Q.focusQuest]];
      else if (Q.markedQuests && Q.markedQuests.length) ids = Q.markedQuests.slice();
      else {
        const src = Number(opt("routeSource", 0));
        if (src === 0) return storyGoals();
        ids = src === 2 ? activeQuestIds() : [];
      }
      const out = [];
      for (const id of ids) for (const g of questGoalsFor(id)) out.push(g);
      return out;
    } catch (e) { return []; }
  }
  // shortest way between two spots on a floor through its rooms' doorways (Dijkstra; within a room any two of
  // its points join): { d, pts } or null
  function floorPath(floor, start, end) {
    const all = [{ x: start.x, y: start.y, rooms: [start.room.id] }];
    for (const c of floor.connections) {
      const n = Math.max(1, c.size || 1);
      const x = c.dir === "VERTICAL" ? (c.tx + n / 2) * 8 : (c.tx + 1) * 8;
      const y = c.dir === "VERTICAL" ? (c.ty + 1) * 8 : (c.ty + n / 2) * 8;
      all.push({ x, y, rooms: [c.map1 + 1, c.map2 + 1] });
    }
    all.push({ x: end.x, y: end.y, rooms: [end.room.id], goal: true });
    const dist = all.map(() => Infinity), prev = all.map(() => -1), done = all.map(() => false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < all.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || all[u].goal) break;
      done[u] = true;
      for (let v = 0; v < all.length; v++) {
        if (done[v] || !all[v].rooms.some(r => all[u].rooms.includes(r))) continue;
        const d = dist[u] + Math.hypot(all[u].x - all[v].x, all[u].y - all[v].y);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; }
      }
    }
    const gi = all.length - 1;
    if (dist[gi] === Infinity) return null;
    const pts = [];
    for (let i = gi; i >= 0; i = prev[i]) { pts.push({ x: all[i].x, y: all[i].y }); if (i === 0) break; }
    return { d: dist[gi], pts: pts.reverse() };
  }
  // a spot on one of this floor's maps as { room, x, y } (area-map pixels), or null; interiors shown as an
  // icon count as their door
  function onFloorSpot(floor, map, gx, gy, gw, gh) {
    const room = floor.rooms.find(r => r && r.name === map);
    if (room) { const p = toFloor(floor, room, gx, gy, gw, gh); return p ? { room, x: p.x * 8, y: p.y * 8 } : null; }
    const inter = floor.wdnInteriors && floor.wdnInteriors[map];
    const door = inter && floor.rooms.find(r => r && r.name === inter[0]);
    return door ? { room: door, x: inter[1], y: inter[2] } : null;
  }
  // where a map's exit to another map is, on this floor
  function exitSpot(floor, from, to) {
    const L = MAP_LINKS[from], ex = L && L[2].find(e => e[0] === to);
    if (ex) return onFloorSpot(floor, from, ex[1], ex[2], L[0], L[1]);
    const r = floor.rooms.find(q => q && q.name === from);
    return r ? { room: r, x: (r.min.x + r.max.x) * 4, y: (r.min.y + r.max.y) * 4 } : onFloorSpot(floor, from, 0, 0, 1, 1);
  }
  // the route's part on this floor as area-map pixel points, or null. On Lea's floor it starts at Lea; on
  // any other floor or area (browsing the map) it's the stretch of her way there that crosses this floor:
  // from where she'll come in to the goal, or to where she'll leave again.
  const routeCaches = new WeakMap();
  function questRoute(floor) {
    if (!opt("questRoute", true) || !floor || !floor.rooms || !floor.connections) return null;
    const now = Date.now(), cached = routeCaches.get(floor);
    if (cached && now - cached.at < 1000) return cached.pts;
    let pts = null;
    try {
      const goals = questGoals(), lea = leaSpot(floor), here = String(sc.map.currentMap || "");
      const ok = m => !!onFloorSpot(floor, m, 0, 0, 1, 1);
      let best = null;
      for (const g of goals) {
        const path = mapPath(here, g[0]);
        if (!path) continue;
        let i, start;
        if (lea) { i = 0; start = { room: lea.room, x: lea.x * 8, y: lea.y * 8 }; }
        else {
          i = path.findIndex(ok);
          if (i < 0) continue;
          start = i > 0 ? exitSpot(floor, path[i], path[i - 1]) : exitSpot(floor, path[0], "");
        }
        if (!start) continue;
        let k = i;
        while (k + 1 < path.length && ok(path[k + 1])) k++;
        const last = path[path.length - 1];
        const end = k < path.length - 1 ? exitSpot(floor, path[k], path[k + 1])
          : last === g[0] ? onFloorSpot(floor, g[0], g[1], g[2], g[3], g[4]) : exitSpot(floor, last, "");
        if (!end) continue;
        const fp = floorPath(floor, start, end);
        if (!fp) continue;
        // fewest maps to the goal first, then the shortest line
        const score = (path.length - 1) * 100000 + fp.d;
        if (!best || score < best.score) best = { score, pts: fp.pts };
      }
      pts = best ? best.pts : null;
    } catch (e) { pts = null; }
    routeCaches.set(floor, { at: now, pts });
    try {
      const sig = JSON.stringify(questGoals().slice(0, 4)) + "|" + (pts ? pts.length : 0);
      if (sig !== routeLogged) { routeLogged = sig; log("route: goals " + sig.split("|")[0] + (pts ? " -> route with " + pts.length + " points" : " -> no route on this floor")); }
    } catch (e) {}
    return pts;
  }
  const visited = a => { try { return !!sc.map.getVisitedArea(a); } catch (e) { return true; } };
  window.wdnMapArea = m => (MAP_LINKS[m] && MAP_LINKS[m][3]) || null;
  // the area the route's goal is in (for the world map): the goal fewest maps away
  let destCache = null, destAt = 0;
  function routeDestArea() {
    const now = Date.now();
    if (now - destAt < 1000) return destCache;
    destAt = now; destCache = null;
    try {
      if (!opt("questRoute", true)) return null;
      const here = String(sc.map.currentMap || "");
      let bestLen = Infinity;
      const goals = questGoals();
      for (const g of goals) {
        const p = mapPath(here, g[0]);
        const L = MAP_LINKS[g[0]];
        // a goal in the area you're in (no path needed) still marks that area
        const len = p ? p.length : (L && MAP_LINKS[here] && MAP_LINKS[here][3] === L[3] ? 0 : Infinity);
        if (!(L && L[3] && len < bestLen)) continue;
        bestLen = len;
        // the world map only has pins for areas you've been to: aim for the last one of those on the way
        let area = L[3];
        if (!visited(area) && p) {
          area = null;
          for (let i = p.length - 1; i >= 0 && !area; i--) { const a = MAP_LINKS[p[i]] && MAP_LINKS[p[i]][3]; if (a && visited(a)) area = a; }
        }
        destCache = area || L[3];
      }
      const sig = destCache + " <- " + JSON.stringify(goals.slice(0, 2).map(g => g[0])) + " from " + here;
      if (sig !== routeDestArea.logged) { routeDestArea.logged = sig; log("world pin: " + sig); }
    } catch (e) { destCache = null; }
    return destCache;
  }
  // "  > Gaia's Garden" after the area's name on the minimap tab: where the route leads (another area's name,
  // or the room's name when it's in this area)
  let destLabelCache = "", destLabelAt = 0;
  function routeDestLabel() {
    const now = Date.now();
    if (now - destLabelAt < 1000) return destLabelCache;
    destLabelAt = now; destLabelCache = "";
    try {
      if (!opt("questRoute", true) || opt("mmDest", true) === false) return "";
      const here = String(sc.map.currentMap || ""), hereArea = sc.map.currentPlayerArea && sc.map.currentPlayerArea.path;
      let best = null, bestLen = Infinity;
      for (const g of questGoals()) {
        const p = mapPath(here, g[0]);
        if (p && p.length < bestLen) { bestLen = p.length; best = g[0]; }
      }
      if (!best) return "";
      const area = MAP_LINKS[best] && MAP_LINKS[best][3];
      let name = "";
      if (area && area !== hereArea) name = String(sc.map.getAreaName(area) || "");
      else {
        // a room in this area: its name on the area map
        const a = sc.map.currentPlayerArea && sc.map.currentPlayerArea.data;
        for (const f of (a && a.floors) || []) for (const m of f.maps || []) {
          if (m && m.path === best && m.name) { try { name = ig.LangLabel.getText(m.name); } catch (e) { name = ""; } }
        }
        if (best === here) name = "";
      }
      destLabelCache = name ? "  > " + name : "";
    } catch (e) { destLabelCache = ""; }
    return destLabelCache;
  }
  window.wdnRouteDest = routeDestLabel;   // for the L2 quick ring's Map label
  // world map: the destination area's pin turns gold and glows
  let goldPins = null;
  function goldPin(icon) {
    try {
      const src = new ig.Image("media/gui/menu.png");
      if (!src.loaded || !src.data) return null;
      goldPins = goldPins || {};
      if (goldPins[icon]) return goldPins[icon];
      const k = src.data.width / src.width;   // the game may hold the sheet scaled up
      const c = document.createElement("canvas"); c.width = 8 * k; c.height = 8 * k;
      const cx = c.getContext("2d");
      cx.drawImage(src.data, (328 + icon) * k, 456 * k, 8 * k, 8 * k, 0, 0, 8 * k, 8 * k);
      const id = cx.getImageData(0, 0, c.width, c.height), px = id.data;
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
        // dark outline stays dark brown, the rest runs from deep gold to pale gold
        px[i] = Math.round(70 + 185 * Math.min(1, l * 1.25)); px[i + 1] = Math.round(40 + 180 * l); px[i + 2] = Math.round(10 + 90 * l * l);
      }
      cx.putImageData(id, 0, 0);
      const img = new ig.Image({}); img.data = c; img.loaded = true; img.width = 8 * k; img.height = 8 * k; img.k = k;
      return (goldPins[icon] = img);
    } catch (e) { return null; }
  }
  if (window.sc && sc.AreaButton) sc.AreaButton.inject({
    updateDrawables(r) {
      this.parent(r);
      try {
        // every orb of this area found: a small gold orb on the pin
        if (opt("orbWorldMap", true) !== false && window.wdnOrbAreaDone && window.wdnOrbAreaDone(this.key)) {
          r.addColor("rgb(14,12,18)", 11, -1, 5, 7); r.addColor("rgb(14,12,18)", 10, 0, 7, 5);
          r.addColor("rgb(240,190,60)", 12, 0, 3, 5); r.addColor("rgb(240,190,60)", 11, 1, 5, 3); r.addColor("#fff", 12, 1, 1, 1);
        }
        if (opt("routeWorld", true) === false || this.key !== routeDestArea()) return;
        const g = goldPin(this.icon);
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 300);
        r.addGfx(this.gfx, -3, -2, 421, 173, 21, 21).setCompositionMode("lighter").setAlpha(pulse);
        if (g) {
          if (g.k > 1) { r.addTransform().setTranslate(4, 4).setScale(1 / g.k, 1 / g.k); r.addGfx(g, 0, 0, 0, 0, 8 * g.k, 8 * g.k); r.undoTransform(); }
          else r.addGfx(g, 4, 4, 0, 0, 8, 8);
        }
      } catch (e) {}
    }
  });
  // dots along the route; (ox, oy) + point * k gives GUI pixels; dots march towards the goal
  function drawRoute(r, pts, ox, oy, k, vis) {
    if (!pts || pts.length < 2) return;
    const step = 5, t = (performance.now() / 1000 * 10) % step;
    let carry = t;   // (the first dot sits further along as time goes on: the dots travel towards the goal)
    for (let i = 1; i < pts.length; i++) {
      const ax = ox + pts[i - 1].x * k, ay = oy + pts[i - 1].y * k, bx = ox + pts[i].x * k, by = oy + pts[i].y * k;
      const len = Math.hypot(bx - ax, by - ay);
      let d = carry;
      while (d < len) {
        const x = Math.round(ax + (bx - ax) * d / len), y = Math.round(ay + (by - ay) * d / len);
        if (!vis || vis(x - 1, y - 1, 3, 3)) {
          r.addColor("#3a2a00", x - 1, y, 3, 1).setAlpha(0.7);
          r.addColor("#ffde50", x - 1, y - 1, 2, 2);
        }
        d += step;
      }
      carry = d - len;
    }
    // a ring at the goal
    const g = pts[pts.length - 1], gx = Math.round(ox + g.x * k), gy = Math.round(oy + g.y * k);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
    if (!vis || vis(gx - 4, gy - 4, 8, 8)) {
      r.addColor("#ffde50", gx - 3, gy - 4, 6, 1).setAlpha(0.6 + 0.4 * pulse); r.addColor("#ffde50", gx - 3, gy + 3, 6, 1).setAlpha(0.6 + 0.4 * pulse);
      r.addColor("#ffde50", gx - 4, gy - 3, 1, 6).setAlpha(0.6 + 0.4 * pulse); r.addColor("#ffde50", gx + 3, gy - 3, 1, 6).setAlpha(0.6 + 0.4 * pulse);
    }
  }

  // Lea's spot on the area map (in cells), or null when she isn't on this floor
  function leaSpot(floor) {
    const map = sc.map, player = ig.game && ig.game.playerEntity;
    if (!map || !player || !floor || !floor.rooms || !floor.tiles || !ig.game.size) return null;
    if (map.currentArea !== map.currentPlayerArea) return null;            // browsing another area
    // inside a building that the true-scale map shows as an icon: Lea stands at its door
    const inter = floor.wdnInteriors && floor.wdnInteriors[map.currentMap];
    if (inter) {
      const room = floor.rooms.find(r => r && r.name === inter[0]);
      return room ? { room, x: inter[1] / 8, y: inter[2] / 8, inside: true } : null;
    }
    if ((floor.level || 0) !== (map.currentPlayerFloor || 0)) return null;  // another floor
    const room = floor.rooms.find(r => r && r.name === map.currentMap);
    if (!room) return null;
    const c = player.coll;
    const p = toFloor(floor, room, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
    return p && { room, x: p.x, y: p.y };
  }

  // draws a chest marker centred on (cx, cy) in GUI pixels
  let gfx = null, chestGfx = null;
  function loadGfx() {
    if (!gfx) { gfx = new ig.Image(SHEET); chestGfx = new ig.Image("media/entity/objects/treasure.png"); }
  }
  // Area map > Markers > Marker size: chests and quest markers drawn smaller or bigger
  function markerScale() { return [0.75, 1, 1.5, 2][Number(opt("markerSize", 1))] || 1; }
  function scaled(r, cx, cy, draw) {
    const k = markerScale();
    if (k === 1) return draw(cx, cy);
    r.addTransform().setTranslate(Math.round(cx), Math.round(cy)).setScale(k, k);
    try { draw(0, 0); } finally { r.undoTransform(); }
  }
  function drawChest(r, type, opened, cx, cy) { scaled(r, cx, cy, (x, y) => drawChest1(r, type, opened, x, y)); }
  function drawChest1(r, type, opened, cx, cy) {
    const lock = !opened ? LOCK_SPRITE[type] : null;
    if (lock) { r.addGfx(chestGfx, Math.round(cx - 6), Math.round(cy - 5), lock.x, lock.y, lock.w, lock.h); return; }
    const icon = opened ? OPENED_ICON : (TYPE_ICON[type] !== undefined ? TYPE_ICON[type] : 0);
    const d = r.addGfx(gfx, Math.round(cx - 3), Math.round(cy - 3), icon, 0, 7, 7);
    if (opened) d.setAlpha(0.7);
  }

  // shiny enemies (see the monster cards): a pulsing red orb with a glow and a twinkle
  function drawShinyOrb(r, x, y) {
    const t = performance.now() / 1000, p = 0.5 + 0.5 * Math.sin(t * 5);
    x = Math.round(x); y = Math.round(y);
    r.addColor("rgb(255,60,60)", x - 5, y - 2, 11, 5).setAlpha(0.18 + 0.15 * p);
    r.addColor("rgb(255,60,60)", x - 2, y - 5, 5, 11).setAlpha(0.18 + 0.15 * p);
    r.addColor("rgb(255,60,60)", x - 4, y - 3, 9, 7).setAlpha(0.12 + 0.1 * p);
    r.addColor("rgb(40,0,0)", x - 2, y - 3, 5, 7); r.addColor("rgb(40,0,0)", x - 3, y - 2, 7, 5);
    r.addColor("rgb(230,30,40)", x - 2, y - 2, 5, 5); r.addColor("rgb(230,30,40)", x - 1, y - 3, 3, 7); r.addColor("rgb(230,30,40)", x - 3, y - 1, 7, 3);
    r.addColor("rgb(255,120,110)", x - 1, y - 2, 2, 2);
    r.addColor("#fff", x - 1, y - 2, 1, 1);
    const k = (t % 1.6) / 0.5;   // a twinkle
    if (k < 1) { const a = Math.sin(k * Math.PI); r.addColor("rgb(255,236,170)", x + 2, y - 6, 1, 5).setAlpha(a); r.addColor("rgb(255,236,170)", x, y - 4, 5, 1).setAlpha(a); }
  }
  // the minimap's enemy icon, recoloured gold (made once from the game's own icon sheet)
  let goldIcon = null;
  function goldEnemyIcon() {
    if (goldIcon) return goldIcon;
    loadGfx();
    if (!gfx || !gfx.loaded || !gfx.data) return null;
    try {
      const k = (gfx.data.width / gfx.width) || 1;
      const c = document.createElement("canvas"); c.width = 7; c.height = 7;
      const cx = c.getContext("2d");
      cx.imageSmoothingEnabled = false;
      cx.drawImage(gfx.data, ENEMY_ICON * k, 0, 7 * k, 7 * k, 0, 0, 7, 7);
      const id = cx.getImageData(0, 0, 7, 7), px = id.data;
      const lo = [110, 62, 8], hi = [255, 236, 140];
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const l = Math.min(1, ((px[i] + px[i + 1] + px[i + 2]) / 765) * 1.6 + 0.15);
        for (let j = 0; j < 3; j++) px[i + j] = Math.round(lo[j] + (hi[j] - lo[j]) * l);
      }
      cx.putImageData(id, 0, 0);
      goldIcon = canvasImage(c);
    } catch (e) { log("gold icon: " + e); goldIcon = null; return null; }
    return goldIcon;
  }
  // the enemy icon recoloured from dark (lo) to light (hi): champions in their modifier's colour
  const tintIcons = {};
  function tintedEnemyIcon(name, lo, hi) {
    if (tintIcons[name]) return tintIcons[name];
    loadGfx();
    if (!gfx || !gfx.loaded || !gfx.data) return null;
    try {
      const k = (gfx.data.width / gfx.width) || 1;
      const c = document.createElement("canvas"); c.width = 7; c.height = 7;
      const cx = c.getContext("2d");
      cx.imageSmoothingEnabled = false;
      cx.drawImage(gfx.data, ENEMY_ICON * k, 0, 7 * k, 7 * k, 0, 0, 7, 7);
      const id = cx.getImageData(0, 0, 7, 7), px = id.data;
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const l = Math.min(1, ((px[i] + px[i + 1] + px[i + 2]) / 765) * 1.6 + 0.15);
        for (let j = 0; j < 3; j++) px[i + j] = Math.round(lo[j] + (hi[j] - lo[j]) * l);
      }
      cx.putImageData(id, 0, 0);
      tintIcons[name] = canvasImage(c);
    } catch (e) { tintIcons[name] = null; }
    return tintIcons[name];
  }
  const CHAMP_TINT = { armoured: [[24, 54, 120], [170, 215, 255], "rgb(111,180,255)"], mighty: [[120, 30, 10], [255, 170, 120], "rgb(255,106,72)"], regen: [[18, 90, 40], [170, 255, 190], "rgb(92,255,138)"] };
  // a champion enemy: the icon in its modifier's colour, with a pulsing ring (two colours for two modifiers)
  function drawChampIcon(r, x, y, mods) {
    const t = performance.now() / 1000, p = 0.5 + 0.5 * Math.sin(t * 4);
    x = Math.round(x); y = Math.round(y);
    const A = CHAMP_TINT[mods[0]] || CHAMP_TINT.mighty, B = CHAMP_TINT[mods[1]] || A;
    r.addColor(A[2], x - 5, y - 5, 11, 1).setAlpha(0.5 + 0.4 * p); r.addColor(A[2], x - 5, y - 5, 1, 11).setAlpha(0.5 + 0.4 * p);
    r.addColor(B[2], x - 5, y + 5, 11, 1).setAlpha(0.5 + 0.4 * p); r.addColor(B[2], x + 5, y - 5, 1, 11).setAlpha(0.5 + 0.4 * p);
    const ic = tintedEnemyIcon(mods[0] || "mighty", A[0], A[1]);
    if (ic) r.addGfx(ic, x - 3, y - 3, 0, 0, 7, 7);
    else r.addColor(A[2], x - 2, y - 2, 5, 5);
  }
  function liveChampions() {
    const out = [];
    try {
      for (const e of ig.game.entities) {
        if (!e || !e.__wdnChamp || e._killed || !e.coll || e.__wdnShiny) continue;
        if (e._hidden || (e.coll.type === ig.COLLTYPE.NONE)) continue;
        try { if (e.params && e.params.isDefeated && e.params.isDefeated()) continue; } catch (err) {}
        out.push(e);
      }
    } catch (e) {}
    return out;
  }
  // a gold enemy icon with a soft glow and twinkles, centred on (x, y)
  function drawShinyIcon(r, x, y) {
    const t = performance.now() / 1000, p = 0.5 + 0.5 * Math.sin(t * 5);
    x = Math.round(x); y = Math.round(y);
    r.addColor("rgb(255,214,96)", x - 5, y - 5, 11, 11).setAlpha(0.12 + 0.12 * p);
    r.addColor("rgb(255,214,96)", x - 4, y - 4, 9, 9).setAlpha(0.15 + 0.15 * p);
    const ic = goldEnemyIcon();
    if (ic) r.addGfx(ic, x - 3, y - 3, 0, 0, 7, 7);
    else r.addColor("rgb(255,214,96)", x - 2, y - 2, 5, 5);
    for (let i = 0; i < 2; i++) {
      const k = ((t + i * 0.8) % 1.6) / 0.6;
      if (k < 1) {
        const a = Math.sin(k * Math.PI), sx = x + (i ? -5 : 4), sy = y + (i ? 3 : -5);
        r.addColor("rgb(255,246,200)", sx - 1, sy, 3, 1).setAlpha(a); r.addColor("rgb(255,246,200)", sx, sy - 1, 1, 3).setAlpha(a);
      }
    }
  }
  // card players (see the card games): a small gold card with a dark face and a diamond
  function drawCardPlayerIcon(r, x, y) {
    x = Math.round(x); y = Math.round(y);
    r.addColor("rgb(14,12,18)", x - 4, y - 5, 9, 11);
    r.addColor("rgb(232,182,58)", x - 3, y - 4, 7, 9);
    r.addColor("rgb(255,236,150)", x - 3, y - 4, 7, 1);
    r.addColor("rgb(46,52,74)", x - 2, y - 3, 5, 7);
    r.addColor("rgb(255,220,110)", x, y - 2, 1, 5); r.addColor("rgb(255,220,110)", x - 1, y - 1, 3, 3);
    r.addColor("#fff", x, y, 1, 1);
  }
  // bounty boards: a little notice board (brown frame, pinned paper)
  function drawBoardIcon(r, x, y) {
    x = Math.round(x); y = Math.round(y);
    r.addColor("rgb(14,12,18)", x - 5, y - 5, 11, 9);
    r.addColor("rgb(160,104,58)", x - 4, y - 4, 9, 7);
    r.addColor("rgb(196,140,84)", x - 4, y - 4, 9, 1);
    r.addColor("rgb(244,240,228)", x - 3, y - 3, 3, 4); r.addColor("rgb(250,226,120)", x + 1, y - 2, 3, 3);
    r.addColor("rgb(206,40,40)", x - 2, y - 3, 1, 1); r.addColor("rgb(206,40,40)", x + 2, y - 2, 1, 1);
    r.addColor("rgb(14,12,18)", x - 4, y + 4, 2, 3); r.addColor("rgb(14,12,18)", x + 3, y + 4, 2, 3);
    r.addColor("rgb(74,44,24)", x - 4, y + 4, 1, 2); r.addColor("rgb(74,44,24)", x + 3, y + 4, 1, 2);
  }
  function boardSpotsOn(floor) { return cardPlayerSpotsOn(floor, null, window.wdnBoardSpots); }
  // the tracked bounty's hunting grounds: a gold target with a dark "!"
  function drawBountyIcon(r, x, y) {
    x = Math.round(x); y = Math.round(y);
    const a = 0.75 + 0.25 * Math.sin(Date.now() / 250);
    r.addColor("rgb(14,12,18)", x - 4, y - 5, 9, 11); r.addColor("rgb(14,12,18)", x - 5, y - 4, 11, 9);
    r.addColor("rgb(232,182,58)", x - 3, y - 4, 7, 9).setAlpha(a); r.addColor("rgb(232,182,58)", x - 4, y - 3, 9, 7).setAlpha(a);
    r.addColor("rgb(255,236,150)", x - 3, y - 4, 7, 1);
    r.addColor("rgb(40,24,10)", x, y - 3, 1, 4); r.addColor("rgb(40,24,10)", x, y + 2, 1, 1);
  }
  function bountySpotsOn(floor) { return cardPlayerSpotsOn(floor, null, window.wdnBountySpots); }
  // element orbs (see the orbs): a small ball in its element's colour
  function drawOrbDot(r, x, y, el, a) {
    x = Math.round(x); y = Math.round(y);
    const c = window.wdnOrbColour ? window.wdnOrbColour(el) : [255, 255, 255], col = "rgb(" + c.join(",") + ")";
    r.addColor("rgb(14,12,18)", x - 2, y - 3, 5, 7).setAlpha(a == null ? 1 : a); r.addColor("rgb(14,12,18)", x - 3, y - 2, 7, 5).setAlpha(a == null ? 1 : a);
    r.addColor(col, x - 1, y - 2, 3, 5).setAlpha(a == null ? 1 : a); r.addColor(col, x - 2, y - 1, 5, 3).setAlpha(a == null ? 1 : a);
    r.addColor("#fff", x - 1, y - 1, 1, 1).setAlpha(a == null ? 0.9 : a);
  }
  function orbSpotsOn(floor) { return cardPlayerSpotsOn(floor, null, window.wdnOrbFoundSpots); }
  function orbLeftSpotsOn(floor) {
    const a = cardPlayerSpotsOn(floor, null, window.wdnOrbLeftSpots), b = cardPlayerSpotsOn(floor, null, window.wdnOrbRevealedSpots);
    return a.length ? a : b;   // (all the orbs left, if that's switched on; else just the ones the orb trader marked)
  }
  // the orb trader: a hooded figure in purple holding a blue orb
  function drawTraderIcon(r, x, y) {
    x = Math.round(x); y = Math.round(y);
    r.addColor("rgb(14,12,18)", x - 4, y - 5, 9, 11); r.addColor("rgb(14,12,18)", x - 5, y - 2, 11, 7);
    r.addColor("rgb(120,74,160)", x - 3, y - 4, 7, 9); r.addColor("rgb(120,74,160)", x - 4, y - 1, 9, 5);
    r.addColor("rgb(70,40,96)", x - 2, y - 4, 5, 3); r.addColor("rgb(210,170,140)", x - 1, y - 3, 3, 1);
    r.addColor("rgb(150,230,255)", x - 1, y + 1, 3, 2); r.addColor("#fff", x, y + 1, 1, 1);
  }
  function traderSpotsOn(floor) { return cardPlayerSpotsOn(floor, null, window.wdnOrbTraderSpots); }
  // the mod's own people and places: the card collector (green), the rival (red), orb shrines (a pillar
  // with an orb in its element's colour)
  // drawn like the game's own map icons (12x12, black outline): the collector's top hat, Ryder's blond spikes,
  // and a shrine pillar with its element's orb
  const figureImgs = {};
  function figureImg(kind) {
    if (!(kind in figureImgs)) { try { figureImgs[kind] = new ig.Image("media/gui/wdn-icon-" + kind + ".png"); } catch (e) { figureImgs[kind] = null; } }
    const im = figureImgs[kind];
    return im && im.loaded && !im.failed ? im : null;
  }
  function drawFigureIcon(r, x, y, kind) {
    x = Math.round(x); y = Math.round(y);
    if (kind === "quest") { drawQuestBubble1(r, x, y); return; }   // (the game's own quest bubble, pointing at the spot)
    const im = figureImg(kind);
    if (im) { r.addGfx(im, x - 6, y - 6, 0, 0, 12, 12); return; }
    if (kind === "trial") {   // the Trial Fountain: a little fountain, its spout splashing, with an orb over it
      r.addColor("rgb(14,12,18)", x - 6, y + 1, 13, 5); r.addColor("rgb(14,12,18)", x - 2, y - 4, 5, 7);
      r.addColor("rgb(150,150,165)", x - 5, y + 2, 11, 3); r.addColor("rgb(90,170,230)", x - 4, y + 2, 9, 1);
      r.addColor("rgb(150,150,165)", x - 1, y - 3, 3, 5); r.addColor("rgb(160,220,255)", x, y - 3, 1, 4);
      r.addColor("rgb(14,12,18)", x - 2, y - 9, 5, 5); r.addColor("rgb(255,214,96)", x - 1, y - 8, 3, 3); r.addColor("#fff", x - 1, y - 8, 1, 1);
      return;
    }
    const body = kind === "rival" ? "rgb(200,40,40)" : "rgb(50,120,80)", hair = kind === "rival" ? "rgb(60,110,220)" : "rgb(110,70,40)";
    r.addColor("rgb(14,12,18)", x - 4, y - 5, 9, 11);
    r.addColor(hair, x - 2, y - 4, 5, 2); r.addColor("rgb(232,190,150)", x - 2, y - 2, 5, 2);
    r.addColor(body, x - 3, y, 7, 4); r.addColor("rgb(240,240,240)", x - 1, y + 1, 1, 2);
  }
  function figureSpotsOn(floor) { return cardPlayerSpotsOn(floor, null, window.wdnFigureSpots); }
  // an orb not found yet: the dot, dark and greyed
  function drawOrbDim(r, x, y, el) {
    x = Math.round(x); y = Math.round(y);
    const c = window.wdnOrbColour ? window.wdnOrbColour(el) : [200, 200, 200], g = (c[0] + c[1] + c[2]) / 3, col = "rgb(" + c.map(v => Math.round((v * 0.45 + g * 0.55) * 0.35)).join(",") + ")";
    r.addColor("rgb(14,12,18)", x - 2, y - 3, 5, 7); r.addColor("rgb(14,12,18)", x - 3, y - 2, 7, 5);
    r.addColor(col, x - 1, y - 2, 3, 5); r.addColor(col, x - 2, y - 1, 5, 3);
  }
  // card players in other rooms of this floor, at the spots they stand (from the mod's list)
  function cardPlayerSpotsOn(floor, skipMap, source) {
    const out = [];
    try {
      const spots = (source || window.wdnCardPlayerSpots) ? (source || window.wdnCardPlayerSpots)() : [];
      for (const sp of spots) {
        if (sp.map === skipMap) continue;
        const room = floor.rooms.find(r => r && r.name === sp.map), L = MAP_LINKS[sp.map];
        if (!room || !L) continue;
        if (!roomVars(room.name)) continue;   // only rooms you've been to
        const p = toFloor(floor, room, sp.x, sp.y, L[0], L[1]);
        if (p) { if (sp.el != null) p.el = sp.el; out.push(p); }
      }
    } catch (e) {}
    return out;
  }
  function cardPlayersHere() {
    const out = [];
    try {
      if (!window.wdnIsCardPlayer) return out;
      for (const e of ig.game.entities) if (ig.ENTITY.NPC && e instanceof ig.ENTITY.NPC && !e._hidden && e.coll && window.wdnIsCardPlayer(e)) out.push(e);
    } catch (e) {}
    return out;
  }
  function liveShinies() {
    const out = [];
    try {
      for (const e of ig.game.entities) {
        if (!e || !e.__wdnShiny || e._killed || !e.coll) continue;
        if (e._hidden || (e.coll.type === ig.COLLTYPE.NONE)) continue;
        try { if (e.params && e.params.isDefeated && e.params.isDefeated()) continue; } catch (err) {}
        out.push(e);
      }
    } catch (e) {}
    return out;
  }

  // ---------- area map (pause menu) markers ----------
  let Marker = null, LeaMarker = null, QuestMarker = null, RouteMarker = null, OutlineMarker = null, ShinyMarker = null, CardPlayerMarker = null, BoardMarker = null, BountyMarker = null, OrbMarker = null, TraderMarker = null, ChampMarker = null, FigureMarker = null;
  function defineMarkers() {
    if (Marker) return;
    loadGfx();
    Marker = ig.GuiElementBase.extend({
      init(spot) { this.parent(); this.spot = spot; this.setSize(1, 1); },
      updateDrawables(r) { drawChest(r, this.spot.ch.t, this.spot.opened, 0, 0); }
    });
    QuestMarker = ig.GuiElementBase.extend({
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { drawQuestBubble(r, 0, 0); }
    });
    OutlineMarker = ig.GuiElementBase.extend({
      init(floor) { this.parent(); this.floor = floor; },
      updateDrawables(r) { drawOutline(r, floorOutline(this.floor), 0, 0, 1); }
    });
    RouteMarker = ig.GuiElementBase.extend({
      init(floor) { this.parent(); this.floor = floor; this.setSize(1, 1); },
      // as big as the whole floor, so it's never skipped as being off screen
      update() { const p = this.hook.parentHook; if (p && (p.size.x !== this.hook.size.x || p.size.y !== this.hook.size.y)) this.setSize(p.size.x, p.size.y); },
      updateDrawables(r) {
        if (opt("routeMap", true) === false) return;
        const pts = questRoute(this.floor);
        if (!this._logged) { this._logged = true; log("area map route: floor " + (this.floor.level || 0) + ", " + (pts ? pts.length + " points" : "no route") + ", size " + this.hook.size.x + "x" + this.hook.size.y); }
        drawRoute(r, pts, 0, 0, 1, null);
      }
    });
    ChampMarker = ig.GuiElementBase.extend({
      mods: null,
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { drawChampIcon(r, 0, 0, this.mods || ["mighty"]); }
    });
    FigureMarker = ig.GuiElementBase.extend({
      kind: null,
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { drawFigureIcon(r, 0, 0, this.kind); }
    });
    TraderMarker = ig.GuiElementBase.extend({
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { drawTraderIcon(r, 0, 0); }
    });
    OrbMarker = ig.GuiElementBase.extend({
      el: 0,
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { if (this.dim) drawOrbDim(r, 0, 0, this.el); else drawOrbDot(r, 0, 0, this.el); }
    });
    BountyMarker = ig.GuiElementBase.extend({
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { drawBountyIcon(r, 0, 0); }
    });
    BoardMarker = ig.GuiElementBase.extend({
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { drawBoardIcon(r, 0, 0); }
    });
    CardPlayerMarker = ig.GuiElementBase.extend({
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { drawCardPlayerIcon(r, 0, 0); }
    });
    ShinyMarker = ig.GuiElementBase.extend({
      init() { this.parent(); this.setSize(1, 1); },
      updateDrawables(r) { drawShinyIcon(r, 0, 0); }
    });
    LeaMarker = ig.GuiElementBase.extend({
      init() { this.parent(); this.setSize(LEA.w, LEA.h); },
      updateDrawables(r) { r.addGfx(gfx, 0, 0, LEA.x, LEA.y, LEA.w, LEA.h); }
    });
  }

  function addMarkers(floorGui) {
    defineMarkers();
    const floor = floorGui.floor;
    if (!floor || !floor.tiles || !floor.rooms) return;
    try {
      const om = new OutlineMarker(floor);
      om.setSize(floorGui.hook.size.x || floor.tiles[0].length * 8, floorGui.hook.size.y || floor.tiles.length * 8);
      floorGui.addChildGui(om);
    } catch (e) { log("outline: " + e); }
    try {
      for (const room of floor.rooms) {
        if (!room) continue;
        for (const s of chestSpots(floor, room)) {
          const m = new Marker(s);
          m.setPos(s.cx, s.cy);
          floorGui.addChildGui(m);
        }
      }
    } catch (e) { console.error("[CrossCode Enhanced]", e); }
    try {
      for (const room of floor.rooms) {
        if (!room || !roomVars(room.name)) continue;      // only rooms you've been to are drawn
        for (const s of giverSpots(floor, room)) {
          const m = new QuestMarker();
          m.setPos(s.cx, s.cy);
          floorGui.addChildGui(m);
        }
      }
    } catch (e) { console.error("[Maps] quest givers", e); }
    try {
      // as big as the whole floor from the start: a 1x1 element in the floor's corner is skipped by the menu
      // whenever that corner is scrolled off screen
      const rm = new RouteMarker(floor);
      rm.setSize(floorGui.hook.size.x || floor.tiles[0].length * 8, floorGui.hook.size.y || floor.tiles.length * 8);
      floorGui.addChildGui(rm);
    } catch (e) { log("route marker: " + e); }
    try {   // card players in the room Lea is in
      const lp = leaSpot(floor);
      if (lp && !lp.inside && opt("mmCardPlayers", true) !== false) for (const e of cardPlayersHere()) {
        const c = e.coll;
        const p = toFloor(floor, lp.room, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
        if (!p) continue;
        const m = new CardPlayerMarker();
        m.setPos(Math.round(p.x * 8), Math.round(p.y * 8));
        floorGui.addChildGui(m);
      }
      if (opt("mmCardPlayers", true) !== false) for (const p of cardPlayerSpotsOn(floor, lp && !lp.inside ? sc.map.currentMap : null)) {
        const m = new CardPlayerMarker();
        m.setPos(Math.round(p.x * 8), Math.round(p.y * 8));
        floorGui.addChildGui(m);
      }
    } catch (e) { log("card player marker: " + e); }
    try {   // bounty boards
      for (const p of boardSpotsOn(floor)) {
        const m = new BoardMarker();
        m.setPos(Math.round(p.x * 8), Math.round(p.y * 8));
        floorGui.addChildGui(m);
      }
    } catch (e) { log("board marker: " + e); }
    try {   // the tracked bounty's hunting grounds
      for (const p of bountySpotsOn(floor)) {
        const m = new BountyMarker();
        m.setPos(Math.round(p.x * 8), Math.round(p.y * 8));
        floorGui.addChildGui(m);
      }
    } catch (e) { log("bounty marker: " + e); }
    try {   // element orbs you've found
      for (const p of orbSpotsOn(floor)) {
        const m = new OrbMarker(); m.el = p.el;
        m.setPos(Math.round(p.x * 8), Math.round(p.y * 8));
        floorGui.addChildGui(m);
      }
      for (const p of traderSpotsOn(floor)) { const m = new TraderMarker(); m.setPos(Math.round(p.x * 8), Math.round(p.y * 8)); floorGui.addChildGui(m); }
      for (const p of figureSpotsOn(floor)) { const m = new FigureMarker(); m.kind = p.el; m.setPos(Math.round(p.x * 8), Math.round(p.y * 8)); floorGui.addChildGui(m); }
      for (const p of orbLeftSpotsOn(floor)) {   // and, if switched on, the ones still out there
        const m = new OrbMarker(); m.el = p.el; m.dim = true;
        m.setPos(Math.round(p.x * 8), Math.round(p.y * 8));
        floorGui.addChildGui(m);
      }
    } catch (e) { log("orb marker: " + e); }
    try {   // shiny enemies in the room Lea is in
      const lp = leaSpot(floor);
      if (lp && !lp.inside && opt("shinyMarkers", true) !== false) for (const e of liveShinies()) {
        const c = e.coll;
        const p = toFloor(floor, lp.room, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
        if (!p) continue;
        const m = new ShinyMarker();
        m.setPos(Math.round(p.x * 8), Math.round(p.y * 8));
        floorGui.addChildGui(m);
      }
    } catch (e) { log("shiny marker: " + e); }
    try {   // champion enemies in the room Lea is in
      const lp = leaSpot(floor);
      if (lp && !lp.inside && opt("champMarkers", true) !== false) for (const e of liveChampions()) {
        const c = e.coll;
        const p = toFloor(floor, lp.room, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
        if (!p) continue;
        const m = new ChampMarker(); m.mods = e.__wdnChamp.mods;
        m.setPos(Math.round(p.x * 8), Math.round(p.y * 8));
        floorGui.addChildGui(m);
      }
    } catch (e) { log("champion marker: " + e); }
    try {
      if (!opt("showLea", true)) return;
      const p = leaSpot(floor);
      if (!p) return;
      const m = new LeaMarker();
      m.setPos(Math.round(p.x * 8) - 8, Math.round(p.y * 8) - 6);
      floorGui.addChildGui(m);   // added last, so she's drawn on top of the chest markers
    } catch (e) { console.error("[CrossCode Enhanced] Lea marker", e); }
  }

  if (window.sc && sc.MapFloor) {
    sc.MapFloor.inject({
      onAttach() {
        this.parent();
        try { addMarkers(this); } catch (e) { console.error("[CrossCode Enhanced]", e); }
      }
    });
    console.log("[CrossCode Enhanced] loaded: " + Object.values(CHESTS).reduce((a, r) => a + r.c.length, 0) + " chests known");
  } else console.error("[CrossCode Enhanced] map screen not found");

  // =====================================================================================================
  // ---------- minimap ----------
  // The area map around Lea, as on the pause screen (the game's own room drawing, doors and icons), with the
  // room she's in filled with a live miniature of the actual map: every tile drawn as its average colour.
  // On top: shop / quest / exit icons, chests, enemies and Lea.
  // =====================================================================================================
  const SIZES = [[96, 64], [128, 84], [160, 104], [200, 130]];

  // an ig.Image backed by our own canvas (built at logical size; scaled up for the game's pixel scale)
  function canvasImage(canvas) {
    const k = ig.system.scale || 1;
    let data = canvas;
    if (k !== 1) {
      data = document.createElement("canvas");
      data.width = canvas.width * k; data.height = canvas.height * k;
      const cx = data.getContext("2d");
      cx.imageSmoothingEnabled = false;
      cx.drawImage(canvas, 0, 0, data.width, data.height);
    }
    const img = new ig.Image({});
    img.data = data; img.width = canvas.width; img.height = canvas.height; img.loaded = true;
    return img;
  }

  // ---------- small log file in the mod's folder (mods/cc-weather-daynight/maps-log.txt) ----------
  // The game's console isn't easy to reach, so key events and errors are written here to help fix problems.
  const logLines = [];
  let logPath = null;
  function log(msg) {
    try {
      const line = new Date().toISOString().substr(11, 8) + " " + msg;
      if (logLines.length > 300) return;
      logLines.push(line);
      if (logPath === null) {
        logPath = "";
        const fs = window.require && window.require("fs"), path = window.require && window.require("path");
        if (fs && path) {
          // the game folder: where the game was started from, or where its program is
          const roots = [];
          try { roots.push(process.cwd()); } catch (e) {}
          try { roots.push(path.dirname(process.execPath)); } catch (e) {}
          for (const r of roots) for (const sub of [["assets", "mods"], ["mods"]]) {
            const dir = path.join(r, ...sub, "cc-weather-daynight");
            if (!logPath && fs.existsSync(dir)) logPath = path.join(dir, "maps-log.txt");
          }
          if (logPath) fs.writeFileSync(logPath, "");
        }
      }
      if (logPath) window.require("fs").appendFileSync(logPath, line + "\n");
    } catch (e) { logPath = ""; }
  }

  // ---------- room detail and doorway alignment, from each room's map file ----------
  // Each room's map file is read in the background (one at a time, the first time the room is needed):
  //  - its ground and object layers are drawn tile by tile into a small picture (a few pixels per tile)
  //  - its exits (doors and map-edge transitions) and chests are noted with their on-screen positions.
  // The area map's rooms are hand-drawn diagrams, not to scale, so a plain stretch puts doorways in the wrong
  // place. Instead each room is stretched piecewise: every exit is pinned to the spot where the area map draws
  // its connection (or the arrow icon for exits to other areas), with even stretching in between.
  const EXIT_TYPES = { TeleportGround: 1, Door: 1, TeleportField: 1, TeleportStairs: 1 };
  const infos = new Map(), queue = [];   // map name -> { state, pic, ppt, w, h, exits, chests }
  let loadingMap = false;
  // screen pixels per game pixel. CrossCode draws at 568x320 and, with Pixel Size above 1, scales the whole
  // canvas up (ig.system.contextScale) while ig.system.scale stays 1; either way this is the real factor.
  function picScale() {
    const s = ig.system;
    return Math.max(1, Math.round((s.scale || 1) * (s.contextScale || 1)));
  }
  // the map's info, or null while it's still loading (asks for it to be loaded unless `peek`)
  function mapInfo(name, peek) {
    const e = infos.get(name);
    if (e) {
      if (e.state === "ready") { infos.delete(name); infos.set(name, e); return e; }   // keep recently used ones
      return null;
    }
    if (peek && !opt("mapDetail", true) && !opt("minimap", true)) return null;
    infos.set(name, { state: "queued" });
    queue.push(name);
    pumpQueue();
    return null;
  }
  // ---------- pre-rendered room pictures ----------
  // Every area room's picture is drawn ahead of time (media/wdn-maps/*.webp, listed with its doors and chests
  // in data/wdn-map-pics.json: map -> [file, pixels per tile, width, height, [[to, x, y]], { chest: [x, y] }]),
  // so the game only has to show an image (decoded in the background) instead of reading a map file and
  // drawing thousands of tiles. Rooms missing from the list are drawn the old way.
  let PRE = {};
  try {
    $.ajax({ dataType: "json", async: false, url: ig.getFilePath(ig.root + "data/wdn-map-pics.json" + ig.getCacheSuffix()),
      success: d => { PRE = d || {}; }, error: () => {} });
  } catch (e) {}
  function loadPrerendered(name, done, fallback) {
    const pre = PRE[name];
    if (!pre || !window.Image) return false;
    const im = new Image();
    let finished = false;
    const ok = () => {
      if (finished) return; finished = true;
      const chests = {};
      for (const [k, v] of Object.entries(pre[5] || {})) chests[k] = { x: v[0], y: v[1] };
      done({ pic: im, ppt: pre[1], w: pre[2], h: pre[3], exits: (pre[4] || []).map(e => ({ map: e[0], x: e[1], y: e[2] })), chests, pre: true });
    };
    im.onload = () => { if (im.decode) im.decode().then(ok, ok); else ok(); };
    // the pictures live in the mod's own folder; a plain picture load doesn't go through the mod loader, so the
    // path is spelled out (the game folder's media/wdn-maps is tried too, for older installs)
    const paths = [ig.root + "mods/cc-weather-daynight/assets/media/wdn-maps/" + pre[0], ig.root + "media/wdn-maps/" + pre[0]];
    let tryN = 0;
    im.onerror = () => {
      if (finished) return;
      if (++tryN < paths.length) { im.src = ig.getFilePath(paths[tryN]); return; }
      finished = true; log("pre-rendered picture missing for " + name); fallback();
    };
    im.src = ig.getFilePath(paths[0]);
    return true;
  }

  // Entering a new area, the game is busy setting the map up, so the mod holds back: it waits a second before
  // reading any room, reads them one at a time with a pause in between (nearest rooms first), and draws each
  // picture in small slices.
  let lastMapSeen = "", mapChangedAt = 0, pumpWaiting = false;
  function nextQueued(here) {
    const near = new Set(((MAP_LINKS[here] || [])[2] || []).map(e => e[0]));
    let best = 0, bestScore = 9;
    queue.forEach((n, i) => { const s_ = n === here ? 0 : near.has(n) ? 1 : 2; if (s_ < bestScore) { bestScore = s_; best = i; } });
    return queue.splice(best, 1)[0];
  }
  function pumpQueue() {
    if (loadingMap || !queue.length) return;
    const here = String((window.sc && sc.map && sc.map.currentMap) || "");
    if (here !== lastMapSeen) { lastMapSeen = here; mapChangedAt = Date.now(); }
    if (Date.now() - mapChangedAt < (PRE[queue[0]] ? 300 : 1000)) {
      if (!pumpWaiting) { pumpWaiting = true; setTimeout(() => { pumpWaiting = false; pumpQueue(); }, 200); }
      return;
    }
    const name = nextQueued(here);
    loadingMap = true;
    const done = info => {
      infos.set(name, info ? Object.assign(info, { state: "ready" }) : { state: "failed" });
      log("read " + name + (info ? ": " + (info.pic ? info.pic.width + "x" + info.pic.height + (info.pre ? " pre-rendered" : "") + " picture" : "no picture") + ", " + info.exits.length + " exits" : ": failed"));
      // keep memory in check: drop the pictures of the least recently used maps (doors and chests are kept;
      // a dropped picture is re-read if that room's detail is needed again)
      const withPic = [...infos.values()].filter(v => v.state === "ready" && v.pic);
      for (let n = 0; n < withPic.length - 40; n++) { withPic[n].pic = null; withPic[n].dropped = true; }
      loadingMap = false;
      setTimeout(pumpQueue, info && info.pre ? 20 : 120);
    };
    const fromFile = () => loadMapJson(name, data => data ? readMap(data, done) : done(null));
    if (!loadPrerendered(name, done, fromFile)) fromFile();
  }

  // layer order: height levels bottom to top, then the object layers (buildings, trees) on top
  function layerRank(level) {
    const l = String(level);
    if (/^\d+$/.test(l)) return +l;
    const m = /^object(\d)$/.exec(l);
    return m ? 1000 + +m[1] : -1;
  }
  function readMap(data, done) {
    const TW = Math.max(1, data.mapWidth | 0), TH = Math.max(1, data.mapHeight | 0);
    const w = TW * 16, h = TH * 16;
    // an entity's level is a number or { level, offset } (offset in pixels on top of that level's height)
    const lh = l => {
      let off = 0;
      if (l && typeof l === "object") { off = l.offset || 0; l = l.level; }
      const v = data.levels && data.levels[l | 0];
      return (v ? v.height || 0 : 0) + off;
    };
    // exits and chests at their on-screen positions (ground position raised by the height of their level)
    const exits = [], chests = {};
    for (const e of data.entities || []) {
      const st = e.settings || {};
      const sz = st.size || {};
      const cx = e.x + (sz.x || 16) / 2, cy = e.y - lh(e.level) + (sz.y || 16) / 2;
      if (EXIT_TYPES[e.type] && typeof st.map === "string" && st.map) exits.push({ map: st.map, x: cx, y: cy });
      if (e.type === "Chest") chests[st.variable ? "v:" + st.variable : st.mapId] = { x: e.x + 8, y: e.y - lh(e.level) + 6 };
    }
    // the picture: a few pixels per tile (more with a bigger Pixel Size), at most 2400 pixels across
    const k = picScale();
    let ppt = Math.min(8, Math.max(4, 2 * k));
    while (ppt > 1 && (TW * ppt > 2400 || TH * ppt > 2400)) ppt--;
    renderMap(data, ppt, true, pic => done({ pic, ppt, w, h, exits, chests }));
  }

  // draws a map's ground and object layers into a canvas at `ppt` pixels per tile, tile by tile and a few
  // milliseconds at a time so the game never stutters; calls back with the canvas (or null if it failed)
  function renderMap(data, ppt, smooth, cb) {
    const t0 = Date.now();
    const go = () => {
      if (!propSheetsReady(data) && Date.now() - t0 < 5000) { setTimeout(go, 50); return; }
      renderMap2(data, ppt, smooth, cb);
    };
    go();
  }
  function renderMap2(data, ppt, smooth, cb) {
    const TW = Math.max(1, data.mapWidth | 0), TH = Math.max(1, data.mapHeight | 0);
    // tile layers, plus flat "scalable props" (the sea around Rookie Harbor, pools, carpets...) drawn as their
    // repeating pattern on top of their own level's ground
    const steps = (data.layer || [])
      .filter(l => l.type === "Background" && !l.lighter && Number(l.distance || 1) === 1 && layerRank(l.level) >= 0 && l.data && l.tilesetName)
      .map((l, i) => ({ l, i, rank: layerRank(l.level), order: 0 }));
    const props = flatProps(data);
    if (props.length || flatPropsNote) { log("flat props in " + (data.name || "?") + ": " + props.length + (flatPropsNote ? " (" + flatPropsNote + ")" : "")); flatPropsNote = ""; }
    if (props.length) steps.push({ props, i: 0, rank: Math.min(...props.map(p => p.rank)), order: 1, multi: true });
    steps.sort((a, b) => a.rank - b.rank || a.order - b.order || a.i - b.i);
    const layers = [];
    for (const st of steps) {
      if (!st.multi) { layers.push(st.l); continue; }
      // props go in after the layers of their level (so water sits under the piers above it)
      for (const p of st.props) layers.push({ prop: p, rank: p.rank });
    }
    layers.sort((a, b) => (a.prop ? a.rank + 0.5 : layerRank(a.level)) - (b.prop ? b.rank + 0.5 : layerRank(b.level)));
    const imgs = {};
    for (const l of layers) { const n = l.prop ? l.prop.gfx : l.tilesetName; if (!imgs[n]) imgs[n] = new ig.Image(n); }
    const release = () => { for (const i of Object.values(imgs)) { try { i.decreaseRef(); } catch (e) {} } };
    const started = Date.now();
    const wait = () => {
      const list = Object.values(imgs);
      if (list.some(i => i.failed) || Date.now() - started > 15000) { release(); log("tilesets failed for a map"); cb(null); return; }
      if (list.some(i => !i.loaded)) { setTimeout(wait, 100); return; }
      drawTiles();
    };
    const pic = document.createElement("canvas"); pic.width = TW * ppt; pic.height = TH * ppt;
    const cx = pic.getContext("2d");
    cx.imageSmoothingEnabled = smooth;
    if (smooth) cx.imageSmoothingQuality = "high";
    let li = 0, row = 0;
    const drawTiles = () => {
      const until = performance.now() + 3;
      try {
        while (li < layers.length && performance.now() < until) {
          if (layers[li].prop) {
            const p = layers[li].prop, img = imgs[p.gfx], kk = img.data.width / img.width, k = ppt / 16;
            for (let y = 0; y < p.h; y += p.ph) for (let x = 0; x < p.w; x += p.pw) {
              const w = Math.min(p.pw, p.w - x), h = Math.min(p.ph, p.h - y);
              cx.drawImage(img.data, p.sx * kk, p.sy * kk, w * kk, h * kk, (p.x + x) * k, (p.y + y) * k, w * k, h * k);
            }
            li++; row = 0;
            continue;
          }
          const l = layers[li], img = imgs[l.tilesetName], ts = l.tilesize || 16, f = ts / 16;
          const cols = Math.max(1, Math.floor(img.width / ts)), kk = img.data.width / img.width;
          const r = l.data[row] || [];
          for (let x = 0; x < r.length; x++) {
            const t = r[x] - 1;
            if (t < 0) continue;
            const sx = (t % cols) * ts, sy = Math.floor(t / cols) * ts;
            if (sy + ts > img.height) continue;
            cx.drawImage(img.data, sx * kk, sy * kk, ts * kk, ts * kk, x * f * ppt, row * f * ppt, f * ppt, f * ppt);
          }
          if (++row >= l.data.length) { row = 0; li++; }
        }
      } catch (e) { log("drawing tiles failed: " + e); release(); cb(null); return; }
      if (li < layers.length) { setTimeout(drawTiles, 0); return; }
      release(); cb(pic);
    };
    wait();
  }
  // flat scalable props of a map, ready to draw: { gfx, sx, sy, pw, ph (one pattern tile), x, y, w, h (where, as
  // drawn), rank (level) }
  const scaleSheets = {};
  let flatPropsNote = "";
  // the sheets load in the background (the game's file loading doesn't always honour "wait for it"), so a map
  // waits for its sheets before it's drawn: { state: "loading" | "ready" | "failed", entries }
  function requestSheet(name) {
    if (scaleSheets[name]) return scaleSheets[name];
    const s = scaleSheets[name] = { state: "loading", entries: null };
    try {
      $.ajax({ dataType: "json", url: ig.getFilePath(ig.root + "data/scale-props/" + name + ".json" + ig.getCacheSuffix()),
        success: d => { s.entries = (d && d.entries) || null; s.state = "ready"; },
        error: (x, st, err) => { s.state = "failed"; flatPropsNote = "couldn't read scale-props/" + name + ": " + st + " " + err; } });
    } catch (e) { s.state = "failed"; flatPropsNote = "scale-props/" + name + ": " + e; }
    return s;
  }
  function scaleSheet(name) { const s = requestSheet(name); return s.state === "ready" ? s.entries : null; }
  // the sheets a map's flat props need, all requested; true once none is still loading
  function propSheetsReady(data) {
    let ready = true;
    for (const e of data.entities || []) {
      const pc = e.type === "ScalableProp" && e.settings && e.settings.propConfig;
      if (pc && pc.sheet && requestSheet(pc.sheet).state === "loading") ready = false;
    }
    return ready;
  }
  function flatProps(data) {
    const out = [];
    try {
      const lh = l => {
        let off = 0;
        if (l && typeof l === "object") { off = l.offset || 0; l = l.level; }
        const v = data.levels && data.levels[l | 0];
        return { h: (v ? v.height || 0 : 0) + off, rank: l | 0 };
      };
      for (const e of data.entities || []) {
        if (e.type !== "ScalableProp") continue;
        const st = e.settings || {}, pc = st.propConfig || {};
        const sheet = pc.sheet && scaleSheet(pc.sheet), def = sheet && sheet[pc.name];
        if (!def || !def.gfx || !def.patterns || !st.size) continue;
        if ((def.baseSize && def.baseSize.z) || st.size.z) continue;            // only flat ones (no walls)
        const L = lh(e.level), pt = def.patterns;
        out.push({ gfx: def.gfx, sx: (def.gfxBaseX || 0) + (pt.x || 0), sy: (def.gfxBaseY || 0) + (pt.y || 0), pw: pt.w || 16, ph: pt.h || 16,
          x: e.x, y: e.y - L.h, w: st.size.x || 0, h: st.size.y || 0, rank: L.rank });
      }
    } catch (e) { flatPropsNote = "flat props: " + e; }
    return out;
  }
  function loadMapJson(name, cb) {
    try {
      $.ajax({
        dataType: "json",
        url: ig.getFilePath(name.toPath(ig.root + "data/maps/", ".json") + ig.getCacheSuffix()),
        success: data => cb(data),
        error: () => { log("couldn't read map " + name); cb(null); }
      });
    } catch (e) { log("couldn't read map " + name + ": " + e); cb(null); }
  }

  // ---- stretch pinning every exit to the area map's connections ----
  // Each map-edge exit is pinned to where the area map draws its connection, while keeping the picture as undistorted
  // as possible: a straight-line stretch does most of the work, and only the exits it can't reach get a small
  // local nudge (see below), so streets and buildings away from those doors stay straight.
  function warpAt(arr, v) {
    if (v <= arr[0][0]) return arr[0][1];
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1], b = arr[i];
      if (v <= b[0]) return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]);
    }
    return arr[arr.length - 1][1];
  }
  // keep the anchors in order: each must be further along both in the map and on the area map
  function fitAnchors(list, start, end) {
    list.sort((a, b) => a[0] - b[0]);
    const out = [start];
    for (const a of list) {
      const last = out[out.length - 1];
      if (a[0] > last[0] + 2 && a[1] > last[1] + 0.25 && a[0] < end[0] - 2 && a[1] < end[1] - 0.25) out.push(a);
    }
    out.push(end);
    return out;
  }
  const warps = new WeakMap();   // floor -> Map(room name -> warp)
  function roomWarp(floor, room) {
    let m = warps.get(floor);
    if (!m) { m = new Map(); warps.set(floor, m); }
    if (m.has(room.name)) return m.get(room.name);
    // true-scale maps: the room sits exactly at its true spot, at one fixed scale; nothing to stretch or pin
    const exact = floor.wdnPos && floor.wdnPos[room.name];
    if (exact) {
      const k = floor.wdnScale || 20, info0 = mapInfo(room.name, true);
      const wp0 = { W: info0 ? info0.w : 0, H: info0 ? info0.h : 0, map: (x, y) => ({ x: exact[0] + x / k, y: exact[1] + y / k }) };
      m.set(room.name, wp0);
      return wp0;
    }
    const info = mapInfo(room.name);
    if (!info) return null;
    const W = info.w, H = info.h, x0 = room.min.x * 8, x1 = room.max.x * 8, y0 = room.min.y * 8, y1 = room.max.y * 8;
    const linX = x => x0 + x / W * (x1 - x0), linY = y => y0 + y / H * (y1 - y0);
    const idx = room.id - 1, maps = floor.maps || [];
    // wanted spots: { target map, px, py (null = that axis isn't pinned) }
    const wants = [];
    for (const c of floor.connections || []) {
      if (c.map1 !== idx && c.map2 !== idx) continue;
      const other = maps[c.map1 === idx ? c.map2 : c.map1];
      if (!other || !other.path) continue;
      const size = Math.max(1, c.size || 1), off = c.offset || { x: 0, y: 0 };
      if (c.dir === "VERTICAL") wants.push({ map: other.path, px: c.tx * 8 + size * 4 + off.x, py: (c.ty + 1) * 8 + off.y });
      else wants.push({ map: other.path, px: (c.tx + 1) * 8 + off.x, py: c.ty * 8 + size * 4 + off.y });
    }
    for (const ic of floor.icons || []) {            // exits to other areas, at their arrow icons
      if (ic.map !== idx || !ic.data || !ic.data.map) continue;
      if (/left|right/.test(ic.icon)) wants.push({ map: ic.data.map, px: null, py: ic.y });
      else if (/up|down/.test(ic.icon)) wants.push({ map: ic.data.map, px: ic.x, py: null });
    }
    // match each wanted spot to its own exit: closest pairs first, every exit used once
    const pairs = [];
    wants.forEach((w, wi) => info.exits.forEach((e, ei) => {
      if (e.map !== w.map) return;
      pairs.push({ wi, ei, d: (w.px === null ? 0 : Math.abs(linX(e.x) - w.px)) + (w.py === null ? 0 : Math.abs(linY(e.y) - w.py)) });
    }));
    pairs.sort((a, b) => a.d - b.d);
    const usedW = new Set(), usedE = new Set(), anchors = [];
    for (const p of pairs) {
      if (usedW.has(p.wi) || usedE.has(p.ei)) continue;
      usedW.add(p.wi); usedE.add(p.ei);
      const w = wants[p.wi], e = info.exits[p.ei];
      // only transitions at the map's edges are pinned: doors into buildings in the middle of a map lead to
      // little rooms the area map draws wherever they fit, and pinning those would bend the whole picture
      const edge = 40;
      if (e.x > edge && e.x < W - edge && e.y > edge && e.y < H - edge) continue;
      anchors.push({ mx: e.x, my: e.y, tx: w.px, ty: w.py });
    }
    // Stage 1: a straight-line stretch, separately along x and y, through as many exits as fit in order
    // (straight streets and walls stay straight). Exits right at a map edge only pin the axis along that edge.
    const EDGE = 24, axs = [], ays = [];
    for (const a of anchors) {
      const nearX = a.mx < EDGE || a.mx > W - EDGE, nearY = a.my < EDGE || a.my > H - EDGE;
      if (a.tx !== null && !(nearX && a.ty !== null)) axs.push([a.mx, a.tx]);
      if (a.ty !== null && !(nearY && a.tx !== null)) ays.push([a.my, a.ty]);
    }
    const xs = fitAnchors(axs, [0, x0], [W, x1]), ys = fitAnchors(ays, [0, y0], [H, y1]);
    const sx = x => warpAt(xs, x), sy = y => warpAt(ys, y);
    // Stage 2: whatever's still off gets a small, local nudge: a smooth bump around that exit only (it fades
    // out within about two map squares), solved so each exit lands exactly on its connection
    const bumps = [];
    // (exits at a map edge are only nudged along that edge: how deep the area map draws the doorway doesn't
    // matter, since markers are kept inside the room's outline anyway, and nudging that way bends the picture)
    for (const a of anchors) {
      const qx = sx(a.mx), qy = sy(a.my);
      const nearX = a.mx < EDGE || a.mx > W - EDGE, nearY = a.my < EDGE || a.my > H - EDGE;
      const rx = a.tx === null || (nearX && a.ty !== null) ? 0 : a.tx - qx;
      const ry = a.ty === null || (nearY && a.tx !== null) ? 0 : a.ty - qy;
      bumps.push({ x: qx, y: qy, rx, ry });
    }
    const SIG = 10, K = (a, b) => Math.exp(-((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / (2 * SIG * SIG));
    const solve = key => {          // weights so the bumps add up exactly to each exit's correction
      const n = bumps.length;
      if (!n || bumps.every(b => Math.abs(b[key]) < 0.25)) return null;
      const A = bumps.map((b, i) => bumps.map((c, j) => K(b, c) + (i === j ? 1e-6 : 0)).concat([b[key]]));
      for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        [A[c], A[p]] = [A[p], A[c]];
        if (Math.abs(A[c][c]) < 1e-9) continue;
        for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k2 = c; k2 <= n; k2++) A[r][k2] -= f * A[c][k2]; }
      }
      return A.map((row, i) => Math.abs(row[i]) < 1e-9 ? 0 : row[n] / row[i]);
    };
    const wx = solve("rx"), wy = solve("ry");
    const wp = {
      W, H,
      // a map position (pixels) -> area-map pixels
      map(x, y) {
        const q = { x: sx(x), y: sy(y) };
        let dx = 0, dy = 0;
        if (wx || wy) for (let i = 0; i < bumps.length; i++) {
          const k = K(q, bumps[i]);
          if (k < 1e-4) continue;
          if (wx) dx += wx[i] * k;
          if (wy) dy += wy[i] * k;
        }
        return { x: q.x + dx, y: q.y + dy };
      }
    };
    m.set(room.name, wp);
    return wp;
  }

  // draws the source triangle (sx, sy) of img onto the destination triangle (dx, dy), slightly enlarged so
  // neighbouring triangles meet without hairline gaps
  function drawTriangle(ctx, img, p0, p1, p2) {
    const mx = (p0.dx + p1.dx + p2.dx) / 3, my = (p0.dy + p1.dy + p2.dy) / 3;
    const grow = p => {
      const vx = p.dx - mx, vy = p.dy - my, l = Math.hypot(vx, vy) || 1;
      return [p.dx + vx / l * 0.7, p.dy + vy / l * 0.7];
    };
    const den = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p2.sx - p0.sx) * (p1.sy - p0.sy);
    if (Math.abs(den) < 1e-6) return;
    // affine transform taking the source triangle onto the destination one
    const a = ((p1.dx - p0.dx) * (p2.sy - p0.sy) - (p2.dx - p0.dx) * (p1.sy - p0.sy)) / den;
    const c = ((p2.dx - p0.dx) * (p1.sx - p0.sx) - (p1.dx - p0.dx) * (p2.sx - p0.sx)) / den;
    const b = ((p1.dy - p0.dy) * (p2.sy - p0.sy) - (p2.dy - p0.dy) * (p1.sy - p0.sy)) / den;
    const d = ((p2.dy - p0.dy) * (p1.sx - p0.sx) - (p1.dy - p0.dy) * (p2.sx - p0.sx)) / den;
    const e = p0.dx - a * p0.sx - c * p0.sy, f = p0.dy - b * p0.sx - d * p0.sy;
    const g0 = grow(p0), g1 = grow(p1), g2 = grow(p2);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  // a light unsharp mask, so shrunken pictures read crisp rather than soft
  function sharpen(ctx, w, h, amount) {
    if (w < 3 || h < 3) return;
    const img = ctx.getImageData(0, 0, w, h), src = img.data, out = new Uint8ClampedArray(src);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (!src[i + 3]) continue;
      for (let ch = 0; ch < 3; ch++) {
        const blur = (src[i - 4 + ch] + src[i + 4 + ch] + src[i - w * 4 + ch] + src[i + w * 4 + ch]) / 4;
        out[i + ch] = src[i + ch] + (src[i + ch] - blur) * amount;
      }
    }
    img.data.set(out);
    ctx.putImageData(img, 0, 0);
  }

  // an ig.Image from a canvas drawn at the game's real pixel resolution (k screen pixels per game pixel)
  // Two cases: if the game scales its images itself (ig.system.scale > 1), an image whose logical size is
  // canvas / k is drawn 1:1 on screen. If instead the whole canvas is scaled up (contextScale > 1), the picture
  // is drawn inside a 1/k shrink so each of its pixels lands on one screen pixel. lw / lh: size in game pixels.
  function hiResImage(canvas, k) {
    const img = new ig.Image({});
    img.data = canvas; img.loaded = true; img.k = k;
    img.lw = canvas.width / k; img.lh = canvas.height / k;
    img.viaTransform = (ig.system.contextScale || 1) > 1 && (ig.system.scale || 1) === 1 && k > 1;
    img.width = img.viaTransform ? canvas.width : img.lw;
    img.height = img.viaTransform ? canvas.height : img.lh;
    return img;
  }
  function drawHiRes(r, img, x, y) {
    if (!img.viaTransform) return r.addGfx(img, x, y, 0, 0, img.width, img.height);
    r.addTransform().setTranslate(x, y).setScale(1 / img.k, 1 / img.k);
    const d = r.addGfx(img, 0, 0, 0, 0, img.width, img.height);
    r.undoTransform();
    return d;
  }
  // the room's picture, stretched onto its box on the area map at zoom Z (with the doorways lined up) and cut
  // to the room's drawn shape, inset by one area-map pixel so the game's room outline stays visible
  const detailCache = new WeakMap();   // floor -> Map(room | zoom | scale -> ig.Image)
  // building a room's detail picture is heavy (bending it onto the map, sharpening): at most one new one
  // every few frames, so walking into a new area doesn't freeze the game while every room is drawn at once
  let detailBuiltAt = 0, asyncFailed = false;
  // kept by room name too (not only per floor), so coming back to an area doesn't build them all again;
  // the 60 most recently used are kept
  const detailByName = new Map();
  function roomDetail(floor, room, Z, sharp) {
    const k = picScale();
    let m = detailCache.get(floor);
    if (!m) { m = new Map(); detailCache.set(floor, m); }
    const key = room.name + "|" + Z + "|" + k + (sharp ? "|s" : "");
    if (m.has(key)) return m.get(key);
    if (detailByName.has(key)) { const im = detailByName.get(key); detailByName.delete(key); detailByName.set(key, im); m.set(key, im); return im; }
    if (performance.now() - detailBuiltAt < 60) return null;   // another one was just built: next time
    const info = mapInfo(room.name);
    if (!info) return null;
    if (!info.pic) {
      if (info.dropped) { infos.delete(room.name); mapInfo(room.name); }   // read it again
      else m.set(key, null);                                               // map without usable tiles
      return null;
    }
    const tBuild = performance.now();
    const wp = roomWarp(floor, room), s = Z * k, ox = room.min.x * 8, oy = room.min.y * 8;
    const rw = room.max.x - room.min.x, rh = room.max.y - room.min.y;
    const c = document.createElement("canvas"); c.width = rw * 8 * s; c.height = rh * 8 * s;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    // the picture is bent onto the area map through a mesh of triangles (two per area-map square)
    // (one mesh point per area-map square; the bend is smooth, so this is plenty)
    const f = info.ppt / 16, nx = Math.max(2, rw), ny = Math.max(2, rh);
    const P = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const mx = info.w * i / nx, my = info.h * j / ny, q = wp.map(mx, my);
      P.push({ sx: mx * f, sy: my * f, dx: (q.x - ox) * s, dy: (q.y - oy) * s });
    }
    const at = (i, j) => P[j * (nx + 1) + i];
    // most rooms aren't really bent, just placed and scaled: then one straight draw does it (the mesh of
    // hundreds of clipped triangles is only for the ones that are)
    const p00 = at(0, 0), p10 = at(nx, 0), p01 = at(0, ny);
    const ax = (p10.dx - p00.dx) / (p10.sx - p00.sx || 1), ay = (p10.dy - p00.dy) / (p10.sx - p00.sx || 1);
    const bx = (p01.dx - p00.dx) / (p01.sy - p00.sy || 1), by = (p01.dy - p00.dy) / (p01.sy - p00.sy || 1);
    const flat = P.every(q => {
      const ex = p00.dx + ax * (q.sx - p00.sx) + bx * (q.sy - p00.sy), ey = p00.dy + ay * (q.sx - p00.sx) + by * (q.sy - p00.sy);
      return Math.abs(ex - q.dx) < 0.75 && Math.abs(ey - q.dy) < 0.75;
    });
    if (flat) {
      cx.save();
      cx.setTransform(ax, ay, bx, by, p00.dx - ax * p00.sx - bx * p00.sy, p00.dy - ay * p00.sx - by * p00.sy);
      cx.drawImage(info.pic, 0, 0);
      cx.restore();
    } else for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = at(i, j), b = at(i + 1, j), cc = at(i, j + 1), d = at(i + 1, j + 1);
      drawTriangle(cx, info.pic, a, b, d);
      drawTriangle(cx, info.pic, a, d, cc);
    }
    // sharpening goes over every pixel, so it's only done for the pause map's bigger pictures
    if (sharp && opt("mapSharpen", true)) sharpen(cx, c.width, c.height, 0.6);
    const mask = document.createElement("canvas"); mask.width = c.width; mask.height = c.height;
    const mx = mask.getContext("2d");
    mx.fillStyle = "#fff";
    const inRoom = (x, y) => cellOf(floor.tiles, x, y) === room.id;
    const cs = 8 * s, inset = s;
    for (let y = room.min.y; y < room.max.y; y++) for (let x = room.min.x; x < room.max.x; x++) {
      if (!inRoom(x, y)) continue;
      const l = inRoom(x - 1, y) ? 0 : inset, t = inRoom(x, y - 1) ? 0 : inset;
      const r = inRoom(x + 1, y) ? 0 : inset, b = inRoom(x, y + 1) ? 0 : inset;
      mx.fillRect((x - room.min.x) * cs + l, (y - room.min.y) * cs + t, cs - l - r, cs - t - b);
    }
    cx.globalCompositeOperation = "destination-in";
    cx.drawImage(mask, 0, 0);
    const img = hiResImage(c, k);
    m.set(key, img);
    detailByName.set(key, img);
    { const d = performance.now() - tBuild; if (d > 25) log("slow room picture " + room.name + ": " + d.toFixed(0) + "ms (" + (flat ? "straight" : "bent") + ", " + c.width + "x" + c.height + ")"); }
    while (detailByName.size > 60) detailByName.delete(detailByName.keys().next().value);
    detailBuiltAt = performance.now();
    return img;
  }

  // ---------- true-scale area maps ----------
  // The game's area maps squeeze rooms into hand-drawn boxes. For the areas in data/wdn-true-scale.json (made
  // from the game's own files: every room at its real size, about 10 tiles per square, joined at its real
  // doorways, with interiors placed beside their door) the area's grid, joins, icons and teleport landmarks are
  // swapped in as the area is loaded. Turn it off in the Area map tab (applies the next time an area loads).
  let TRUE_SCALE = null;
  try {
    $.ajax({
      dataType: "json", async: false,
      url: ig.getFilePath(ig.root + "data/wdn-true-scale.json" + ig.getCacheSuffix()),
      success: d => { TRUE_SCALE = d; },
      error: () => log("true-scale layouts not found")
    });
  } catch (e) { log("true-scale layouts: " + e); }
  function trueScale(path, a) {
    const L = TRUE_SCALE && TRUE_SCALE[path];
    if (!L || !a || !a.floors || !L.floors || L.floors.length !== a.floors.length) return a;
    const d = JSON.parse(JSON.stringify(a));
    d.width = L.width; d.height = L.height;
    d.floors.forEach((f, i) => {
      const n = L.floors[i];
      f.tiles = n.tiles.map(r => r.slice());
      f.connections = n.connections.map(c => Object.assign({}, c));
      f.icons = n.icons.map(c => JSON.parse(JSON.stringify(c)));
      f.landmarks = n.landmarks.map(c => Object.assign({}, c));
      f.wdnPos = n.pos || null;          // each room's exact spot (area-map pixels) on this floor
      f.wdnScale = L.scale || 20;        // map pixels per area-map pixel
    });
    d.wdnTrueScale = true;
    // interiors: path -> [door's room, x, y, floor index of that room]
    d.wdnInteriors = L.interiors || {};
    d.wdnMain = L.main || 0;
    d.floors.forEach(f => { f.wdnInteriors = {}; f.wdnByParent = {}; });
    for (const [ip, v] of Object.entries(d.wdnInteriors)) {
      const f = d.floors[v[3] !== undefined ? v[3] : d.wdnMain];
      if (!f) continue;
      f.wdnInteriors[ip] = v;
      (f.wdnByParent[v[0]] = f.wdnByParent[v[0]] || []).push([ip, v[1], v[2]]);
    }
    log("true-scale map for " + path + " (" + L.width + "x" + L.height + ")");
    return d;
  }
  if (window.sc && sc.AreaLoadable) sc.AreaLoadable.inject({
    onload(a) {
      try { if (opt("mapTrueScale", true)) a = trueScale(this.path, a); } catch (e) { log("true-scale error for " + this.path + ": " + e); }
      return this.parent(a);
    }
  });

  window.__ccMapsDebug = { floorOutline, routeDestLabel, routeDestArea, questGoals, questRoute, roomDetail, mapInfo, roomWarp, renderMap, loadMapJson, trueScale, trueDetail, chestSpots, leaSpot, giverSpots };   // for testing outside the game

  // true-scale maps: the room's whole picture at its exact spot and true scale, nothing cut away, so
  // neighbouring rooms meet seamlessly. Returns { img, dx, dy } (offset from the room's box, area-map pixels).
  function trueDetail(floor, room, Z, sharp) {
    const exact = floor.wdnPos && floor.wdnPos[room.name];
    if (!exact) return null;
    const k = picScale();
    let m = detailCache.get(floor);
    if (!m) { m = new Map(); detailCache.set(floor, m); }
    const key = "T|" + room.name + "|" + Z + "|" + k + (sharp ? "|s" : "");
    if (m.has(key)) return m.get(key);
    if (detailByName.has(key)) { const v = detailByName.get(key); detailByName.delete(key); detailByName.set(key, v); m.set(key, v); return v; }
    if (performance.now() - detailBuiltAt < 60) return null;   // one new picture every few frames
    const info = mapInfo(room.name);
    if (!info) return null;
    if (!info.pic) {
      if (info.dropped) { infos.delete(room.name); mapInfo(room.name); }
      else m.set(key, null);
      return null;
    }
    const sc_ = (floor.wdnScale || 20), s = Z * k;
    const w = Math.max(1, Math.round(info.w / sc_ * s)), h = Math.max(1, Math.round(info.h / sc_ * s));
    const dx = exact[0] - room.min.x * 8, dy = exact[1] - room.min.y * 8;
    // pre-rendered pictures are shrunk to size by the browser away from the game's frame (createImageBitmap),
    // so a new area's rooms appear a moment later instead of each one costing the game a hitch
    if (info.pre && window.createImageBitmap && !asyncFailed) {
      m.set(key, null);
      const done = res => { m.set(key, res); detailByName.set(key, res); while (detailByName.size > 60) detailByName.delete(detailByName.keys().next().value); };
      try {
        createImageBitmap(info.pic, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" })
          .then(bmp => done({ img: hiResImage(bmp, k), dx, dy }))
          .catch(e => { asyncFailed = true; m.delete(key); log("quick room pictures off: " + e); });
        return null;
      } catch (e) { asyncFailed = true; m.delete(key); log("quick room pictures off: " + e); }
    }
    const tBuild2 = performance.now();
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    cx.drawImage(info.pic, 0, 0, w, h);
    if (sharp && opt("mapSharpen", true) && !info.pre) sharpen(cx, w, h, 0.6);   // (pause map only; pre-rendered pictures come sharpened)
    const res = { img: hiResImage(c, k), dx, dy };
    { const d = performance.now() - tBuild2; if (d > 25) log("slow true-scale picture " + room.name + ": " + d.toFixed(0) + "ms (" + w + "x" + h + ")"); }
    m.set(key, res);
    detailByName.set(key, res);
    while (detailByName.size > 60) detailByName.delete(detailByName.keys().next().value);
    detailBuiltAt = performance.now();
    return res;
  }

  // pause-screen area map: each visited room gets its detail drawn over the game's room shape
  if (window.sc && sc.MapRoom) sc.MapRoom.inject({
    updateDrawables(r) {
      // true-scale maps: once the room's picture is ready it replaces the game's room shape (no outlines)
      try {
        if (this.prerendered && this.unlocked && opt("mapDetail", true) && this.floor && this.floor.wdnPos && this.floor.wdnPos[this.room.name]) {
          const t = trueDetail(this.floor, this.room, 1, true);
          if (t) {
            drawHiRes(r, t.img, t.dx, t.dy).setAlpha((this.roomAlpha === undefined ? 1 : this.roomAlpha) * opt("mapDetailStrength", 1));
            return;
          }
        }
      } catch (e) { if (!this._ccErr2) { this._ccErr2 = true; log("true-scale detail error for " + (this.room && this.room.name) + ": " + (e && e.stack || e)); } }
      this.parent(r);
      try {
        if (!this.prerendered || !this.unlocked || !opt("mapDetail", true)) return;
        const img = roomDetail(this.floor, this.room, 1, true);
        if (img) {
          drawHiRes(r, img, 0, 0).setAlpha((this.roomAlpha === undefined ? 1 : this.roomAlpha) * opt("mapDetailStrength", 1));
          if (!this._ccLogged) { this._ccLogged = true; log("pause map: drew detail for " + this.room.name + " (" + img.data.width + "x" + img.data.height + " px for " + img.lw + "x" + img.lh + ")"); }
        }
      } catch (e) { if (!this._ccErr) { this._ccErr = true; log("pause map detail error for " + (this.room && this.room.name) + ": " + (e && e.stack || e)); } }
    }
  });

  const FRAME = 5, CUT = 10, TAB_H = 9, TAB_SLANT = 6;   // CUT <= FRAME * 2 keeps the map inside the plate
  const BG_COLOUR = "#1a2333", GRID_COLOUR = "rgba(110,140,190,0.12)";
  let PLATE = [0, 0, 0, 255], TRACK = [80, 80, 80, 255], EDGE = [24, 24, 24, 255];
  // Minimap > Look: frame colours [plate, track, edge] and backgrounds [colour, opacity]
  const MM_FRAMES = [
    [[0, 0, 0, 255], [80, 80, 80, 255], [24, 24, 24, 255]],         // classic (health bar)
    [[14, 24, 48, 255], [86, 140, 214, 255], [6, 10, 22, 255]],      // blue
    [[38, 26, 10, 255], [214, 170, 70, 255], [18, 12, 4, 255]],      // gold
    [[44, 46, 52, 255], [190, 196, 206, 255], [20, 21, 24, 255]]     // silver
  ];
  const MM_BACKGROUNDS = [["#1a2333", 1], ["#000000", 1], ["#2a2c30", 1], ["#1a2333", 0.4]];
  let frameStyleShown = 0;
  function useFrameStyle(i) {
    const f = MM_FRAMES[i] || MM_FRAMES[0];
    PLATE = f[0]; TRACK = f[1]; EDGE = f[2]; frameStyleShown = i;
  }
  function pixelCanvas(w, h, colourAt) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const cx = c.getContext("2d"), img = cx.createImageData(w, h), px = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = colourAt(x, y);
      if (!col) continue;
      const i = (y * w + x) * 4;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = col[3];
    }
    cx.putImageData(img, 0, 0);
    return c;
  }
  // inside a w x h plate with the top-right and bottom-left corners cut by `cut` pixels, inset by `inset`
  function inPlate(x, y, w, h, inset, cut) {
    if (x < inset || y < inset || x >= w - inset || y >= h - inset) return false;
    if (x - y > w - 1 - inset * 2 - cut + inset) return false;      // top-right cut
    if (y - x > h - 1 - inset * 2 - cut + inset) return false;      // bottom-left cut
    return true;
  }
  function frameCanvas(w, h) {
    const inner = (x, y) => inPlate(x, y, w, h, FRAME, CUT);
    return pixelCanvas(w, h, (x, y) => {
      if (!inPlate(x, y, w, h, 0, CUT)) return null;                // outside: transparent
      if (inner(x, y)) return null;                                 // the map shows through
      // the grey track hugs the map's edge, like the HP bar's inner stripe
      if (inner(x + 1, y) || inner(x - 1, y) || inner(x, y + 1) || inner(x, y - 1)) return TRACK;
      if (!inPlate(x + 1, y, w, h, 0, CUT) || !inPlate(x - 1, y, w, h, 0, CUT) || !inPlate(x, y + 1, w, h, 0, CUT) || !inPlate(x, y - 1, w, h, 0, CUT)) return EDGE;
      return PLATE;
    });
  }
  // the name tab: black parallelogram slanting like the HP bar ("\" sides)
  function tabCanvas(w, h) {
    return pixelCanvas(w, h, (x, y) => (x >= y * TAB_SLANT / (h - 1) && x <= w - 1 - TAB_SLANT + y * TAB_SLANT / (h - 1)) ? PLATE : null);
  }

  // everything the minimap needs for the current map; rebuilt when the map, floor or zoom changes
  let mm = null;
  function releaseMinimap() {
    if (!mm) return;
    // rooms kept for the next build on this floor stay drawn; the rest let go of their pictures
    const keep = minimapRooms.get(mm.floor);
    for (const r of mm.rooms) { if (keep && keep.get(r.room && r.room.name) === r) continue; try { r.clearPrerendered(); } catch (e) {} }
    mm = null;
  }
  function minimapKey() {
    const m = sc.map;
    return [m.currentPlayerArea && m.currentPlayerArea.path, m.currentPlayerFloor, m.currentMap, Number(opt("mmZoom", 1)) + 1].join("|");
  }
  const minimapRooms = new WeakMap();   // floor -> Map(room name -> sc.MapRoom)
  let lastMinimapRoom = "", lastMinimapFloor = null;
  function buildMinimap() {
    const map = sc.map, area = map.currentPlayerArea;
    if (!area || !area.loaded || !area.data || !area.data.floors || !ig.game.size) return null;
    let floor = area.data.floors.find(f => (f.level || 0) === (map.currentPlayerFloor || 0));
    let room = floor && floor.rooms && floor.rooms.find(r => r && r.name === map.currentMap);
    let inside = false;
    // inside a building the true-scale map shows as an icon: show the street around its door
    const inter = area.data.wdnInteriors && area.data.wdnInteriors[map.currentMap];
    if (!room && inter) {
      floor = area.data.floors[inter[3] !== undefined ? inter[3] : (area.data.wdnMain || 0)];
      room = floor && floor.rooms && floor.rooms.find(r => r && r.name === inter[0]);
      inside = true;
    }
    if (!floor || !floor.rooms || !floor.tiles || !room) return null;
    const Z = Number(opt("mmZoom", 1)) + 1;
    // the other rooms: the game's own pause-map drawing (visited rooms only, doors between them)
    // (kept between rooms of the same floor: only rooms not seen before, and the ones you just left and
    // entered, which the game draws highlighted, are made again)
    // a different floor or area: the old floor's kept rooms let go of their pictures
    if (lastMinimapFloor && lastMinimapFloor !== floor) {
      const old = minimapRooms.get(lastMinimapFloor);
      if (old) { for (const r of old.values()) { try { r.clearPrerendered(); } catch (e) {} } minimapRooms.delete(lastMinimapFloor); }
    }
    lastMinimapFloor = floor;
    let cache = minimapRooms.get(floor);
    if (!cache) { cache = new Map(); minimapRooms.set(floor, cache); }
    const rooms = [];
    for (const r of floor.rooms) {
      if (!r) continue;
      let mr = cache.get(r.name);
      if (!mr || r.name === map.currentMap || r.name === lastMinimapRoom || (!mr.unlocked && roomVars(r.name)) || (mr.unlocked && !mr.prerendered)) {
        if (mr && mr.prerendered) { try { mr.clearPrerendered(); } catch (e) {} }
        mr = new sc.MapRoom(r, floor, floor.level);
        if (mr.unlocked) mr.preRender();
        cache.set(r.name, mr);
      }
      if (mr.unlocked && mr.prerendered) rooms.push(mr);
    }
    lastMinimapRoom = map.currentMap;
    // shop / quest / landmark / exit icons, as on the pause map (skipping hidden ones and big gates)
    const icons = [], iconGfx = new ig.Image("media/gui/area-icons.png"), cond = new ig.VarCondition("");
    for (const ic of floor.icons || []) {
      const def = sc.AREA_ICONS[ic.icon];
      if (!def || def.type === sc.AREA_ICON_TYPE.LARGE) continue;
      const owner = floor.rooms.find(r => r && r.id === ic.map + 1);
      if (!owner || !roomVars(owner.name)) continue;
      if (ic.data && ic.data.condition) { cond.setCondition(ic.data.condition); if (!cond.evaluate()) continue; }
      icons.push({ x: ic.x, y: ic.y, index: def.index });
    }
    return { key: minimapKey(), floor, room, Z, inside, rooms, icons, iconGfx, chestData: CHESTS[room.name] || null };
  }

  let MinimapFrame = null, minimap = null, retryAt = 0;
  function defineMinimap() {
    if (MinimapFrame) return true;
    if (!window.ig || !ig.BoxGui || !ig.NinePatch || !sc.MapRoom) return false;
    loadGfx();
    const View = ig.GuiElementBase.extend({
      init() { this.parent(); this.hook.clip = true; },
      updateDrawables(r) {
        if (!mm) return;
        const W = this.hook.size.x, H = this.hook.size.y, Z = mm.Z;
        const lea = leaSpot(mm.floor);
        const lx = lea ? lea.x * 8 : (mm.room.min.x + mm.room.max.x) * 4, ly = lea ? lea.y * 8 : (mm.room.min.y + mm.room.max.y) * 4;
        const ox = Math.round(W / 2 - lx * Z), oy = Math.round(H / 2 - ly * Z);
        const vis = (x, y, w, h) => x + w > 0 && y + h > 0 && x < W && y < H;
        // map-paper background: dark blue with a faint grid of area-map squares that scrolls with the map
        const bg = MM_BACKGROUNDS[Number(opt("mmBg", 0))] || MM_BACKGROUNDS[0];
        r.addColor(bg[0], 0, 0, W, H).setAlpha(bg[1]);
        const cs = 8 * Z;
        if (opt("mmGrid", true) !== false) {
          for (let x = ((ox % cs) + cs) % cs; x < W; x += cs) r.addColor(GRID_COLOUR, x, 0, 1, H);
          for (let y = ((oy % cs) + cs) % cs; y < H; y += cs) r.addColor(GRID_COLOUR, 0, y, W, 1);
        }
        // rooms (area-map scale, enlarged)
        r.addTransform().setTranslate(ox, oy).setScale(Z, Z);
        const detail = opt("mmDetail", 0.9), trueRooms = new Set();
        const tdetail = rm => { try { return detail > 0 && mm.floor.wdnPos && mm.floor.wdnPos[rm.name] ? trueDetail(mm.floor, rm, Z) : null; } catch (e) { return null; } };
        for (const mr of mm.rooms) {
          const rm = mr.room;
          if (!vis(ox + rm.min.x * 8 * Z, oy + rm.min.y * 8 * Z, mr.tileWidth * 8 * Z, mr.tileHeight * 8 * Z)) continue;
          if (tdetail(rm)) { trueRooms.add(rm); continue; }   // true-scale picture replaces the room shape
          r.addGfx(mr.buffer, rm.min.x * 8, rm.min.y * 8, 0, 0);
        }
        r.undoTransform();
        for (const rm of trueRooms) {
          const t = tdetail(rm);
          if (t) drawHiRes(r, t.img, ox + (rm.min.x * 8 + t.dx) * Z, oy + (rm.min.y * 8 + t.dy) * Z).setAlpha(detail);
        }
        // every visible room in detail (loaded in the background the first time it's seen)
        if (detail > 0) for (const mr of mm.rooms) {
          const rm = mr.room, x = ox + rm.min.x * 8 * Z, y = oy + rm.min.y * 8 * Z;
          if (trueRooms.has(rm)) continue;
          if (!vis(x, y, mr.tileWidth * 8 * Z, mr.tileHeight * 8 * Z)) continue;
          let img = null;
          try { img = roomDetail(mm.floor, rm, Z); } catch (e) { log("minimap detail error for " + rm.name + ": " + e); }
          if (img) drawHiRes(r, img, x, y).setAlpha(detail);
        }
        // the gold outline around the area
        try { drawOutline(r, floorOutline(mm.floor), ox, oy, Z); } catch (e) {}
        // map icons
        if (opt("mmIcons", true)) for (const ic of mm.icons) {
          const x = ox + ic.x * Z - 6, y = oy + ic.y * Z - 6;
          if (!vis(x, y, 12, 12)) continue;
          const cols = Math.max(1, Math.floor(mm.iconGfx.width / 12));
          r.addGfx(mm.iconGfx, x, y, (ic.index % cols) * 12, Math.floor(ic.index / cols) * 12, 12, 12);
        }
        // chests: other rooms from the chest list; the current room at the chests' real positions
        const live = {};
        for (const e of ig.game.entities) if (e && !e._killed && e._tmapKey) live[e._tmapKey] = e;
        for (const rm of mm.floor.rooms) {
          if (!rm) continue;
          const rx = ox + rm.min.x * 8 * Z, ry = oy + rm.min.y * 8 * Z;
          if (!vis(rx - 8, ry - 8, (rm.max.x - rm.min.x) * 8 * Z + 16, (rm.max.y - rm.min.y) * 8 * Z + 16)) continue;
          if (opt("mmChests", true) === false) break;
          for (const s of chestSpots(mm.floor, rm)) {
            let cx = s.cx * Z, cy = s.cy * Z;
            const e = rm === mm.room && !mm.inside && live[dataKey(rm.name, s.ch)];
            if (e) {
              const c = e.coll;
              const p = toFloor(mm.floor, rm, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
              if (p) { cx = p.x * 8 * Z; cy = p.y * 8 * Z; }
            }
            if (vis(ox + cx - 7, oy + cy - 6, 14, 12)) drawChest(r, s.ch.t, s.opened, ox + cx, oy + cy);
          }
        }
        // enemies in the current map
        if (opt("mmEnemies", true) && ig.ENTITY.Enemy && !mm.inside) for (const e of ig.game.entities) {
          if (!(e instanceof ig.ENTITY.Enemy) || e._killed || !e.coll || e.__wdnShiny || e.__wdnChamp || e.__wdnCompanion) continue;
          // enemies the map keeps hidden until something (often a quest or event) brings them out
          if (e._hidden || e.hidden || (e.animState && e.animState.alpha <= 0.02) || (e.coll.type === ig.COLLTYPE.NONE)) continue;
          try { if (e.params && e.params.isDefeated && e.params.isDefeated()) continue; } catch (err) {}
          const c = e.coll;
          const p = toFloor(mm.floor, mm.room, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
          if (!p) continue;
          const x = Math.round(ox + p.x * 8 * Z) - 3, y = Math.round(oy + p.y * 8 * Z) - 3;
          if (vis(x, y, 7, 7)) r.addGfx(gfx, x, y, ENEMY_ICON, 0, 7, 7);
        }
        // card players in this room
        if (opt("mmCardPlayers", true) !== false && !mm.inside) for (const e of cardPlayersHere()) {
          const c = e.coll;
          const p = toFloor(mm.floor, mm.room, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
          if (!p) continue;
          const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
          if (vis(x - 5, y - 6, 10, 12)) drawCardPlayerIcon(r, x, y);
        }
        if (opt("mmCardPlayers", true) !== false) for (const p of cardPlayerSpotsOn(mm.floor, mm.inside ? null : sc.map.currentMap)) {
          const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
          if (vis(x - 5, y - 6, 10, 12)) drawCardPlayerIcon(r, x, y);
        }
        // bounty boards (this room's too: they're always at their spot)
        for (const p of boardSpotsOn(mm.floor)) {
          const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
          if (vis(x - 6, y - 6, 12, 14)) drawBoardIcon(r, x, y);
        }
        for (const p of bountySpotsOn(mm.floor)) {
          const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
          if (vis(x - 6, y - 6, 12, 12)) drawBountyIcon(r, x, y);
        }
        for (const p of figureSpotsOn(mm.floor)) {   // the collector, the rival, orb shrines
          const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
          if (vis(x - 6, y - 6, 12, 12)) drawFigureIcon(r, x, y, p.el);
        }
        for (const p of traderSpotsOn(mm.floor)) {   // the orb trader
          const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
          if (vis(x - 6, y - 6, 12, 12)) drawTraderIcon(r, x, y);
        }
        for (const p of cardPlayerSpotsOn(mm.floor, null, window.wdnOrbRevealedSpots)) {   // orbs the trader marked
          const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
          if (vis(x - 4, y - 4, 8, 8)) drawOrbDim(r, x, y, p.el);
        }
        // element orbs still waiting in this room: a dot when in view, else a marker on the border pointing
        // to the nearest one
        this.orbCompass = null;
        if (!mm.inside && window.wdnOrbsHere) {
          let best = Infinity;
          for (const o of window.wdnOrbsHere()) {
            const p = toFloor(mm.floor, mm.room, o.x, o.y, ig.game.size.x, ig.game.size.y);
            if (!p) continue;
            const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
            if (x > 3 && y > 3 && x < W - 3 && y < H - 3) { drawOrbDot(r, x, y, o.el, 1); continue; }
            const d = (x - W / 2) ** 2 + (y - H / 2) ** 2;
            if (d < best && opt("orbEdge", false) === true) { best = d; this.orbCompass = { x, y, el: o.el }; }   // (the marker on the border: its own setting)
          }
        }
        // champion enemies: the icon in their colour when on the minimap; otherwise the same on the border,
        // pointing to the nearest one
        this.champCompass = null;
        if (opt("champMarkers", true) !== false && !mm.inside) {
          let best = Infinity;
          for (const e of liveChampions()) {
            const c = e.coll;
            const p = toFloor(mm.floor, mm.room, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
            if (!p) continue;
            const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
            if (x > 3 && y > 3 && x < W - 3 && y < H - 3) { drawChampIcon(r, x, y, e.__wdnChamp.mods); continue; }
            const d = (x - W / 2) ** 2 + (y - H / 2) ** 2;
            if (d < best) { best = d; this.champCompass = { x, y, mods: e.__wdnChamp.mods }; }
          }
        }
        // shiny enemies: a gold enemy icon when on the minimap; otherwise a red orb on the border pointing to
        // the nearest one, like the chest compass
        this.shinyCompass = null;
        if (opt("shinyMarkers", true) !== false && !mm.inside) {
          let best = Infinity;
          for (const e of liveShinies()) {
            const c = e.coll;
            const p = toFloor(mm.floor, mm.room, c.pos.x + c.size.x / 2, c.pos.y - c.pos.z + c.size.y / 2, ig.game.size.x, ig.game.size.y);
            if (!p) continue;
            const x = ox + p.x * 8 * Z, y = oy + p.y * 8 * Z;
            if (x > 3 && y > 3 && x < W - 3 && y < H - 3) { drawShinyIcon(r, x, y); continue; }
            const d = (x - W / 2) ** 2 + (y - H / 2) ** 2;
            if (d < best) { best = d; this.shinyCompass = { x, y }; }
          }
        }
        // quest givers with a quest open to take
        if (opt("questGivers", true) && opt("mmQuests", true) !== false) for (const mr of mm.rooms) {
          const rm = mr.room;
          if (!vis(ox + rm.min.x * 8 * Z - 16, oy + rm.min.y * 8 * Z - 16, mr.tileWidth * 8 * Z + 32, mr.tileHeight * 8 * Z + 32)) continue;
          for (const g of giverSpots(mm.floor, rm)) {
            const x = ox + g.cx * Z, y = oy + g.cy * Z;
            if (vis(x - 5, y - 11, 10, 11)) drawQuestBubble(r, x, y);
          }
        }
        // the tracked quest's route
        if (opt("mmRoute", true) !== false) { try { drawRoute(r, questRoute(mm.floor), ox, oy, Z, vis); } catch (e) {} }
        // chest compass: find the nearest unopened chest (every chest in the area, or only those the map
        // shows); the frame draws a glowing marker on its border pointing that way when it's off the minimap
        this.compass = null;
        if (lea && opt("mmCompass", true)) {
          const now = Date.now(), any = Number(opt("mmCompassFind", 0)) === 0;
          if (!mm.compassAt || now - mm.compassAt > 500) {
            mm.compassAt = now; mm.compass = null;
            let best = Infinity;
            // "Skip marked chests": leave out chests that already have a marker on the minimap, so the compass
            // only leads to ones you haven't found yet
            const skipShown = opt("mmCompassSkip", false) === true && opt("mmChests", true) !== false && opt("mapChests", true) !== false;
            for (const rm of mm.floor.rooms) {
              if (!rm) continue;
              const shown = skipShown ? new Set(chestSpots(mm.floor, rm, false).map(s => s.ch)) : null;
              for (const s of chestSpots(mm.floor, rm, any)) {
                if (s.opened || (shown && shown.has(s.ch))) continue;
                const d = (s.cx - lx) ** 2 + (s.cy - ly) ** 2;
                if (d < best) { best = d; mm.compass = s; }
              }
            }
            if (mm.compass && mm.compassLogged !== mm.compass.ch) { mm.compassLogged = mm.compass.ch; log("compass: nearest chest " + Math.round(Math.sqrt(best) * 20 / 16) + " tiles away"); }
          }
          const c = mm.compass;
          if (c) {
            const tx = ox + c.cx * Z, ty = oy + c.cy * Z;
            // distance in map tiles (area-map pixels are 20 map pixels on true-scale maps)
            const tiles = Math.hypot(c.cx - lx, c.cy - ly) * (mm.floor.wdnScale || 20) / 16;
            const range = Number(opt("mmCompassRange", 0)) || 0;           // 0: the whole area
            const hide = Number(opt("mmCompassHide", 0));                  // -1 never, 0 on the minimap, else tiles
            const onMap = tx > 2 && ty > 2 && tx < W - 2 && ty < H - 2;
            const inRange = !range || tiles <= range;
            let show = inRange;
            if (hide === 0) show = show && !onMap;                        // off once the chest is on the minimap
            else if (hide > 0) show = show && !onMap && tiles > hide;     // ...or once you're this close
            if (show) this.compass = { x: tx, y: ty };
          }
        }
        // Lea, always in the middle
        if (lea && opt("mmLea", true) !== false) r.addGfx(gfx, Math.round(W / 2) - 8, Math.round(H / 2) - 6, LEA.x, LEA.y, LEA.w, LEA.h);
      }
    });
    // frame art, health-bar style: a black plate with the HP bar's slanted corners (top right and bottom left
    // cut at 45 degrees) and a thin grey track along the inside edge; drawn over the map
    const FrameArt = ig.GuiElementBase.extend({
      img: null, w: 0, h: 0,
      updateDrawables(r) { if (this.img) r.addGfx(this.img, 0, 0, 0, 0, this.w, this.h); }
    });
    // name tab under the frame, like the HP bar's "SP" tab: a black slanted plate with tiny text
    const Tab = ig.GuiElementBase.extend({
      img: null, text: null, label: "",
      init() {
        this.parent();
        this.text = new sc.TextGui("", { font: sc.fontsystem.tinyFont });
        this.text.setPos(TAB_SLANT + 2, 1);
        this.addChildGui(this.text);
      },
      setLabel(label) {
        if (label === this.label) return;
        this.label = label;
        this.text.setText(label);
        const w = Math.max(24, this.text.hook.size.x + TAB_SLANT * 2 + 4);
        this.img = canvasImage(tabCanvas(w, TAB_H));
        this.setSize(w, TAB_H);
      },
      updateDrawables(r) { if (this.img) r.addGfx(this.img, 0, 0, 0, 0, this.hook.size.x, TAB_H); }
    });
    // chest compass: a glowing blue square on the black border, at the point where a line from the middle of
    // the minimap towards the chest crosses the border; it pulses gently
    // the game's round element icons (media/font/icons.png, 11x11) and glow colours [outer, inner]
    const COMPASS_ICON_X = [0, 198, 212, 226, 240];
    const COMPASS_GLOW = [null, ["#ff5a1e", "#ffa050"], ["#3c8cff", "#9ad4ff"], ["#a040ff", "#e090ff"], ["#18c8b0", "#80f0e0"]];
    let compassIconImg = null;
    const compassIcons = () => compassIconImg || (compassIconImg = new ig.Image("media/font/icons.png"));
    // where a line from the middle of the minimap towards (c.x, c.y) crosses the black border
    function borderPoint(f, c) {
      const w = f.art.w, h = f.art.h;
      const cx = w / 2, cy = h / 2, dx = FRAME + c.x - cx, dy = FRAME + c.y - cy;
      const bx = w / 2 - FRAME / 2, by = h / 2 - FRAME / 2;
      const k = Math.min(bx / Math.max(1e-6, Math.abs(dx)), by / Math.max(1e-6, Math.abs(dy)));
      let x = cx + dx * k, y = cy + dy * k;
      const cut = CUT - FRAME / 2;
      if (x - y > w - cut - FRAME / 2) { const m = (x - y - (w - cut - FRAME / 2)) / 2; x -= m; y += m; }
      if (y - x > h - cut - FRAME / 2) { const m = (y - x - (h - cut - FRAME / 2)) / 2; x += m; y -= m; }
      return { x: Math.round(x), y: Math.round(y) };
    }
    const ShinyCompass = ig.GuiElementBase.extend({
      frame: null,
      init(frame) { this.parent(); this.frame = frame; this.setSize(1, 1); },
      updateDrawables(r) {
        const f = this.frame, c = f.view && f.view.shinyCompass;
        if (!c) return;
        const p = borderPoint(f, c);
        drawShinyIcon(r, p.x, p.y);   // the gold enemy icon (an orb here got mixed up with the element orbs)
      }
    });
    const ChampCompass = ig.GuiElementBase.extend({
      frame: null,
      init(frame) { this.parent(); this.frame = frame; this.setSize(1, 1); },
      updateDrawables(r) {
        const f = this.frame, c = f.view && f.view.champCompass;
        if (!c) return;
        const p = borderPoint(f, c);
        drawChampIcon(r, p.x, p.y, c.mods);
      }
    });
    const OrbCompass = ig.GuiElementBase.extend({
      frame: null,
      init(frame) { this.parent(); this.frame = frame; this.setSize(1, 1); },
      updateDrawables(r) {
        const f = this.frame, c = f.view && f.view.orbCompass;
        if (!c) return;
        const p = borderPoint(f, c);
        drawOrbDot(r, p.x, p.y, c.el, 0.7 + 0.3 * Math.sin(Date.now() / 180));
      }
    });
    const CompassMarker = ig.GuiElementBase.extend({
      frame: null,
      init(frame) { this.parent(); this.frame = frame; this.setSize(1, 1); },
      updateDrawables(r) {
        const f = this.frame, c = f.view && f.view.compass;
        if (!c) return;
        const w = f.art.w, h = f.art.h;
        const cx = w / 2, cy = h / 2, dx = FRAME + c.x - cx, dy = FRAME + c.y - cy;
        const bx = w / 2 - FRAME / 2, by = h / 2 - FRAME / 2;          // the middle of the border
        const k = Math.min(bx / Math.max(1e-6, Math.abs(dx)), by / Math.max(1e-6, Math.abs(dy)));
        let x = cx + dx * k, y = cy + dy * k;
        // keep it on the plate where the corners are cut
        const cut = CUT - FRAME / 2;
        if (x - y > w - cut - FRAME / 2) { const m = (x - y - (w - cut - FRAME / 2)) / 2; x -= m; y += m; }
        if (y - x > h - cut - FRAME / 2) { const m = (y - x - (h - cut - FRAME / 2)) / 2; x += m; y -= m; }
        x = Math.round(x); y = Math.round(y);
        const pulse = 0.65 + 0.35 * Math.sin(Date.now() / 220);
        // with an element equipped: that element's round icon in a glow of its colour; neutral: the blue square
        let el = 0;
        try { el = sc.model.player.currentElementMode | 0; } catch (e) {}
        const icons = el ? compassIcons() : null;
        if (el && icons && icons.loaded) {
          const glow = COMPASS_GLOW[el];
          r.addColor(glow[0], x - 6, y - 6, 12, 12).setAlpha(0.16 * pulse);
          r.addColor(glow[0], x - 5, y - 5, 10, 10).setAlpha(0.24 * pulse);
          r.addColor(glow[1], x - 4, y - 4, 8, 8).setAlpha(0.35 * pulse);
          r.addTransform().setTranslate(x - 4, y - 4).setScale(0.75, 0.75);
          r.addGfx(icons, 0, 0, COMPASS_ICON_X[el], 105, 11, 11).setAlpha(0.85 + 0.15 * pulse);
          r.undoTransform();
          return;
        }
        r.addColor("#1e90ff", x - 5, y - 5, 10, 10).setAlpha(0.18 * pulse);
        r.addColor("#3cb8ff", x - 4, y - 4, 8, 8).setAlpha(0.32 * pulse);
        r.addColor("#6fd6ff", x - 3, y - 3, 6, 6).setAlpha(0.75);
        r.addColor("#d8f6ff", x - 2, y - 2, 4, 4).setAlpha(0.85 + 0.15 * pulse);
      }
    });
    MinimapFrame = ig.GuiElementBase.extend({
      transitions: {
        DEFAULT: { state: {}, time: 0.2, timeFunction: KEY_SPLINES.LINEAR },
        HIDDEN: { state: { alpha: 0 }, time: 0.2, timeFunction: KEY_SPLINES.LINEAR }
      },
      view: null, art: null, tab: null, hidden: true, sizeIndex: -1, corner: -1,
      init() {
        this.parent();
        this.view = new View();
        this.view.setPos(FRAME, FRAME);
        this.addChildGui(this.view);
        this.art = new FrameArt();
        this.addChildGui(this.art);       // after the view, so it's drawn over the map's edges
        this.tab = new Tab();
        this.addChildGui(this.tab);
        this.destTab = new Tab();          // where the quest route leads, on a line of its own
        this.addChildGui(this.destTab);
        this.compassGui = new CompassMarker(this);
        this.addChildGui(this.compassGui); // on top of the frame and the name tab
        this.shinyGui = new ShinyCompass(this);
        this.addChildGui(this.shinyGui);
        this.orbGui = new OrbCompass(this);
        this.addChildGui(this.orbGui);
        this.champGui = new ChampCompass(this);
        this.addChildGui(this.champGui);
        this.doStateTransition("HIDDEN", true);
      },
      layout() {
        const si = Math.max(0, Math.min(SIZES.length - 1, Number(opt("mmSize", 1)) || 0));
        const fs = Number(opt("mmFrame", 0)) || 0;
        if (fs !== frameStyleShown) {
          useFrameStyle(fs); this.sizeIndex = -1;
          if (this.tab) { this.tab.label = null; this.tab.setLabel(this.areaName || ""); }
          if (this.destTab) { this.destTab.label = null; }
        }
        const [w, h] = SIZES[si];
        const corner = Number(opt("mmPos", 0)) || 0;   // 0 top right, 1 top left (under the HUD), 2 bottom left, 3 bottom right
        if (si !== this.sizeIndex) {
          this.sizeIndex = si;
          this.setSize(w, h + TAB_H * 2);
          this.view.setSize(w - FRAME * 2, h - FRAME * 2);
          this.art.img = canvasImage(frameCanvas(w, h)); this.art.w = w; this.art.h = h;
          this.art.setSize(w, h);
          this.corner = -1;
        }
        // area name in the tab, tucked under the bottom edge on the side away from the screen edge
        const showTab = opt("mmName", true) && !!this.areaName;
        if (showTab) this.tab.setLabel(this.areaName);
        this.tab.hook.localAlpha = showTab ? 1 : 0;
        const dest = routeDestLabel().trim(), showDest = !!dest;
        if (showDest) this.destTab.setLabel(dest);
        this.destTab.hook.localAlpha = showDest ? 1 : 0;
        const tabs = (showTab ? 1 : 0) + (showDest ? 1 : 0);
        const right = corner === 0 || corner === 3;
        this.tab.setPos(w - this.tab.hook.size.x, h - 1);   // under the square bottom-right corner
        this.destTab.setPos(w - this.destTab.hook.size.x, h - 1 + (showTab ? TAB_H : 0));
        const ax = right ? ig.GUI_ALIGN.X_RIGHT : ig.GUI_ALIGN.X_LEFT;
        const bottom = corner >= 2;
        const ay = bottom ? ig.GUI_ALIGN.Y_BOTTOM : ig.GUI_ALIGN.Y_TOP;
        this.setAlign(ax, ay);
        // the hook is h + TAB_H tall; without the tab, bottom corners sit lower so the frame keeps its margin
        const SW = ig.system.width, SH = ig.system.height, fullH = h + TAB_H * 2, vh = h + tabs * TAB_H;
        const attach = !!(window.wdnClockAttached && window.wdnClockAttached());
        let posY = corner === 1 ? 40 : 4;
        if (bottom) posY = 4 - (2 - tabs) * TAB_H + (attach ? CLOCK_H + 2 : 0) + bottomBarLift();   // room for the clock underneath, and any big health bar
        const x = right ? SW - 4 - w : 4;
        const topOf = py => bottom ? SH - py - fullH : py;
        // keep clear of the clock wherever it is (unless it's hanging under the minimap)
        const cr = !attach && window.wdnClockRect ? window.wdnClockRect() : null;
        if (cr) {
          const y = topOf(posY);
          if (x < cr.x + cr.w && x + w > cr.x && y < cr.y + cr.h && y + vh > cr.y) {
            if (bottom) posY = SH - (cr.y - 2 - vh) - fullH;   // move up, just above the clock
            else posY = cr.y + cr.h + 2;                       // move down, just below it
          }
        }
        this.setPos(4, posY);
        window.ccMinimapRect = opt("minimap", true) ? { x, y: topOf(posY), w, h: vh, right, bottom } : null;
        this.hook.localAlpha = opt("mmOpacity", 1);
      },
      show() { if (this.hidden) { this.hidden = false; this.doStateTransition("DEFAULT"); } },
      hide(now) { if (!this.hidden) { this.hidden = true; this.doStateTransition("HIDDEN", !!now); } }
    });
    return true;
  }

  // where a GUI element is on screen, following its parents' positions and alignment
  function screenRect(hook) {
    const chain = [];
    for (let h = hook; h && h.pos && h.size; h = h.parentHook) chain.push(h);
    let px = 0, py = 0, pw = ig.system.width, ph = ig.system.height;
    for (let i = chain.length - 1; i >= 0; i--) {
      const k = chain[i], A = ig.GUI_ALIGN;
      const x = k.align.x === A.X_RIGHT ? px + pw - k.size.x - k.pos.x : k.align.x === A.X_CENTER ? px + Math.floor(pw / 2 - k.size.x / 2 + k.pos.x) : px + k.pos.x;
      const y = k.align.y === A.Y_BOTTOM ? py + ph - k.size.y - k.pos.y : k.align.y === A.Y_CENTER ? py + Math.floor(ph / 2 - k.size.y / 2 + k.pos.y) : py + k.pos.y;
      px = x; py = y; pw = k.size.x; ph = k.size.y;
    }
    return { x: px, y: py, w: pw, h: ph };
  }
  window.ccScreenRect = screenRect;
  // the game's big health bars along the bottom of the screen (something to protect, a boss): how much room
  // they take, so the minimap and clock sit above them (looked up a few times a second)
  let barLift = 0, barCheckedAt = 0;
  function bottomBarLift() {
    const t = performance.now();
    if (t - barCheckedAt < 300) return barLift;
    barCheckedAt = t; barLift = 0;
    try {
      if (!sc.BigGenericBar) return 0;
      const SH = ig.system.height;
      const walk = (hooks, depth) => {
        for (const h of hooks || []) {
          if (!h || !h.gui) continue;
          if (h.gui instanceof sc.BigGenericBar) {
            const st = h.currentStateName;
            if (st && st.indexOf("HIDDEN") < 0) { const r = screenRect(h); if (r.y > SH / 2) barLift = Math.max(barLift, SH - r.y + 3); }
          } else if (depth < 4 && h.children && h.children.length) walk(h.children, depth + 1);
        }
      };
      walk(ig.gui.guiHooks, 0);
    } catch (e) {}
    return barLift;
  }
  window.wdnBottomBarLift = bottomBarLift;
  const CLOCK_H = 23;   // the weather clock plate with its day tab

  function minimapAllowed() {
    try {
      if (!opt("minimap", true) || !sc.model.isGame() || !ig.game.playerEntity) return false;
      if (sc.model.isCutscene() || sc.model.isMenu() || sc.model.isPaused() || sc.model.isQuickMenu()) return false;
      if (ig.game.teleporting && ig.game.teleporting.active) return false;
      if (sc.gui && sc.gui.statusHud && sc.gui.statusHud.hook.currentStateName === "HIDDEN") return false;
      // the stats panel slides out over this corner (level ups, and when it's opened): make way for it
      // (it slides out under the HP bar, top left: only the top-left minimap is in its way)
      if (Number(opt("mmPos", 0)) === 1 && ((sc.model.isLevelUp && sc.model.isLevelUp()) || (sc.gui && sc.gui.statusHud && sc.gui.statusHud.paramGui && sc.gui.statusHud.paramGui._isOut))) return false;
      return true;
    } catch (e) { return false; }
  }

  function minimapTick() {
    try {
      if (!defineMinimap()) return;
      if (!minimap || !ig.gui.guiHooks.includes(minimap.hook)) {
        minimap = new MinimapFrame();
        minimap.hook.zIndex = 1200;
        ig.gui.addGuiElement(minimap);
      }
      try {
        const ap = sc.map.currentPlayerArea && sc.map.currentPlayerArea.path;
        minimap.areaName = ap ? String(sc.map.getAreaName(ap) || "") : "";
      } catch (e) { minimap.areaName = ""; }
      minimap.layout();
      const allowed = minimapAllowed();
      if (allowed && (!mm || mm.key !== minimapKey()) && Date.now() >= retryAt) {
        releaseMinimap();
        mm = buildMinimap();
        if (!mm) retryAt = Date.now() + 500;   // tilesets or area still loading
      }
      if (allowed && mm) minimap.show();
      else {
        let menu = false;
        try { menu = sc.model.isMenu() || sc.model.isPaused() || sc.model.isQuickMenu(); } catch (e) {}
        minimap.hide(menu);   // menus/pause: vanish at once, no fade
      }
    } catch (e) {
      console.error("[CrossCode Enhanced] minimap", e);
      releaseMinimap(); retryAt = Date.now() + 3000;
    }
  }
  setInterval(minimapTick, 100);

  setTimeout(() => log("started: scale " + (window.ig && ig.system && ig.system.scale) + " x canvas scale " + (window.ig && ig.system && ig.system.contextScale) + ", detail drawn at " + picScale() + "x, screen " + (window.ig && ig.system && ig.system.width) + "x" + (window.ig && ig.system && ig.system.height)), 3000);

  // =====================================================================================================
  // ---------- room close-up (pause-screen area map) ----------
  // On the area map, point at a room you've visited and press the close-up key (R, or R3 on a controller) to
  // see it full screen at the game's real resolution, with its chests and Lea. Press it again (or back) to close.
  // =====================================================================================================
  const CLOSEUP_ACTION = "cc-weather-daynight-keyRoomView";
  let closeup = null, CloseupGui = null;
  function defineCloseup() {
    if (CloseupGui) return true;
    if (!window.sc || !sc.TextGui || !ig.GuiElementBase) return false;
    loadGfx();
    CloseupGui = ig.GuiElementBase.extend({
      transitions: {
        DEFAULT: { state: {}, time: 0.15, timeFunction: KEY_SPLINES.LINEAR },
        HIDDEN: { state: { alpha: 0 }, time: 0.15, timeFunction: KEY_SPLINES.LINEAR }
      },
      open: false, room: null, floor: null, img: null, frame: null, data: null, info: null, loading: false, token: 0,
      init() {
        this.parent();
        this.setSize(ig.system.width, ig.system.height);
        this.hook.zIndex = 1e6; this.hook.pauseGui = true;
        this.title = new sc.TextGui("", { font: sc.fontsystem.font });
        this.title.setAlign(ig.GUI_ALIGN.X_CENTER, ig.GUI_ALIGN.Y_TOP); this.title.setPos(0, 6);
        this.addChildGui(this.title);
        this.hint = new sc.TextGui("", { font: sc.fontsystem.tinyFont });
        this.hint.setAlign(ig.GUI_ALIGN.X_CENTER, ig.GUI_ALIGN.Y_BOTTOM); this.hint.setPos(0, 5);
        this.addChildGui(this.hint);
        this.doStateTransition("HIDDEN", true);
      },
      show(floor, room) {
        this.open = true; this.floor = floor; this.room = room; this.img = null; this.loading = true;
        const token = ++this.token;
        this.title.setText(room.text || room.name);
        this.hint.setText("Loading...");
        this.doStateTransition("DEFAULT");
        try { sc.menu.pushBackCallback(this.backFn = () => this.close(true)); } catch (e) {}
        log("close-up: " + room.name);
        // fit the room in the screen, drawn at the game's real resolution: as many screen pixels per tile as fit
        loadMapJson(room.name, data => {
          if (token !== this.token || !data) { if (token === this.token) this.hint.setText("Couldn't load this room."); return; }
          const k = picScale(), TW = data.mapWidth, TH = data.mapHeight;
          const maxW = ig.system.width - 24, maxH = ig.system.height - 52;
          const fit = Math.min(maxW / (TW * 16), maxH / (TH * 16));          // game pixels per map pixel
          let ppt = Math.max(1, Math.min(16 * k, Math.floor(16 * fit * k)));  // screen pixels per tile
          while (ppt > 1 && (TW * ppt > 4096 || TH * ppt > 4096)) ppt--;
          renderMap(data, ppt, ppt < 16, pic => {
            if (token !== this.token) return;
            if (!pic) { this.hint.setText("Couldn't draw this room."); return; }
            this.img = hiResImage(pic, k);
            this.pxScale = ppt / 16 / k;   // game pixels per map pixel
            this.data = data;
            this.loading = false;
            this.frame = canvasImage(frameCanvas(Math.round(this.img.lw) + FRAME * 2, Math.round(this.img.lh) + FRAME * 2));
            this.hint.setText("Press the close-up key again (R / R3) or back to close");
          });
        });
        // chests and doors need the room's info too
        mapInfo(room.name);
      },
      close(fromBack) {
        if (!this.open) return;
        this.open = false; this.token++;
        if (!fromBack) { try { sc.menu.popBackCallback(); } catch (e) {} }
        else { try { sc.menu.popBackCallback(); } catch (e) {} }
        this.doStateTransition("HIDDEN");
      },
      updateDrawables(r) {
        if (!this.open && this.hook.currentStateName === "HIDDEN") return;
        const W = this.hook.size.x, H = this.hook.size.y;
        r.addColor("#000", 0, 0, W, H).setAlpha(0.82);
        if (!this.img) return;
        const iw = Math.round(this.img.lw), ih = Math.round(this.img.lh);
        const x = Math.round((W - iw) / 2), y = Math.round((H - ih) / 2) + 4;
        r.addColor(BG_COLOUR, x, y, iw, ih);
        drawHiRes(r, this.img, x, y);
        if (this.frame) r.addGfx(this.frame, x - FRAME, y - FRAME, 0, 0, this.frame.width, this.frame.height);
        const sc_ = this.pxScale, room = this.room, info = mapInfo(room.name);
        // chests at their exact spots, with the same icons and rules as the map
        if (info && opt("mapChests", true)) {
          const data = CHESTS[room.name];
          const reveal = Number(opt("reveal", 2)) || 0, showOpened = opt("showOpened", true);
          if (data && hasExt(data.x) && !(reveal >= 1 && !roomVars(room.name))) for (const ch of data.c) {
            if (!chestTypeShown(ch.t)) continue;
            const opened = isOpened(room.name, ch);
            if (opened && !showOpened) continue;
            if (reveal === 2 && !opened && !found[dataKey(room.name, ch)]) continue;
            const at = info.chests[ch.v ? "v:" + ch.v : ch.id] || { x: ch.x, y: ch.y };
            drawChest(r, ch.t, opened, x + at.x * sc_, y + at.y * sc_);
          }
        }
        // quest givers with a quest open to take
        if (opt("questGivers", true)) for (const g of GIVERS_BY_MAP[room.name] || []) {
          if (giverActive(g)) drawQuestBubble(r, x + g.x * sc_, y + g.y * sc_);
        }
        // Lea, if she's in this room
        try {
          const p = ig.game.playerEntity;
          if (p && sc.map.currentMap === room.name) {
            const c = p.coll;
            r.addGfx(gfx, Math.round(x + (c.pos.x + c.size.x / 2) * sc_) - 8, Math.round(y + (c.pos.y - c.pos.z + c.size.y / 2) * sc_) - 6, LEA.x, LEA.y, LEA.w, LEA.h);
          }
        } catch (e) {}
      }
    });
    return true;
  }
  function closeupPressed() {
    try {
      if (ig.input.pressed(CLOSEUP_ACTION)) return true;
      if (opt("closeupPad", true) && ig.gamepad && ig.gamepad.isButtonPressed(ig.BUTTONS.RIGHT_STICK)) return true;
    } catch (e) {}
    return false;
  }
  if (window.sc && sc.MapAreaContainer) sc.MapAreaContainer.inject({
    update() {
      try {
        if (!defineCloseup()) return this.parent();
        if (!closeup || !ig.gui.guiHooks.includes(closeup.hook)) { closeup = new CloseupGui(); ig.gui.addGuiElement(closeup); }
        if (closeup.open) {             // the map waits underneath while the close-up is open
          if (closeupPressed()) closeup.close(false);
          return;
        }
        if (closeupPressed() && !sc.menu.mapStampMenu) {
          const area = sc.map.getCurrentArea(), fi = sc.map.getCurrentFloorIndex();
          const floor = area && area.floors && area.floors[fi];
          let room = this.hoverRoom;
          if (!room && floor && floor.rooms) room = floor.rooms.find(r => r && r.name === sc.map.currentMap) || null;
          if (floor && room) closeup.show(floor, room);
          else log("close-up: no room under the cursor");
        }
      } catch (e) { log("close-up error: " + (e && e.stack || e)); }
      return this.parent();
    }
  });
  window.wdnMapCloseupOpen = () => !!(closeup && closeup.open);
  // close it if the map menu goes away underneath
  setInterval(() => {
    try { if (closeup && closeup.open && !(sc.model.isMenu() && sc.menu.currentMenu === sc.MENU_SUBMENU.MAP)) closeup.close(false); } catch (e) {}
  }, 200);
})();
