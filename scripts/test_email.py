#!/usr/bin/env python3
"""Send a test email and exercise level-up notify + duplicate protection."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services import email_service as email_svc  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/test_email.py recipient@example.com")
        return 1

    to_addr = sys.argv[1].strip().lower()
    status = email_svc.verify_connection()
    print("Config:", json.dumps(email_svc.config_status(), indent=2))

    if not status.get("ready"):
        print("\nERROR:", status.get("error") or "Email not configured.")
        print("See GMAIL_SETUP.md")
        return 1

    print(f"\nSending test email to {to_addr}...")
    email_svc.send_test_email(to_addr)
    print("Test email sent.")

    payload = {
        "studentName": "Test Student",
        "studentEmail": "student@example.com",
        "advisorEmails": [to_addr],
        "level": 99,
        "previousLevel": 98,
        "totalXp": 9999,
        "xp": 9999,
    }

    print("\nFirst level-up notify (should send)...")
    r1 = email_svc.notify_level_up(payload)
    print(json.dumps(r1, indent=2))

    print("\nSecond level-up notify (duplicate — should NOT send)...")
    r2 = email_svc.notify_level_up(payload)
    print(json.dumps(r2, indent=2))

    if r1.get("sent", 0) >= 1 and r2.get("sent", 0) == 0:
        print("\nOK: duplicate protection working.")
        return 0

    print("\nWARN: expected first send and second skip.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
