# Builds assets/data/wdn-shop.json: the Chef's Vault, the mod's own gear and food sold at Chef Backer Goods.
# Every piece of gear is level-scaled (it grows with Lea), with stats set at level 60 against the game's own
# gear of that level: Rare a touch above the shop gear, Legendary ~8% more, Unique ~15% more.
# Gear has a patron medal: its bronze, silver and gold tiers take 30%, 60% and 85% off.
# Food unlocks (stays on sale for good) once a medal reaches the tier shown.
import json, pathlib

OUT = pathlib.Path(__file__).resolve().parents[2] / "assets/data/wdn-shop.json"
RARE, LEGEND, UNIQUE = 2, 3, 4
MULT = {RARE: 1.04, LEGEND: 1.10, UNIQUE: 1.17}
ICON = {"ARM": "item-sword", "HEAD": "item-helm", "TORSO": "item-belt", "FEET": "item-shoe"}
PRICE = {RARE: 520000, LEGEND: 720000, UNIQUE: 950000}

# base stat shapes per slot at level 60
SHAPES = {
    "ARM": {"atk": {"attack": 118, "defense": 50}, "foc": {"attack": 90, "focus": 92}, "bal": {"attack": 60, "defense": 66, "focus": 66}, "hp": {"hp": 300, "attack": 108, "defense": 46}},
    "HEAD": {"foc": {"defense": 8, "focus": 168}, "def": {"defense": 86, "focus": 66}, "atk": {"attack": 34, "defense": 8, "focus": 132}, "hp": {"hp": 160, "defense": 80, "focus": 64}},
    "TORSO": {"hp": {"hp": 1220, "defense": 40}, "def": {"hp": 660, "defense": 108}, "foc": {"hp": 900, "defense": 32, "focus": 46}, "atk": {"hp": 600, "attack": 48, "defense": 68}},
    "FEET": {"foc": {"hp": 800, "defense": 22, "focus": 78}, "def": {"hp": 700, "defense": 66, "focus": 34}, "hp": {"hp": 900, "defense": 30, "focus": 46}, "atk": {"hp": 640, "attack": 22, "defense": 22, "focus": 62}},
}

SETS = {
    "aurum": "Aurum set: 2 pieces +15% Credits, all 4 pieces +12% melee and ranged damage and +20% critical damage.",
    "storm": "Stormcaller set: 2 pieces +15% shock and wave resistance; all 4, while it rains or storms outdoors, +15% damage and longer dodges.",
    "moon": "Moonlit set: 2 pieces regenerate HP at night; all 4 pieces, from 8pm to 5am, +30% critical damage and longer dodges.",
}

GEAR = [
    # key, name, slot, rarity, shape, properties, elem, patron medal, set, description
    ("aurumEdge", "Aurum Edge", "ARM", UNIQUE, "atk", {"MELEE_DMG": 1.2, "CRITICAL_DMG": 1.3}, None, "Enhanced", "aurum",
     "A gilded blade forged from every point the mod ever gave you."),
    ("aurumCirclet", "Aurum Circlet", "HEAD", UNIQUE, "foc", {"AIM_SPEED": 1.2, "XP_PLUS": 1.15}, None, "Star Gazer", "aurum",
     "A circlet of hammered gold set with a star for every one you earned."),
    ("aurumMantle", "Aurum Mantle", "TORSO", UNIQUE, "hp", {"HP_REGEN": 1.25, "GUARD_STRENGTH": 1.2}, [1.1, 1.1, 1.1, 1.1], "Home Turf", "aurum",
     "Gold thread over steel: worn by those who call every area home."),
    ("aurumGreaves", "Aurum Greaves", "FEET", UNIQUE, "foc", {"DASH_INVINC": 1.3, "SP_REGEN": 1.15}, None, "Perk Collector", "aurum",
     "Light golden greaves that hum with every perk you've taken."),

    ("stormSaber", "Stormcaller Saber", "ARM", LEGEND, "foc", {"CRITICAL_DMG": 1.4, "KNOCKBACK": 1.3}, None, "Storm Watcher", "storm",
     "Forged in a Tempest: the edge crackles whenever the sky opens."),
    ("stormHood", "Stormcaller Hood", "HEAD", LEGEND, "atk", {"RANGED_DMG": 1.2, "AIM_STABILITY": 1.3}, None, "Rift Walker", "storm",
     "Rainproof, rift-proof, and a little bit dramatic."),
    ("stormCoat", "Stormcaller Coat", "TORSO", LEGEND, "foc", {"OVERHEAT_REDUCTION": 1.25, "COND_EFFECT_ALL": 1.25}, [1, 1, 1.15, 1], "Spark Tracker", "storm",
     "Lined with copper thread that drinks in stray lightning."),
    ("stormTreads", "Stormcaller Treads", "FEET", LEGEND, "atk", {"AIMING_MOVEMENT": 1.25, "DASH_STEP": 2}, [1, 1, 1, 1.15], "Tide Chaser", "storm",
     "Grippy soles made for running through puddles at full speed."),

    ("moonFang", "Moonlit Fang", "ARM", LEGEND, "atk", {"ASSAULT": 1.25, "CROSS_COUNTER": 1.3}, None, "Night Stalker", "moon",
     "Pale as moonlight and twice as quiet."),
    ("moonVeil", "Moonlit Veil", "HEAD", LEGEND, "foc", {"CRITICAL_DMG": 1.3, "BREAK_DMG": 1.2}, None, "Shiny Hunter", "moon",
     "Shimmers like a shiny card under the moon."),
    ("moonShroud", "Moonlit Shroud", "TORSO", LEGEND, "foc", {"DASH_INVINC": 1.2, "CRITICAL_DMG": 1.25}, None, "Soulmates", "moon",
     "Woven by the light of a full moon, for those who never fight alone."),
    ("moonSteps", "Moonlit Steps", "FEET", LEGEND, "foc", {"MOMENTUM": 1.15, "DASH_INVINC": 1.25}, None, "Lightning Quick", "moon",
     "You'll be gone before the shadows notice."),

    ("creditCrusher", "Credit Crusher", "ARM", RARE, "hp", {"MONEY_PLUS": 1.3, "ASSAULT": 1.15}, None, "Card Shark", None,
     "A knuckleduster bought with card winnings. Hits harder the richer you get."),
    ("cardsharpEdge", "Cardsharp's Edge", "ARM", LEGEND, "foc", {"CRITICAL_DMG": 1.6, "DROP_CHANCE": 1.25}, None, "Card Collector", None,
     "Thin as a playing card and sharper than any of them."),
    ("prismGauntlets", "Prism Gauntlets", "ARM", LEGEND, "bal", {"COND_EFFECT_ALL": 1.35, "SP_REGEN": 1.15, "GUARD_SP": 1.2}, [1.05, 1.05, 1.05, 1.05], "Orb Seeker", None,
     "Each knuckle holds a sliver of a different element orb."),
    ("sageMonocle", "Sage's Monocle", "HEAD", RARE, "foc", {"XP_PLUS": 1.25, "BREAK_DMG": 1.3}, None, "Field Notes", None,
     "For reading the field notes, and the enemy's weak spots."),
    ("championCrest", "Champion's Crest", "HEAD", LEGEND, "atk", {"BERSERK": 1.3, "STUN_THRESHOLD": 1.03, "MELEE_DMG": 1.1}, None, "Champion Hunter", None,
     "Taken from the aura of a fallen champion. Still warm."),
    ("trialCirclet", "Trialmaster Crown", "HEAD", RARE, "def", {"PERFECT_GUARD_WINDOW": 1.3, "AIM_SPEED": 1.25}, None, "Trial Runner", None,
     "Awarded at the Trial Fountain to those who keep coming back."),
    ("chefApron", "Chef's Apron", "TORSO", LEGEND, "hp", {"APPETITE": 2, "ITEM_BOOST": 1.35, "HP_REGEN": 1.2}, None, "Best Friends", None,
     "Chef Backer's own. Food tastes better, lasts longer and heals more."),
    ("bergenBulwark", "Bulwark of Bergen", "TORSO", RARE, "def", {"GUARD_STRENGTH": 1.35, "SPIKE_DMG": 1.4, "ITEM_GUARD": 2}, [1, 1.1, 1, 1], "Boss Breaker", None,
     "Mountain steel that boss trials couldn't dent."),
    ("wandererCoat", "Wanderer's Coat", "TORSO", RARE, "foc", {"DASH_INVINC": 1.3, "COND_HEALING": 1.4}, [1.05, 1.05, 1.05, 1.05], "Area Sweeper", None,
     "Worn thin by every corner of every area."),
    ("leagueBoots", "Seven-League Boots", "FEET", LEGEND, "atk", {"DASH_STEP": 2, "MOMENTUM": 1.15, "AIMING_MOVEMENT": 1.2}, None, "Against the Clock", None,
     "Each step covers a little more ground than it should."),
    ("glacierTreads", "Glacier Treads", "FEET", RARE, "def", {"BEGONE_ICE": 2, "STUN_THRESHOLD": 1.04}, [1, 1.25, 1, 1], "Frost Finder", None,
     "Spiked soles. Ice simply gives up."),
    ("emberStriders", "Ember Striders", "FEET", RARE, "hp", {"OVERHEAT_REDUCTION": 1.35, "DASH_INVINC": 1.2}, [1.25, 1, 1, 1], "Heat Seeker", None,
     "Lava-proof, and they leave little sparks on the ground."),
]

FOOD = [
    # key, name, stats, seconds, price, medal, tier, food sprite, description
    ("clubSandwich", "Golden Club Sand.", ["HEAL-4", "ATTACK-3", "DEFENSE-3"], 90, 12000, "Card Collector", 2, "RISING_STAR",
     "Three layers, gold leaf on top. The Chef's pride."),
    ("orbitParfait", "Orbit Parfait", ["SP_REGEN-3", "FOCUS-3", "WDN-CRIT-2"], 90, 14000, "Orb Seeker", 2, "MOONCAKE",
     "Four scoops, one per element, orbiting a cherry."),
    ("trialRation", "Trial Ration", ["ATTACK-4", "WDN-CRIT-3"], 60, 9500, "Trial Runner", 1, "BEAT_ZERO",
     "Eaten in one bite between trial rounds."),
    ("riftEspresso", "Rift Espresso", ["DASH-STEP-1", "WDN-DASH-3"], 90, 8800, "Rift Walker", 1, "PUMPKIN_SPICE",
     "Brewed with water from the rift. Don't ask."),
    ("championFeast", "Champion's Feast", ["HEAL-5", "HP-3", "MELEE_DMG-4"], 120, 16000, "Champion Hunter", 2, "GUACAMOLE_TOAST",
     "A meal fit for someone who eats champions for breakfast."),
    ("fortuneCookie", "Fortune Cookie", ["WDN-DROP-3", "WDN-MONEY-3"], 300, 15000, "Card Shark", 2, "RICE_CRACKER",
     "The slip inside always says the same thing: 'You will win.'"),
    ("thunderTea", "Thunderhead Tea", ["SHOCK-RES-3", "WAVE-RES-3", "REGEN-4"], 120, 7500, "Storm Watcher", 1, "GREEN_TEA",
     "Steeped in a thunderstorm. Fizzes slightly."),
    ("scholarScone", "Scholar's Scone", ["WDN-XP-3"], 300, 18000, "Field Notes", 2, "WILLI_BUN",
     "Crumbs everywhere, but you learn so much faster."),
    ("bondBiscuit", "Bond Biscuit", ["COND_HEALING-3", "REGEN-3", "CROSS_COUNTER-3"], 90, 9000, "Best Friends", 1, "WILLI_BUN",
     "Baked to share. Your companions insist."),
    ("hideoutHotpot", "Hideout Hotpot", ["HEAL-5", "REGEN-4", "SP_REGEN-3"], 60, 11000, "A Place of My Own", 3, "MOONCAKE",
     "Simmered on the hideout's little stove. Tastes like home."),
    ("gildedPudding", "Gilded Pudding", ["ATTACK-4", "DEFENSE-3", "FOCUS-4", "HP-3"], 180, 30000, "Enhanced", 3, "PENGO_POP",
     "The most expensive dessert in Rhombus Square. Worth every Credit."),
]


def lang(s):
    return {"en_US": s, "de_DE": s, "fr_FR": s, "zh_CN": s, "zh_TW": s, "ja_JP": s, "ko_KR": s}


items = []
for i, (key, name, slot, rar, shape, props, elem, medal, st, desc) in enumerate(GEAR):
    p = {k: max(1, round(v * MULT[rar])) for k, v in SHAPES[slot][shape].items()}
    params = {"elemFactor": elem or [1, 1, 1, 1]}
    params.update(p)
    full = desc   # (set bonuses show on the shop card: the info bar is one line)
    items.append({
        "wdnKey": key, "wdnShop": {"page": "gear", "price": PRICE[rar], "medal": medal, "set": st},
        "name": lang(name), "description": lang(full),
        "type": "EQUIP", "equipType": slot, "icon": ICON[slot], "rarity": rar, "level": 60,
        "cost": PRICE[rar] // 10, "order": 300 + i, "params": params, "properties": props,
        "effect": {"sheet": "", "name": None}, "noTrack": True, "noCount": True, "isScalable": True,
    })
for i, (key, name, stats, secs, price, medal, tier, sprite, desc) in enumerate(FOOD):
    items.append({
        "wdnKey": key, "wdnShop": {"page": "food", "price": price, "medal": medal, "tier": tier},
        "name": lang(name), "description": lang(desc),
        "type": "CONS", "icon": "item-items", "rarity": 5, "level": 1, "cost": price, "order": 120 + i,
        "effect": {"sheet": "drops", "name": "circle"}, "useSpeed": 1, "foodSprite": sprite,
        "time": secs, "stats": stats, "noTrack": True, "noCount": True, "isScalable": False,
    })

# ---------- the area sets: one per area, four pieces, each piece with its own challenge in that area ----------
# (appended after the first 35 so their item ids never move)
AREA_SETS = [
    # area, display name, level, resisted element index (or None), [weapon, head, body, feet] names, flavour
    ("rookie-harbor", "Rookie Harbor", 8, None, ["Harbor Cutlass", "Harbor Cap", "Harbor Peacoat", "Harbor Deckboots"], "Sea-salted and sturdy, made in Rookie Harbor's docks."),
    ("autumn-area", "Autumn's Rise", 10, None, ["Maple Knuckles", "Maple Crown", "Maple Vest", "Maple Striders"], "Stitched from Autumn's Rise leaves that never fall."),
    ("bergen-trails", "Bergen Trails", 16, 1, ["Frostpine Axe", "Frostpine Hood", "Frostpine Parka", "Frostpine Boots"], "Pine-scented and frost-proof, for the mountain paths."),
    ("bergen", "Bergen Village", 18, 1, ["Hearthguard Mitts", "Hearth Beanie", "Hearth Sweater", "Hearth Clogs"], "Knitted by the fire in Bergen. Warm as a hug."),
    ("cold-dng", "Temple Mine", 22, 1, ["Glacial Pick", "Glacial Visor", "Glacial Plate", "Glacial Spikes"], "Hewn from the Temple Mine's oldest ice."),
    ("heat-area", "Maroon Valley", 29, 0, ["Maroon Scimitar", "Maroon Turban", "Maroon Wrap", "Maroon Sandals"], "Sun-bleached cloth and desert steel."),
    ("heat-village", "Ba'kii Kum", 31, 0, ["Oasis Bangles", "Oasis Veil", "Oasis Robe", "Oasis Slippers"], "Traded at Ba'kii Kum for a lot of water."),
    ("heat-dng", "Faj'ro Temple", 35, 0, ["Magma Fists", "Magma Helm", "Magma Cuirass", "Magma Greaves"], "Still glowing from the Faj'ro Temple's forges."),
    ("autumn-fall", "Autumn's Fall", 25, None, ["Amberleaf Blade", "Amberleaf Cap", "Amberleaf Coat", "Amberleaf Boots"], "Amber-dipped leaves from the Fall's tallest trees."),
    ("jungle", "Gaia's Garden", 42, 3, ["Gaia Thorn", "Gaia Bloom", "Gaia Bark Mail", "Gaia Roots"], "Grown, not made. Gaia's Garden insisted."),
    ("jungle-city", "Basin Keep", 45, None, ["Basin Baton", "Basin Beret", "Basin Uniform", "Basin Loafers"], "Standard issue in Basin Keep. Very non-standard stats."),
    ("shock-dng", "So'najiz Temple", 48, 2, ["Voltaic Claws", "Voltaic Mask", "Voltaic Harness", "Voltaic Skates"], "Hums faintly. Do not lick."),
    ("wave-dng", "Zir'vitar Temple", 52, 3, ["Tidal Trident", "Tidal Diadem", "Tidal Scales", "Tidal Fins"], "Polished by the tides of Zir'vitar."),
    ("forest", "Sapphire Ridge", 39, None, ["Sapphire Saber", "Sapphire Tiara", "Sapphire Mail", "Sapphire Sabatons"], "Cut from the Ridge's bluest stone."),
    ("tree-dng", "Grand Krys'kajo", 62, None, ["Rootcrystal Maul", "Rootcrystal Crown", "Rootcrystal Plate", "Rootcrystal Boots"], "Crystal grown through ancient roots."),
    ("arid", "Vermillion Wastes", 68, 0, ["Vermillion Edge", "Vermillion Mask", "Vermillion Duster", "Vermillion Walkers"], "From the end of the world, where the sand is red."),
]
SLOTS = ["ARM", "HEAD", "TORSO", "FEET"]
REQ = ["areaStars", "areaOrbs", "areaCards", "areaChests"]   # weapon, head, body, feet
SHAPE_ROT = {"ARM": ["atk", "foc", "bal", "hp"], "HEAD": ["foc", "def", "atk", "hp"], "TORSO": ["hp", "def", "foc", "atk"], "FEET": ["foc", "def", "hp", "atk"]}
POOLS = {
    "ARM": [("MELEE_DMG", 1.15), ("CRITICAL_DMG", 1.3), ("RANGED_DMG", 1.15), ("ASSAULT", 1.15), ("BREAK_DMG", 1.2), ("KNOCKBACK", 1.3), ("CROSS_COUNTER", 1.2), ("SPIKE_DMG", 1.25)],
    "HEAD": [("AIM_SPEED", 1.2), ("CRITICAL_DMG", 1.2), ("XP_PLUS", 1.15), ("PERFECT_GUARD_WINDOW", 1.2), ("AIM_STABILITY", 1.3), ("GUARD_SP", 1.15), ("OVERHEAT_REDUCTION", 1.15), ("MONEY_PLUS", 1.15)],
    "TORSO": [("HP_REGEN", 1.2), ("COND_HEALING", 1.3), ("GUARD_STRENGTH", 1.2), ("DASH_INVINC", 1.15), ("SP_REGEN", 1.1), ("COND_EFFECT_ALL", 1.2), ("ITEM_BOOST", 1.15), ("OVERHEAT_REDUCTION", 1.2)],
    "FEET": [("DASH_INVINC", 1.2), ("AIMING_MOVEMENT", 1.2), ("MOMENTUM", 1.1), ("HP_REGEN", 1.15), ("COND_HEALING", 1.25), ("DROP_CHANCE", 1.15), ("SP_REGEN", 1.1), ("GUARD_SP", 1.15)],
}
LEVEL_PRICE = {RARE: 9000, LEGEND: 11000, UNIQUE: 13000}
for ai, (area, aname, lv, res, names, flav) in enumerate(AREA_SETS):
    rar = RARE if lv < 25 else LEGEND if lv <= 50 else UNIQUE
    k = (lv / 60) ** 1.45 * MULT[rar]
    for si, slot in enumerate(SLOTS):
        shape = SHAPE_ROT[slot][ai % 4]
        params = {"elemFactor": [1, 1, 1, 1]}
        params.update({st: max(1, round(v * k)) for st, v in SHAPES[slot][shape].items()})
        if res is not None and slot in ("TORSO", "FEET"):
            params["elemFactor"][res] = 1.1 if lv < 30 else 1.15
        pool = POOLS[slot]
        props = {}
        for j in (ai % len(pool), (ai * 3 + 1 + si) % len(pool)):
            key_, v = pool[j]
            if key_ in props: key_, v = pool[(j + 2) % len(pool)]
            props[key_] = v if key_ == "STUN_THRESHOLD" else round(1 + (v - 1) * (0.8 + 0.4 * lv / 70), 2)
        items.append({
            "wdnKey": area + ":" + slot.lower(),
            "wdnShop": {"page": "gear", "price": min(999900, max(60000, LEVEL_PRICE[rar] * lv // 100 * 100)),
                        "req": {"type": REQ[si], "area": area, "name": aname}, "set": "area:" + area, "minLevel": lv},
            "name": lang(names[si]), "description": lang(flav),
            "type": "EQUIP", "equipType": slot, "icon": ICON[slot], "rarity": rar, "level": lv,
            "cost": max(500, LEVEL_PRICE[rar] * lv // 1000), "order": 400 + lv * 4 + si, "params": params, "properties": props,
            "effect": {"sheet": "", "name": None}, "noTrack": True, "noCount": True, "isScalable": False,
        })

# ---------- forge & fusion sets (appended last, so earlier ids never move): level-scaled, patron medals ----------
SMITH_FUSE = [
    ("smithHammer", "Forgemaster Hammer", "ARM", LEGEND, "hp", {"BREAK_DMG": 1.35, "STUN_THRESHOLD": 1.03}, None, "Apprentice Smith", "smith", "Heavier than it looks. Every swing rings like an anvil."),
    ("smithGoggles", "Soot Goggles", "HEAD", RARE, "def", {"OVERHEAT_REDUCTION": 1.3, "GUARD_SP": 1.15}, [1.15, 1, 1, 1], "Hidden Depths", "smith", "Scratched lenses that have stared into a thousand sparks."),
    ("smithApron", "Scorched Apron", "TORSO", LEGEND, "def", {"GUARD_STRENGTH": 1.3, "ITEM_GUARD": 2}, [1.15, 1, 1, 1], "Master Smith", "smith", "Scorched, patched and impossibly tough."),
    ("smithBoots", "Ironshod Boots", "FEET", RARE, "def", {"STUN_THRESHOLD": 1.04, "SPIKE_DMG": 1.3}, None, "Forged Lea", "smith", "Iron-capped and steel-soled. Kick with care."),
    ("weaveGloves", "Arrowweave Gloves", "ARM", LEGEND, "foc", {"CRITICAL_DMG": 1.4, "AIM_SPEED": 1.15}, None, "Card Welder", "weave", "Stitched from the arrows of fused cards. Every finger points somewhere."),
    ("weaveCirclet", "Fusion Circlet", "HEAD", LEGEND, "foc", {"XP_PLUS": 1.15, "CRITICAL_DMG": 1.2}, None, "Shine Maker", "weave", "A band of polished foil that never quite stops glittering."),
    ("weaveCoat", "Foil-Lined Coat", "TORSO", RARE, "foc", {"DASH_INVINC": 1.2, "COND_EFFECT_ALL": 1.2}, None, "Perfect Hand", "weave", "Lined with spare card foil. Catches the light, and the odd attack."),
    ("weaveSteps", "Eight-Way Steps", "FEET", LEGEND, "atk", {"DASH_STEP": 2, "AIMING_MOVEMENT": 1.2}, None, "Card Welder", "weave", "Built to step in all eight directions at once. Almost."),
]
for i, (key, name, slot, rar, shape, props, elem, medal, st, desc) in enumerate(SMITH_FUSE):
    p_ = {k: max(1, round(v * MULT[rar])) for k, v in SHAPES[slot][shape].items()}
    params = {"elemFactor": elem or [1, 1, 1, 1]}; params.update(p_)
    items.append({
        "wdnKey": key, "wdnShop": {"page": "gear", "price": PRICE[rar], "medal": medal, "set": st},
        "name": lang(name), "description": lang(desc),
        "type": "EQUIP", "equipType": slot, "icon": ICON[slot], "rarity": rar, "level": 60,
        "cost": PRICE[rar] // 10, "order": 360 + i, "params": params, "properties": props,
        "effect": {"sheet": "", "name": None}, "noTrack": True, "noCount": True, "isScalable": True,
    })

OUT.write_text(json.dumps({"items": items}, indent=1))
print(len(items), "items ->", OUT)
