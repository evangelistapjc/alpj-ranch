#!/usr/bin/env python3
"""Local dev server that refuses to let the browser cache anything.

`python -m http.server` sends no Cache-Control at all, so browsers fall back to
heuristic caching and happily serve a stale ES module after you have rebuilt.
That makes a fix look like it did not apply, which is a miserable way to debug.

Every response here carries `Cache-Control: no-store`, so a plain refresh always
picks up the newest build. The service worker still caches on top of that, so if
the page looks stale after this, it is the worker — unregister it in DevTools →
Application, or check the version chip in the footer.

    python serve.py [port]        # default 8000
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # keep the console readable — only report anything that is not a 200
        if args and len(args) > 1 and str(args[1]) != "200":
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"ALPJ Ranch on http://localhost:{port}/  (no-store; Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
