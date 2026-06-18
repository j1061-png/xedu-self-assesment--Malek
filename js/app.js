/** Assessment app — sequential 7 questions → AI results → feedback chat */
const App = {
  feedbackHistory: [],
  assessmentContext: "",
  lastResult: null,
  quizIndex: 0,
  quizAnswers: {},

  init() {
    this.bindQuiz();
    this.bindFeedback();
    this.bindRestart();
    this.quizIndex = 0;
    this.quizAnswers = {};
    this.renderQuestion();
    try {
      XP.updateUI();
    } catch (e) {
      console.warn("XP UI skipped", e);
    }
  },

  goToPhase(name) {
    document.querySelectorAll(".phase").forEach((p) => p.classList.remove("active"));
    document.getElementById(`phase-${name}`)?.classList.add("active");
    document.body.classList.toggle("chat-mode", name === "feedback");
    document.querySelectorAll(".step").forEach((s) => {
      s.classList.remove("active", "done");
      const order = ["assessment", "results", "feedback"];
      const cur = order.indexOf(name);
      const mine = order.indexOf(s.dataset.step);
      if (mine < cur) s.classList.add("done");
      if (mine === cur) s.classList.add("active");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  bindQuiz() {
    document.getElementById("quiz-next")?.addEventListener("click", () => this.quizNext());
    document.getElementById("quiz-back")?.addEventListener("click", () => this.quizBack());
    document.getElementById("quiz-input")?.addEventListener("input", () => this.hideQuizError());
  },

  currentQuestion() {
    return QUESTIONS[this.quizIndex];
  },

  getCurrentValue() {
    const q = this.currentQuestion();
    if (!q) return "";
    if (q.type === "choice") {
      return document.querySelector(".quiz-option.selected")?.dataset.value || this.quizAnswers[q.field] || "";
    }
    return document.getElementById("quiz-input")?.value.trim() || this.quizAnswers[q.field] || "";
  },

  validateCurrent() {
    const q = this.currentQuestion();
    const val = this.getCurrentValue();
    if (!val) return "Please answer this question before continuing.";
    if (q.type === "text") {
      const min = q.minLength || 10;
      if (val.length < min) {
        return min <= 5
          ? "Please answer this question before continuing."
          : `Write a fuller answer — at least ${min} characters.`;
      }
    }
    return null;
  },

  saveCurrentAnswer() {
    const q = this.currentQuestion();
    if (q) this.quizAnswers[q.field] = this.getCurrentValue();
  },

  showQuizError(msg) {
    const el = document.getElementById("quiz-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  },

  hideQuizError() {
    document.getElementById("quiz-error")?.classList.add("hidden");
  },

  updateQuizProgress() {
    const total = QUESTIONS.length;
    const done = this.quizIndex;
    const pct = Math.round((done / total) * 100);
    document.getElementById("quiz-counter").textContent = `Question ${this.quizIndex + 1} of ${total}`;
    document.getElementById("quiz-percent-label").textContent = `${pct}% complete`;
    document.getElementById("quiz-progress-fill").style.width = `${pct}%`;
    document.getElementById("quiz-step-label").textContent = `Question ${this.quizIndex + 1}`;
    document.getElementById("quiz-back")?.classList.toggle("hidden", this.quizIndex === 0);
    const nextBtn = document.getElementById("quiz-next");
    if (nextBtn) nextBtn.textContent = this.quizIndex === total - 1 ? "Get My Assessment →" : "Next →";
  },

  renderQuestion() {
    const q = this.currentQuestion();
    if (!q) return;
    this.hideQuizError();
    this.updateQuizProgress();

    const card = document.getElementById("quiz-card");
    card?.classList.toggle("quiz-card-highlight", !!q.highlight);
    document.getElementById("quiz-title").textContent = q.title;

    const sub = document.getElementById("quiz-subtitle");
    sub.textContent = q.subtitle || "";
    sub.style.display = q.subtitle ? "block" : "none";

    const body = document.getElementById("quiz-body");
    const ta = document.getElementById("quiz-input");
    const saved = this.quizAnswers[q.field] || "";

    body?.querySelector(".quiz-options")?.remove();

    if (q.type === "choice") {
      if (ta) ta.classList.add("hidden");
      const opts = document.createElement("div");
      opts.className = "quiz-options";
      q.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quiz-option" + (saved === opt.value ? " selected" : "");
        btn.dataset.value = opt.value;
        btn.innerHTML = `<span class="quiz-option-label">${this.esc(opt.label)}</span>`;
        btn.addEventListener("click", () => {
          opts.querySelectorAll(".quiz-option").forEach((o) => o.classList.remove("selected"));
          btn.classList.add("selected");
          this.hideQuizError();
        });
        opts.appendChild(btn);
      });
      body?.appendChild(opts);
    } else if (ta) {
      ta.className = "quiz-textarea" + (q.minLength <= 5 ? " quiz-textarea-short" : " quiz-textarea-essay");
      ta.rows = q.minLength <= 5 ? 3 : 8;
      ta.placeholder = q.placeholder || "Type your answer…";
      ta.value = saved;
      ta.classList.remove("hidden");
      ta.disabled = false;
      ta.readOnly = false;
      requestAnimationFrame(() => ta.focus());
    }

    card?.classList.remove("quiz-slide-in");
    void card?.offsetWidth;
    card?.classList.add("quiz-slide-in");
  },

  quizBack() {
    if (this.quizIndex === 0) return;
    this.saveCurrentAnswer();
    this.quizIndex--;
    this.renderQuestion();
  },

  async quizNext() {
    const err = this.validateCurrent();
    if (err) return this.showQuizError(err);
    this.saveCurrentAnswer();
    this.hideQuizError();
    if (this.quizIndex < QUESTIONS.length - 1) {
      this.quizIndex++;
      this.renderQuestion();
      return;
    }
    await this.submitQuiz();
  },

  async submitQuiz() {
    const card = document.getElementById("quiz-card");
    const nav = document.querySelector(".quiz-nav");
    const progress = document.querySelector(".quiz-progress-wrap");
    const loading = document.getElementById("quiz-loading");

    card?.classList.add("hidden");
    nav?.classList.add("hidden");
    progress?.classList.add("hidden");
    loading?.classList.remove("hidden");

    const payload = buildAnalyzePayload(this.quizAnswers, "", "", QUESTIONS);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Assessment failed.");
      this.showResults(payload, body.result);
    } catch (submitErr) {
      loading?.classList.add("hidden");
      card?.classList.remove("hidden");
      nav?.classList.remove("hidden");
      progress?.classList.remove("hidden");
      this.showQuizError(submitErr.message);
    }
  },

  bindFeedback() {
    const input = document.getElementById("chat-input");
    document.getElementById("chat-send")?.addEventListener("click", () => this.sendFeedback());
    document.getElementById("feedback-btn")?.addEventListener("click", () => this.startFeedback());
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendFeedback();
      }
    });
    input?.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 200) + "px";
      this.updateComposeState();
    });
    this.updateComposeState();
  },

  updateComposeState() {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send");
    sendBtn?.toggleAttribute("disabled", !input?.value.trim());
  },

  scrollChat() {
    const main = document.getElementById("chat-main");
    if (main) main.scrollTop = main.scrollHeight;
  },

  addMessage(text, role) {
    const box = document.getElementById("chat-messages");
    const row = document.createElement("div");
    const isUser = role === "user";
    row.className = `chat-row chat-row-${isUser ? "user" : "assistant"}`;

    if (!isUser) {
      const avatar = document.createElement("div");
      avatar.className = "chat-avatar chat-avatar-bot";
      avatar.innerHTML = '<img src="assets/logo.png" alt="" />';
      row.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    const p = document.createElement("p");
    p.textContent = text;
    bubble.appendChild(p);
    row.appendChild(bubble);

    box.appendChild(row);
    document.getElementById("chat-layout")?.classList.add("has-messages");
    this.scrollChat();
  },

  showTyping() {
    const box = document.getElementById("chat-messages");
    const row = document.createElement("div");
    row.className = "chat-row chat-row-assistant chat-row-typing";
    row.id = "typing-indicator";
    row.innerHTML = `
      <div class="chat-avatar chat-avatar-bot"><img src="assets/logo.png" alt="" /></div>
      <div class="chat-bubble"><span></span><span></span><span></span></div>
    `;
    box.appendChild(row);
    this.scrollChat();
  },

  hideTyping() {
    document.getElementById("typing-indicator")?.remove();
  },

  showChatError(msg) {
    const el = document.getElementById("chat-error");
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 6000);
  },

  buildAssessmentContext(payload, result) {
    const qa = (payload.questions || [])
      .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
      .join("\n\n");
    const strengths = (result.strengths || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
    return `Assessment focus: ${payload.assessmentFocus}

Student's answers:
${qa}

Your assessment results:
Score: ${result.assessmentScore}% — ${result.scoreLabel || ""}
Overview: ${result.summary || ""}

What's working well:
${strengths}

Biggest gap: ${result.biggestGap || ""}

Next step: ${result.nextStep || ""}`;
  },

  startFeedback() {
    this.goToPhase("feedback");
    const box = document.getElementById("chat-messages");
    if (box?.childElementCount > 0) return;
    const greeting =
      "Your assessment is ready. Ask me anything — I can explain your results, " +
      "help you with your next step, or answer follow-up questions about your profile.";
    this.feedbackHistory = [{ role: "assistant", content: greeting }];
    this.addMessage(greeting, "bot");
  },

  async sendFeedback() {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    input.style.height = "auto";
    this.updateComposeState();
    sendBtn.disabled = true;
    this.addMessage(text, "user");
    this.feedbackHistory.push({ role: "user", content: text });

    this.showTyping();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: this.feedbackHistory,
          assessmentContext: this.assessmentContext,
        }),
      });
      const data = await res.json();
      this.hideTyping();
      if (!res.ok) throw new Error(data.error || "Chat failed.");
      this.feedbackHistory.push({ role: "assistant", content: data.reply });
      this.addMessage(data.reply, "bot");
    } catch (err) {
      this.hideTyping();
      this.showChatError(err.message);
    } finally {
      sendBtn.disabled = false;
      this.updateComposeState();
      input.focus();
    }
  },

  animateScoreRing(percent, color) {
    const ring = document.getElementById("score-ring-fill");
    if (!ring) return;
    const circumference = 2 * Math.PI * 52;
    ring.style.stroke = color;
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference}`;
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = `${circumference * (1 - percent / 100)}`;
    });
  },

  showResults(formData, result) {
    this.lastResult = result;
    this.assessmentContext = this.buildAssessmentContext(formData, result);
    const percent = result.assessmentScore ?? 0;
    const band = scoreLabel(percent);
    const aiLabel = result.scoreLabel || band.label;

    document.getElementById("score-percent").textContent = `${percent}%`;
    document.getElementById("score-label").textContent = aiLabel;
    document.getElementById("score-breakdown").textContent =
      result.scoreExplanation || `Your score reflects how you're doing on: ${formData.assessmentFocus}`;
    this.animateScoreRing(percent, band.color);

    document.getElementById("results-title").textContent = "Your Assessment";
    const focusEl = document.getElementById("results-focus");
    if (formData.assessmentFocus) {
      focusEl.innerHTML = `Assessing: <span>${this.esc(formData.assessmentFocus)}</span>`;
    }
    document.getElementById("result-summary").textContent = result.summary;
    document.getElementById("result-gap").textContent = result.biggestGap;
    document.getElementById("result-next-step").textContent = result.nextStep;

    const grid = document.getElementById("strengths-grid");
    grid.innerHTML = "";
    result.strengths.forEach((s, i) => {
      const card = document.createElement("div");
      card.className = "strength-card reveal";
      card.innerHTML = `<div class="strength-num">Strength ${i + 1}</div><p>${this.esc(s)}</p>`;
      grid.appendChild(card);
    });

    const xp = XP.awardAssessment(percent);
    const badge = document.getElementById("xp-earned-badge");
    if (badge) {
      badge.textContent = xp.improved
        ? `+${xp.total} XP — improved since last time!`
        : `+${xp.total} XP earned!`;
    }

    this.feedbackHistory = [];
    document.getElementById("chat-messages").innerHTML = "";
    document.getElementById("chat-layout")?.classList.remove("has-messages");
    this.goToPhase("results");
  },

  esc(t) {
    const d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
  },

  bindRestart() {
    document.getElementById("restart-btn")?.addEventListener("click", () => {
      this.feedbackHistory = [];
      this.assessmentContext = "";
      this.lastResult = null;
      this.quizIndex = 0;
      this.quizAnswers = {};
      document.getElementById("chat-messages").innerHTML = "";
      document.getElementById("chat-layout")?.classList.remove("has-messages");
      document.querySelectorAll("[data-xp-awarded]").forEach((el) => delete el.dataset.xpAwarded);

      document.getElementById("quiz-card")?.classList.remove("hidden");
      document.querySelector(".quiz-nav")?.classList.remove("hidden");
      document.querySelector(".quiz-progress-wrap")?.classList.remove("hidden");
      document.getElementById("quiz-loading")?.classList.add("hidden");
      this.hideQuizError();
      this.renderQuestion();
      this.goToPhase("assessment");
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("phase-assessment")) App.init();
});
