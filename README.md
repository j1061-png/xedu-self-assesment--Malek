# Xedu — Student Self-Assessment

Xedu is a student-facing web app that collects profile information, runs an AI assessment, and returns clear guidance.

## What It Is.

These are the non-negotiable requirements this app is designed to satisfy.

### 1) Input form with 5 to 7 questions
- The assessment flow uses **7 questions**.
- Questions are natural and easy to answer.
- Coverage includes both:
  - academics (grade, subjects, challenges)
  - extracurriculars (activities, achievements, weekly time)

### 2) AI-generated output
- On submit, the frontend sends answers to `POST /api/analyze`.
- The response is personalized and includes:
  - **strengths**
  - **biggest gap**
  - **one specific next step**

### 3) Clean, readable results screen
- Output is shown in separate sections (not a wall of raw text):
  - score + overview
  - strengths
  - biggest gap
  - next step

### 4) It must actually run
- Run locally with:

```bash
python3 server.py
```

- Open:
  - `http://localhost:3000`
  - `http://localhost:3000/assessment.html`

If it does not run live, it does not count.

## App Flow

1. **Questions** — student answers 7 prompts.
2. **Results** — AI returns score, strengths, biggest gap, next step.
3. **Feedback** — student can ask follow-up questions about the result.

## AI Setup

Create `.env.local` in the project root:

```env
DEEPSEEK_API_KEY=your_key_here
```

If requests fail with insufficient balance, top up at [platform.deepseek.com](https://platform.deepseek.com).

## Stack

- Plain HTML/CSS/JavaScript
- Python server (`server.py`) for static files and API routes
