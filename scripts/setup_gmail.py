#!/usr/bin/env python3
"""Gmail API one-time setup for Xedu advisor level-up emails.

Google Cloud steps (do once):
  1. https://console.cloud.google.com/apis/library/gmail.googleapis.com → Enable
  2. OAuth consent screen → External → add your email as test user
  3. Credentials → Create OAuth client ID → Web application
  4. Authorized redirect URI: http://127.0.0.1:8765/

Then run:
  python3 scripts/setup_gmail.py

This opens Google sign-in, saves tokens to .env.local, and verifies the connection.
"""
from __future__ import annotations

import argparse
import json
import ssl
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.gmail_env import ENV_PATH, merge_gmail_env, gmail_env_status  # noqa: E402

REDIRECT_URI = "http://127.0.0.1:8765/"
SCOPE = "https://www.googleapis.com/auth/gmail.send"
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
CALLBACK_PORT = 8765


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    auth_code: str | None = None
    auth_error: str | None = None

    def do_GET(self) -> None:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if query.get("error"):
            OAuthCallbackHandler.auth_error = (query.get("error") or [""])[0]
            body = b"<h1>Authorization failed.</h1><p>Close this tab and check the terminal.</p>"
        else:
            OAuthCallbackHandler.auth_code = (query.get("code") or [""])[0]
            body = b"<h1>Gmail connected!</h1><p>You can close this tab and return to the terminal.</p>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        return


def prompt(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or default


def exchange_code(client_id: str, client_secret: str, code: str) -> dict:
    payload = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode("utf-8")
    req = urllib.request.Request(
        TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Token exchange failed ({exc.code}): {detail}") from exc


def wait_for_auth_code() -> str:
    OAuthCallbackHandler.auth_code = None
    OAuthCallbackHandler.auth_error = None
    server = HTTPServer(("127.0.0.1", CALLBACK_PORT), OAuthCallbackHandler)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()
    thread.join(timeout=300)
    server.server_close()

    if OAuthCallbackHandler.auth_error:
        raise SystemExit(f"Google OAuth error: {OAuthCallbackHandler.auth_error}")
    if not OAuthCallbackHandler.auth_code:
        raise SystemExit("Timed out waiting for Google authorization. Try again.")
    return OAuthCallbackHandler.auth_code


def verify_refresh_token(client_id: str, client_secret: str, refresh_token: str) -> None:
    payload = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode("utf-8")
    req = urllib.request.Request(
        TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not data.get("access_token"):
        raise SystemExit("Refresh token check failed — no access token returned.")


def print_intro() -> None:
    print("\n=== Xedu Gmail API setup ===\n")
    print("Before running this script, in Google Cloud Console:")
    print("  • Enable Gmail API")
    print("  • Create OAuth Web client")
    print(f"  • Add redirect URI: {REDIRECT_URI}")
    print("  • Add your Google account as a test user on the OAuth consent screen\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Set up Gmail API for Xedu advisor emails")
    parser.add_argument("--client-id", help="Google OAuth client ID")
    parser.add_argument("--client-secret", help="Google OAuth client secret")
    parser.add_argument("--from-email", help="Sender Gmail address (GMAIL_FROM)")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation before writing .env.local")
    args = parser.parse_args()

    print_intro()
    status = gmail_env_status()
    if any(status.values()):
        print("Existing Gmail keys in .env.local:")
        for key, ok in status.items():
            print(f"  {key}: {'set' if ok else 'missing'}")
        print()

    client_id = args.client_id or prompt("GMAIL_CLIENT_ID")
    client_secret = args.client_secret or prompt("GMAIL_CLIENT_SECRET")
    gmail_from = args.from_email or prompt("GMAIL_FROM (sender email)")

    params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    })
    auth_url = f"{AUTH_URL}?{params}"

    print(f"\nListening on {REDIRECT_URI}")
    print("Opening browser for Google sign-in…\n")
    webbrowser.open(auth_url)

    code = wait_for_auth_code()
    token_data = exchange_code(client_id, client_secret, code)
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        raise SystemExit(
            "No refresh token returned. In Google Account → Security → Third-party access, "
            "remove this app and run setup again."
        )

    print("Verifying refresh token…")
    verify_refresh_token(client_id, client_secret, refresh_token)
    print("Gmail API connection verified.\n")

    updates = {
        "GMAIL_CLIENT_ID": client_id,
        "GMAIL_CLIENT_SECRET": client_secret,
        "GMAIL_REFRESH_TOKEN": refresh_token,
        "GMAIL_FROM": gmail_from,
    }

    if not args.yes:
        confirm = input(f"Write Gmail keys to {ENV_PATH}? [Y/n] ").strip().lower()
        if confirm not in ("", "y", "yes"):
            print("\nSkipped writing .env.local. Add these manually:\n")
            for key, value in updates.items():
                print(f"{key}={value}")
            return

    merge_gmail_env(updates)
    print(f"Saved Gmail API credentials to {ENV_PATH}")
    print("\nNext steps:")
    print("  1. Restart the server: python3 server.py")
    print("  2. Test email: python3 scripts/test_gmail.py --to advisor@example.com")
    print("  3. Or check status: curl http://localhost:3000/api/email/status\n")


if __name__ == "__main__":
    main()
