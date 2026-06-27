"""
XEdu email service — Gmail SMTP (App Password) with duplicate protection.

Environment variables (read from os.environ or .env.local):
  EMAIL_USER          — Gmail address used to send
  EMAIL_APP_PASSWORD  — Gmail App Password (16 chars)
  APP_URL             — Base URL for links in emails (default http://localhost:3000)
  PORT                — App server port (default 3000)
"""
from __future__ import annotations

import html
import json
import os
import re
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
EMAIL_LOG_PATH = ROOT / ".xedu-email-log.json"
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _clean_env_value(raw: str) -> str:
    value = raw.strip()
    if "#" in value and not (value.startswith('"') or value.startswith("'")):
        value = value.split("#", 1)[0].strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1]
    return value


def load_env_file(path: Path = ENV_PATH) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = _clean_env_value(v)
    return env


def _env(key: str, default: str = "") -> str:
    file_env = load_env_file()
    return os.environ.get(key) or file_env.get(key, default)


EMAIL_USER = ""
EMAIL_APP_PASSWORD = ""
APP_URL = ""


def reload_config() -> None:
    global EMAIL_USER, EMAIL_APP_PASSWORD, APP_URL
    port = _env("PORT", "3000")
    EMAIL_USER = (
        _env("EMAIL_USER")
        or _env("SMTP_USER")
        or _env("GMAIL_FROM")
    )
    EMAIL_APP_PASSWORD = (
        _env("EMAIL_APP_PASSWORD")
        or _env("SMTP_PASS")
    )
    APP_URL = _env("APP_URL") or f"http://localhost:{port}"


reload_config()


def is_configured() -> bool:
    reload_config()
    return bool(EMAIL_USER and EMAIL_APP_PASSWORD and EMAIL_RE.match(EMAIL_USER))


def config_status() -> dict:
    reload_config()
    ready = is_configured()
    return {
        "configured": ready,
        "gmailConfigured": ready,
        "smtpConfigured": ready,
        "provider": "gmail_smtp" if ready else None,
        "fromAddress": EMAIL_USER or None,
        "ready": ready,
        "tokenOk": ready,
        "error": None if ready else "Missing EMAIL_USER or EMAIL_APP_PASSWORD in .env.local",
    }


def verify_connection() -> dict:
    status = config_status()
    if not status["ready"]:
        return status
    try:
        with _smtp_connection() as smtp:
            smtp.noop()
        status["error"] = None
    except Exception as exc:
        status["ready"] = False
        status["error"] = str(exc)
    return status


def _smtp_ssl_context() -> ssl.SSLContext:
    """Build TLS context; certifi fixes macOS Python SSL verify failures."""
    ctx = ssl.create_default_context()
    try:
        import certifi

        ctx.load_verify_locations(certifi.where())
    except ImportError:
        pass
    return ctx


def _smtp_connection():
    ctx = _smtp_ssl_context()
    smtp = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
    smtp.starttls(context=ctx)
    smtp.login(EMAIL_USER, EMAIL_APP_PASSWORD.replace(" ", ""))
    return smtp


def read_notification_log() -> set[str]:
    try:
        if not EMAIL_LOG_PATH.exists():
            return set()
        data = json.loads(EMAIL_LOG_PATH.read_text(encoding="utf-8"))
        return set(data if isinstance(data, list) else [])
    except Exception:
        return set()


def write_notification_log(keys: set[str]) -> None:
    EMAIL_LOG_PATH.write_text(json.dumps(sorted(keys), indent=2), encoding="utf-8")


def notification_key(student_email: str, student_name: str, advisor_email: str, level: int) -> str:
    student_id = (student_email or student_name or "student").strip().lower()
    return f"{student_id}|{advisor_email.strip().lower()}|level:{int(level)}"


def normalize_advisor_emails(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    clean: list[str] = []
    for email in raw:
        value = str(email).strip().lower()
        if value and EMAIL_RE.match(value) and value not in clean:
            clean.append(value)
    return clean


def validate_notify_payload(data: dict) -> tuple[dict, Optional[str]]:
    if not isinstance(data, dict):
        return {}, "Invalid JSON body."

    student_name = (data.get("studentName") or "").strip()
    student_email = (data.get("studentEmail") or "").strip().lower()
    advisor_emails = normalize_advisor_emails(data.get("advisorEmails") or [])
    level = int(data.get("level") or 0)
    total_xp = int(data.get("totalXp") or data.get("xp") or 0)
    previous_level = int(data.get("previousLevel") or max(1, level - 1))

    if len(student_name) < 2:
        return {}, "studentName is required (min 2 characters)."
    if level < 1:
        return {}, "level must be a positive integer."
    if total_xp < 0:
        return {}, "xp must be zero or greater."
    if not advisor_emails:
        return {}, "At least one valid advisor email is required."
    if student_email and not EMAIL_RE.match(student_email):
        return {}, "studentEmail is not a valid email address."

    return {
        "studentName": student_name,
        "studentEmail": student_email,
        "advisorEmails": advisor_emails,
        "level": level,
        "totalXp": total_xp,
        "previousLevel": previous_level,
        "transcriptExcerpt": (data.get("transcriptExcerpt") or "")[:1200],
    }, None


def build_level_up_email(
    *,
    student_name: str,
    student_email: str,
    advisor_email: str,
    level: int,
    total_xp: int,
    previous_level: int,
) -> EmailMessage:
    reload_config()
    reached_at = datetime.now().strftime("%A, %B %d, %Y at %I:%M %p")
    progress_url = f"{APP_URL.rstrip('/')}/rewards.html"
    safe_name = html.escape(student_name)
    safe_student_email = html.escape(student_email or "Not provided")

    subject = "🎉 Student Level Up – XEdu"

    plain = f"""Hello,

Great news — {student_name} has reached Level {level} on XEdu!

Student: {student_name}
Level: {previous_level} → {level}
Total XP: {total_xp:,}
Reached: {reached_at}
Student email: {student_email or 'Not provided'}

Please congratulate them on their continued progress.

View progress: {progress_url}

— XEdu Self Assessment Tool
"""

    body_html = f"""\
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Student Level Up – XEdu</title>
</head>
<body style="margin:0;padding:0;background:#eef4fb;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#0f2742;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe8ff;border-radius:24px;overflow:hidden;box-shadow:0 20px 50px rgba(7,56,97,.12);">
          <tr>
            <td style="padding:32px 32px 24px;background:linear-gradient(135deg,#073861 0%,#1d7fe8 100%);color:#ffffff;">
              <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85;margin-bottom:10px;">Xedu Level Update</div>
              <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:800;">🎉 {safe_name} leveled up!</h1>
              <p style="margin:12px 0 0;font-size:16px;line-height:1.55;opacity:.92;">Congratulations — your student has reached a new milestone.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px 18px;border-radius:18px;background:#f7fbff;border:1px solid #e3edff;">
                    <div style="font-size:11px;font-weight:700;color:#6a7d91;text-transform:uppercase;letter-spacing:.07em;">Student</div>
                    <div style="font-size:20px;font-weight:800;color:#073861;margin-top:6px;">{safe_name}</div>
                  </td>
                </tr>
                <tr><td style="height:12px;"></td></tr>
                <tr>
                  <td style="padding:16px 18px;border-radius:18px;background:#f7fbff;border:1px solid #e3edff;">
                    <div style="font-size:11px;font-weight:700;color:#6a7d91;text-transform:uppercase;letter-spacing:.07em;">Current level</div>
                    <div style="font-size:22px;font-weight:800;color:#073861;margin-top:6px;">Level {previous_level} → Level {level}</div>
                  </td>
                </tr>
                <tr><td style="height:12px;"></td></tr>
                <tr>
                  <td style="padding:16px 18px;border-radius:18px;background:#f7fbff;border:1px solid #e3edff;">
                    <div style="font-size:11px;font-weight:700;color:#6a7d91;text-transform:uppercase;letter-spacing:.07em;">Total XP</div>
                    <div style="font-size:22px;font-weight:800;color:#073861;margin-top:6px;">{total_xp:,} XP</div>
                  </td>
                </tr>
                <tr><td style="height:12px;"></td></tr>
                <tr>
                  <td style="padding:16px 18px;border-radius:18px;background:#f7fbff;border:1px solid #e3edff;">
                    <div style="font-size:11px;font-weight:700;color:#6a7d91;text-transform:uppercase;letter-spacing:.07em;">Date &amp; time</div>
                    <div style="font-size:16px;font-weight:700;color:#073861;margin-top:6px;">{html.escape(reached_at)}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:15px;line-height:1.65;color:#53687f;">
                {safe_name} is making real progress. A quick note of encouragement from you can make a big difference.
              </p>
              <p style="margin:10px 0 0;font-size:14px;color:#53687f;">Student email: <strong style="color:#073861;">{safe_student_email}</strong></p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 0;">
                <tr>
                  <td style="border-radius:999px;background:#073861;">
                    <a href="{html.escape(progress_url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">View Student Progress</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#f7fbff;border-top:1px solid #e6efff;font-size:12px;color:#6a7d91;line-height:1.5;">
              XEdu Self Assessment Tool · Automated advisor notification<br />
              You received this because you were listed as an advisor for this student.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = advisor_email
    msg.set_content(plain)
    msg.add_alternative(body_html, subtype="html")
    return msg


def send_message(msg: EmailMessage) -> None:
    if not is_configured():
        raise RuntimeError(
            "Email not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD in .env.local — see GMAIL_SETUP.md"
        )
    with _smtp_connection() as smtp:
        smtp.send_message(msg)


def send_test_email(to_addr: str) -> dict:
    to_addr = to_addr.strip().lower()
    if not EMAIL_RE.match(to_addr):
        raise ValueError("Invalid recipient email address.")
    msg = EmailMessage()
    msg["Subject"] = "XEdu Gmail test"
    msg["From"] = EMAIL_USER
    msg["To"] = to_addr
    msg.set_content("Gmail SMTP is configured correctly for XEdu.")
    send_message(msg)
    return {"ok": True, "sent": True, "to": to_addr, "provider": "gmail_smtp"}


def notify_level_up(data: dict, *, notified_levels: set[int] | None = None) -> dict:
    """Send level-up emails to all advisors. Skips duplicates via server-side log + notified_levels."""
    payload, err = validate_notify_payload(data)
    if err:
        raise ValueError(err)

    if not is_configured():
        return {
            "ok": False,
            "sent": 0,
            "failed": [],
            "skipped": ["Email credentials not configured"],
            "skippedDuplicates": [],
            "provider": None,
            "message": "Unable to notify advisor — email not configured.",
        }

    student_name = payload["studentName"]
    student_email = payload["studentEmail"]
    advisor_emails = payload["advisorEmails"]
    level = payload["level"]
    total_xp = payload["totalXp"]
    previous_level = payload["previousLevel"]

    sent = 0
    failed: list[dict] = []
    skipped_duplicates: list[str] = []
    log = read_notification_log()
    notified_levels = notified_levels if notified_levels is not None else set()

    if level in notified_levels:
        return {
            "ok": True,
            "sent": 0,
            "failed": [],
            "skipped": [f"Level {level} already notified for this student"],
            "skippedDuplicates": advisor_emails,
            "provider": "gmail_smtp",
            "message": "Advisor already notified for this level.",
        }

    for advisor_email in advisor_emails:
        key = notification_key(student_email, student_name, advisor_email, level)
        if key in log:
            skipped_duplicates.append(advisor_email)
            continue
        msg = build_level_up_email(
            student_name=student_name,
            student_email=student_email,
            advisor_email=advisor_email,
            level=level,
            total_xp=total_xp,
            previous_level=previous_level,
        )
        try:
            send_message(msg)
            sent += 1
            log.add(key)
            write_notification_log(log)
            print(f"[email] Sent level {level} notification to {advisor_email} for {student_name}")
        except Exception as exc:
            print(f"[email] Failed to send to {advisor_email}: {exc}")
            failed.append({"email": advisor_email, "error": str(exc)})

    if sent > 0:
        notified_levels.add(level)

    message = "✓ Advisor notified successfully" if sent > 0 else (
        "Advisor already notified for this level." if skipped_duplicates else "Unable to notify advisor"
    )

    return {
        "ok": sent > 0 or bool(skipped_duplicates),
        "sent": sent,
        "failed": failed,
        "skipped": [],
        "skippedDuplicates": skipped_duplicates,
        "provider": "gmail_smtp",
        "message": message,
        "notifiedLevels": sorted(notified_levels),
    }


def notify_level_up_batch(
    profile: dict,
    previous_level: int,
    new_level: int,
    total_xp: int,
    notified_levels: set[int] | None = None,
) -> dict:
    """Notify for each new level between previous_level and new_level (inclusive of new)."""
    notified_levels = notified_levels if notified_levels is not None else set()
    aggregate = {"sent": 0, "failed": [], "skipped": [], "skippedDuplicates": [], "provider": "gmail_smtp"}

    if not is_configured():
        aggregate["skipped"] = ["Email credentials not configured"]
        aggregate["message"] = "Unable to notify advisor — configure EMAIL_USER and EMAIL_APP_PASSWORD."
        return aggregate

    student_name = (profile.get("studentName") or "Student").strip()
    student_email = (profile.get("studentEmail") or "").strip()
    advisor_emails = profile.get("advisorEmails") or []
    if not normalize_advisor_emails(advisor_emails):
        aggregate["skipped"] = ["No advisor emails configured"]
        aggregate["message"] = "Unable to notify advisor — no advisor emails on file."
        return aggregate

    for level in range(previous_level + 1, new_level + 1):
        result = notify_level_up(
            {
                "studentName": student_name,
                "studentEmail": student_email,
                "advisorEmails": advisor_emails,
                "level": level,
                "totalXp": total_xp,
                "previousLevel": previous_level,
            },
            notified_levels=notified_levels,
        )
        aggregate["sent"] += result.get("sent", 0)
        aggregate["failed"].extend(result.get("failed") or [])
        aggregate["skipped"].extend(result.get("skipped") or [])
        aggregate["skippedDuplicates"].extend(result.get("skippedDuplicates") or [])

    aggregate["ok"] = aggregate["sent"] > 0 or bool(aggregate["skippedDuplicates"])
    aggregate["message"] = (
        "✓ Advisor notified successfully" if aggregate["sent"] > 0
        else "Advisor already notified for this level." if aggregate["skippedDuplicates"]
        else "Unable to notify advisor"
    )
    aggregate["notifiedLevels"] = sorted(notified_levels)
    return aggregate
