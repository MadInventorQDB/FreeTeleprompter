#!/usr/bin/env python3
"""FreeTeleprompter sync-capable Python server.

Serves static files from the repository root and provides:
- POST /sync/push
- GET  /sync/poll?channel=<id>&since=<cursor>
"""

from __future__ import annotations

import json
import os
import posixpath
import urllib.parse
from collections import defaultdict, deque
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

ROOT = os.path.dirname(os.path.abspath(__file__))
MAX_EVENTS_PER_CHANNEL = 300

cursor = 0
channels: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=MAX_EVENTS_PER_CHANNEL))


class TeleprompterHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send_json(self, payload: dict[str, Any], status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/sync/push":
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON body"}, status=HTTPStatus.BAD_REQUEST)
            return

        event = payload.get("event")
        if not isinstance(event, dict):
            self._send_json({"error": "Missing event payload"}, status=HTTPStatus.BAD_REQUEST)
            return

        channel = str(payload.get("channel") or "default")

        global cursor
        cursor += 1
        message = {"id": cursor, **event}
        channels[channel].append(message)

        self._send_json({"ok": True, "cursor": cursor})

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/sync/poll":
            query = urllib.parse.parse_qs(parsed.query)
            channel = (query.get("channel") or ["default"])[0]
            try:
                since = int((query.get("since") or ["0"])[0])
            except ValueError:
                since = 0
            events = [event for event in channels[channel] if int(event.get("id", 0)) > since]
            self._send_json({"cursor": cursor, "events": events})
            return

        # Delegate normal static file handling.
        super().do_GET()

    def translate_path(self, path: str) -> str:
        # Same behavior as SimpleHTTPRequestHandler, pinned to ROOT.
        path = path.split("?", 1)[0]
        path = path.split("#", 1)[0]
        trailing_slash = path.rstrip().endswith("/")
        path = posixpath.normpath(urllib.parse.unquote(path))
        words = [word for word in path.split("/") if word]
        final_path = ROOT
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                continue
            final_path = os.path.join(final_path, word)
        if trailing_slash:
            final_path += "/"
        return final_path


def main() -> None:
    port = int(os.environ.get("PORT", "4173"))
    server = ThreadingHTTPServer(("0.0.0.0", port), TeleprompterHandler)
    print(f"FreeTeleprompter Python server running at http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
