# XEdu

XEdu is an AI-powered student development platform that helps students better understand their academic and extracurricular profile through personalized assessments and interactive feedback.

Students complete a short self-assessment covering academics, extracurricular activities, achievements, interests, challenges, and future aspirations. Using AI, XEdu analyzes these responses to generate meaningful insights, identify strengths, highlight opportunities for growth, and recommend actionable next steps.

Unlike traditional assessment tools that simply provide a report, XEdu enables students to continue the conversation through an integrated AI mentor. Students can ask follow-up questions, discuss their experiences, explore opportunities, and receive ongoing personalized guidance tailored to their unique profile.

---

## Why XEdu?

Many students know what they have accomplished but struggle to understand what those experiences actually say about them. They may not know which strengths stand out, what areas need improvement, or what opportunities they should pursue next.

XEdu was built to bridge this gap by combining intelligent profile analysis with conversational AI guidance. The goal is to help students reflect on their experiences, discover their potential, and make more informed decisions about their future.

---

## Key Features

### Personalized Student Assessment

Students complete a structured assessment designed to build a holistic understanding of their profile. Questions cover areas such as:

- Academic performance
- Subject interests
- Extracurricular involvement
- Leadership experiences
- Awards and achievements
- Personal challenges
- Future goals and aspirations

### AI-Powered Analysis

Once completed, the assessment is analyzed using AI to generate personalized feedback, including:

- Profile overview
- Key strengths
- Areas for improvement
- Growth opportunities
- Actionable recommendations

### Interactive AI Mentor

After receiving their assessment results, students can continue engaging with XEdu through an integrated AI chat experience.

Students can:

- Ask questions about their assessment
- Explore their strengths in greater depth
- Discuss academic interests
- Reflect on extracurricular experiences
- Receive personalized advice
- Brainstorm projects and initiatives
- Identify leadership opportunities
- Explore future academic and career pathways

Rather than ending after the assessment, the experience evolves into an ongoing conversation that helps students continuously learn more about themselves.

### Actionable Recommendations

XEdu focuses on practical guidance rather than generic feedback. Recommendations are designed to help students take meaningful next steps and continue developing their academic and extracurricular profile.

### Student-Centered Design

The platform is designed to be simple, intuitive, and accessible. Results are presented clearly, allowing students to easily understand their feedback and take action.

---

## How It Works

### Step 1: Complete the Assessment

Students answer a series of questions about their academic journey, extracurricular involvement, achievements, interests, and goals.

### Step 2: Receive Personalized Insights

XEdu analyzes the responses and generates an individualized assessment report containing strengths, growth areas, and recommendations.

### Step 3: Continue the Conversation

Students can then chat directly with the AI mentor to gain deeper insights, ask questions, and receive further guidance tailored to their experiences and aspirations.

---

## Technology Stack

- HTML
- CSS
- JavaScript
- Python
- DeepSeek API
- Gmail API (advisor level-up emails)

---

## Local setup

```bash
python3 server.py
```

Open `http://localhost:3000`.

Add `DEEPSEEK_API_KEY` to `.env.local` (see `.env.example`).

### Gmail advisor notifications

Level-up emails use **Gmail SMTP + App Password** (no separate mail server required).

1. Follow **[GMAIL_SETUP.md](GMAIL_SETUP.md)** to set `EMAIL_USER` and `EMAIL_APP_PASSWORD` in `.env.local`.
2. Run `python3 server.py` and level up on the Rewards page to test.

```bash
curl http://127.0.0.1:3000/api/email/status
python3 scripts/test_email.py advisor@example.com
```

---

## Vision

We believe every student deserves access to personalized guidance and mentorship.

XEdu aims to make high-quality educational support accessible to all students by leveraging artificial intelligence to provide meaningful feedback, encourage self-reflection, and empower students to take ownership of their personal and academic growth.

By combining assessment, analysis, and conversation into a single platform, XEdu transforms self-evaluation into an engaging and insightful experience.

---

## Built For Students

Whether a student is looking to understand their strengths, improve their profile, discover new opportunities, or simply gain clarity about their future, XEdu provides a space for meaningful reflection and personalized guidance.
