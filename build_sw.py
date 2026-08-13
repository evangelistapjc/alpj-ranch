#!/usr/bin/env python3
"""Stamps sw.js's cache VERSION with a hash of the files it actually caches.

The service worker caches the app SHELL (html/css/js/icons). Anything you change
inside the running app — moving a plant, adding one, editing rooms — lives in
localStorage and needs no version bump at all. What needs a bump is a change to
the shell itself, otherwise browsers keep serving the old modules.

Doing that by hand is exactly the kind of step that gets forgotten, so this
derives the version instead: hash every file listed in CORE, and write
`alpj-<hash>` into sw.js. Same shell in, same version out; one byte different
and every client picks up the new build.

    python build_sw.py          # stamp
    python build_sw.py --check  # exit 1 if stale (for CI)
"""
import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
SW = os.path.join(BASE, "sw.js")

src = open(SW, encoding="utf-8").read()

# Read the CORE list straight out of sw.js so the two can never drift apart.
block = re.search(r"const CORE = \[(.*?)\];", src, re.S)
if not block:
    sys.exit("Could not find the CORE array in sw.js")
paths = re.findall(r"'\./([^']*)'", block.group(1))

h = hashlib.sha256()
missing = []
for rel in sorted(paths):
    if not rel:                       # './' — the directory entry, same as index.html
        continue
    full = os.path.join(BASE, rel.replace("/", os.sep))
    if not os.path.isfile(full):
        missing.append(rel)
        continue
    h.update(rel.encode())
    with open(full, "rb") as f:
        h.update(f.read())

if missing:
    sys.exit("sw.js caches files that do not exist:\n  " + "\n  ".join(missing))

version = "alpj-" + h.hexdigest()[:10]
current = re.search(r"const VERSION = '([^']+)';", src)
if not current:
    sys.exit("Could not find VERSION in sw.js")

if current.group(1) == version:
    print(f"sw.js already current ({version}, {len(paths)} shell files)")
    sys.exit(0)

if "--check" in sys.argv:
    print(f"STALE: sw.js says {current.group(1)}, shell hashes to {version}")
    sys.exit(1)

out = src.replace(f"const VERSION = '{current.group(1)}';", f"const VERSION = '{version}';", 1)
with open(SW, "w", encoding="utf-8", newline="\n") as f:
    f.write(out)

print(f"sw.js {current.group(1)} -> {version}  ({len(paths)} shell files hashed)")
