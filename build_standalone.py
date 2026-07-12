#!/usr/bin/env python3
"""Bakes all JSON data into a single self-contained HTML file that works
without a server (double-click / phone). Run after build_data.py."""
import json, os
idx = json.load(open('data/index.json'))
home = json.load(open('data/home.json'))
plants = [json.load(open('data/' + p)) for p in idx['plants']]
html = open('index.html', encoding='utf-8').read()
embed = "<script>window.EMBEDDED_DATA=" + json.dumps({"home": home, "plants": plants}, ensure_ascii=False) + ";</script>\n"
anchor = "<script>\n/* ============ storage shim"
html = html.replace(anchor, embed + anchor, 1)
html = html.replace('<link rel="manifest" href="manifest.webmanifest" />\n', '')
html = html.replace('<link rel="apple-touch-icon" href="icons/icon-180.png" />\n', '')
open('alpj-ranch-standalone.html', 'w', encoding='utf-8').write(html)
print("Wrote alpj-ranch-standalone.html", len(html), "bytes")
