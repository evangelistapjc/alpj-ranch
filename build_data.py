#!/usr/bin/env python3
"""Generates the ALPJ Ranch data layer: one JSON per plant + home.json + index.json.
Edit this file (or the JSON directly) to add/adjust plants."""
import json, os

BASE = os.path.dirname(os.path.abspath(__file__))
PDIR = os.path.join(BASE, "resources", "data", "plants")
os.makedirs(PDIR, exist_ok=True)

HOME = {
    "name": "ALPJ Ranch",
    "location": {"city": "San Jose, CA", "lat": 37.3382, "lon": -121.8863,
                 "climate": "Mediterranean / coastal"},
    "indoor": {"tempF": [65, 70], "humidityPct": [45, 55],
               "note": "First-floor unit — runs cool, so soil dries slowly."},
    "lightSummary": "Two south windows (Den and Kitchen) carry ~6h of direct sun from mid-morning "
                    "to late afternoon, and the bedroom's 3-pane bay takes direct EAST sun all "
                    "morning. The living room is north-facing and gets almost none; the patio is "
                    "bright but mostly indirect.",
    "grid": {"cols": 12, "rows": 10, "tile": 40},
    # The plan is drawn SOUTH-UP (Den/Kitchen windows sit on the top edge and
    # are south-facing), which flips the horizontal axis: left is EAST, right
    # is WEST. resources/js/sun.js reads this rather than hard-coding it.
    #
    # Verified against observation: a 175 deg window (5 deg east of true south)
    # with a 75 deg acceptance spread predicts the Den lit 09:45-15:50 on 8 Aug,
    # against the 09:45-16:00 actually observed - 10 minutes of total error.
    # The same fit reproduces the other four rooms' behaviour, which is what
    # confirms the orientation.
    #
    # VALIDATED AT A SECOND TIME POINT: photos taken around 2 PM show direct sun
    # still on the Den sill (predicted - its window runs to 15:50) while the
    # patio floor sits entirely in shade under its arch (predicted - overhung).
    # Two independent falsifiable predictions, both held.
    "orientation": {"top": "S", "bottom": "N", "left": "E", "right": "W"},
    # Each room carries a microclimate block so the app can score how well a
    # plant actually fits where it's standing (see resources/js/climate.js).
    #   tempF / humidityPct : the range that spot actually sits at
    #   airflow             : "still" | "calm" | "drafty"  (drafty = cold-draft risk)
    #   dryFactor           : relative soil dry-down speed vs. the home average
    #                         (>1 dries faster → shorter check interval)
    "rooms": [
        {"id": "den", "name": "Den", "x": 0, "y": 0, "w": 5, "h": 3, "floor": "wood",
         "light": 5, "windows": [{"edge": "top", "direct": True, "facing": 175, "spread": 75,
                                  "obstruction": 18, "size": "large",
                                  "foliage": {"deciduous": True, "summer": 0.45, "bare": 0.9}}],
         "note": "South window · the long midday arc — your best direct-sun room",
         "sun": {"observed": {"from": "09:45", "to": "16:00"},
                 "hoursAug": 6.1, "quality": "direct",
                 "note": "Observed lit 9:45 AM-4 PM. South-facing, so it gets MORE hours in "
                         "winter (low sun stays within the window's arc) and fewer at "
                         "midsummer when the sun passes overhead."},
         "climate": {"tempF": [65, 70], "humidityPct": [45, 55], "airflow": "calm",
                     "dryFactor": 1.0, "note": "Interior wall, steady — the most average spot in the house."}},
        {"id": "kitchen", "name": "Kitchen", "x": 7, "y": 0, "w": 5, "h": 4, "floor": "tile",
         "light": 4, "windows": [{"edge": "top", "direct": True, "facing": 175, "spread": 75,
                                  "obstruction": 18, "size": "small",
                                  "foliage": {"deciduous": True, "summer": 0.4, "bare": 0.9}}],
         "note": "South window · same sun as the Den, through a smaller pane",
         "sun": {"observed": {"from": "09:45", "to": "16:00"},
                 "hoursAug": 6.1, "quality": "direct",
                 "note": "Same hours as the Den — same orientation — but a smaller window, "
                         "so less total light lands in the room."},
         "climate": {"tempF": [66, 76], "humidityPct": [40, 62], "airflow": "calm",
                     "dryFactor": 1.25, "note": "Direct sun + cooking heat: warmest room, and soil dries noticeably faster."}},
        {"id": "bathroom", "name": "Bath", "x": 0, "y": 3, "w": 3, "h": 2, "floor": "tile",
         "light": 0, "windows": [], "note": "No light · ideal future grow-light + humidity shelf",
         "sun": {"hoursAug": 0, "quality": "none", "note": "Windowless — grow light or nothing."},
         "climate": {"tempF": [66, 73], "humidityPct": [55, 80], "airflow": "still",
                     "dryFactor": 0.75, "note": "Shower steam keeps humidity high and soil wet far longer."}},
        {"id": "closet", "name": "Closet", "x": 0, "y": 5, "w": 3, "h": 2, "floor": "wood",
         "light": 0, "windows": [], "note": "No light",
         "sun": {"hoursAug": 0, "quality": "none", "note": "Windowless."},
         "climate": {"tempF": [64, 69], "humidityPct": [45, 55], "airflow": "still",
                     "dryFactor": 0.8, "note": "Dead air and no light — soil just sits wet."}},
        {"id": "bedroom", "name": "Bedroom", "x": 0, "y": 7, "w": 6, "h": 3, "floor": "carpet",
         "light": 5, "windows": [
             {"edge": "bottom", "direct": False, "facing": 0,  "spread": 75, "obstruction": 10, "bay": True, "size": "large"},
             {"edge": "bottom", "direct": True,  "facing": 45, "spread": 75, "obstruction": 10, "bay": True, "size": "large"},
             {"edge": "left",   "direct": True,  "facing": 90, "spread": 75, "obstruction": 10, "bay": True, "size": "large"}],
         "note": "3-pane bay facing north/northeast/EAST · real morning sun, bright all day",
         "sun": {"observed": {"from": "06:25", "to": "12:50"},
                 "hoursAug": 6.4, "quality": "direct-morning",
                 "note": "CORRECTED: the old data called this indirect-only. The bay's east "
                         "pane takes direct morning sun until about 1 PM; the north pane "
                         "supplies steady ambient the rest of the day."},
         "climate": {"tempF": [68, 75], "humidityPct": [45, 55], "airflow": "drafty",
                     "dryFactor": 1.05,
                     "note": "MEASURED: a thermometer on the bay shelf read 23C (73F) mid-afternoon, "
                             "well above the 62-69F previously assumed. The bay glass still runs cold "
                             "overnight, so treat this as the daytime high end of a wide daily swing."}},
        {"id": "living", "name": "Living Room", "x": 6, "y": 4, "w": 6, "h": 4, "floor": "wood",
         "light": 2, "windows": [{"edge": "bottom", "direct": False, "facing": 0, "spread": 75,
                                  "obstruction": 10, "size": "large"}],
         "note": "North slider only · the dimmest room that has a window at all",
         "sun": {"hoursAug": 0.5, "quality": "indirect",
                 "note": "North-facing, so barely half an hour of glancing sun at midsummer "
                         "dawn and none the rest of the year. Matches your read that this "
                         "room gets the least of the five."},
         "climate": {"tempF": [62, 68], "humidityPct": [45, 55], "airflow": "drafty",
                     "dryFactor": 0.85, "note": "North-facing and coolest indoor room; the slider leaks a draft."}},
        {"id": "patio", "name": "Patio", "x": 6, "y": 8, "w": 6, "h": 2, "floor": "grass",
         "light": 3, "outdoor": True,
         "windows": [{"edge": "bottom", "direct": False, "facing": 0, "spread": 90,
                     "obstruction": 12, "overhang": 35, "size": "open",
                     "foliage": {"deciduous": True, "summer": 0.25, "bare": 0.85}}],
         "note": "Outdoor · north-facing and overhung · little direct sun, huge sky view",
         "sun": {"hoursAug": 0.5, "quality": "indirect-bright",
                 "note": "CORRECTED down from 4. North-facing and shaded from above, so very "
                         "little DIRECT sun — but open sky gives far more ambient light than "
                         "any indoor room, which is why it still reads bright."},
         "climate": {"tempF": [48, 88], "humidityPct": [30, 90], "airflow": "drafty",
                     "dryFactor": 1.6, "tracksWeather": True,
                     "note": "Outdoors — tracks live weather. Wind and sun dry pots very fast."}},
    ],
}

# ---- plants -------------------------------------------------------------
# medium: "soil" or "water" (currently rooting in water)
# waterDays = soil check interval; water-medium uses a fixed refresh cadence in the app
P = []

P.append({
    "id": "SOH", "name": "Variegated String of Hearts", "botanical": "Ceropegia woodii f. variegata",
    "sprite": "💗", "location": "bedroom", "zone": "bright", "stage": "growing", "difficulty": "moderate",
    "medium": "soil", "currentStatus": "A bit dry — fine; give a soak in the next day or two",
    "growLight": True, "waterDays": 18, "waterBucket": "sip",
    "needs": {"tempF": [60, 85], "humidityPct": [30, 50], "draftSensitive": False},
    "headline": "Your light diva. More light = pinker hearts, tighter spacing.",
    "water": "Soak-and-dry. Let it dry out almost fully, then water thoroughly. ~every 2.5–3 wks here.",
    "light": "The hungriest plant you own. Brightest indirect light — but even your bay window is indirect, so a grow light is the real fix. Low light = hearts space out & lose pink.",
    "soil": "Gritty succulent mix — 50–70% pumice/perlite/coarse sand in a well-draining pot.",
    "temp": "Warm-loving; happy at your indoor temps, keep above ~40°F.",
    "humidity": "Low. It's a succulent — no misting needed.",
    "fertilizer": "Light feeder. Half-strength, once a month spring–summer only.",
    "repot": "Rarely. Shallow pot; it grows a caudex and likes snug roots.",
    "propagate": "Very easy — stem cuttings or the bead-like tubers pressed into soil.",
    "tips": ["If it's all green with big gaps, it's begging for light.",
             "A cheap grow light does more for this plant than anything else in your home.",
             "When unsure, don't water — it shrugs off drought, not wet feet."],
    "issues": [{"sign": "Leggy vines, faded pink, wide gaps", "fix": "Not enough light — grow light."},
               {"sign": "Mushy stems", "fix": "Overwatered. Dry fully; check for rot."},
               {"sign": "Crispy hearts", "fix": "Too-intense direct sun or long drought."}],
    "sources": [{"label": "Ohio Tropics", "url": "https://www.ohiotropics.com/2022/11/16/variegated-string-of-hearts-care/"}],
})

P.append({
    "id": "HOY", "name": "Hoya obovata", "botanical": "Hoya obovata (fresh cutting)",
    "sprite": "🌸", "location": "patio", "zone": "bright", "stage": "establishing", "difficulty": "moderate",
    "medium": "water", "currentStatus": "Rooting in water — refresh the water ~weekly, top up as needed",
    "growLight": False, "waterDays": 16, "waterBucket": "sip",
    "needs": {"tempF": [65, 85], "humidityPct": [50, 70], "draftSensitive": True},
    "headline": "Freshly propagated — rooting in water until it takes hold.",
    "water": "In water now: refresh every ~5–7 days, keep nodes submerged. Once potted: semi-succulent, let soil dry almost fully (~2 wks).",
    "light": "Bright indirect. Not a low-light plant; it won't bloom without good light.",
    "soil": "When you pot it: chunky & airy — potting mix + orchid bark + perlite.",
    "temp": "65–85°F, no cold drafts. Keep off cold windowsills at night.",
    "humidity": "Moderate; cuttings root faster with a little extra humidity.",
    "fertilizer": "Skip while rooting. Once established, dilute feed spring–summer.",
    "repot": "Every 2–3 yrs. Likes to be pot-bound (triggers blooms later).",
    "propagate": "Already done! Roots in water, moss, or perlite from a 2–3 node cutting.",
    "tips": ["Pot it up once roots hit ~1–2 inches.",
             "Give it months to establish — slow growth is normal.",
             "Thick leaves store water, so once potted, err dry."],
    "issues": [{"sign": "Slimy stem in water", "fix": "Change water more often; trim rot."},
               {"sign": "No roots after weeks", "fix": "More warmth + bright indirect light."},
               {"sign": "Yellowing leaf", "fix": "Normal for one old leaf; worry if several."}],
    "sources": [{"label": "Ohio Tropics", "url": "https://www.ohiotropics.com/2020/04/17/hoya-obovata-care/"}],
})

P.append({
    "id": "PIL", "name": "Pilea (Chinese Money Plant)", "botanical": "Pilea peperomioides · baby, ~12 stems",
    "sprite": "🍀", "location": "bedroom", "zone": "bright", "stage": "establishing", "difficulty": "easy",
    "medium": "soil", "currentStatus": "Soil fairly dry — water within a day or two",
    "growLight": False, "waterDays": 10, "waterBucket": "regular",
    "needs": {"tempF": [60, 75], "humidityPct": [40, 60], "draftSensitive": False},
    "headline": "The friendship plant — pops out shareable pups when happy.",
    "water": "Water when top 2–3\" are dry (~weekly, longer when cool). Drooping = thirsty. Empty the saucer.",
    "light": "Bright indirect. Rotate every few days or it leans hard toward the window.",
    "soil": "Well-draining potting mix with extra perlite.",
    "temp": "60–75°F — your cool apartment suits it fine.",
    "humidity": "Tolerates normal/dry air.",
    "fertilizer": "Diluted monthly spring–summer. White crust = ease off / flush.",
    "repot": "When rootbound; separate pups to share.",
    "propagate": "Easiest of the bunch — twist off pups once ~1–2\" tall.",
    "tips": ["Rotate a quarter-turn each watering for a round shape.",
             "Wipe the coin leaves so they soak up your limited light.",
             "Lower leaves dropping as it grows tall is normal."],
    "issues": [{"sign": "Tall bare stem", "fix": "Low light — brightest spot."},
               {"sign": "Leaning one way", "fix": "Rotate regularly."},
               {"sign": "Curling + soggy soil", "fix": "Overwatered; let it dry."}],
    "sources": [{"label": "Bob Vila", "url": "https://www.bobvila.com/articles/pilea-care/"}],
})

P.append({
    "id": "TRA", "name": "Tradescantia \"Feeling Dreamy\"", "botanical": "Tradescantia cv.",
    "sprite": "💜", "location": "patio", "zone": "bright", "stage": "growing", "difficulty": "easy",
    "medium": "soil", "currentStatus": "Slightly damp — good, no action needed",
    "growLight": False, "waterDays": 10, "waterBucket": "regular",
    "needs": {"tempF": [60, 80], "humidityPct": [50, 70], "draftSensitive": True},
    "headline": "Fast, forgiving, colorful — and your kitchen's direct sun keeps it vivid.",
    "water": "Let the top inch dry; ~weekly. Droopy = drink me. Hates soggy.",
    "light": "Bright indirect + the kitchen's direct sun is perfect for holding its pink/purple.",
    "soil": "Well-draining mix + perlite.",
    "temp": "60–80°F; keep away from cold drafts.",
    "humidity": "Likes moderate–high; crispy tips mean dry air.",
    "fertilizer": "Half-strength monthly, spring–fall.",
    "repot": "Yearly; a wide, shallow pot suits it.",
    "propagate": "Ridiculously easy — cuttings root in soil or water. Pinch tips to stay bushy.",
    "tips": ["Pinch it back often — every pinch is a free cutting.",
             "Refresh a leggy pot once a year by cutting it back.",
             "Wear gloves when pruning — sap can irritate skin."],
    "issues": [{"sign": "Leggy, gone green", "fix": "More light; pinch back."},
               {"sign": "Brown crispy tips", "fix": "Low humidity."},
               {"sign": "Mushy base", "fix": "Root rot; re-root healthy tips."}],
    "sources": [{"label": "Bloomscape", "url": "https://bloomscape.com/plant-care-guide/tradescantia/"}],
})

P.append({
    "id": "MON", "name": "Monstera", "botanical": "Monstera deliciosa · large",
    "sprite": "🌿", "location": "bedroom", "zone": "medium", "stage": "propReady", "difficulty": "moderate",
    "medium": "soil", "currentStatus": "Chill — all good",
    "growLight": False, "waterDays": 12, "waterBucket": "regular",
    "needs": {"tempF": [65, 85], "humidityPct": [50, 70], "draftSensitive": False},
    "headline": "Your big one — prop candidate in ~3 months. Loves bright indirect (would adore the bedroom).",
    "water": "Water when top 1–2\" dry (~10–12 days when cool/low-light).",
    "light": "Bright indirect for splits; the north bedroom bay would suit it better than the dim living room.",
    "soil": "Chunky aroid mix — bark + perlite + potting soil.",
    "temp": "65–85°F.", "humidity": "Prefers moderate–high; tolerates average.",
    "fertilizer": "Balanced, monthly spring–summer.",
    "repot": "Every 1–2 yrs; add a moss pole for bigger leaves.",
    "propagate": "~3 mo out: cut below a node with an aerial root; root in water/moss.",
    "tips": ["New leaves with no holes = wants more light.",
             "ID your nodes before propagating.",
             "A moss pole = bigger, split-ier leaves."],
    "issues": [{"sign": "No splits", "fix": "Brighter light + maturity."},
               {"sign": "Yellow leaves", "fix": "Usually overwatering."},
               {"sign": "Brown crispy edges", "fix": "Underwater / low humidity."}],
    "sources": [{"label": "The Spruce", "url": "https://www.thespruce.com/monstera-plant-profile-5072671"}],
})

P.append({
    "id": "SOH_DUP", "name": "", "skip": True
})  # placeholder guard (removed below)

P.append({
    "id": "SNO", "name": "Snow Queen Pothos", "botanical": "Epipremnum aureum 'Snow Queen'",
    "sprite": "❄️", "location": "bedroom", "zone": "medium", "stage": "growing", "difficulty": "easy",
    "medium": "soil", "currentStatus": "Top soil dry, damp just below — hold off watering",
    "growLight": False, "waterDays": 12, "waterBucket": "regular",
    "needs": {"tempF": [60, 80], "humidityPct": [40, 60], "draftSensitive": False},
    "headline": "Mostly-white leaves = needs real light to stay snowy.",
    "water": "Let it mostly dry (top 1–2\"), then soak. ~10–12 days. Soft leaves = thirsty.",
    "light": "Bright indirect. 70–90% white with little chlorophyll, so low light makes new leaves revert green.",
    "soil": "Well-draining aroid mix — potting soil + perlite (+ a little bark).",
    "temp": "60–80°F.", "humidity": "Moderate 40–60%.",
    "fertilizer": "Balanced, every 4–6 wks in the growing season.",
    "repot": "Every 12–18 mo; likes being a touch rootbound.",
    "propagate": "Super easy — node cuttings root in water in days.",
    "tips": ["Give it your best window — this pothos punishes low light with green reversion.",
             "Prune all-white leaves; they can't feed the plant.",
             "Wipe leaves so the white sections aren't fighting dust."],
    "issues": [{"sign": "New leaves green", "fix": "More light; prune to rebalance."},
               {"sign": "Yellowing base", "fix": "Overwatering."},
               {"sign": "Brown tips", "fix": "Low humidity + minerals."}],
    "sources": [{"label": "Ohio Tropics", "url": "https://www.ohiotropics.com/2022/05/13/snow-queen-pothos-care/"}],
})

P.append({
    "id": "BRA", "name": "Philodendron Brasil", "botanical": "Philodendron hederaceum 'Brasil' (fresh cutting)",
    "sprite": "🍃", "location": "living", "zone": "medium", "stage": "establishing", "difficulty": "easy",
    "medium": "water", "currentStatus": "Rooting in water — refresh ~weekly",
    "growLight": False, "waterDays": 10, "waterBucket": "regular",
    "needs": {"tempF": [65, 80], "humidityPct": [40, 60], "draftSensitive": False},
    "headline": "Freshly propagated & your most low-light-tolerant plant.",
    "water": "In water now: refresh every ~5–7 days. Once potted: top 1–2\" dry (~10 days).",
    "light": "Tolerates low–medium, but the lime stripe needs medium–bright to stay vivid.",
    "soil": "When potting: aroid mix — potting soil + perlite + bark.",
    "temp": "65–80°F.", "humidity": "Average is fine.",
    "fertilizer": "Skip while rooting; balanced monthly once potted.",
    "repot": "Pot up once roots ~1–2\"; then when rootbound ~1–2 yrs.",
    "propagate": "Already done — node cuttings root readily.",
    "tips": ["Best bet for a dim corner once established.",
             "Pinch/trim to keep it full.",
             "Keep sap away from pets — mild irritant."],
    "issues": [{"sign": "Variegation fading", "fix": "More light."},
               {"sign": "Yellow leaves", "fix": "Overwatering once potted."},
               {"sign": "Slimy stem in water", "fix": "Change water more often."}],
    "sources": [{"label": "The Spruce", "url": "https://www.thespruce.com/grow-philodendron-brasil-5077387"}],
})

P.append({
    "id": "RUB", "name": "Rubber Plant", "botanical": "Ficus elastica (fresh cutting)",
    "sprite": "🌳", "location": "bedroom", "zone": "medium", "stage": "establishing", "difficulty": "moderate",
    "medium": "water", "currentStatus": "Rooting in water — refresh ~weekly, keep it warm",
    "growLight": False, "waterDays": 12, "waterBucket": "regular",
    "needs": {"tempF": [60, 80], "humidityPct": [45, 65], "draftSensitive": True},
    "headline": "Freshly propagated — hates cold drafts, so mind the first floor.",
    "water": "In water now: refresh every ~5–7 days. Once potted: top 1–2\" dry (~10–12 days).",
    "light": "Bright indirect is best; the kitchen's light suits it. Low light = slow & leggy.",
    "soil": "When potting: well-draining potting mix.",
    "temp": "60–80°F. Very sensitive to cold drafts — it drops leaves in protest.",
    "humidity": "Average–moderate; a bit more helps roots.",
    "fertilizer": "Skip while rooting; balanced monthly once potted.",
    "repot": "Pot up once rooted; then every 1–2 yrs.",
    "propagate": "Already done — rooting in water.",
    "tips": ["Keep away from cold windowsills & door drafts.",
             "Wipe the big leaves — dust magnets that need all the light.",
             "Milky sap is irritating — wash hands after pruning."],
    "issues": [{"sign": "Leaf drop", "fix": "Cold draft / temp swing."},
               {"sign": "No roots", "fix": "More warmth + light."},
               {"sign": "Yellowing", "fix": "Once potted, overwatering."}],
    "sources": [{"label": "The Spruce", "url": "https://www.thespruce.com/grow-rubber-tree-plant-1902756"}],
})

P.append({
    "id": "MNY", "name": "Money Tree", "botanical": "Pachira aquatica · braided",
    "sprite": "🌴", "location": "kitchen", "zone": "medium", "stage": "growing", "difficulty": "moderate",
    "medium": "soil", "currentStatus": "A bit dry — check finger 2\" down; water if dry",
    "growLight": False, "waterDays": 12, "waterBucket": "regular",
    "needs": {"tempF": [65, 85], "humidityPct": [40, 60], "draftSensitive": True},
    "headline": "All-green & understory-adapted — one of your more low-light-friendly plants. Pet-safe.",
    "water": "Overwatering is the #1 killer. Water when top 1–2\" dry, err dry (~12–14 days when cool).",
    "light": "Prefers bright indirect but tolerates medium/light shade. Direct sun scorches. Rotate.",
    "soil": "Well-draining, rich — peat/loam + sand or perlite. Good drainage is non-negotiable.",
    "temp": "65–85°F; above ~50°F, away from cold drafts.",
    "humidity": "Likes 40–60%; brown crispy tips = air too dry.",
    "fertilizer": "Half-strength, once a month spring–summer. Skip winter.",
    "repot": "Every 2–3 yrs; it dislikes being moved — pick a spot and leave it.",
    "propagate": "Stem cuttings root best in a moist medium (soil, not water).",
    "tips": ["When in doubt, don't water.",
             "Rotate a quarter-turn each watering.",
             "Stable home — drafts/moves trigger leaf drop."],
    "issues": [{"sign": "Yellowing leaves", "fix": "Overwatering / early rot."},
               {"sign": "Brown crispy tips", "fix": "Underwater / dry air."},
               {"sign": "Sudden leaf drop", "fix": "Cold draft or a move."}],
    "sources": [{"label": "Soltech", "url": "https://soltech.com/products/money-tree-care"}],
})

P.append({
    "id": "MO2", "name": "Monstera (new)", "botanical": "Monstera deliciosa · recent addition",
    "sprite": "🌿", "location": "living", "zone": "medium", "stage": "establishing",
    "difficulty": "moderate", "medium": "soil",
    "currentStatus": "Newly arrived — settling in; hold off feeding until it pushes a leaf",
    "growLight": False, "waterDays": 12, "waterBucket": "regular",
    "needs": {"tempF": [65, 85], "humidityPct": [50, 70], "draftSensitive": False},
    "headline": "The new one. Living room is dim (0h direct sun) — watch for small, hole-less leaves.",
    "water": "Water when top 1–2\" dry. Slower here than the bedroom: the living room is north-facing and cool.",
    "light": "Wants bright indirect. The living room slider is the only light it gets, so keep it hugging the glass.",
    "soil": "Chunky aroid mix — bark + perlite + potting soil.",
    "temp": "65–85°F.", "humidity": "Prefers moderate–high; tolerates average.",
    "fertilizer": "Skip while it settles; balanced monthly once it is actively growing.",
    "repot": "Leave it be for now; repot once roots fill the pot.",
    "propagate": "Not yet — let it establish first.",
    "tips": ["New arrivals sulk for a few weeks; that is normal.",
             "Quarantine away from the others for ~2 weeks and watch for pests.",
             "Hole-less new leaves here mean the living room is too dim — consider the bedroom."],
    "issues": [{"sign": "No splits on new leaves", "fix": "Not enough light — move toward the slider or the bedroom bay."},
               {"sign": "Yellow lower leaves", "fix": "Overwatering, likely in this cool room."},
               {"sign": "Drooping after the move", "fix": "Transplant shock; keep care steady and wait."}],
    "sources": [{"label": "The Spruce", "url": "https://www.thespruce.com/monstera-plant-profile-5072671"}],
})

# drop guards / skips, keep order
P = [p for p in P if not p.get("skip")]

# write per-plant files
def slug(p):
    return {
        "SOH": "string-of-hearts", "HOY": "hoya-obovata", "PIL": "pilea",
        "TRA": "tradescantia", "MON": "monstera", "SNO": "snow-queen-pothos",
        "BRA": "philodendron-brasil", "RUB": "rubber-plant", "MNY": "money-tree",
        "MO2": "monstera-new",
    }[p["id"]]

# Point every plant at its SVG in icons/plant-sprites/. The emoji stays as a
# fallback for anywhere the file can't load (and as the tiny map label glyph).
for _p in P:
    _p["spriteFile"] = "resources/icons/plant-sprites/{}.svg".format(slug(_p))

files = []
for p in P:
    fn = f"{slug(p)}.json"
    with open(os.path.join(PDIR, fn), "w", encoding="utf-8") as f:
        json.dump(p, f, indent=2, ensure_ascii=False)
    files.append(f"plants/{fn}")

with open(os.path.join(BASE, "resources", "data", "home.json"), "w", encoding="utf-8") as f:
    json.dump(HOME, f, indent=2, ensure_ascii=False)

with open(os.path.join(BASE, "resources", "data", "index.json"), "w", encoding="utf-8") as f:
    json.dump({"home": "home.json", "plants": files, "almanac": "almanac.json", "count": len(files)}, f, indent=2)

print(f"Wrote {len(files)} plant files + home.json + index.json into resources/data/")
print("(almanac.json is hand-authored content — referenced by index.json, not regenerated here)")
print("Plants:", ", ".join(p["id"] for p in P))
