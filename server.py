#!/usr/bin/env python3
"""
Local server — serves static files + DeepSeek API routes.
Run: python3 server.py  →  http://localhost:3000
"""

import json
import os
import re
import ssl
import urllib.parse
import urllib.error
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Optional
from datetime import datetime

from services import email_service as email_svc

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

CHAT_SYSTEM_PROMPT = """You are Xedu, a warm and constructive academic advisor for secondary school students.

Students may chat with you at any time: before assessment, during questions, or after results.

Response style:
- Be concise (2-4 sentences) and specific.
- Stay constructive: focus on practical next actions, not criticism.
- Use encouraging but realistic language.

If assessment context is provided, reference the student's actual answers/results.
If context is not provided, still give useful, concrete guidance based on the student's message."""

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

ASSESSMENT_SYSTEM_PROMPT = """You are an experienced and constructive academic advisor who helps secondary school students.

The student answered 7 questions about their profile, then asked what they want assessed (question 7).
You are also given the full advisor-student meeting transcript.

CRITICAL:
- Treat the meeting transcript as the PRIMARY source of evidence.
- Do not ignore transcript evidence even if short-form quiz answers differ.
- Use quiz answers as supplemental context.

Your job:
1. Read all 7 answers carefully — especially question 7 (assessment focus).
2. Read the full meeting transcript and extract concrete evidence.
3. Assess them ONLY on what they asked to be assessed.
4. Give a fair score (0–100) for how they're doing in THAT area.
5. Return three things they need most — personalised, specific, actionable, and constructive:

Return JSON only:
{
  "assessmentScore": 72,
  "scoreLabel": "Short 2-4 word label e.g. Strong but improvable",
  "scoreExplanation": "One sentence explaining what the score means for their stated goal.",
  "strengths": ["Specific strength 1 with evidence from their answers", "Strength 2", "Strength 3"],
  "biggestGap": "The single most important weakness relative to their goal — name it clearly and say why it matters.",
  "nextStep": "One concrete action they can take within the next 7 days. Be specific — not 'study harder'.",
  "actionPlan": ["Step 1", "Step 2", "Step 3"],
  "weeklyTasks": ["Task 1 for this week", "Task 2 for this week", "Task 3 for this week"],
  "summary": "2-3 sentence overview tying together what's working, the gap, and the priority.",
  "xpBonus": 50
}

Guidelines:
- strengths: exactly 3 items. Each must reference something they actually wrote — never generic praise.
- strengths should prioritize transcript-backed evidence.
- biggestGap: one focused paragraph. Address their stated worry if relevant.
- nextStep: one action only. Achievable in 7 days. Tied to the biggest gap.
- actionPlan: exactly 3 concise constructive steps.
- weeklyTasks: exactly 3 concrete tasks the student can execute this week.
- assessmentScore: integer 0–100 for their chosen focus area.
- Never give vague advice like "stay motivated" or "believe in yourself".
- Keep the tone constructive: highlight progress potential and clear next moves.
- Set xpBonus between 25–75 (default 50).
- actionPlan and weeklyTasks are MANDATORY — never omit them. They must be personalized from the student's actual answers."""

ACTION_PLAN_SYSTEM_PROMPT = """You are Xedu, an expert academic coach. Create a personalized self-improvement action plan for a secondary school student.
You will receive the full advisor-student meeting transcript. Treat it as your primary evidence.

Return JSON only:
{
  "actionPlan": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
  "weeklyTasks": ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5"]
}

Rules for actionPlan (5 steps):
- Medium-term moves over the next 2–4 weeks tied to their assessment focus and biggest gap.
- Each step starts with a strong verb and names something specific from their profile (subjects, school, activities, challenges).
- 20–45 words each. Measurable where possible.

Rules for weeklyTasks (5 tasks):
- Achievable THIS WEEK with a clear deliverable (time block, page count, session count, conversation, output).
- Each task starts with a verb. Include when/how long where helpful.
- Directly attack the biggest gap — not generic study advice.

Never use vague phrases like "study harder", "stay motivated", "believe in yourself", or "work on weaknesses".
Every item must reference their situation — if they mentioned football, maths, time management, etc., use it."""

TASK_FEEDBACK_PROMPT = """You are Xedu, a constructive academic coach.
You are given the full advisor-student transcript and recent assessment context.
Use transcript evidence first when explaining feedback.

A student just completed a task from their self-improvement plan. Give brief feedback in 2-4 sentences:
1. Acknowledge what they completed
2. Explain why it helps their specific goal
3. One tiny next move they can do right now

Be warm, specific, and practical. No generic praise."""


def load_env(path: Path) -> dict:
    def clean_value(raw: str) -> str:
        value = raw.strip()
        # Drop inline comments for unquoted values: KEY=value # comment
        if "#" in value and not (value.startswith('"') or value.startswith("'")):
            value = value.split("#", 1)[0].strip()
        # Trim matching surrounding quotes
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        return value

    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = clean_value(v)
    return env


ENV = load_env(ROOT / ".env.local")
API_KEY = os.environ.get("DEEPSEEK_API_KEY") or ENV.get("DEEPSEEK_API_KEY", "")
XP_STORE_PATH = ROOT / ".xedu-xp-store.json"
XP_TASK_VALUES = {
    "assessment": 75,
    "advisorTask": 100,
    "reflection": 40,
    "improvement": 60,
}


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


def email_config_status() -> dict:
    return email_svc.config_status()


def xp_threshold_for_level(level: int) -> int:
    """Total XP needed to reach a numbered level. Level 1 starts at 0 XP."""
    level = max(1, int(level))
    thresholds = [0, 250, 600, 1000, 1500]
    if level <= len(thresholds):
        return thresholds[level - 1]
    total = thresholds[-1]
    gap = 500
    for _ in range(6, level + 1):
        gap += 100
        total += gap
    return total


def xp_level_from_total(total_xp: int) -> int:
    total_xp = max(0, int(total_xp or 0))
    level = 1
    while level < 100 and total_xp >= xp_threshold_for_level(level + 1):
        level += 1
    return level


def xp_state(total_xp: int) -> dict:
    total_xp = max(0, int(total_xp or 0))
    level = xp_level_from_total(total_xp)
    current_threshold = xp_threshold_for_level(level)
    next_threshold = xp_threshold_for_level(level + 1) if level < 100 else current_threshold
    span = max(1, next_threshold - current_threshold)
    xp_into_level = min(span, max(0, total_xp - current_threshold))
    xp_to_next = 0 if level >= 100 else max(0, next_threshold - total_xp)
    return {
        "totalXp": total_xp,
        "level": level,
        "currentLevelXp": current_threshold,
        "nextLevelXp": next_threshold if level < 100 else None,
        "xpIntoLevel": xp_into_level,
        "xpToNext": xp_to_next,
        "progressPercent": 100 if level >= 100 else round((xp_into_level / span) * 100),
        "previousLevel": max(1, level - 1),
        "nextLevel": min(100, level + 1),
        "maxLevel": 100,
    }


def read_xp_store() -> dict:
    try:
        if not XP_STORE_PATH.exists():
            return {}
        data = json.loads(XP_STORE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def write_xp_store(store: dict) -> None:
    XP_STORE_PATH.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")


def student_id_from_profile(profile: dict) -> str:
    email = str(profile.get("studentEmail") or "").strip().lower()
    name = str(profile.get("studentName") or "").strip().lower()
    raw = email or name or "local-student"
    return re.sub(r"[^a-z0-9@._-]+", "-", raw).strip("-") or "local-student"


def default_xp_record() -> dict:
    return {
        "totalXp": 0,
        "completedTasks": [],
        "notifiedLevels": [],
        "stats": {
            "assessmentsCompleted": 0,
            "tasksCompleted": 0,
            "reflectionsCompleted": 0,
            "improvementsCompleted": 0,
        },
        "activity": [],
        "lastNotification": None,
    }


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


GENERIC_ACTION_PLAN = [
    "Clarify your target outcome for the next 4 weeks.",
    "Work on your biggest gap with focused, trackable effort.",
    "Review progress weekly and adjust your strategy.",
]

GENERIC_WEEKLY_TASKS = [
    "Block two 60-minute deep-focus sessions for your weakest area.",
    "Complete one measurable output (practice set, draft, or revision sheet).",
    "Reflect on what improved and set next week's target.",
]


def normalize_task_list(items, min_count=3, max_count=5):
    if not isinstance(items, list):
        return []
    clean = [str(item).strip() for item in items if str(item).strip()]
    return clean[:max_count] if len(clean) >= min_count else clean


def generate_action_plan(
    focus: str,
    pre_context: str,
    qa_text: str,
    meeting_transcript: str,
    assessment: dict,
) -> dict:
    """Dedicated DeepSeek call to produce personalized action plan tasks."""
    user_prompt = f"""Assessment focus:
{focus}

Student profile:
{pre_context}

Student's 7 question answers:
{qa_text}

Full advisor-student meeting transcript (primary evidence):
{meeting_transcript or "Not provided"}

Assessment results:
Score: {assessment.get("assessmentScore")}% — {assessment.get("scoreLabel", "")}
Summary: {assessment.get("summary", "")}
Biggest gap: {assessment.get("biggestGap", "")}
Next step: {assessment.get("nextStep", "")}
Strengths: {", ".join(assessment.get("strengths") or [])}

Create exactly 5 personalized actionPlan steps and 5 personalized weeklyTasks for THIS student."""

    raw = call_deepseek(
        [{"role": "system", "content": ACTION_PLAN_SYSTEM_PROMPT},
         {"role": "user", "content": user_prompt}],
        json_mode=True,
    )
    parsed = parse_json_response(raw)
    action_plan = normalize_task_list(parsed.get("actionPlan"), min_count=2, max_count=5)
    weekly_tasks = normalize_task_list(parsed.get("weeklyTasks"), min_count=2, max_count=5)
    if len(action_plan) < 2 or len(weekly_tasks) < 2:
        raise RuntimeError("AI returned an incomplete action plan.")
    return {"actionPlan": action_plan, "weeklyTasks": weekly_tasks}


def generate_action_plan_with_retry(
    focus: str,
    pre_context: str,
    qa_text: str,
    meeting_transcript: str,
    assessment: dict,
) -> dict:
    last_error = None
    for attempt in range(2):
        try:
            return generate_action_plan(focus, pre_context, qa_text, meeting_transcript, assessment)
        except Exception as exc:
            last_error = exc
            print(f"[generate_action_plan] attempt {attempt + 1} failed: {exc}")
    raise last_error or RuntimeError("Could not generate action plan.")


def validate_questions(data: dict) -> Optional[str]:
    questions = data.get("questions")
    if not isinstance(questions, list) or len(questions) < 3:
        return "Invalid questions format from AI."
    for i, q in enumerate(questions):
        if not q.get("title") or not q.get("field"):
            return f"Question {i + 1} is missing fields."
        if q.get("type") == "choice" and not q.get("options"):
            return f"Question {i + 1} is missing options."
    return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        path = self.path.split("?")[0]
        if path.endswith((".png", ".jpg", ".svg", ".webp", ".ico")):
            self.send_header("Cache-Control", "public, max-age=86400")
        elif path.endswith((".css", ".js")):
            self.send_header("Cache-Control", "no-cache")
        elif path.endswith(".html") or path == "/":
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/email/status":
            return self._handle_email_status()
        return super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return self._json(400, {"error": "Invalid JSON."})

        if self.path == "/api/chat":
            return self._handle_chat(data)
        if self.path == "/api/task-feedback":
            return self._handle_task_feedback(data)
        if self.path == "/api/generate-action-plan":
            return self._handle_generate_action_plan(data)
        if self.path == "/api/notify-level-up":
            return self._handle_notify_level_up(data)
        if self.path == "/api/email/test":
            return self._handle_email_test(data)
        if self.path == "/api/xp/state":
            return self._handle_xp_state(data)
        if self.path == "/api/xp/complete-task":
            return self._handle_xp_complete_task(data)
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

    def _handle_task_feedback(self, data: dict):
        task = (data.get("task") or "").strip()
        list_type = (data.get("listType") or "actionPlan").strip()
        context = (data.get("assessmentContext") or "").strip()
        if len(task) < 3:
            return self._json(400, {"error": "Add task text to continue."})
        kind = "weekly task" if list_type == "weeklyTasks" else "action plan step"
        try:
            system = TASK_FEEDBACK_PROMPT
            if context:
                system = TASK_FEEDBACK_PROMPT + "\n\nStudent context:\n" + context
            reply = call_deepseek([
                {"role": "system", "content": system},
                {"role": "user", "content": f'I completed this {kind}: "{task}"'},
            ])
            return self._json(200, {"feedback": reply})
        except Exception as exc:
            print(f"[/api/task-feedback] {exc}")
            return self._json(500, {"error": str(exc)})

    def _handle_generate_action_plan(self, data: dict):
        focus = (data.get("assessmentFocus") or "").strip()
        if len(focus) < 5:
            return self._json(400, {"error": "Add an assessment focus to generate tasks."})

        assessment = dict(data.get("assessment") or {})
        for key in ("summary", "biggestGap", "nextStep", "scoreLabel"):
            if not assessment.get(key) and data.get(key):
                assessment[key] = data.get(key)
        if assessment.get("assessmentScore") is None and data.get("assessmentScore") is not None:
            assessment["assessmentScore"] = data.get("assessmentScore")
        if not assessment.get("strengths") and data.get("strengths"):
            assessment["strengths"] = data.get("strengths")

        has_context = any(
            assessment.get(k)
            for k in ("summary", "biggestGap", "nextStep", "assessmentScore")
        )
        if not has_context:
            return self._json(400, {"error": "Complete an assessment first, then try again."})

        answers = data.get("answers") or {}
        meeting_transcript = (answers.get("meetingTranscript") or "").strip()
        qa_lines = []
        for item in data.get("questions") or []:
            qid = item.get("id") or item.get("field") or ""
            q = item.get("question") or item.get("title") or ""
            a = (
                item.get("answer")
                or answers.get(qid)
                or answers.get(item.get("field"))
                or ""
            )
            if q or a:
                qa_lines.append(f"Q: {q}\nA: {a}")

        pre_context_lines = [
            f"School: {(answers.get('schoolName') or 'Not provided').strip()}",
            f"Academic disadvantages: {(answers.get('academicDisadvantage') or 'Not provided').strip()}",
            f"Details: {(answers.get('academicDisadvantageNotes') or 'Not provided').strip()}",
        ]

        try:
            plan = generate_action_plan_with_retry(
                focus,
                "\n".join(pre_context_lines),
                "\n".join(qa_lines) if qa_lines else "No quiz answers saved — use assessment results above.",
                meeting_transcript or "Not provided",
                assessment,
            )
            return self._json(200, {"actionPlan": plan["actionPlan"], "weeklyTasks": plan["weeklyTasks"]})
        except Exception as exc:
            print(f"[/api/generate-action-plan] {exc}")
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

    def _handle_email_status(self):
        return self._json(200, {"ok": True, **email_svc.verify_connection()})

    def _handle_email_test(self, data: dict):
        to_addr = (data.get("to") or data.get("email") or "").strip().lower()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", to_addr):
            return self._json(400, {"error": "Valid recipient email required.", **email_config_status()})
        try:
            result = email_svc.send_test_email(to_addr)
            return self._json(200, {**result, **email_config_status()})
        except Exception as exc:
            print(f"[/api/email/test] {exc}")
            return self._json(500, {"error": str(exc), **email_config_status()})

    def _handle_notify_level_up(self, data: dict):
        try:
            result = email_svc.notify_level_up(data)
        except ValueError as exc:
            return self._json(400, {"ok": False, "error": str(exc), "message": "Unable to notify advisor"})
        except Exception as exc:
            print(f"[/api/notify-level-up] {exc}")
            return self._json(500, {"ok": False, "error": str(exc), "message": "Unable to notify advisor"})
        status = 200 if result.get("ok") else 503
        return self._json(status, result)

    def _send_level_up_emails(
        self,
        profile: dict,
        previous_level: int,
        new_level: int,
        total_xp: int,
        notified_levels: set,
    ) -> dict:
        return email_svc.notify_level_up_batch(
            profile, previous_level, new_level, total_xp, notified_levels
        )

    def _handle_xp_state(self, data: dict):
        profile = data.get("profile") or {}
        student_id = student_id_from_profile(profile)
        store = read_xp_store()
        record = store.get(student_id) or default_xp_record()
        state = xp_state(record.get("totalXp", 0))
        return self._json(200, {
            "ok": True,
            "studentId": student_id,
            "state": state,
            "completedTasks": record.get("completedTasks", []),
            "stats": record.get("stats") or default_xp_record()["stats"],
            "activity": record.get("activity", [])[:12],
            "lastNotification": record.get("lastNotification"),
            "taskValues": XP_TASK_VALUES,
            "emailConfig": email_config_status(),
        })

    def _handle_xp_complete_task(self, data: dict):
        profile = data.get("profile") or {}
        task_type = (data.get("taskType") or "").strip()
        task_id = (data.get("taskId") or "").strip()

        if task_type not in XP_TASK_VALUES:
            return self._json(400, {"error": "Unknown XP task type."})
        if len(task_id) < 3:
            return self._json(400, {"error": "Task id is too short."})

        student_id = student_id_from_profile(profile)
        store = read_xp_store()
        record = store.get(student_id) or default_xp_record()
        completed = set(record.get("completedTasks") or [])
        notified_levels = set(int(x) for x in (record.get("notifiedLevels") or []) if str(x).isdigit())
        stats = record.get("stats") or default_xp_record()["stats"]
        activity = record.get("activity") or []
        state_before = xp_state(record.get("totalXp", 0))

        if task_id in completed:
            return self._json(200, {
                "ok": True,
                "duplicate": True,
                "awardedXp": 0,
                "studentId": student_id,
                "state": state_before,
                "previousState": state_before,
                "stats": stats,
                "activity": activity[:12],
                "lastNotification": record.get("lastNotification"),
                "taskValues": XP_TASK_VALUES,
                "levelUp": None,
                "email": {"sent": 0, "failed": [], "skipped": ["Task already awarded XP"]},
                "emailConfig": email_config_status(),
            })

        awarded = XP_TASK_VALUES[task_type]
        completed.add(task_id)
        total_xp = int(record.get("totalXp", 0)) + awarded
        state_after = xp_state(total_xp)
        level_up = None
        email_result = {"sent": 0, "failed": [], "skipped": []}

        if state_after["level"] > state_before["level"]:
            level_up = {"previousLevel": state_before["level"], "newLevel": state_after["level"]}
            email_result = self._send_level_up_emails(
                profile,
                state_before["level"],
                state_after["level"],
                total_xp,
                notified_levels,
            )

        task_labels = {
            "assessment": "Completed Assessment",
            "advisorTask": "Completed Advisor Task",
            "reflection": "Finished Reflection",
            "improvement": "Daily Improvement Activity",
        }
        stat_keys = {
            "assessment": "assessmentsCompleted",
            "advisorTask": "tasksCompleted",
            "reflection": "reflectionsCompleted",
            "improvement": "improvementsCompleted",
        }
        stat_key = stat_keys.get(task_type)
        if stat_key:
            stats[stat_key] = int(stats.get(stat_key, 0)) + 1
            if task_type in ("advisorTask", "improvement"):
                stats["tasksCompleted"] = int(stats.get("tasksCompleted", 0)) + (0 if task_type == "advisorTask" else 1)

        activity_item = {
            "id": task_id,
            "taskType": task_type,
            "label": task_labels.get(task_type, "Completed Task"),
            "xp": awarded,
            "createdAt": datetime.now().isoformat(timespec="seconds"),
        }
        activity = [activity_item] + [item for item in activity if item.get("id") != task_id]
        activity = activity[:25]

        last_notification = record.get("lastNotification")
        if level_up:
            last_notification = {
                "previousLevel": level_up["previousLevel"],
                "newLevel": level_up["newLevel"],
                "sent": email_result.get("sent", 0),
                "createdAt": datetime.now().isoformat(timespec="seconds"),
            }

        record.update({
            "totalXp": total_xp,
            "completedTasks": sorted(completed),
            "notifiedLevels": sorted(notified_levels),
            "stats": stats,
            "activity": activity,
            "lastNotification": last_notification,
        })
        store[student_id] = record
        write_xp_store(store)

        return self._json(200, {
            "ok": True,
            "duplicate": False,
            "awardedXp": awarded,
            "studentId": student_id,
            "state": state_after,
            "previousState": state_before,
            "stats": stats,
            "activity": activity[:12],
            "lastNotification": last_notification,
            "taskValues": XP_TASK_VALUES,
            "levelUp": level_up,
            "email": email_result,
            "emailConfig": email_config_status(),
        })

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
        meeting_transcript = (answers.get("meetingTranscript") or "").strip()

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
{chr(10).join(qa_lines) if qa_lines else "No quiz answers."}

Full advisor-student meeting transcript (primary evidence):
{meeting_transcript or "Not provided"}"""

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

            pre_context = "\n".join(pre_context_lines)
            qa_text = "\n".join(qa_lines) if qa_lines else "No quiz answers."
            try:
                ai_plan = generate_action_plan_with_retry(
                    focus,
                    pre_context,
                    qa_text,
                    meeting_transcript or "Not provided",
                    result,
                )
                result["actionPlan"] = ai_plan["actionPlan"]
                result["weeklyTasks"] = ai_plan["weeklyTasks"]
            except Exception as plan_exc:
                print(f"[/api/analyze] action plan generation failed: {plan_exc}")
                if isinstance(result.get("actionPlan"), list):
                    result["actionPlan"] = normalize_task_list(result["actionPlan"])
                if isinstance(result.get("weeklyTasks"), list):
                    result["weeklyTasks"] = normalize_task_list(result["weeklyTasks"])
                if not result.get("actionPlan"):
                    result["actionPlan"] = GENERIC_ACTION_PLAN
                if not result.get("weeklyTasks"):
                    result["weeklyTasks"] = GENERIC_WEEKLY_TASKS

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
    email_status = email_svc.verify_connection()
    if email_status.get("ready"):
        print(f"Gmail SMTP ready — sending as {email_status.get('fromAddress')}")
    else:
        print("WARNING: Gmail not configured.")
        print("         Add EMAIL_USER and EMAIL_APP_PASSWORD to .env.local (see GMAIL_SETUP.md)")
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"\n  ✦ Xedu Self-Assessment running at http://localhost:{PORT}\n")
    print("  Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
