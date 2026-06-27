"""HTTP client for the Xedu Gmail mail server."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import gmail_service

MAIL_SERVER_URL = (os.environ.get("MAIL_SERVER_URL") or "http://127.0.0.1:8787").rstrip("/")


def _post(path: str, payload: dict, timeout: int = 30) -> dict | None:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{MAIL_SERVER_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def _get(path: str, timeout: int = 10) -> dict | None:
    req = urllib.request.Request(f"{MAIL_SERVER_URL}{path}", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def is_online() -> bool:
    data = _get("/health", timeout=3)
    return bool(data and data.get("ok"))


def get_status() -> dict:
    data = _get("/api/status")
    if data:
        return data
    return {"ok": True, **gmail_service.verify_gmail_connection(), "mailServerOnline": False}


def send_test(to_addr: str) -> dict:
    data = _post("/api/test", {"to": to_addr})
    if data:
        return data
    msg = gmail_service.EmailMessage()
    msg["Subject"] = "Xedu Gmail test"
    msg["From"] = gmail_service.GMAIL_FROM or gmail_service.SMTP_FROM
    msg["To"] = to_addr
    msg.set_content("Test email from Xedu (local fallback).")
    provider = gmail_service.send_message(msg)
    return {"ok": True, "sent": True, "to": to_addr, "provider": provider, "fallback": True}


def notify_level_up(data: dict) -> dict:
    result = _post("/api/level-up", data)
    if result:
        return result
    return gmail_service.notify_level_up_payload(data)


def send_level_up_emails(profile: dict, previous_level: int, new_level: int, total_xp: int, notified_levels: set) -> dict:
    payload = {
        "studentName": profile.get("studentName"),
        "studentEmail": profile.get("studentEmail"),
        "advisorEmails": profile.get("advisorEmails") or [],
        "previousLevel": previous_level,
        "newLevel": new_level,
        "totalXp": total_xp,
        "transcriptExcerpt": (profile.get("meetingTranscript") or "")[:1200],
        "notifiedLevels": sorted(notified_levels),
    }
    result = _post("/api/level-up-batch", payload)
    if result:
        updated = result.get("notifiedLevels")
        if isinstance(updated, list):
            notified_levels.clear()
            notified_levels.update(int(x) for x in updated if str(x).isdigit())
        return result
    local = gmail_service.send_level_up_emails(profile, previous_level, new_level, total_xp, notified_levels)
    local["fallback"] = True
    return local
