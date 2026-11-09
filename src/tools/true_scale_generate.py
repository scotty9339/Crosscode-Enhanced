# True-scale area maps for the CrossCode Enhanced mod.
# Rebuilds each area's room grid from the real map sizes, with rooms joined at their real doorways.
# Run from CrossCode/assets:  python3 true_scale_generate.py OUTDIR area [area ...]
#
# How rooms are placed (one coordinate space for all of an area's floors):
#  - every exit that names its target room and arrival point joins two rooms: the next room is placed so its
#    arrival point sits just beyond the exit (map-edge transitions, and doors in dungeon walls alike)
#  - rooms only overlap if they're on different floors (that's how floors stack)
#  - a room that would land on top of the room it's entered from, through a door in the middle of that room,
#    is a building interior: it isn't drawn; it becomes an icon on that door (and so do rooms reached only
#    through it, like cellars). Edge transitions that clash (loops, caves under paths) move to the nearest
#    free space instead.
#  - rooms not joined to anything keep their offset from the nearest placed room on the game's own map
import json, os, sys, math, collections, glob

T = 10                     # tiles per area-map square
CELL = T * 16              # map pixels per square
GAP = 16 * 3               # free space kept around moved rooms
DIRS = {'EAST': (1, 0), 'WEST': (-1, 0), 'SOUTH': (0, 1), 'NORTH': (0, -1)}
OPPOSITE = {'EAST': 'WEST', 'WEST': 'EAST', 'NORTH': 'SOUTH', 'SOUTH': 'NORTH'}
EXT_DIRS = [''] + sorted(d + '/' for d in glob.glob('extension/*') if os.path.isdir(d))

def find(rel):
    for base in EXT_DIRS:
        if os.path.exists(base + rel): return base + rel
    return rel
def mapfile(p): return find('data/maps/' + p.replace('.', '/') + '.json')
def areafile(a): return find('data/areas/%s.json' % a)

_tilesets, _void = {}, {}
def is_void(ts_path, tilesize, t):
    """True for tiles that are essentially black or empty (the void around dungeon rooms)."""
    key = (ts_path, tilesize, t)
    if key in _void: return _void[key]
    v = False
    try:
        from PIL import Image
        if ts_path not in _tilesets: _tilesets[ts_path] = Image.open(find(ts_path)).convert('RGBA')
        im = _tilesets[ts_path]; cols = im.width // tilesize; i = t - 1
        sx, sy = (i % cols) * tilesize, (i // cols) * tilesize
        if sy + tilesize > im.height: v = True
        else:
            c = im.crop((sx, sy, sx + tilesize, sy + tilesize)); px = list(c.get_flattened_data() if hasattr(c, 'get_flattened_data') else c.getdata())
            vis = [p for p in px if p[3] > 40]
            v = len(vis) < len(px) * 0.25 or sum(p[0] + p[1] + p[2] for p in vis) / (3 * len(vis)) < 14
    except Exception:
        v = False
    _void[key] = v
    return v

def read_map(p):
    d = json.load(open(mapfile(p)))
    lv = d.get('levels') or []
    def lh(l):
        off = 0
        if isinstance(l, dict): off = l.get('offset', 0) or 0; l = l.get('level', 0)
        try: l = int(l or 0)
        except Exception: l = 0
        return (lv[l]['height'] if 0 <= l < len(lv) else 0) + off
    named, exits = {}, []
    for e in d.get('entities', []):
        st = e.get('settings') or {}; sz = st.get('size') or {}
        cx = e['x'] + (sz.get('x') or 16) / 2; cy = e['y'] - lh(e.get('level')) + (sz.get('y') or 16) / 2
        if st.get('name'): named[st['name']] = (cx, cy)
        if isinstance(st.get('map'), str) and st['map']:
            # the way you travel through it: edge transitions give it directly; a door's "dir" is the way it
            # faces (into its room), so you leave through it the opposite way
            td = st.get('dir')
            if e['type'] != 'TeleportGround' and td in OPPOSITE: td = OPPOSITE[td]
            exits.append(dict(to=st['map'], marker=st.get('marker'), x=cx, y=cy, dir=td, type=e['type'],
                              w=sz.get('x') or 16, h=sz.get('y') or 16))
    TW, TH = d['mapWidth'], d['mapHeight']
    filled = [[0] * TW for _ in range(TH)]
    for l in d.get('layer', []):
        if l['type'] != 'Background' or l.get('lighter') or float(l.get('distance', 1)) != 1: continue
        ts, tsz = l.get('tilesetName'), l.get('tilesize', 16)
        for y, row in enumerate(l['data'][:TH]):
            for x, t in enumerate(row[:TW]):
                if t and not filled[y][x] and not is_void(ts, tsz, t): filled[y][x] = 1
    xs = [x for y in range(TH) for x in range(TW) if filled[y][x]]; ys = [y for y in range(TH) for x in range(TW) if filled[y][x]]
    box = (min(xs) * 16, min(ys) * 16, (max(xs) + 1) * 16, (max(ys) + 1) * 16) if xs else (0, 0, TW * 16, TH * 16)
    return dict(W=TW * 16, H=TH * 16, named=named, exits=exits, filled=filled, TW=TW, TH=TH, box=box)

def old_boxes(fl):
    boxes = {}
    for y, row in enumerate(fl['tiles']):
        for x, v in enumerate(row):
            v = v - 10000 if v > 10000 else v
            if v:
                b = boxes.setdefault(v - 1, [x, y, x + 1, y + 1])
                b[0] = min(b[0], x); b[1] = min(b[1], y); b[2] = max(b[2], x + 1); b[3] = max(b[3], y + 1)
    return boxes

def overlap(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))

def generate(area_name):
    area = json.load(open(areafile(area_name)))
    floors = area['floors']
    info = {}
    for f in floors:
        for m in f['maps']:
            if m['path'] not in info and os.path.exists(mapfile(m['path'])): info[m['path']] = read_map(m['path'])
    on_floors = collections.defaultdict(set)
    for fi, f in enumerate(floors):
        for m in f['maps']:
            if m['path'] in info: on_floors[m['path']].add(fi)
    rooms = sorted(info)
    dungeon_room = {m['path']: bool(m.get('dungeon')) for f in floors for m in f['maps']}
    main_i = max(range(len(floors)), key=lambda i: len(floors[i]['maps']))

    # joins: exits that name a room in this area and an arrival point in it
    links = collections.defaultdict(list)       # p -> [(exit, q, arrival or None)]
    EDGE_M = 48
    def at_edge(i, x, y, d, far=False):
        """is (x, y) at the map's edge on side d (or, with far, on the opposite side)?"""
        if far: d = (-d[0], -d[1])
        return (d[0] > 0 and x > i['W'] - EDGE_M) or (d[0] < 0 and x < EDGE_M) or (d[1] > 0 and y > i['H'] - EDGE_M) or (d[1] < 0 and y < EDGE_M)
    for p in rooms:
        for e in info[p]['exits']:
            q = e['to']
            if q not in info or q == p: continue
            arr = info[q]['named'].get(e['marker'])
            if e['type'] == 'TeleportGround':
                # an edge transition is only a real join if it's at this map's edge and arrives at the next map's
                # opposite edge; anything else (a shortcut in the middle of a map) doesn't say where rooms are
                d = DIRS.get(e['dir'])
                if not d or not arr or not at_edge(info[p], e['x'], e['y'], d) or not at_edge(info[q], arr[0], arr[1], d, far=True):
                    e = dict(e, type='TeleportField')
            elif e['type'] == 'Door':
                # a door in a wall (at the edge of the room's drawn part, arriving at the next room's matching
                # wall) says where the rooms are; a door in the middle of a room may still lead into a building
                d = DIRS.get(e['dir'])
                bp, bq = info[p]['box'], info[q]['box']; M = 96
                def near(b, x, y, dd):
                    return (dd[0] > 0 and x > b[2] - M) or (dd[0] < 0 and x < b[0] + M) or (dd[1] > 0 and y > b[3] - M) or (dd[1] < 0 and y < b[1] + M)
                wall = bool(d and arr and near(bp, e['x'], e['y'], d) and near(bq, arr[0], arr[1], (-d[0], -d[1])))
                e = dict(e, wall=wall)
            links[p].append((e, q, arr))
    neighbours = collections.defaultdict(set)
    for p in rooms:
        for e, q, a in links[p]: neighbours[p].add(q); neighbours[q].add(p)

    pos = {}
    def cbox(p, x=None, y=None):           # a room's drawn content, in area space
        x = pos[p][0] if x is None else x; y = pos[p][1] if y is None else y; b = info[p]['box']
        return (x + b[0] + 16, y + b[1] + 16, x + b[2] - 16, y + b[3] - 16)
    def share(p, q): return bool(on_floors[p] & on_floors[q])
    def clashes(p, x, y, gap=0):
        r = cbox(p, x, y); r = (r[0] - gap, r[1] - gap, r[2] + gap, r[3] + gap)
        return [o for o in pos if o != p and share(p, o) and overlap(r, cbox(o)) > 0]
    def nearest_free(p, x, y):
        if not clashes(p, x, y, GAP): return x, y
        for rad in range(1, 400):
            n = rad * 8
            for k in range(n):
                a = k / n * 2 * math.pi; cx, cy = x + math.cos(a) * rad * 48, y + math.sin(a) * rad * 48
                if not clashes(p, cx, cy, GAP): return cx, cy
        return x, y

    report = dict(moved=[], interior_from={}, guessed=[])
    def area_of(p): b = info[p]['box']; return max(1, (b[2] - b[0]) * (b[3] - b[1]))
    # how much a room matters for the layout: through-routes (more places joined) before dead ends, then size
    walk = {p: len({q for e, q, a in links[p] if e['type'] != 'TeleportField'}) for p in rooms}
    def rank(p): return (area_of(p) * (1 + 0.5 * min(walk[p], 3)),)   # size, boosted for through-routes
    def building(q, p):
        """q plus everything reached only through it (cellars, upstairs): a building's inside, if it's a small
        dead end smaller than the room it's entered from; otherwise None"""
        group, todo = {q}, [q]
        while todo:
            r = todo.pop()
            for n in neighbours[r]:
                if n == p or n in group: continue
                group.add(n); todo.append(n)
                if len(group) > 4: return None
        if any(n not in group and n != p for r in group for n in neighbours[r]): return None
        if area_of(q) > 0.35 * area_of(p): return None
        return group
    def near_content_edge(p, e):
        b = info[p]['box']; m = 3 * 16
        return e['x'] < b[0] + m or e['x'] > b[2] - m or e['y'] < b[1] + m or e['y'] > b[3] - m

    def place_from(start):
        """Places everything joined to `start`, biggest rooms first, so main paths and towns claim their spots
        before caves and side rooms (which then step aside if they'd overlap)."""
        import heapq
        heap, n = [], 0
        def push(p):
            nonlocal n
            for e, q, arr in links[p]:
                if q in pos or q in report['interior_from'] or e['type'] == 'TeleportField': continue
                r_ = rank(q); heapq.heappush(heap, (-r_[0], 0, e['type'] != 'TeleportGround', n, p, q, e, arr)); n += 1
        push(start)
        while heap:
            _, _, _, _, p, q, e, arr = heapq.heappop(heap)
            if q in pos or q in report['interior_from']: continue
            d = DIRS.get(e['dir'])
            if arr and d:
                x = pos[p][0] + e['x'] - arr[0] + d[0] * 8; y = pos[p][1] + e['y'] - arr[1] + d[1] * 8
            elif d and e['type'] == 'TeleportGround':
                W, H = info[p]['W'], info[p]['H']; BW, BH = info[q]['W'], info[q]['H']
                x = pos[p][0] + (W if d[0] > 0 else -BW if d[0] < 0 else 0); y = pos[p][1] + (H if d[1] > 0 else -BH if d[1] < 0 else 0)
            else:
                continue
            cl = clashes(q, x, y)
            inside = 0
            if cl:
                qb = cbox(q, x, y); area_q = max(1, (qb[2] - qb[0]) * (qb[3] - qb[1]))
                inside = overlap(qb, cbox(p)) / area_q if p in cl else 0
                grp = building(q, p) if e['type'] == 'Door' and inside > 0.5 else None
                if grp:                                                 # a building's interior
                    report['interior_from'][q] = (p, e)
                    for r in grp:
                        if r != q and r not in pos: report['interior_from'].setdefault(r, ('@', q))
                    continue
            if e['type'] == 'Door' and not e.get('wall'):
                continue                                                # not a wall door: says nothing about where q is
            if cl:
                others = [c for c in cl if c != p]
                if others and all(rank(c) < rank(q) for c in others) and not (p in cl and inside > 0.5):
                    # the spot belongs to the bigger room: smaller rooms already there (caves, side rooms) step aside
                    pos[q] = (x, y); push(q)
                    for c in others:
                        cx0, cy0 = pos.pop(c)
                        pos[c] = nearest_free(c, cx0, cy0); report['moved'].append(c)
                    continue
                if not (cl == [p] and e['type'] != 'TeleportGround' and inside <= 0.5):
                    # step straight out along the doorway (stays in line with it), else the nearest free space
                    moved = None
                    if d:
                        for k in range(1, 80):
                            cx, cy = x + d[0] * k * 32, y + d[1] * k * 32
                            if not clashes(q, cx, cy): moved = (cx, cy); break
                    x, y = moved or nearest_free(q, x, y); report['moved'].append(q)
            pos[q] = (x, y); push(q)

    main_rooms = [m['path'] for m in floors[main_i]['maps'] if m['path'] in info]
    root = max(main_rooms or rooms, key=lambda p: (sum(1 for e, q, a in links[p] if a and DIRS.get(e['dir'])), info[p]['W'] * info[p]['H']))
    pos[root] = (0.0, 0.0)
    place_from(root)

    # anything else: next to the nearest placed room, keeping its offset from the game's own map
    scale = CELL / 8
    olds = {}
    for fi, f in enumerate(floors):
        for idx, b in old_boxes(f).items():
            p = f['maps'][idx]['path']
            if p in info and p not in olds: olds[p] = b
    for p in sorted(rooms, key=lambda p: (p not in main_rooms, p)):
        if p in pos or p in report['interior_from']: continue
        if p in olds and pos:
            b = olds[p]
            cand = [q for q in pos if q in olds]
            if cand:
                q = min(cand, key=lambda q: (not share(p, q), (olds[q][0] - b[0]) ** 2 + (olds[q][1] - b[1]) ** 2))
                x = pos[q][0] + (b[0] - olds[q][0]) * scale; y = pos[q][1] + (b[1] - olds[q][1]) * scale
            else: x, y = 0, 0
        else: x, y = 0, 0
        pos[p] = nearest_free(p, x, y); report['guessed'].append(p)
        place_from(p)

    # settle the whole layout at once: every join pulls its two rooms into line, rooms that overlap (on a
    # floor they share) push apart, and everything relaxes until it balances. Where the game's maps don't quite
    # add up around a loop, the mismatch is spread thinly over the loop instead of one join being far off.
    def relax(iters=600):
        drawn = sorted(pos)
        cons, joined = [], set()
        for p in drawn:
            for e, q, arr in links[p]:
                d = DIRS.get(e['dir'])
                if q not in pos or not arr or not d or e['type'] == 'TeleportField': continue
                cons.append((p, q, e['x'] - arr[0] + d[0] * 8, e['y'] - arr[1] + d[1] * 8))
                if e['type'] != 'TeleportGround': joined.add((min(p, q), max(p, q)))
        P = {p: [pos[p][0], pos[p][1]] for p in drawn}; init = {p: tuple(pos[p]) for p in drawn}
        pairs = [(a, b) for i, a in enumerate(drawn) for b in drawn[i + 1:] if share(a, b) and (a, b) not in joined]
        def box(p):
            b = info[p]['box']; return (P[p][0] + b[0] + 16, P[p][1] + b[1] + 16, P[p][0] + b[2] - 16, P[p][1] + b[3] - 16)
        for it in range(iters):
            acc = {p: [0.0, 0.0, 0.0] for p in drawn}
            for p, q, dx, dy in cons:
                rx = P[q][0] - P[p][0] - dx; ry = P[q][1] - P[p][1] - dy; r = math.hypot(rx, ry)
                w = 1.0 if r < 48 else 48 / r            # a join that's hopelessly out (a cave under a path) pulls less
                acc[q][0] += (P[p][0] + dx) * w; acc[q][1] += (P[p][1] + dy) * w; acc[q][2] += w
                acc[p][0] += (P[q][0] - dx) * w; acc[p][1] += (P[q][1] - dy) * w; acc[p][2] += w
            for p in drawn:
                wa = 0.02
                tx = (acc[p][0] + init[p][0] * wa) / (acc[p][2] + wa); ty = (acc[p][1] + init[p][1] * wa) / (acc[p][2] + wa)
                P[p][0] += (tx - P[p][0]) * 0.5; P[p][1] += (ty - P[p][1]) * 0.5
            for a, b in pairs:                           # push overlapping rooms apart
                A, B = box(a), box(b)
                ox = min(A[2], B[2]) - max(A[0], B[0]); oy = min(A[3], B[3]) - max(A[1], B[1])
                if ox <= 0 or oy <= 0: continue
                if ox < oy:
                    s_ = 1 if (A[0] + A[2]) < (B[0] + B[2]) else -1; P[a][0] -= s_ * ox / 2; P[b][0] += s_ * ox / 2
                else:
                    s_ = 1 if (A[1] + A[3]) < (B[1] + B[3]) else -1; P[a][1] -= s_ * oy / 2; P[b][1] += s_ * oy / 2
        for p in drawn: pos[p] = (P[p][0], P[p][1])
        report['overlaps'] = sum(1 for a, b in pairs if overlap(box(a), box(b)) > 32 * 32)
    report['overlaps'] = 0
    if os.environ.get('RELAX'): relax()      # off by default: it spreads loop errors but makes rooms overlap

    # each interior's door, on a drawn room (following interiors inside interiors outwards)
    def door_of(p, depth=0):
        src = report['interior_from'].get(p)
        if not src or depth > 8: return None
        if src[0] == '@': return door_of(src[1], depth + 1)
        q, e = src
        if q in pos: return (q, pos[q][0] + e['x'], pos[q][1] + e['y'])
        return door_of(q, depth + 1)
    interiors = {}
    for p in sorted(report['interior_from']):
        r = door_of(p)
        if r: interiors[p] = r

    # normalise: two squares of margin
    allr = [(pos[p][0] + info[p]['box'][0], pos[p][1] + info[p]['box'][1], pos[p][0] + info[p]['box'][2], pos[p][1] + info[p]['box'][3]) for p in pos]
    minx = min(r[0] for r in allr) - 2 * CELL; miny = min(r[1] for r in allr) - 2 * CELL
    for p in pos: pos[p] = (pos[p][0] - minx, pos[p][1] - miny)
    interiors = {p: (q, x - minx, y - miny) for p, (q, x, y) in interiors.items()}
    Wc = math.ceil((max(r[2] for r in allr) - minx) / CELL) + 2; Hc = math.ceil((max(r[3] for r in allr) - miny) / CELL) + 2

    out_floors = []
    for fi, f in enumerate(floors):
        paths = [m['path'] for m in f['maps']]
        grid = [[0] * Wc for _ in range(Hc)]; best = [[0.0] * Wc for _ in range(Hc)]
        here = [p for p in paths if p in pos]
        for p in here:
            idx = paths.index(p); x, y = pos[p]; i = info[p]
            c0, c1 = round(x / CELL), max(round(x / CELL) + 1, round((x + i['W']) / CELL))
            r0, r1 = round(y / CELL), max(round(y / CELL) + 1, round((y + i['H']) / CELL))
            cells = []
            for cy in range(r0, r1):
                for cx in range(c0, c1):
                    tx0 = int((cx * CELL - x) // 16); ty0 = int((cy * CELL - y) // 16); s = 0
                    for ty in range(max(0, ty0), min(i['TH'], ty0 + T)):
                        rw = i['filled'][ty]
                        for tx in range(max(0, tx0), min(i['TW'], tx0 + T)): s += rw[tx]
                    cells.append((s / (T * T), cx, cy))
            keep = [c for c in cells if c[0] >= 0.3] or [max(cells)]
            for cov, cx, cy in keep:
                if 0 <= cy < Hc and 0 <= cx < Wc and cov > best[cy][cx]: grid[cy][cx] = idx + 1; best[cy][cx] = cov
        # one connected shape per room (the game expects that): keep each room's biggest piece
        seen = set()
        for idx in range(len(paths)):
            v = idx + 1; parts = []
            for y in range(Hc):
                for x in range(Wc):
                    if grid[y][x] == v and (x, y) not in seen:
                        part, st = [], [(x, y)]; seen.add((x, y))
                        while st:
                            cx, cy = st.pop(); part.append((cx, cy))
                            for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                                if 0 <= nx < Wc and 0 <= ny < Hc and grid[ny][nx] == v and (nx, ny) not in seen: seen.add((nx, ny)); st.append((nx, ny))
                        parts.append(part)
            for part in sorted(parts, key=len)[:-1]:
                for cx, cy in part: grid[cy][cx] = 0
        # joins between rooms on this floor, at their real doorways
        conns, done = [], set()
        for p in here:
            idx = paths.index(p)
            for e, q, arr in links[p]:
                d = DIRS.get(e['dir'])
                if not d or q not in paths or q not in pos: continue
                j = paths.index(q); X = pos[p][0] + e['x'] + d[0] * 4; Y = pos[p][1] + e['y'] + d[1] * 4
                if d[1] == 0:   # across a vertical boundary
                    bx = round(X / CELL); size = max(1, round(e['h'] / CELL)); ty = round((Y - size * CELL / 2) / CELL)
                    a, b = (idx + 1, j + 1) if d[0] > 0 else (j + 1, idx + 1)
                    found = None
                    for bb in (bx, bx - 1, bx + 1):
                        ok = [r for r in range(ty - 1, ty + size + 1) if 0 <= r < Hc and 0 < bb < Wc and grid[r][bb - 1] == a and grid[r][bb] == b]
                        if ok: found = (bb, ok); break
                    if not found: continue
                    bb, ok = found; ty = max(min(ok), min(ty, max(ok))); size = max(1, min(size, max(ok) - ty + 1))
                    key = ('H', bb, ty, min(a, b), max(a, b))
                    if key not in done: done.add(key); conns.append(dict(tx=bb - 1, ty=ty, dir='HORIZONTAL', size=size, map1=a - 1, map2=b - 1))
                else:
                    by = round(Y / CELL); size = max(1, round(e['w'] / CELL)); tx = round((X - size * CELL / 2) / CELL)
                    a, b = (idx + 1, j + 1) if d[1] > 0 else (j + 1, idx + 1)
                    found = None
                    for bb in (by, by - 1, by + 1):
                        ok = [c for c in range(tx - 1, tx + size + 1) if 0 <= c < Wc and 0 < bb < Hc and grid[bb - 1][c] == a and grid[bb][c] == b]
                        if ok: found = (bb, ok); break
                    if not found: continue
                    bb, ok = found; tx = max(min(ok), min(tx, max(ok))); size = max(1, min(size, max(ok) - tx + 1))
                    key = ('V', bb, tx, min(a, b), max(a, b))
                    if key not in done: done.add(key); conns.append(dict(tx=tx, ty=bb - 1, dir='VERTICAL', size=size, map1=a - 1, map2=b - 1))
        # icons and teleport landmarks
        ob = old_boxes(f)
        def remap(item):
            if item['map'] >= len(paths): return None
            p = paths[item['map']]; b = ob.get(item['map'])
            if p not in pos or not b: return None
            mx = min(1, max(0, (item['x'] / 8 - b[0]) / max(1, b[2] - b[0]))) * info[p]['W']
            my = min(1, max(0, (item['y'] / 8 - b[1]) / max(1, b[3] - b[1]))) * info[p]['H']
            if item.get('data') and item['data'].get('map'):
                ex = next((e for e in info[p]['exits'] if e['to'] == item['data']['map']), None)
                if ex: mx, my = ex['x'], ex['y']
            n = dict(item); n['x'] = round((pos[p][0] + mx) / scale); n['y'] = round((pos[p][1] + my) / scale)
            return n
        icons = [n for n in (remap(i) for i in f['icons']) if n]
        lms = [n for n in (remap(l) for l in f.get('landmarks', [])) if n]
        # interiors whose door is on a room of this floor: an icon on the door (the interior's own icon if it
        # had one on the game's map, e.g. shop or weapons; a doorway otherwise)
        KEEP = {'shop', 'trader', 'pub', 'weapons', 'quest', 'quest_hub', 'chest', 'ferro'}
        at_door = collections.OrderedDict()
        for ip, (q, x, y) in sorted(interiors.items()):
            if q not in paths: continue
            key = (q, round(x), round(y)); at_door.setdefault(key, [])
            for g in floors:
                gp = [m['path'] for m in g['maps']]
                for it in g['icons']:
                    if it['map'] < len(gp) and gp[it['map']] == ip and it['icon'] in KEEP and it['icon'] not in at_door[key]: at_door[key].append(it['icon'])
                for lm in g.get('landmarks', []):
                    if lm['map'] < len(gp) and gp[lm['map']] == ip:
                        n = dict(lm); n['x'] = round(x / scale); n['y'] = round(y / scale) - 6; n['map'] = paths.index(q); lms.append(n)
        for (q, x, y), kinds in at_door.items():
            kinds = (kinds or ['entrance'])[:2]
            for k, kind in enumerate(kinds):
                icons.append(dict(icon=kind, x=round(x / scale) + k * 12 - (len(kinds) - 1) * 6, y=round(y / scale) - 6, map=paths.index(q)))
        out_floors.append(dict(level=f.get('level', 0), tiles=grid, connections=conns, icons=icons, landmarks=lms,
                               pos={p: [round(pos[p][0] / scale, 2), round(pos[p][1] / scale, 2)] for p in here}))
    # interiors: path -> [door's room, x, y (area-map pixels), floor index of that room]
    inter_out = {}
    for ip, (q, x, y) in interiors.items():
        fl_i = next((fi for fi in sorted(on_floors[q]) if ip in [m['path'] for m in floors[fi]['maps']]), min(on_floors[q]))
        inter_out[ip] = [q, round(x / scale, 2), round(y / scale, 2), fl_i]
    off = []
    for p in pos:
        for e, q2, arr in links[p]:
            d = DIRS.get(e['dir'])
            if q2 not in pos or not arr or not d or e['type'] == 'TeleportField' or (e['type'] == 'Door' and not e.get('wall')): continue
            r = math.hypot(pos[p][0] + e['x'] + d[0] * 8 - pos[q2][0] - arr[0], pos[p][1] + e['y'] + d[1] * 8 - pos[q2][1] - arr[1]) / 16
            if r > 2: off.append((round(r), p, q2))
    q = dict(off=len(off) // 2, off_list=sorted(off, reverse=True)[:12], overlaps=report['overlaps'], rooms=len(rooms), drawn=len(pos), interiors=len(interiors), moved=len(set(report['moved'])), guessed=len(report['guessed']),
             floors=len(floors), conns_old=sum(len(f['connections']) for f in floors), conns_new=sum(len(f['connections']) for f in out_floors),
             dungeon=any(m.get('dungeon') for f in floors for m in f['maps']))
    print('%-16s rooms %3d drawn %3d interiors %3d moved %2d unjoined %2d floors %d joins %3d (game %3d) misaligned %2d overlaps %d' % (
        area_name, q['rooms'], q['drawn'], q['interiors'], q['moved'], q['guessed'], q['floors'], q['conns_new'], q['conns_old'], q['off'], q['overlaps']), flush=True)
    return dict(width=Wc, height=Hc, scale=int(scale), floors=out_floors, interiors=inter_out, main=main_i, quality=q)

if __name__ == '__main__':
    import time
    out_dir = sys.argv[1]; os.makedirs(out_dir, exist_ok=True)
    budget = float(os.environ.get('BUDGET', '1e9')); t0 = time.time()
    for a in sys.argv[2:]:
        dest = os.path.join(out_dir, a + '.json')
        if os.path.exists(dest) and not os.environ.get('FORCE'): continue
        if time.time() - t0 > budget: print('(time up, run again to continue)'); break
        try: r = generate(a)
        except Exception as e:
            import traceback; traceback.print_exc(); r = dict(error=repr(e))
        json.dump(r, open(dest, 'w'))
