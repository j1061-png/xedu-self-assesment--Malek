"""Gmail API + SMTP email service for Xedu advisor notifications."""
from __future__ import annotations

import base64
import html
import json
import os
import re
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent
EMAIL_LOG_PATH = ROOT / ".xedu-email-log.json"
SCOPE = "https://www.googleapis.com/auth/gmail.send"


def make_ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl._create_unverified_context()


def clean_env_value(value: str) -> str:
    value = value.strip()
    if "#" in value and not (value.startswith('"') or value.startswith("'")):
        value = value.split("#", 1)[0].strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1]
    return value


def load_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = clean_env_value(v)
    return env


ENV_PATH = ROOT / ".env.local"
ENV = load_env(ENV_PATH)

GMAIL_CLIENT_ID = ""
GMAIL_CLIENT_SECRET = ""
GMAIL_REFRESH_TOKEN = ""
GMAIL_FROM = ""
SMTP_USER = ""
SMTP_PASS = ""
SMTP_HOST = ""
SMTP_PORT = 587
SMTP_FROM = ""


def reload_config() -> None:
    global ENV, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM
    global SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT, SMTP_FROM

    ENV = load_env(ENV_PATH)
    GMAIL_CLIENT_ID = os.environ.get("GMAIL_CLIENT_ID") or ENV.get("GMAIL_CLIENT_ID", "")
    GMAIL_CLIENT_SECRET = os.environ.get("GMAIL_CLIENT_SECRET") or ENV.get("GMAIL_CLIENT_SECRET", "")
    GMAIL_REFRESH_TOKEN = os.environ.get("GMAIL_REFRESH_TOKEN") or ENV.get("GMAIL_REFRESH_TOKEN", "")
    SMTP_USER = os.environ.get("SMTP_USER") or ENV.get("SMTP_USER", "")
    SMTP_PASS = os.environ.get("SMTP_PASS") or ENV.get("SMTP_PASS", "")
    SMTP_HOST = os.environ.get("SMTP_HOST") or ENV.get("SMTP_HOST", "")
    SMTP_PORT = int(os.environ.get("SMTP_PORT") or ENV.get("SMTP_PORT", "587"))
    SMTP_FROM = os.environ.get("SMTP_FROM") or ENV.get("SMTP_FROM", SMTP_USER)
    GMAIL_FROM = os.environ.get("GMAIL_FROM") or ENV.get("GMAIL_FROM", SMTP_FROM or SMTP_USER)
    if not SMTP_HOST and SMTP_USER.lower().endswith("@gmail.com"):
        SMTP_HOST = "smtp.gmail.com"


reload_config()


def gmail_api_configured() -> bool:
    return all((GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM))


def smtp_configured() -> bool:
    return all((SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM))


def email_config_status() -> dict:
    gmail_ready = gmail_api_configured()
    smtp_ready = smtp_configured()
    provider = "gmail_api" if gmail_ready else ("smtp" if smtp_ready else None)
    return {
        "gmailConfigured": gmail_ready,
        "smtpConfigured": smtp_ready,
        "provider": provider,
    }


def verify_gmail_connection() -> dict:
    status = email_config_status()
    result = {
        **status,
        "fromAddress": GMAIL_FROM or SMTP_FROM or None,
        "tokenOk": False,
        "ready": False,
        "error": None,
        "setupUrl": "http://127.0.0.1:8787/",
    }
    if status["gmailConfigured"]:
        try:
            get_gmail_access_token()
            result["tokenOk"] = True
            result["ready"] = True
        except Exception as exc:
            result["error"] = str(exc)
        return result
    if status["smtpConfigured"]:
        result["ready"] = True
        return result
    result["error"] = "Gmail not configured. Open http://127.0.0.1:8787/ and save your App Password."
    return result


def read_email_log() -> set:
    try:
        if not EMAIL_LOG_PATH.exists():
            return set()
        data = json.loads(EMAIL_LOG_PATH.read_text(encoding="utf-8"))
        return set(data if isinstance(data, list) else [])
    except Exception:
        return set()


def write_email_log(keys: set) -> None:
    EMAIL_LOG_PATH.write_text(json.dumps(sorted(keys), indent=2), encoding="utf-8")


def notification_key(student_email: str, student_name: str, advisor_email: str, level: int) -> str:
    student_id = (student_email or student_name or "student").strip().lower()
    return f"{student_id}|{advisor_email.strip().lower()}|level:{int(level)}"


def get_gmail_access_token() -> str:
    payload = urllib.parse.urlencode({
        "client_id": GMAIL_CLIENT_ID,
        "client_secret": GMAIL_CLIENT_SECRET,
        "refresh_token": GMAIL_REFRESH_TOKEN,
        "grant_type": "refresh_token",
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    ctx = make_ssl_context()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gmail OAuth token request failed ({exc.code}): {detail}") from exc
    token = data.get("access_token")
    if not token:
        raise RuntimeError("Gmail API did not return an access token.")
    return token


def exchange_auth_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    payload = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    ctx = make_ssl_context()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OAuth code exchange failed ({exc.code}): {detail}") from exc


def build_oauth_url(client_id: str, redirect_uri: str) -> str:
    params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    })
    return f"https://accounts.google.com/o/oauth2/v2/auth?{params}"


def build_level_up_email(
    student_name: str,
    student_email: str,
    advisor_email: str,
    level: int,
    total_xp: int,
    level_award: str = "",
    transcript_excerpt: str = "",
    previous_level: Optional[int] = None,
) -> EmailMessage:
    from_addr = GMAIL_FROM or SMTP_FROM
    subject = "Student Level Up Notification"
    previous_level = previous_level or max(1, level - 1)
    reached_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    student_email_text = student_email or "Not provided"
    transcript_text = transcript_excerpt.strip()
    transcript_text_html = html.escape(transcript_text)
    transcript_block_plain = (
        f"\nTranscript evidence excerpt:\n{transcript_text}\n"
        if transcript_text else ""
    )
    transcript_block_html = (
        f"""<tr><td style="height:12px;"></td></tr>
                  <tr>
                    <td style="padding:14px 16px;border-radius:16px;background:#f7fbff;border:1px solid #dbe8ff;">
                      <div style="font-size:12px;font-weight:700;color:#6a7d91;text-transform:uppercase;letter-spacing:.06em;">Transcript evidence excerpt</div>
                      <div style="font-size:13px;line-height:1.6;color:#40556f;margin-top:6px;white-space:pre-wrap;">{transcript_text_html}</div>
                    </td>
                  </tr>"""
        if transcript_text else ""
    )

    plain = f"""Hello,

{student_name} has reached Level {level} on Xedu.

{student_name} has progressed from Level {previous_level} to Level {level}.

Total XP: {total_xp:,}
Date/time reached: {reached_at}
Student email: {student_email_text}
{transcript_block_plain}

Please congratulate them on their continued progress.

Xedu Self Assessment Tool
"""

    body_html = f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f8ff;font-family:Arial,Helvetica,sans-serif;color:#0f2742;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8ff;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe8ff;border-radius:22px;overflow:hidden;box-shadow:0 18px 40px rgba(7,56,97,.10);">
            <tr>
              <td style="padding:26px 28px 18px;background:linear-gradient(135deg,#eef6ff,#ffffff);">
                <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2563eb;margin-bottom:8px;">Xedu Level Update</div>
                <h1 style="margin:0;font-size:28px;line-height:1.15;color:#073861;">{html.escape(student_name)} reached Level {level}</h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.55;color:#53687f;">{html.escape(student_name)} has progressed from Level {previous_level} to Level {level}. Please congratulate them on their continued progress.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:14px 16px;border-radius:16px;background:#f7fbff;border:1px solid #dbe8ff;">
                      <div style="font-size:12px;font-weight:700;color:#6a7d91;text-transform:uppercase;letter-spacing:.06em;">Milestone</div>
                      <div style="font-size:18px;font-weight:800;color:#073861;margin-top:4px;">Level {previous_level} → Level {level}</div>
                    </td>
                  </tr>
                  <tr><td style="height:12px;"></td></tr>
                  <tr>
                    <td style="padding:14px 16px;border-radius:16px;background:#f7fbff;border:1px solid #dbe8ff;">
                      <div style="font-size:12px;font-weight:700;color:#6a7d91;text-transform:uppercase;letter-spacing:.06em;">Total XP</div>
                      <div style="font-size:18px;font-weight:800;color:#073861;margin-top:4px;">{total_xp:,} XP</div>
                    </td>
                  </tr>
                  <tr><td style="height:12px;"></td></tr>
                  <tr>
                    <td style="padding:14px 16px;border-radius:16px;background:#f7fbff;border:1px solid #dbe8ff;">
                      <div style="font-size:12px;font-weight:700;color:#6a7d91;text-transform:uppercase;letter-spacing:.06em;">Date/time reached</div>
                      <div style="font-size:18px;font-weight:800;color:#073861;margin-top:4px;">{reached_at}</div>
                    </td>
                  </tr>
                  {transcript_block_html}
                </table>
                <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#53687f;">Student email: <strong style="color:#073861;">{html.escape(student_email_text)}</strong></p>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#53687f;">This update was sent because the student added you as an advisor in Xedu.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f7fbff;border-top:1px solid #e6efff;font-size:12px;color:#6a7d91;">
                Xedu Self Assessment Tool · Automated advisor notification
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
    msg["From"] = from_addr
    msg["To"] = advisor_email
    msg.set_content(plain)
    msg.add_alternative(body_html, subtype="html")
    return msg


def send_email_via_gmail_api(msg: EmailMessage) -> None:
    access_token = get_gmail_access_token()
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    payload = json.dumps({"raw": raw}).encode("utf-8")
    req = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    ctx = make_ssl_context()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            if resp.status not in (200, 202):
                raise RuntimeError(f"Gmail API send failed with status {resp.status}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gmail API send failed ({exc.code}): {detail}") from exc


def send_email_via_smtp(msg: EmailMessage) -> None:
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        smtp.starttls()
        smtp.login(SMTP_USER, SMTP_PASS)
        smtp.send_message(msg)


def send_message(msg: EmailMessage) -> str:
    if gmail_api_configured():
        send_email_via_gmail_api(msg)
        return "gmail_api"
    if smtp_configured():
        send_email_via_smtp(msg)
        return "smtp"
    raise RuntimeError("Gmail API and SMTP are not configured.")


def send_level_up_emails(
    profile: dict,
    previous_level: int,
    new_level: int,
    total_xp: int,
    notified_levels: set | None = None,
) -> dict:
    student_name = (profile.get("studentName") or "Student").strip()
    student_email = (profile.get("studentEmail") or "").strip()
    advisor_emails = profile.get("advisorEmails") or []
    transcript_excerpt = (profile.get("meetingTranscript") or "").strip()[:1200]
    sent = 0
    failed = []
    skipped = []
    notified_levels = notified_levels if notified_levels is not None else set()

    if not isinstance(advisor_emails, list) or not advisor_emails:
        return {"sent": 0, "failed": [], "skipped": ["No advisor emails configured"], "provider": None}

    if not gmail_api_configured() and not smtp_configured():
        return {"sent": 0, "failed": [], "skipped": ["Email provider not configured"], "provider": None}

    clean_advisors = []
    for email in advisor_emails:
        value = str(email).strip().lower()
        if value and re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value) and value not in clean_advisors:
            clean_advisors.append(value)

    email_log = read_email_log()
    provider = "gmail_api" if gmail_api_configured() else "smtp"

    for level in range(previous_level + 1, new_level + 1):
        if level in notified_levels:
            skipped.append(f"Level {level} already notified")
            continue
        level_sent = 0
        for advisor_email in clean_advisors:
            log_key = notification_key(student_email, student_name, advisor_email, level)
            if log_key in email_log:
                skipped.append(f"{advisor_email} already notified for Level {level}")
                continue
            msg = build_level_up_email(
                student_name=student_name,
                student_email=student_email,
                advisor_email=advisor_email,
                level=level,
                total_xp=total_xp,
                level_award=f"Progressed from Level {previous_level} to Level {level}",
                transcript_excerpt=transcript_excerpt,
                previous_level=previous_level,
            )
            try:
                send_message(msg)
                sent += 1
                level_sent += 1
                email_log.add(log_key)
                write_email_log(email_log)
            except Exception as exc:
                failed.append({"email": advisor_email, "level": level, "error": str(exc)})
        if level_sent > 0:
            notified_levels.add(level)

    return {"sent": sent, "failed": failed, "skipped": skipped, "provider": provider}


def notify_level_up_payload(data: dict) -> dict:
    student_name = (data.get("studentName") or "").strip()
    student_email = (data.get("studentEmail") or "").strip()
    advisor_emails = data.get("advisorEmails") or []
    level = int(data.get("level") or 0)
    total_xp = int(data.get("totalXp") or 0)
    transcript_excerpt = (data.get("transcriptExcerpt") or "").strip()[:1200]
    previous_level = int(data.get("previousLevel") or max(1, level - 1))

    if not student_name or not isinstance(advisor_emails, list) or not advisor_emails or level < 1:
        raise ValueError("Invalid level-up notification payload.")

    if not gmail_api_configured() and not smtp_configured():
        return {
            "ok": True,
            "sent": 0,
            "failed": [],
            "skipped": ["Email provider not configured"],
            "provider": None,
        }

    clean_advisors = []
    for email in advisor_emails:
        value = str(email).strip().lower()
        if value and re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value) and value not in clean_advisors:
            clean_advisors.append(value)

    if not clean_advisors:
        raise ValueError("No valid advisor emails found.")

    sent = 0
    failed = []
    skipped_duplicates = []
    email_log = read_email_log()
    provider = "gmail_api" if gmail_api_configured() else "smtp"

    for advisor_email in clean_advisors:
        log_key = notification_key(student_email, student_name, advisor_email, level)
        if log_key in email_log:
            skipped_duplicates.append(advisor_email)
            continue
        msg = build_level_up_email(
            student_name=student_name,
            student_email=student_email,
            advisor_email=advisor_email,
            level=level,
            total_xp=total_xp,
            level_award=(data.get("levelAward") or "").strip(),
            transcript_excerpt=transcript_excerpt,
            previous_level=previous_level,
        )
        try:
            send_message(msg)
            sent += 1
            email_log.add(log_key)
            write_email_log(email_log)
        except Exception as exc:
            failed.append({"email": advisor_email, "error": str(exc)})

    return {
        "ok": True,
        "sent": sent,
        "failed": failed,
        "skippedDuplicates": skipped_duplicates,
        "provider": provider,
    }
