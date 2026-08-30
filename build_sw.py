#!/usr/bin/env python3
"""Stamps sw.js's cache VERSION from version.json plus a hash of the shell.

    python build_sw.py                 # stamp from the current version.json
    python build_sw.py --bump patch    # 5.0.0 -> 5.0.1, then stamp
    python build_sw.py --bump minor    # 5.0.0 -> 5.1.0
    python build_sw.py --bump major    # 5.0.0 -> 6.0.0
    python build_sw.py --set 5.2.3     # set an exact version, then stamp
    python build_sw.py --check         # exit 1 if sw.js is stale (for CI)

WHY BOTH A VERSION AND A HASH
The version is for you: "alpj-v5.0.0" is readable, it shows in the app footer,
and you control it. The trailing hash is for correctness: the service worker
only refreshes its cache when the VERSION string changes, so if you edit code
and forget to bump, a pure-semver scheme would ship stale assets to everyone.
Appending the shell hash means the cache key changes whenever the code does,
bumped or not — you get readable versions without the failure mode.

    alpj-v5.0.0+7699262144
         ^^^^^ yours       ^^^^^^^^^^ derived, do not edit

The service worker caches the app SHELL. Your own data — waterings, placement,
room edits — lives in localStorage and is never affected by a version bump.
"""
import hashlib
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
SW = os.path.join(BASE, "sw.js")
VERSION_FILE = os.path.join(BASE, "version.json")


def read_version():
    if not os.path.isfile(VERSION_FILE):
        return "0.0.0", {}
    data = json.load(open(VERSION_FILE, encoding="utf-8"))
    return data.get("version", "0.0.0"), data


def write_version(v, data):
    data["version"] = v
    with open(VERSION_FILE, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    sync_package_json(v)


def sync_package_json(v):
    """version.json is the single source of truth; package.json follows it.

    Two files holding a version number is two files that drift. Rather than ask
    you to remember both, a bump rewrites package.json's version field too --
    edited as text so the key order and formatting survive."""
    pkg = os.path.join(BASE, "package.json")
    if not os.path.isfile(pkg):
        return
    src = open(pkg, encoding="utf-8").read()
    out = re.sub(r'("version"\s*:\s*")[^"]*(")', r"\g<1>%s\g<2>" % v, src, count=1)
    if out != src:
        with open(pkg, "w", encoding="utf-8", newline="\n") as f:
            f.write(out)
        print("package.json version -> %s" % v)


def bump(v, part):
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", v.strip())
    if not m:
        sys.exit("version.json holds '%s', which is not MAJOR.MINOR.PATCH" % v)
    major, minor, patch = (int(x) for x in m.groups())
    if part == "major":
        major, minor, patch = major + 1, 0, 0
    elif part == "minor":
        minor, patch = minor + 1, 0
    elif part == "patch":
        patch += 1
    else:
        sys.exit("--bump takes major, minor or patch")
    return "%d.%d.%d" % (major, minor, patch)


def shell_hash(paths):
    h = hashlib.sha256()
    missing = []
    for rel in sorted(paths):
        if not rel:
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
    return h.hexdigest()[:10]


src = open(SW, encoding="utf-8").read()

block = re.search(r"const CORE = \[(.*?)\];", src, re.S)
if not block:
    sys.exit("Could not find the CORE array in sw.js")
paths = re.findall(r"'\./([^']*)'", block.group(1))

version, meta = read_version()

# --set / --bump adjust version.json before stamping
if "--set" in sys.argv:
    version = sys.argv[sys.argv.index("--set") + 1].lstrip("v")
    if not re.match(r"^\d+\.\d+\.\d+$", version):
        sys.exit("--set expects MAJOR.MINOR.PATCH, e.g. 5.2.3")
    write_version(version, meta)
elif "--bump" in sys.argv:
    version = bump(version, sys.argv[sys.argv.index("--bump") + 1])
    write_version(version, meta)

# version.json is itself part of the shell, so hash it after any bump
digest = shell_hash(paths)
stamp = "alpj-v%s+%s" % (version, digest)

current = re.search(r"const VERSION = '([^']+)';", src)
if not current:
    sys.exit("Could not find VERSION in sw.js")

if current.group(1) == stamp:
    print("sw.js already current (%s, %d shell files)" % (stamp, len(paths)))
    sys.exit(0)

if "--check" in sys.argv:
    print("STALE: sw.js says %s, shell hashes to %s" % (current.group(1), stamp))
    sys.exit(1)

out = src.replace("const VERSION = '%s';" % current.group(1),
                  "const VERSION = '%s';" % stamp, 1)
with open(SW, "w", encoding="utf-8", newline="\n") as f:
    f.write(out)

print("sw.js %s -> %s  (%d shell files hashed)" % (current.group(1), stamp, len(paths)))
