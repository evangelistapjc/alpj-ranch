#!/usr/bin/env python3
"""Generates the plant sprite set into resources/icons/plant-sprites/.

Emoji were standing in for artwork, and several were plainly wrong — a Hoya
obovata is a thick round-leaved trailer, nothing like the blossom emoji that
was representing it. These are simple flat SVGs drawn to the trait that
actually identifies each plant: obovata's speckled round pairs, the Pilea's
coin leaves, Monstera's fenestration, Brasil's lime centre stripe.

64x64 viewBox, foliage only (the map draws its own pot), no background, so they
drop straight onto the card, the map and the tray. Rerun after editing:

    python build_sprites.py
"""
import os

D = os.path.join("resources", "icons", "plant-sprites")
os.makedirs(D, exist_ok=True)


def wrap(inner, title):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" '
            'aria-label="{t}"><title>{t}</title>{i}</svg>\n'.format(t=title, i=inner))


S = {}

# --- Hoya obovata: thick ROUND leaves in opposite pairs, silver flecks ------
S["hoya-obovata"] = wrap(
    '<g stroke="#4a7a3c" stroke-width="2.4" stroke-linecap="round" fill="none">'
    '<path d="M32 60V14"/><path d="M32 44C26 44 20 41 18 36"/><path d="M32 44c6 0 12-3 14-8"/>'
    '<path d="M32 29c-6 0-12-3-14-8"/><path d="M32 29c6 0 12-3 14-8"/></g>'
    '<g fill="#5f9c46" stroke="#3d6b2c" stroke-width="1.6">'
    '<ellipse cx="14" cy="36" rx="10" ry="8.5"/><ellipse cx="50" cy="36" rx="10" ry="8.5"/>'
    '<ellipse cx="14" cy="21" rx="9" ry="7.5"/><ellipse cx="50" cy="21" rx="9" ry="7.5"/>'
    '<ellipse cx="32" cy="11" rx="8.5" ry="7"/></g>'
    '<g fill="#cdeaad" opacity=".9">'
    '<circle cx="11" cy="34" r="1.3"/><circle cx="16" cy="38" r="1"/><circle cx="18" cy="33" r="1.1"/>'
    '<circle cx="47" cy="34" r="1.3"/><circle cx="52" cy="38" r="1"/><circle cx="54" cy="33" r="1.1"/>'
    '<circle cx="12" cy="20" r="1.1"/><circle cx="17" cy="23" r="1"/>'
    '<circle cx="48" cy="20" r="1.1"/><circle cx="53" cy="23" r="1"/>'
    '<circle cx="30" cy="10" r="1.2"/><circle cx="34" cy="13" r="1"/></g>',
    "Hoya obovata")

# --- Monstera: one big fenestrated leaf --------------------------------------
S["monstera"] = wrap(
    # Notches are cut with a MASK so they are truly transparent — filling them
    # with a background colour would show as pale blobs on the dark map floor.
    '<defs><mask id="mfen">'
    '<rect width="64" height="64" fill="#fff"/>'
    '<g fill="#000">'
    '<path d="M2 20l12 3-12 4z"/><path d="M4 30l11 2-10 4z"/>'
    '<path d="M62 20l-12 3 12 4z"/><path d="M60 30l-11 2 10 4z"/>'
    '<path d="M20 12l9 4-9 3z"/><path d="M44 12l-9 4 9 3z"/>'
    '<path d="M21 24l9 3-9 3z"/><path d="M43 24l-9 3 9 3z"/>'
    '</g></mask></defs>'
    '<g stroke="#4a7a3c" stroke-width="2.6" fill="none" stroke-linecap="round">'
    '<path d="M32 62V40"/><path d="M32 48 16 34"/><path d="M32 48l16-14"/></g>'
    '<g mask="url(#mfen)">'
    '<g fill="#4e9440" stroke="#2f5f26" stroke-width="1.8" stroke-linejoin="round">'
    '<path d="M16 36C6 34 2 26 6 20c4-5 12-4 15 2 2 5 0 13-5 14z"/>'
    '<path d="M48 36c10-2 14-10 10-16-4-5-12-4-15 2-2 5 0 13 5 14z"/>'
    '<path d="M32 30c-9-2-13-11-9-17 4-6 14-6 18 0 4 6 0 15-9 17z"/></g>'
    '<g stroke="#2f5f26" stroke-width="1.2" opacity=".5" fill="none">'
    '<path d="M32 28V14"/><path d="M16 34 9 24"/><path d="M48 34l7-10"/></g></g>',
    "Monstera deliciosa")

# --- Pilea: round coin leaves on thin stems ----------------------------------
S["pilea"] = wrap(
    '<g stroke="#4a7a3c" stroke-width="2" fill="none" stroke-linecap="round">'
    '<path d="M32 62V40"/><path d="M32 46 18 30"/><path d="M32 46l14-16"/>'
    '<path d="M32 40 22 18"/><path d="M32 40l10-22"/><path d="M32 44V22"/></g>'
    '<g fill="#63a84a" stroke="#3d6b2c" stroke-width="1.6">'
    '<circle cx="16" cy="28" r="9"/><circle cx="48" cy="28" r="9"/>'
    '<circle cx="21" cy="15" r="8"/><circle cx="43" cy="15" r="8"/><circle cx="32" cy="19" r="8.5"/></g>'
    '<g fill="none" stroke="#96da74" stroke-width="1.1" opacity=".85">'
    '<circle cx="16" cy="28" r="3"/><circle cx="48" cy="28" r="3"/><circle cx="32" cy="19" r="3"/></g>',
    "Pilea peperomioides")


def heart(x, y, s, fill):
    return ('<path d="M{x} {b}c-{s} -{a} -{s} -{c} 0 -{d}c{s} -{e} {s} {f} 0 {d}z" '
            'fill="{fill}" stroke="#7d6480" stroke-width="1"/>').format(
        x=x, b=y + s * 0.9, s=s, a=s * 0.7, c=s * 1.6, d=s * 1.3, e=s * 0.3, f=s * 0.6, fill=fill)


# --- String of Hearts: two trailing vines, alternating pink/silver hearts ----
S["string-of-hearts"] = wrap(
    '<g stroke="#8a6f8e" stroke-width="1.6" fill="none" stroke-linecap="round">'
    '<path d="M22 2c0 14-6 22-6 36s4 18 4 24"/><path d="M42 2c0 14 6 22 6 36s-4 18-4 24"/></g>'
    + "".join(heart(x, y, 5, f) for x, y, f in [
        (16, 10, "#d3e3bd"), (16, 24, "#e8b6cb"), (16, 38, "#d3e3bd"), (18, 52, "#e8b6cb"),
        (48, 10, "#e8b6cb"), (48, 24, "#d3e3bd"), (48, 38, "#e8b6cb"), (46, 52, "#d3e3bd"),
        (32, 18, "#d3e3bd"), (32, 34, "#e8b6cb"), (32, 48, "#d3e3bd")]),
    "Variegated String of Hearts")

# --- Tradescantia: pointed striped leaves, purple/pink ----------------------
S["tradescantia"] = wrap(
    '<path d="M32 62V26" stroke="#7a5a8c" stroke-width="2" fill="none" stroke-linecap="round"/>'
    '<g stroke="#5d3f6b" stroke-width="1.4">'
    '<path d="M32 30C20 30 8 22 6 12c12-2 22 6 26 18z" fill="#9b6fb0"/>'
    '<path d="M32 30c12 0 24-8 26-18-12-2-22 6-26 18z" fill="#c98fc0"/>'
    '<path d="M32 46C22 46 12 40 10 31c10-1 19 6 22 15z" fill="#c98fc0"/>'
    '<path d="M32 46c10 0 20-6 22-15-10-1-19 6-22 15z" fill="#9b6fb0"/></g>'
    '<g stroke="#f4dcef" stroke-width="1.1" opacity=".9" fill="none">'
    '<path d="M12 12c8 1 15 7 18 14"/><path d="M52 12c-8 1-15 7-18 14"/>'
    '<path d="M15 31c7 1 13 6 16 13"/><path d="M49 31c-7 1-13 6-16 13"/></g>',
    "Tradescantia")


def pothos(base, varie, spots, title):
    return wrap(
        '<g stroke="#4a7a3c" stroke-width="2" fill="none" stroke-linecap="round">'
        '<path d="M32 62V30"/><path d="M32 44 18 34"/><path d="M32 44l14-10"/>'
        '<path d="M32 34 24 18"/><path d="M32 34l8-16"/></g>'
        '<g stroke="#3d6b2c" stroke-width="1.5" fill="{b}">'
        '<path d="M16 36c-8-4-10-14-4-19 6-4 14 0 16 8 1 6-4 13-12 11z"/>'
        '<path d="M48 36c8-4 10-14 4-19-6-4-14 0-16 8-1 6 4 13 12 11z"/>'
        '<path d="M32 24c-7-3-9-13-3-17 6-3 13 1 14 8 1 5-4 11-11 9z"/></g>'
        '<g fill="{v}" opacity=".95">{s}</g>'.format(b=base, v=varie, s=spots), title)


# Snow Queen is mostly WHITE with green flecks — the inverse of a Golden pothos
S["snow-queen-pothos"] = pothos(
    "#f2f6ec", "#6da551",
    '<path d="M13 31c-3-3-4-9-1-12 3 3 4 9 1 12z"/>'
    '<path d="M22 22c3-2 6 0 6 3-3 1-6 0-6-3z"/>'
    '<path d="M45 24c3-3 7-3 9 0-3 3-7 3-9 0z"/>'
    '<path d="M43 33c4-2 7-1 8 2-4 2-7 1-8-2z"/>'
    '<path d="M30 11c3-2 6-1 7 2-3 2-6 1-7-2z"/>',
    "Snow Queen Pothos")

# --- Philodendron Brasil: heart leaves with a lime centre stripe ------------
S["philodendron-brasil"] = wrap(
    '<g stroke="#3f6b30" stroke-width="2.2" fill="none" stroke-linecap="round">'
    '<path d="M32 62V38"/><path d="M32 46 18 36"/><path d="M32 46l14-10"/></g>'
    '<g stroke="#2a5622" stroke-width="1.8" stroke-linejoin="round">'
    # three heart leaves, points down
    '<path d="M18 40c-9-5-11-16-4-20 5-3 11 0 12 5 1-5 7-8 12-5 7 4 5 15-4 20-6 3-10 3-16 0z" fill="#3f8f39"/>'
    '<path d="M48 40c9-5 11-16 4-20-5-3-11 0-12 5-1-5-7-8-12-5-7 4-5 15 4 20 6 3 10 3 16 0z" fill="#3f8f39"/>'
    '<path d="M32 26c-8-4-10-14-4-18 4-3 9 0 10 4 1-4 6-7 10-4 6 4 4 14-4 18-4 2-8 2-12 0z" fill="#47a03f"/></g>'
    # the lime centre wedge
    '<g fill="#cbe957">'
    '<path d="M18 39c-3-6-3-14-1-18 3 5 4 13 1 18z"/>'
    '<path d="M48 39c3-6 3-14 1-18-3 5-4 13-1 18z"/>'
    '<path d="M32 25c-2-5-2-12 0-16 2 4 2 11 0 16z"/></g>',
    "Philodendron hederaceum Brasil")

# --- Rubber Plant: big glossy ovals, dark green, red midrib ----------------
S["rubber-plant"] = wrap(
    '<path d="M32 62V12" stroke="#6b4a34" stroke-width="3.4" stroke-linecap="round" fill="none"/>'
    '<g stroke="#1f4a2c" stroke-width="1.6">'
    '<ellipse cx="16" cy="42" rx="12" ry="7" transform="rotate(-18 16 42)" fill="#2f6b3d"/>'
    '<ellipse cx="48" cy="42" rx="12" ry="7" transform="rotate(18 48 42)" fill="#2f6b3d"/>'
    '<ellipse cx="15" cy="24" rx="11" ry="6.5" transform="rotate(-24 15 24)" fill="#377a46"/>'
    '<ellipse cx="49" cy="24" rx="11" ry="6.5" transform="rotate(24 49 24)" fill="#377a46"/>'
    '<ellipse cx="32" cy="11" rx="6" ry="9" fill="#8d3b3b"/></g>'
    '<g stroke="#9c4444" stroke-width="1.1" opacity=".85" fill="none">'
    '<path d="M6 46 27 38"/><path d="M58 46 37 38"/><path d="M6 28 26 20"/><path d="M58 28 38 20"/></g>',
    "Ficus elastica")

# --- Money Tree: braided trunk + palmate leaflets ---------------------------
S["money-tree"] = wrap(
    # braid: three strands crossing twice
    '<g stroke="#7a5636" stroke-width="3.2" fill="none" stroke-linecap="round">'
    '<path d="M26 62c4-8 8-8 12-16"/><path d="M38 62c-4-8-8-8-12-16"/>'
    '<path d="M32 62V46"/></g>'
    '<path d="M32 46V34" stroke="#7a5636" stroke-width="3.4" stroke-linecap="round" fill="none"/>'
    # lower tier
    '<g stroke="#2f5f26" stroke-width="1.5" fill="#3f8f39" stroke-linejoin="round">'
    '<path d="M32 34C22 34 14 30 10 24c8-3 18 1 22 10z"/>'
    '<path d="M32 34c10 0 18-4 22-10-8-3-18 1-22 10z"/></g>'
    # upper tier
    '<g stroke="#2f5f26" stroke-width="1.5" fill="#4e9440" stroke-linejoin="round">'
    '<path d="M32 24C24 24 17 20 14 14c7-2 15 2 18 10z"/>'
    '<path d="M32 24c8 0 15-4 18-10-7-2-15 2-18 10z"/>'
    '<path d="M32 22c-3-7-2-14 0-18 2 4 3 11 0 18z"/></g>',
    "Pachira aquatica")

for name, svg in S.items():
    with open(os.path.join(D, name + ".svg"), "w", encoding="utf-8") as f:
        f.write(svg)

print("Wrote {} sprites into {}".format(len(S), D))
print(", ".join(sorted(S)))
