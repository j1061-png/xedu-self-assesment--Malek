#!/usr/bin/env python3
"""
Local server — serves static files + DeepSeek API routes.
Run: python3 server.py  →  http://localhost:3000
"""

import json
import os
import re
import ssl
import urllib.error
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Optional

PORT = int(os.environ.get("PORT", 3000))
ROOT = Path(__file__).parent.resolve()
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"


def make_ssl_context():
    """Handle macOS Python SSL cert issues for local development."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl._create_unverified_context()

CHAT_SYSTEM_PROMPT = """You are Xedu, a warm academic advisor for secondary school students.

The student completed a self-assessment. You already evaluated their answers and gave them strengths, a biggest gap, and a next step.

They may now ask follow-up questions about their results. Be concise (2–4 sentences), supportive, and specific — reference their actual answers and assessment results.

Do NOT re-run the full assessment from scratch unless they share major new information. Help them understand and act on what they already received."""

FEEDBACK_CONTEXT_PREFIX = """Here is the student's full assessment context:

"""

GENERATE_QUESTIONS_PROMPT = """You create personalized self-assessment quiz questions for secondary school students.

The student already chatted about what they want assessed. Read the conversation and generate 5–7 quiz questions tailored to THAT specific focus.

Return JSON only:
{
  "assessmentFocus": "One clear sentence summarizing what Xedu will assess",
  "questions": [
    {
      "id": "unique_snake_case_id",
      "field": "same_as_id",
      "type": "choice" or "text",
      "title": "Question shown to the student",
      "subtitle": "Optional helper line",
      "options": [{"label": "...", "value": "..."}],
      "placeholder": "For text questions only",
      "minLength": 5,
      "highlight": false
    }
  ]
}

Rules:
- Mix choice and text questions; at least 2 of each when possible.
- Questions must gather evidence needed to assess their stated focus — grades, activities, goals, worries, self-rating, etc.
- Use plain student-friendly language.
- Last question should invite them to state their #1 question or priority (set highlight: true on that one).
- Each id/field must be unique snake_case.
- choice questions need 3–5 options covering realistic student situations.
- text minLength between 5 and 20 as appropriate."""

ASSESSMENT_SYSTEM_PROMPT = """You are an experienced academic advisor who helps secondary school students.

The student answered 7 questions about their profile, then asked what they want assessed (question 7).

Your job:
1. Read all 7 answers carefully — especially question 7 (assessment focus).
2. Assess them ONLY on what they asked to be assessed.
3. Give a fair score (0–100) for how they're doing in THAT area.
4. Return three things they need most — personalised, specific, actionable:

Return JSON only:
{
  "assessmentScore": 72,
  "scoreLabel": "Short 2-4 word label e.g. Strong but improvable",
  "scoreExplanation": "One sentence explaining what the score means for their stated goal.",
  "strengths": ["Specific strength 1 with evidence from their answers", "Strength 2", "Strength 3"],
  "biggestGap": "The single most important weakness relative to their goal — name it clearly and say why it matters.",
  "nextStep": "One concrete action they can take within the next 7 days. Be specific — not 'study harder'.",
  "summary": "2-3 sentence overview tying together what's working, the gap, and the priority.",
  "xpBonus": 50
}

Guidelines:
- strengths: exactly 3 items. Each must reference something they actually wrote — never generic praise.
- biggestGap: one focused paragraph. Address their stated worry if relevant.
- nextStep: one action only. Achievable in 7 days. Tied to the biggest gap.
- assessmentScore: integer 0–100 for their chosen focus area.
- Never give vague advice like "stay motivated" or "believe in yourself".
- Set xpBonus between 25–75 (default 50)."""


def load_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


ENV = load_env(ROOT / ".env.local")
API_KEY = os.environ.get("DEEPSEEK_API_KEY") or ENV.get("DEEPSEEK_API_KEY", "")


def call_deepseek(messages: list, json_mode: bool = False) -> str:
    if not API_KEY:
        raise RuntimeError("DeepSeek API key missing. Add DEEPSEEK_API_KEY to .env.local")

    payload = {"model": MODEL, "messages": messages, "temperature": 0.7}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    req = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
        method="POST",
    )
    try:
        ctx = make_ssl_context()
        with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        try:
            msg = json.loads(err).get("error", {}).get("message", err)
        except json.JSONDecodeError:
            msg = err
        if exc.code == 402 or "Insufficient Balance" in msg:
            raise RuntimeError(
                "DeepSeek account has insufficient balance. Top up at platform.deepseek.com"
            ) from exc
        raise RuntimeError(f"DeepSeek error ({exc.code}): {msg}") from exc

    if body.get("error", {}).get("message"):
        raise RuntimeError(body["error"]["message"])

    content = body.get("choices", [{}])[0].get("message", {}).get("content")
    if not content:
        raise RuntimeError("Empty response from DeepSeek.")
    return content.strip()


def parse_json_response(raw: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def validate_assessment(data: dict) -> Optional[str]:
    focus = (data.get("assessmentFocus") or "").strip()
    if len(focus) < 10:
        return "Assessment focus is missing. Please restart and tell Xedu what to assess."

    qa = data.get("questions") or []
    if len(qa) < 7:
        return "Please answer all 7 questions before submitting."

    for i, item in enumerate(qa):
        ans = (item.get("answer") or data.get("answers", {}).get(item.get("id"), "")).strip()
        if len(ans) < 2:
            return f"Please answer question {i + 1} before submitting."
    return None


def validate_questions(data: dict) -> Optional[str]:
    questions = data.get("questions")
    if not isinstance(questions, list) or len(questions) < 3:
        return "Invalid questions format from AI."
    for i, q in enumerate(questions):
        if not q.get("title") or not q.get("field"):
            return f"Question {i + 1} is missing required fields."
        if q.get("type") == "choice" and not q.get("options"):
            return f"Question {i + 1} is missing options."
    return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        path = self.path.split("?")[0]
        if path.endswith((".css", ".js", ".png", ".jpg", ".svg", ".webp", ".ico")):
            self.send_header("Cache-Control", "public, max-age=86400")
        elif path.endswith(".html") or path == "/":
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return self._json(400, {"error": "Invalid JSON."})

        if self.path == "/api/chat":
            return self._handle_chat(data)
        if self.path == "/api/generate-questions":
            return self._handle_generate_questions(data)
        if self.path == "/api/analyze":
            return self._handle_analyze(data)
        self.send_error(404)

    def _handle_chat(self, data: dict):
        messages = data.get("messages", [])
        if not messages:
            return self._json(400, {"error": "No messages provided."})
        try:
            system = CHAT_SYSTEM_PROMPT
            context = (data.get("assessmentContext") or "").strip()
            if context:
                system = CHAT_SYSTEM_PROMPT + "\n\n" + FEEDBACK_CONTEXT_PREFIX + context
            api_messages = [{"role": "system", "content": system}] + messages
            reply = call_deepseek(api_messages)
            return self._json(200, {"reply": reply})
        except Exception as exc:
            print(f"[/api/chat] {exc}")
            return self._json(500, {"error": str(exc)})

    def _handle_generate_questions(self, data: dict):
        messages = data.get("messages", [])
        if not messages:
            return self._json(400, {"error": "No chat history provided."})

        transcript = "\n".join(
            f"{'Student' if m.get('role') == 'user' else 'Xedu'}: {m.get('content', '')}"
            for m in messages
        )
        user_prompt = f"""Chat transcript:
{transcript}

Generate personalized assessment questions based on what this student wants assessed."""

        try:
            raw = call_deepseek(
                [{"role": "system", "content": GENERATE_QUESTIONS_PROMPT},
                 {"role": "user", "content": user_prompt}],
                json_mode=True,
            )
            parsed = parse_json_response(raw)
            err = validate_questions(parsed)
            if err:
                raise RuntimeError(err)
            return self._json(200, {
                "assessmentFocus": parsed.get("assessmentFocus", "").strip(),
                "questions": parsed["questions"],
            })
        except json.JSONDecodeError:
            return self._json(500, {"error": "Failed to parse AI question response."})
        except Exception as exc:
            print(f"[/api/generate-questions] {exc}")
            return self._json(500, {"error": str(exc)})

    def _handle_analyze(self, data: dict):
        err = validate_assessment(data)
        if err:
            return self._json(400, {"error": err})

        chat_context = data.get("chatContext", "")
        focus = data.get("assessmentFocus", "")
        qa_lines = []
        for item in data.get("questions") or []:
            q = item.get("question") or item.get("title") or ""
            a = item.get("answer") or data.get("answers", {}).get(item.get("id"), "")
            qa_lines.append(f"Q: {q}\nA: {a}")

        answers = data.get("answers", {}) or {}
        school_name = (answers.get("schoolName") or "").strip()
        disadvantage = (answers.get("academicDisadvantage") or "").strip()
        disadvantage_notes = (answers.get("academicDisadvantageNotes") or "").strip()

        pre_context_lines = [
            f"School: {school_name or 'Not provided'}",
            f"Academic disadvantages or barriers: {disadvantage or 'Not provided'}",
            f"Details: {disadvantage_notes or 'Not provided'}",
        ]

        user_prompt = f"""Assessment focus (from question 7):
{focus}

Pre-assessment context:
{chr(10).join(pre_context_lines)}

Student's 7 question answers:
{chr(10).join(qa_lines) if qa_lines else "No quiz answers."}"""

        try:
            raw = call_deepseek(
                [{"role": "system", "content": ASSESSMENT_SYSTEM_PROMPT},
                 {"role": "user", "content": user_prompt}],
                json_mode=True,
            )
            result = parse_json_response(raw)
            for key in ("strengths", "biggestGap", "nextStep", "summary", "assessmentScore"):
                if key not in result:
                    raise RuntimeError("Invalid response format from DeepSeek.")
            if not isinstance(result.get("strengths"), list):
                raise RuntimeError("Invalid strengths in response.")
            score = result.get("assessmentScore")
            if not isinstance(score, (int, float)):
                raise RuntimeError("Invalid assessmentScore in response.")
            result["assessmentScore"] = max(0, min(100, int(round(score))))
            if "scoreLabel" not in result:
                result["scoreLabel"] = "Assessment complete"
            if "scoreExplanation" not in result:
                result["scoreExplanation"] = ""
            if "xpBonus" not in result:
                result["xpBonus"] = 50
            return self._json(200, {"result": result})
        except json.JSONDecodeError:
            return self._json(500, {"error": "Failed to parse AI response."})
        except Exception as exc:
            print(f"[/api/analyze] {exc}")
            return self._json(500, {"error": str(exc)})

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


if __name__ == "__main__":
    os.chdir(ROOT)
    if not API_KEY:
        print("WARNING: DEEPSEEK_API_KEY not set in .env.local")
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"\n  ✦ Xedu Self-Assessment running at http://localhost:{PORT}\n")
    print("  Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
