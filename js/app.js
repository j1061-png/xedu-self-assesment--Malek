/** Assessment app — sequential 7 questions → AI results → feedback chat */
const App = {
  feedbackHistory: [],
  assessmentContext: "",
  improvementPlanKey: "xedu-self-improvement-plan",
  improvementProgressKey: "xedu-self-improvement-progress",
  profileKey: "xedu-profile",
  quizDraftKey: "xedu-assessment-draft",
  lastResult: null,
  quizIndex: 0,
  quizAnswers: {},
  returnPhase: "assessment",
  speechSupported: false,
  recognizers: { quiz: null, chat: null },
  activeRecognizer: null,
  voiceInputs: [
    { kind: "preStudentName", inputId: "student-name-input", buttonId: "student-name-voice-btn" },
    { kind: "preStudentEmail", inputId: "student-email-input", buttonId: "student-email-voice-btn" },
    { kind: "preSchoolName", inputId: "school-name-input", buttonId: "school-name-voice-btn" },
    { kind: "preDisadvantageNotes", inputId: "academic-disadvantage-notes", buttonId: "academic-disadvantage-notes-voice-btn" },
    { kind: "quiz", inputId: "quiz-input", buttonId: "quiz-voice-btn" },
    { kind: "chat", inputId: "chat-input", buttonId: "chat-voice-btn" },
  ],

  init() {
    this.bindPreAssessment();
    this.bindQuiz();
    this.bindFeedback();
    this.bindRestart();
    this.setupSpeechInput();
    this.bindImprovementActions();
    this.quizIndex = 0;
    this.quizAnswers = {};
    this.prefillProfileFromStorage();
    this.showPreAssessmentStep();
    this.updateChatBackButton();
    try {
      XP.updateUI();
    } catch (e) {
      console.warn("XP UI skipped", e);
    }
  },

  goToPhase(name) {
    if (this.activeRecognizer) this.stopAllSpeech();
    if (name !== "feedback") {
      this.returnPhase = name;
      this.updateChatBackButton();
    }
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
    document.getElementById("quiz-voice-btn")?.addEventListener("click", () => this.toggleSpeech("quiz"));
  },

  bindPreAssessment() {
    document.getElementById("pre-assessment-continue")?.addEventListener("click", () => this.startQuizFromPreAssessment());
    document.getElementById("ask-ai-anytime-pre")?.addEventListener("click", () => this.openFeedbackAnytime("assessment"));
    document.getElementById("ask-ai-anytime-quiz")?.addEventListener("click", () => this.openFeedbackAnytime("assessment"));
    [
      "student-name-input",
      "student-email-input",
      "school-name-input",
      "academic-disadvantage-select",
      "academic-disadvantage-notes",
    ].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", () => {
        this.hidePreAssessmentError();
        this.updatePreAssessmentState();
      });
      el?.addEventListener("change", () => {
        this.hidePreAssessmentError();
        this.updatePreAssessmentState();
      });
    });
    [
      { buttonId: "student-name-voice-btn", kind: "preStudentName" },
      { buttonId: "student-email-voice-btn", kind: "preStudentEmail" },
      { buttonId: "school-name-voice-btn", kind: "preSchoolName" },
      { buttonId: "academic-disadvantage-notes-voice-btn", kind: "preDisadvantageNotes" },
    ].forEach(({ buttonId, kind }) => {
      document.getElementById(buttonId)?.addEventListener("click", () => this.toggleSpeech(kind));
    });
  },

  prefillProfileFromStorage() {
    try {
      const raw = localStorage.getItem(this.profileKey);
      if (!raw) return;
      const profile = JSON.parse(raw);
      if (!profile || typeof profile !== "object") return;
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = value || "";
      };
      set("student-name-input", profile.studentName);
      set("student-email-input", profile.studentEmail);
    } catch (e) {
      console.warn("Profile prefill skipped", e);
    }
  },

  showPreAssessmentStep() {
    document.getElementById("pre-assessment-card")?.classList.remove("hidden");
    document.getElementById("quiz-shell")?.classList.add("hidden");
    this.hideQuizError();
    this.hidePreAssessmentError();
    this.updatePreAssessmentState();
    requestAnimationFrame(() => document.getElementById("school-name-input")?.focus());
  },

  showQuizStep() {
    document.getElementById("pre-assessment-card")?.classList.add("hidden");
    document.getElementById("quiz-shell")?.classList.remove("hidden");
  },

  saveDraft(showStatus = false) {
    this.saveCurrentAnswer();
    const draft = {
      quizIndex: this.quizIndex,
      quizAnswers: this.quizAnswers,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(this.quizDraftKey, JSON.stringify(draft));
      if (showStatus) this.showQuizNotice("Draft saved locally.");
    } catch (e) {
      if (showStatus) this.showQuizError("Draft could not be saved in this browser.");
    }
  },

  loadDraft() {
    try {
      const raw = localStorage.getItem(this.quizDraftKey);
      if (!raw) return false;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== "object") return false;
      this.quizAnswers = draft.quizAnswers || {};
      this.quizIndex = Math.min(Math.max(Number(draft.quizIndex) || 0, 0), QUESTIONS.length - 1);
      return true;
    } catch (e) {
      return false;
    }
  },

  showPreAssessmentError(msg) {
    const el = document.getElementById("pre-assessment-error");
    if (!el) return;
    el.textContent = this.normalizeUserError(msg);
    el.classList.remove("hidden");
  },

  hidePreAssessmentError() {
    document.getElementById("pre-assessment-error")?.classList.add("hidden");
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  parseAdvisorEmails(raw) {
    return String(raw || "")
      .split(/[,\n;]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  },

  getProfileFromInputs() {
    const studentName = document.getElementById("student-name-input")?.value.trim() || "";
    const studentEmail = document.getElementById("student-email-input")?.value.trim() || "";
    return { studentName, studentEmail };
  },

  validatePreAssessmentFields() {
    return true;
  },

  updatePreAssessmentState() {
    const continueBtn = document.getElementById("pre-assessment-continue");
    if (!continueBtn) return;
    continueBtn.disabled = !this.validatePreAssessmentFields();
  },

  validateProfile(profile) {
    if (!profile.studentName || profile.studentName.length < 2) {
      return "Please add the student full name before continuing.";
    }
    if (profile.studentEmail && !this.isValidEmail(profile.studentEmail)) {
      return "Please enter a valid student email, or leave it blank.";
    }
    return null;
  },

  saveProfile(profile) {
    localStorage.setItem(this.profileKey, JSON.stringify(profile));
  },

  startQuizFromPreAssessment() {
    const profile = this.getProfileFromInputs();
    const schoolName = document.getElementById("school-name-input")?.value.trim() || "";
    const disadvantage = document.getElementById("academic-disadvantage-select")?.value || "";
    const notes = document.getElementById("academic-disadvantage-notes")?.value.trim() || "";

    const profileError = this.validateProfile(profile);
    if (!profileError) {
      this.saveProfile(profile);
      this.quizAnswers.studentName = profile.studentName;
      this.quizAnswers.studentEmail = profile.studentEmail;
    }
    if (schoolName) this.quizAnswers.schoolName = schoolName;
    if (disadvantage) this.quizAnswers.academicDisadvantage = disadvantage;
    if (notes) this.quizAnswers.academicDisadvantageNotes = notes;

    this.hidePreAssessmentError();
    this.showQuizStep();
    this.renderQuestion();
  },

  setupSpeechInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.speechSupported = Boolean(SpeechRecognition);

    if (!this.speechSupported) {
      this.voiceInputs.map((v) => v.buttonId).forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = true;
        btn.title = "Voice input not supported in this browser";
      });
      return;
    }

    this.voiceInputs.forEach(({ kind, inputId, buttonId }) => {
      this.recognizers[kind] = this.buildRecognizer(kind, inputId, buttonId);
    });
  },

  buildRecognizer(kind, inputId, buttonId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec._inputId = inputId;
    rec._kind = kind;
    rec._buttonId = buttonId;
    rec._baseValue = "";

    rec.onstart = () => {
      const input = document.getElementById(inputId);
      rec._baseValue = input?.value.trim() || "";
      this.activeRecognizer = kind;
      document.getElementById(buttonId)?.classList.add("listening");
      document.getElementById(buttonId)?.setAttribute("aria-pressed", "true");
    };

    rec.onend = () => {
      document.getElementById(buttonId)?.classList.remove("listening");
      document.getElementById(buttonId)?.setAttribute("aria-pressed", "false");
      if (this.activeRecognizer === kind) this.activeRecognizer = null;
    };

    rec.onerror = (event) => {
      if (event?.error === "aborted") return;
      const msg =
        event?.error === "not-allowed" || event?.error === "service-not-allowed"
          ? "Microphone permission is blocked. Allow mic access, then try again."
          : "Voice input failed. Please try again.";
      this.showVoiceError(kind, msg);
    };

    rec.onresult = (event) => {
      const input = document.getElementById(inputId);
      if (!input) return;

      const finalParts = [];
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = (result[0]?.transcript || "").trim();
        if (!text) continue;
        if (result.isFinal) {
          finalParts.push(text);
        } else {
          interim = text;
        }
      }

      const sessionText = [...finalParts, interim].filter(Boolean).join(" ").trim();
      if (!sessionText) return;

      const base = rec._baseValue || "";
      input.value = base ? `${base} ${sessionText}`.trim() : sessionText;

      if (kind === "quiz") this.hideQuizError();
      if (kind === "chat") this.updateComposeState();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    return rec;
  },

  ensureRecognizer(kind) {
    const config = this.voiceInputs.find((v) => v.kind === kind);
    if (!config) return null;
    this.recognizers[kind] = this.buildRecognizer(config.kind, config.inputId, config.buttonId);
    return this.recognizers[kind];
  },

  toggleSpeech(kind) {
    if (!this.speechSupported) return;

    if (this.activeRecognizer && this.activeRecognizer !== kind) {
      this.recognizers[this.activeRecognizer]?.stop();
    }

    if (this.activeRecognizer === kind) {
      this.recognizers[kind]?.stop();
      return;
    }

    const rec = this.ensureRecognizer(kind);
    if (!rec) return;

    try {
      rec.start();
    } catch (err) {
      try {
        const retry = this.ensureRecognizer(kind);
        retry?.start();
      } catch (retryErr) {
        this.showVoiceError(kind, "Voice input could not start. Please click mic again.");
      }
    }
  },

  stopAllSpeech() {
    Object.keys(this.recognizers).forEach((kind) => {
      try {
        this.recognizers[kind]?.stop();
      } catch (e) {
        /* ignore */
      }
    });
    this.activeRecognizer = null;
    document.querySelectorAll(".voice-btn.listening").forEach((btn) => {
      btn.classList.remove("listening");
      btn.setAttribute("aria-pressed", "false");
    });
  },

  showVoiceError(kind, message) {
    if (kind === "quiz") {
      this.showQuizError(message);
      return;
    }
    if (String(kind).startsWith("pre")) {
      this.showPreAssessmentError(message);
      return;
    }
    this.showChatError(message);
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
    el.textContent = this.normalizeUserError(msg);
    el.classList.remove("hidden", "alert-info");
    el.classList.add("alert-error");
  },

  hideQuizError() {
    document.getElementById("quiz-error")?.classList.add("hidden");
  },

  showQuizNotice(msg) {
    const el = document.getElementById("quiz-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden", "alert-error");
    el.classList.add("alert-info");
    clearTimeout(this.quizNoticeTimer);
    this.quizNoticeTimer = setTimeout(() => this.hideQuizError(), 1800);
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
    const voiceBtn = document.getElementById("quiz-voice-btn");
    const saved = this.quizAnswers[q.field] || "";

    body?.querySelector(".quiz-options")?.remove();

    if (q.type === "choice") {
      if (this.activeRecognizer === "quiz") this.recognizers.quiz?.stop();
      if (ta) ta.classList.add("hidden");
      if (voiceBtn) voiceBtn.disabled = true;
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
      if (voiceBtn) voiceBtn.disabled = !this.speechSupported;
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
    this.saveDraft(false);
  },

  async quizNext() {
    const err = this.validateCurrent();
    if (err) return this.showQuizError(err);
    this.saveCurrentAnswer();
    this.saveDraft(false);
    this.hideQuizError();
    if (this.quizIndex < QUESTIONS.length - 1) {
      this.quizIndex++;
      this.renderQuestion();
      this.saveDraft(false);
      return;
    }
    this.saveDraft(false);
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
      const body = await this.postAnalyze(payload);
      this.showResults(payload, body.result);
    } catch (submitErr) {
      loading?.classList.add("hidden");
      card?.classList.remove("hidden");
      nav?.classList.remove("hidden");
      progress?.classList.remove("hidden");
      this.showQuizError(submitErr.message);
    }
  },

  async postAnalyze(payload) {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Assessment failed.");
    return body;
  },

  bindFeedback() {
    const input = document.getElementById("chat-input");
    document.getElementById("chat-send")?.addEventListener("click", () => this.sendFeedback());
    document.getElementById("feedback-btn")?.addEventListener("click", () => this.startFeedback());
    document.getElementById("chat-back-btn")?.addEventListener("click", () => this.goToPhase(this.returnPhase || "assessment"));
    document.getElementById("chat-voice-btn")?.addEventListener("click", () => this.toggleSpeech("chat"));
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

  openFeedbackAnytime(returnPhase = "assessment") {
    const profile = this.getProfileFromInputs();
    const schoolName = document.getElementById("school-name-input")?.value.trim() || "";
    const disadvantage = document.getElementById("academic-disadvantage-select")?.value || "";
    const notes = document.getElementById("academic-disadvantage-notes")?.value.trim() || "";

    // "Ask Xedu now" must stay available at any stage without hard blockers.
    const profileError = this.validateProfile(profile);
    if (!profileError) {
      this.saveProfile(profile);
    } else {
      this.hidePreAssessmentError();
    }

    if (schoolName) this.quizAnswers.schoolName = schoolName;
    if (disadvantage) this.quizAnswers.academicDisadvantage = disadvantage;
    if (notes) this.quizAnswers.academicDisadvantageNotes = notes;

    this.returnPhase = returnPhase;
    this.updateChatBackButton();
    this.startFeedback();
  },

  updateChatBackButton() {
    const btn = document.getElementById("chat-back-btn");
    if (!btn) return;
    btn.classList.toggle("hidden", !this.returnPhase);
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
    el.textContent = this.normalizeUserError(msg);
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 6000);
  },

  normalizeUserError(msg) {
    const text = String(msg || "").trim();
    if (!text) return "Something went wrong. Please try again.";
    return text;
  },

  bindImprovementActions() {
    document.getElementById("share-action-plan-btn")?.addEventListener("click", () => this.shareActionPlan());
  },

  showShareStatus(msg, isError = false) {
    const el = document.getElementById("share-action-plan-status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "var(--error)" : "var(--muted)";
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 4500);
  },

  buildActionPlanShareText() {
    const result = this.lastResult || {};
    const focus = this.quizAnswers?.assessmentFocus || "My academic development";
    const score = typeof result.assessmentScore === "number" ? `${result.assessmentScore}%` : "N/A";
    const nextStep = result.nextStep || "No next step provided";
    const actionPlan = (result.actionPlan || []).map((item, i) => `${i + 1}. ${item}`).join("\n");
    const weeklyTasks = (result.weeklyTasks || []).map((item, i) => `${i + 1}. ${item}`).join("\n");

    const summary = result.summary || "Not available";
    const biggestGap = result.biggestGap || "Not available";

    return `My Xedu Self-Improvement Plan

Focus: ${focus}
Score: ${score}
Summary: ${summary}
Biggest gap: ${biggestGap}
Next step: ${nextStep}

Action plan:
${actionPlan || "Not available"}

Weekly tasks:
${weeklyTasks || "Not available"}`;
  },

  persistImprovementPlan(formData, result) {
    const payload = {
      generatedAt: new Date().toISOString(),
      assessmentFocus: formData?.assessmentFocus || "",
      assessmentScore: result?.assessmentScore ?? null,
      scoreLabel: result?.scoreLabel || "",
      summary: result?.summary || "",
      biggestGap: result?.biggestGap || "",
      nextStep: result?.nextStep || "",
      actionPlan: Array.isArray(result?.actionPlan) ? result.actionPlan : [],
      weeklyTasks: Array.isArray(result?.weeklyTasks) ? result.weeklyTasks : [],
      strengths: Array.isArray(result?.strengths) ? result.strengths : [],
      studentContext: {
        answers: formData?.answers || {},
        questions: formData?.questions || [],
        assessment: {
          assessmentScore: result?.assessmentScore ?? null,
          scoreLabel: result?.scoreLabel || "",
          summary: result?.summary || "",
          biggestGap: result?.biggestGap || "",
          nextStep: result?.nextStep || "",
          strengths: result?.strengths || [],
        },
      },
    };
    localStorage.setItem(this.improvementPlanKey, JSON.stringify(payload));
    localStorage.removeItem(this.improvementProgressKey);
  },

  async shareActionPlan() {
    const text = this.buildActionPlanShareText();
    try {
      if (navigator.share) {
        await navigator.share({
          title: "My Xedu Action Plan",
          text,
        });
        this.showShareStatus("Action plan shared.");
        return;
      }
      throw new Error("Web Share not supported");
    } catch (shareErr) {
      if (shareErr?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        this.showShareStatus("Action plan copied. You can paste and share it.");
      } catch (copyErr) {
        this.showShareStatus("Could not share automatically. Please copy manually.", true);
      }
    }
  },

  buildAssessmentContext(payload, result) {
    const schoolName = payload.answers?.schoolName || "Not provided";
    const disadvantage = payload.answers?.academicDisadvantage || "Not provided";
    const disadvantageNotes = payload.answers?.academicDisadvantageNotes || "Not provided";
    const qa = (payload.questions || [])
      .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
      .join("\n\n");
    const strengths = (result.strengths || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
    const actionPlan = (result.actionPlan || []).map((step, i) => `${i + 1}. ${step}`).join("\n");
    const weeklyTasks = (result.weeklyTasks || []).map((task, i) => `${i + 1}. ${task}`).join("\n");
    return `Assessment focus: ${payload.assessmentFocus}

Student profile context:
School: ${schoolName}
Academic disadvantages / barriers: ${disadvantage}
Details: ${disadvantageNotes}

Student's answers:
${qa}

Your assessment results:
Score: ${result.assessmentScore}% — ${result.scoreLabel || ""}
Overview: ${result.summary || ""}

What's working well:
${strengths}

Biggest gap: ${result.biggestGap || ""}

Next step: ${result.nextStep || ""}

Self improvement action plan:
${actionPlan || "Not provided"}

Weekly tasks:
${weeklyTasks || "Not provided"}`;
  },

  startFeedback() {
    this.goToPhase("feedback");
    const box = document.getElementById("chat-messages");
    if (box?.childElementCount > 0) return;
    const hasAssessment = Boolean(this.assessmentContext);
    const greeting = hasAssessment
      ? "Your assessment is ready. Ask me anything — I can explain your results, help you with your next step, or answer follow-up questions about your profile."
      : "Ask me anything at any time. I will give constructive, specific advice you can act on right now.";
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
    this.persistImprovementPlan(formData, result);
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
    this.renderImprovementLists(result);

    const grid = document.getElementById("strengths-grid");
    grid.innerHTML = "";
    result.strengths.forEach((s, i) => {
      const card = document.createElement("div");
      card.className = "strength-card reveal";
      card.innerHTML = `<div class="strength-num">Strength ${i + 1}</div><p>${this.esc(s)}</p>`;
      grid.appendChild(card);
    });

    const badge = document.getElementById("xp-earned-badge");
    if (badge) badge.textContent = "Saving XP…";
    this.saveAssessmentTaskXp(formData, percent, badge);

    this.feedbackHistory = [];
    document.getElementById("chat-messages").innerHTML = "";
    document.getElementById("chat-layout")?.classList.remove("has-messages");
    this.goToPhase("results");
  },

  renderImprovementLists(result) {
    const ctx = this.assessmentContext;
    Improvement.renderList("result-action-plan", result.actionPlan, "actionPlan", { assessmentContext: ctx });
    Improvement.renderList("result-weekly-tasks", result.weeklyTasks, "weeklyTasks", { assessmentContext: ctx });
  },

  esc(t) {
    const d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
  },

  hashString(value) {
    const text = String(value || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  },

  taskIdFor(type, payload) {
    return `${type}:${this.hashString(JSON.stringify(payload || {}))}`;
  },

  async saveAssessmentTaskXp(formData, percent, badge) {
    if (typeof XP === "undefined") return;
    try {
      const taskId = this.taskIdFor("assessment", {
        focus: formData.assessmentFocus,
        answers: formData.answers,
        questions: formData.questions,
        score: percent,
      });
      const result = await XP.completeTask(
        "assessment",
        taskId,
        { score: percent },
        { showPopup: true }
      );
      await XP.tryScoreImprovement(percent, taskId);
      if (badge) {
        badge.textContent = result.duplicate
          ? "Assessment XP already saved"
          : `+${result.awardedXp.toLocaleString()} XP earned`;
      }
    } catch (e) {
      if (badge) badge.textContent = "Assessment complete — XP will sync when the server is available";
      console.warn("Assessment XP award failed", e);
    }
  },

  bindRestart() {
    document.getElementById("restart-btn")?.addEventListener("click", () => {
      this.stopAllSpeech();
      this.feedbackHistory = [];
      this.assessmentContext = "";
      this.lastResult = null;
      localStorage.removeItem(this.improvementPlanKey);
      localStorage.removeItem(this.improvementProgressKey);
      this.quizIndex = 0;
      this.quizAnswers = {};
      this.returnPhase = "assessment";
      localStorage.removeItem(this.profileKey);
      const studentName = document.getElementById("student-name-input");
      const studentEmail = document.getElementById("student-email-input");
      const schoolInput = document.getElementById("school-name-input");
      const disadvantageSelect = document.getElementById("academic-disadvantage-select");
      const disadvantageNotes = document.getElementById("academic-disadvantage-notes");
      if (studentName) studentName.value = "";
      if (studentEmail) studentEmail.value = "";
      if (schoolInput) schoolInput.value = "";
      if (disadvantageSelect) disadvantageSelect.value = "";
      if (disadvantageNotes) disadvantageNotes.value = "";
      document.getElementById("chat-messages").innerHTML = "";
      document.getElementById("chat-layout")?.classList.remove("has-messages");
      document.getElementById("quiz-card")?.classList.remove("hidden");
      document.querySelector(".quiz-nav")?.classList.remove("hidden");
      document.querySelector(".quiz-progress-wrap")?.classList.remove("hidden");
      document.getElementById("quiz-loading")?.classList.add("hidden");
      this.hideQuizError();
      document.getElementById("share-action-plan-status")?.classList.add("hidden");
      Improvement.renderList("result-action-plan", [], "actionPlan");
      Improvement.renderList("result-weekly-tasks", [], "weeklyTasks");
      document.getElementById("result-summary").textContent = "";
      document.getElementById("result-gap").textContent = "";
      document.getElementById("result-next-step").textContent = "";
      document.getElementById("strengths-grid").innerHTML = "";
      document.getElementById("results-focus").textContent = "";
      document.getElementById("score-percent").textContent = "0%";
      document.getElementById("xp-earned-badge").textContent = "+150 XP earned";
      this.showPreAssessmentStep();
      this.updateChatBackButton();
      this.goToPhase("assessment");
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("phase-assessment")) App.init();
});
