#!/usr/bin/env python3
"""Configure Gmail for Xedu — SMTP (fast) or open OAuth setup page."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
MAIL_URL = os.environ.get("MAIL_SERVER_URL", "http://127.0.0.1:8787").rstrip("/")


def read_env() -> dict[str, str]:
    data: dict[str, str] = {}
    if not ENV_PATH.exists():
        return data
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        data[k.strip()] = v.strip()
    return data


def write_env(updates: dict[str, str]) -> None:
    current = read_env()
    current.update({k: v for k, v in updates.items() if v is not None})
    lines = [
        f"DEEPSEEK_API_KEY={current.get('DEEPSEEK_API_KEY', '')}",
        "",
        f"MAIL_SERVER_URL={current.get('MAIL_SERVER_URL', MAIL_URL)}",
        "",
        "# Gmail API (optional — use mail server OAuth page)",
        f"GMAIL_CLIENT_ID={current.get('GMAIL_CLIENT_ID', '')}",
        f"GMAIL_CLIENT_SECRET={current.get('GMAIL_CLIENT_SECRET', '')}",
        f"GMAIL_REFRESH_TOKEN={current.get('GMAIL_REFRESH_TOKEN', '')}",
        f"GMAIL_FROM={current.get('GMAIL_FROM', current.get('SMTP_FROM', ''))}",
        "",
        "# Gmail SMTP (App Password — https://myaccount.google.com/apppasswords)",
        f"SMTP_HOST={current.get('SMTP_HOST', 'smtp.gmail.com')}",
        f"SMTP_PORT={current.get('SMTP_PORT', '587')}",
        f"SMTP_USER={current.get('SMTP_USER', '')}",
        f"SMTP_PASS={current.get('SMTP_PASS', '')}",
        f"SMTP_FROM={current.get('SMTP_FROM', current.get('SMTP_USER', ''))}",
        "",
    ]
    ENV_PATH.write_text("\n".join(lines), encoding="utf-8")


def mail_status() -> dict:
    try:
        with urllib.request.urlopen(f"{MAIL_URL}/api/status", timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return {"ok": False, "error": str(exc), "mailServerOnline": False}


def test_send(to_addr: str) -> dict:
    payload = json.dumps({"to": to_addr}).encode("utf-8")
    req = urllib.request.Request(
        f"{MAIL_URL}/api/test",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return json.loads(exc.read().decode("utf-8", errors="replace"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Configure Gmail for Xedu")
    parser.add_argument("--smtp-user", help="Your Gmail address")
    parser.add_argument("--smtp-pass", help="Gmail App Password (16 chars)")
    parser.add_argument("--from-email", help="Sender address (defaults to smtp-user)")
    parser.add_argument("--test-to", help="Send test email to this address after setup")
    parser.add_argument("--oauth", action="store_true", help="Open OAuth setup page instead")
    args = parser.parse_args()

    if args.oauth or not (args.smtp_user and args.smtp_pass):
        print(f"\nOpen {MAIL_URL}/ to connect Gmail with Google OAuth.")
        print("Google Cloud redirect URI: http://127.0.0.1:8787/oauth/callback\n")
        webbrowser.open(f"{MAIL_URL}/")
        status = mail_status()
        if status.get("mailServerOnline") is False and "error" in status:
            print(f"Mail server not running. Start it:\n  python3 mail_server.py\n")
            raise SystemExit(1)
        if not (args.smtp_user and args.smtp_pass):
            raise SystemExit(0)

    user = args.smtp_user.strip()
    password = args.smtp_pass.replace(" ", "").strip()
    from_addr = (args.from_email or user).strip()
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", user):
        raise SystemExit("Invalid --smtp-user email.")

    write_env({
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "587",
        "SMTP_USER": user,
        "SMTP_PASS": password,
        "SMTP_FROM": from_addr,
        "GMAIL_FROM": from_addr,
    })
    print(f"Saved SMTP settings to {ENV_PATH}")

    # Reload mail server config by hitting status (mail_server loads .env.local on reload_config at startup)
    print("Restart mail_server.py if it was already running, then test:")
    print(f"  curl -X POST {MAIL_URL}/api/test -H 'Content-Type: application/json' -d '{{\"to\":\"{from_addr}\"}}'")

    test_to = (args.test_to or from_addr).strip()
    result = test_send(test_to)
    if result.get("sent"):
        print(f"\nTest email sent to {test_to} via {result.get('provider')}")
    elif result.get("error"):
        print(f"\nTest failed: {result['error']}")
        print("Restart mail server: python3 mail_server.py")


if __name__ == "__main__":
    main()
