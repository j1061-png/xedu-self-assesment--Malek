"""Read/write email keys in .env.local without touching other variables."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"

GMAIL_KEYS = (
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
    "GMAIL_FROM",
)

SMTP_KEYS = (
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
)


def read_env_lines(path: Path = ENV_PATH) -> list[str]:
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines()


def _merge_keys(updates: dict[str, str], allowed: tuple[str, ...], comment: str, path: Path = ENV_PATH) -> None:
    lines = read_env_lines(path)
    remaining = {k: v for k, v in updates.items() if v is not None and str(v).strip() != ""}
    out: list[str] = []
    seen: set[str] = set()

    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in remaining:
                out.append(f"{key}={remaining.pop(key)}")
                seen.add(key)
                continue
        out.append(line)

    pending = [key for key in allowed if key in remaining and key not in seen]
    if pending:
        if out and out[-1].strip():
            out.append("")
        if not any(line.strip().startswith(f"# {comment}") for line in out):
            out.append(f"# {comment}")
        for key in allowed:
            if key in remaining and key not in seen:
                out.append(f"{key}={remaining[key]}")

    text = "\n".join(out).rstrip() + "\n"
    path.write_text(text, encoding="utf-8")


def merge_gmail_env(updates: dict[str, str], path: Path = ENV_PATH) -> None:
    _merge_keys(updates, GMAIL_KEYS, "Gmail API — advisor level-up emails", path)


def merge_smtp_env(updates: dict[str, str], path: Path = ENV_PATH) -> None:
    _merge_keys(updates, SMTP_KEYS, "Gmail SMTP — advisor level-up emails", path)


def gmail_env_status(path: Path = ENV_PATH) -> dict[str, bool]:
    values = {key: False for key in GMAIL_KEYS}
    for line in read_env_lines(path):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        if key in values:
            values[key] = bool(value.strip()) and "your_" not in value
    return values
