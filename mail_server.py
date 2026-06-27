#!/usr/bin/env python3
"""
Xedu Gmail mail server — browser setup + send API.

Run:  python3 mail_server.py  →  http://127.0.0.1:8787/

Open that URL and use the App Password form (fastest) or OAuth.
"""
from __future__ import annotations

import html as html_lib
import json
import os
import re
import urllib.parse
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import gmail_service
from scripts.gmail_env import merge_gmail_env, merge_smtp_env

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("MAIL_PORT", 8787))
HOST = os.environ.get("MAIL_HOST", "127.0.0.1")
REDIRECT_URI = f"http://{HOST}:{PORT}/oauth/callback"
PENDING_PATH = ROOT / ".xedu-oauth-pending.json"


def read_pending() -> dict:
    try:
        if PENDING_PATH.exists():
            return json.loads(PENDING_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def write_pending(data: dict) -> None:
    PENDING_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def clear_pending() -> None:
    if PENDING_PATH.exists():
        PENDING_PATH.unlink()


def setup_page(status: dict, flash: str = "") -> str:
    pending = read_pending()
    ready = status.get("ready")
    error = status.get("error") or ""
    provider = status.get("provider") or "none"
    from_addr = status.get("fromAddress") or "not set"
    smtp_user = gmail_service.SMTP_USER or ""

    status_class = "ok" if ready else "warn"
    status_text = "Connected — emails will send" if ready else "Not configured yet"

    flash_html = f"<p class='ok-msg'>{html_lib.escape(flash)}</p>" if flash else ""
    err_html = f"<p class='err'>{html_lib.escape(error)}</p>" if error and not ready and not flash else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Xedu Gmail Setup</title>
  <style>
    body {{ font-family: Poppins, Arial, sans-serif; background: #f4f8ff; color: #073861; margin: 0; padding: 2rem 1rem; }}
    .wrap {{ max-width: 580px; margin: 0 auto; display: grid; gap: 1rem; }}
    .card {{ background: #fff; border: 1px solid #dbe8ff; border-radius: 20px; padding: 1.5rem; box-shadow: 0 18px 40px rgba(7,56,97,.08); }}
    h1, h2 {{ margin: 0 0 .35rem; }}
    h1 {{ font-size: 1.55rem; }}
    h2 {{ font-size: 1.1rem; }}
    p, li {{ color: #53687f; line-height: 1.55; }}
    .pill {{ display: inline-block; padding: .35rem .75rem; border-radius: 999px; font-size: .78rem; font-weight: 700; margin-bottom: .75rem; }}
    .pill.ok {{ background: #e7f6ef; color: #16804a; }}
    .pill.warn {{ background: #fff4e5; color: #9a6700; }}
    label {{ display: block; font-size: .82rem; font-weight: 700; margin: .85rem 0 .35rem; }}
    input {{ width: 100%; box-sizing: border-box; padding: .75rem .85rem; border: 1px solid #dbe8ff; border-radius: 12px; font: inherit; }}
    button {{ margin-top: 1rem; width: 100%; padding: .85rem 1rem; border: none; border-radius: 999px; background: #073861; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }}
    button.secondary {{ background: #eef6ff; color: #073861; border: 1px solid #dbe8ff; }}
    .meta {{ margin-top: .75rem; font-size: .88rem; }}
    .meta dt {{ font-weight: 700; margin-top: .45rem; }}
    .err {{ color: #b42318; font-size: .88rem; margin-top: .75rem; }}
    .ok-msg {{ color: #16804a; font-size: .9rem; font-weight: 600; margin-top: .75rem; }}
    a {{ color: #2563eb; }}
    code {{ background: #eef6ff; padding: .1rem .35rem; border-radius: 6px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <span class="pill {status_class}">{html_lib.escape(status_text)}</span>
      <h1>Gmail setup for Xedu</h1>
      <p>Advisor level-up emails need Gmail credentials saved here. The main app cannot send until this shows <strong>Connected</strong>.</p>
      <dl class="meta">
        <dt>Provider</dt><dd>{html_lib.escape(str(provider))}</dd>
        <dt>From address</dt><dd>{html_lib.escape(from_addr)}</dd>
      </dl>
      {flash_html}{err_html}
    </div>

    <div class="card">
      <h2>Option 1 — App Password (recommended, ~2 min)</h2>
      <ol>
        <li>Turn on <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener">2-Step Verification</a></li>
        <li>Create an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">App Password</a> (Mail → Other → Xedu)</li>
        <li>Paste your Gmail + 16-character app password below</li>
      </ol>
      <form method="POST" action="/smtp/configure">
        <label for="smtp_user">Your Gmail address</label>
        <input id="smtp_user" name="smtp_user" type="email" value="{html_lib.escape(smtp_user)}" placeholder="you@gmail.com" required />
        <label for="smtp_pass">App Password (16 characters, spaces OK)</label>
        <input id="smtp_pass" name="smtp_pass" type="password" placeholder="xxxx xxxx xxxx xxxx" required />
        <label for="test_to">Send test email to (optional)</label>
        <input id="test_to" name="test_to" type="email" placeholder="Same as your Gmail is fine" />
        <button type="submit">Save &amp; test Gmail</button>
      </form>
    </div>

    <div class="card">
      <h2>Option 2 — Google OAuth (advanced)</h2>
      <p>Redirect URI: <code>{html_lib.escape(REDIRECT_URI)}</code></p>
      <form method="POST" action="/oauth/begin">
        <label for="client_id">OAuth Client ID</label>
        <input id="client_id" name="client_id" value="{html_lib.escape(pending.get('client_id', gmail_service.GMAIL_CLIENT_ID))}" />
        <label for="client_secret">OAuth Client Secret</label>
        <input id="client_secret" name="client_secret" type="password" value="{html_lib.escape(pending.get('client_secret', ''))}" />
        <label for="from_email">Sender email</label>
        <input id="from_email" name="from_email" type="email" value="{html_lib.escape(pending.get('from_email', gmail_service.GMAIL_FROM))}" />
        <button type="submit" class="secondary">Connect with Google OAuth</button>
      </form>
    </div>
  </div>
</body>
</html>"""


def success_page(message: str) -> str:
    return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f8ff;padding:2rem">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #dbe8ff;border-radius:20px;padding:1.5rem">
    <h1 style="color:#073861">Gmail connected</h1>
    <p style="color:#53687f">{html_lib.escape(message)}</p>
    <p style="color:#53687f"><a href="/">Back to setup</a> · Keep <code>python3 mail_server.py</code> running.</p>
    </div></body></html>"""


class MailHandler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, status: int, content: str) -> None:
        body = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _read_form(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        return {k: v[0] for k, v in urllib.parse.parse_qs(raw).items()}

    def do_GET(self) -> None:
        gmail_service.reload_config()
        path = self.path.split("?")[0]
        if path in ("/", "/setup"):
            status = gmail_service.verify_gmail_connection()
            return self._html(200, setup_page(status))
        if path == "/health":
            return self._json(200, {"ok": True, "service": "xedu-mail"})
        if path == "/api/status":
            status = gmail_service.verify_gmail_connection()
            return self._json(200, {"ok": True, **status, "mailServerOnline": True})
        if path == "/oauth/callback":
            return self._oauth_callback()
        self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        gmail_service.reload_config()
        path = self.path.split("?")[0]
        if path == "/smtp/configure":
            return self._smtp_configure()
        if path == "/oauth/begin":
            return self._oauth_begin()
        if path == "/api/test":
            return self._api_test()
        if path == "/api/send":
            return self._api_send()
        if path == "/api/level-up":
            return self._api_level_up()
        if path == "/api/level-up-batch":
            return self._api_level_up_batch()
        self._json(404, {"error": "Not found"})

    def _smtp_configure(self) -> None:
        form = self._read_form()
        user = (form.get("smtp_user") or "").strip()
        password = (form.get("smtp_pass") or "").replace(" ", "").strip()
        test_to = (form.get("test_to") or user).strip()

        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", user) or len(password) < 8:
            status = gmail_service.verify_gmail_connection()
            return self._html(400, setup_page({**status, "error": "Enter a valid Gmail address and App Password."}))

        merge_smtp_env({
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USER": user,
            "SMTP_PASS": password,
            "SMTP_FROM": user,
        })
        merge_gmail_env({"GMAIL_FROM": user})
        gmail_service.reload_config()

        try:
            msg = EmailMessage()
            msg["Subject"] = "Xedu Gmail test — setup successful"
            msg["From"] = user
            msg["To"] = test_to
            msg.set_content(
                "Gmail is configured for Xedu.\n\n"
                "Advisor level-up emails will send when students reach a new XP level."
            )
            provider = gmail_service.send_message(msg)
            flash = f"Connected via {provider}. Test email sent to {test_to}."
            print(f"[mail_server] SMTP configured; test sent to {test_to}")
            return self._html(200, success_page(flash))
        except Exception as exc:
            print(f"[mail_server] SMTP saved but test failed: {exc}")
            status = gmail_service.verify_gmail_connection()
            return self._html(200, setup_page(status, flash=f"Saved, but test email failed: {exc}"))

    def _oauth_begin(self) -> None:
        form = self._read_form()
        client_id = (form.get("client_id") or "").strip()
        client_secret = (form.get("client_secret") or "").strip()
        from_email = (form.get("from_email") or "").strip()
        if not client_id or not client_secret or not from_email:
            return self._html(400, setup_page({**gmail_service.verify_gmail_connection(), "error": "All OAuth fields are required."}))

        write_pending({"client_id": client_id, "client_secret": client_secret, "from_email": from_email})
        url = gmail_service.build_oauth_url(client_id, REDIRECT_URI)
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()

    def _oauth_callback(self) -> None:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if query.get("error"):
            err = (query.get("error") or [""])[0]
            return self._html(400, setup_page({**gmail_service.verify_gmail_connection(), "error": f"Google OAuth error: {err}"}))

        code = (query.get("code") or [""])[0]
        pending = read_pending()
        client_id = pending.get("client_id", "")
        client_secret = pending.get("client_secret", "")
        from_email = pending.get("from_email", "")
        if not code or not client_id or not client_secret or not from_email:
            return self._html(400, setup_page({**gmail_service.verify_gmail_connection(), "error": "OAuth session expired. Try again."}))

        try:
            token_data = gmail_service.exchange_auth_code(client_id, client_secret, code, REDIRECT_URI)
            refresh_token = token_data.get("refresh_token")
            if not refresh_token:
                raise RuntimeError("No refresh token returned. Remove app access in Google Account and retry.")
            merge_gmail_env({
                "GMAIL_CLIENT_ID": client_id,
                "GMAIL_CLIENT_SECRET": client_secret,
                "GMAIL_REFRESH_TOKEN": refresh_token,
                "GMAIL_FROM": from_email,
            })
            gmail_service.reload_config()
            gmail_service.get_gmail_access_token()
            clear_pending()
            print("[mail_server] Gmail API connected via OAuth")
            return self._html(200, success_page("OAuth connected. Advisor emails are ready."))
        except Exception as exc:
            print(f"[mail_server] OAuth failed: {exc}")
            return self._html(500, setup_page({**gmail_service.verify_gmail_connection(), "error": str(exc)}))

    def _api_test(self) -> None:
        data = self._read_json()
        to_addr = (data.get("to") or data.get("email") or "").strip().lower()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", to_addr):
            return self._json(400, {"error": "Valid recipient email required."})
        status = gmail_service.verify_gmail_connection()
        if not status.get("ready"):
            return self._json(503, {"error": status.get("error") or "Email not configured. Open http://127.0.0.1:8787/", **status})
        msg = EmailMessage()
        msg["Subject"] = "Xedu Gmail test"
        msg["From"] = gmail_service.GMAIL_FROM or gmail_service.SMTP_FROM
        msg["To"] = to_addr
        msg.set_content("Test email from the Xedu mail server.")
        try:
            provider = gmail_service.send_message(msg)
        except Exception as exc:
            return self._json(500, {"error": str(exc), **status})
        print(f"[mail_server] Test email sent to {to_addr} via {provider}")
        return self._json(200, {"ok": True, "sent": True, "to": to_addr, "provider": provider, **status})

    def _api_send(self) -> None:
        data = self._read_json()
        to_addr = (data.get("to") or "").strip()
        subject = (data.get("subject") or "Xedu notification").strip()
        text = (data.get("text") or data.get("body") or "").strip()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", to_addr) or not text:
            return self._json(400, {"error": "Fields 'to' and 'text' are required."})
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = gmail_service.GMAIL_FROM or gmail_service.SMTP_FROM
        msg["To"] = to_addr
        msg.set_content(text)
        html_body = (data.get("html") or "").strip()
        if html_body:
            msg.add_alternative(html_body, subtype="html")
        try:
            provider = gmail_service.send_message(msg)
        except Exception as exc:
            return self._json(500, {"error": str(exc)})
        return self._json(200, {"ok": True, "sent": True, "provider": provider})

    def _api_level_up(self) -> None:
        try:
            result = gmail_service.notify_level_up_payload(self._read_json())
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        except Exception as exc:
            return self._json(500, {"error": str(exc)})
        return self._json(200, result)

    def _api_level_up_batch(self) -> None:
        data = self._read_json()
        profile = {
            "studentName": data.get("studentName"),
            "studentEmail": data.get("studentEmail"),
            "advisorEmails": data.get("advisorEmails") or [],
            "meetingTranscript": data.get("transcriptExcerpt") or "",
        }
        previous_level = int(data.get("previousLevel") or 1)
        new_level = int(data.get("newLevel") or previous_level)
        total_xp = int(data.get("totalXp") or 0)
        notified_levels = set(int(x) for x in (data.get("notifiedLevels") or []) if str(x).isdigit())
        result = gmail_service.send_level_up_emails(profile, previous_level, new_level, total_xp, notified_levels)
        result["ok"] = True
        result["notifiedLevels"] = sorted(notified_levels)
        return self._json(200, result)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[mail_server] {fmt % args}")


if __name__ == "__main__":
    gmail_service.reload_config()
    status = gmail_service.verify_gmail_connection()
    server = HTTPServer((HOST, PORT), MailHandler)
    print(f"\n  ✦ Xedu Gmail setup: http://{HOST}:{PORT}/\n")
    if status.get("ready"):
        print(f"  Ready via {status.get('provider')} ({status.get('fromAddress')})\n")
    else:
        print("  ⚠ Gmail NOT configured — open the URL above and use Option 1 (App Password)\n")
    print("  Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
