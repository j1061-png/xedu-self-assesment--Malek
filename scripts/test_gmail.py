#!/usr/bin/env python3
"""Send a test email via the Xedu Gmail mail server."""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_MAIL_URL = "http://127.0.0.1:8787"


def main() -> None:
    parser = argparse.ArgumentParser(description="Send a test email through mail_server.py")
    parser.add_argument("--to", required=True, help="Recipient email address")
    parser.add_argument("--url", default=DEFAULT_MAIL_URL, help="Mail server base URL")
    args = parser.parse_args()

    payload = json.dumps({"to": args.to.strip()}).encode("utf-8")
    req = urllib.request.Request(
        f"{args.url.rstrip('/')}/api/test",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Mail server error ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Mail server not running at {args.url}. Start it with: python3 mail_server.py"
        ) from exc

    if data.get("error"):
        raise SystemExit(data["error"])
    print(f"Test email sent to {data.get('to')} via {data.get('provider')}")


if __name__ == "__main__":
    main()
