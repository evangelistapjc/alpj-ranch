#!/usr/bin/env python3
"""Compiles resources/scss/main.scss → resources/css/stylesheet.css.

The canonical compiler is Dart Sass (that's what .github/workflows/deploy.yml
runs). This script is the no-Node fallback for local work:

    pip install libsass
    python build_css.py

libsass predates the Sass module system and does not understand `@use`, so the
entry file is rewritten to `@import` in memory before compiling. The partials
themselves use no namespaces or module features, so both compilers produce the
same CSS — main.scss stays `@use` for Dart Sass and is never modified on disk.
"""
import os
import re
import sys

try:
    import sass
except ImportError:
    sys.exit("libsass not installed.  pip install libsass   (or use: sass resources/scss/main.scss resources/css/stylesheet.css)")

BASE = os.path.dirname(os.path.abspath(__file__))
SCSS = os.path.join(BASE, "resources", "scss")
OUT = os.path.join(BASE, "resources", "css", "stylesheet.css")

entry = open(os.path.join(SCSS, "main.scss"), encoding="utf-8").read()
entry = re.sub(r"@use\s+(['\"])(.+?)\1", r"@import \1\2\1", entry)

css = sass.compile(string=entry, include_paths=[SCSS], output_style="compressed")

if "@use" in css or "@import" in css:
    sys.exit("Compile failed: partials were not inlined.\n" + css[:200])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(css)

print(f"Wrote {os.path.relpath(OUT, BASE)}  ({len(css):,} bytes)")
