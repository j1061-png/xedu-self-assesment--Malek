/**
 * Backend-driven XP system.
 * The frontend never decides trusted XP totals; it only renders server state.
 */
const XP = {
  profileKey: "xedu-profile",
  levels: [
    { level: 1, award: "First Steps", desc: "Welcome to Xedu — your journey begins.", icon: "icon-sparkle", xp: 0 },
    { level: 2, award: "Curious Mind", desc: "You completed your first self-assessment.", icon: "icon-chat", xp: 250 },
    { level: 3, award: "Focus Finder", desc: "You defined what Xedu should assess.", icon: "icon-document", xp: 600 },
    { level: 4, award: "Reflection Pro", desc: "You're building self-awareness.", icon: "icon-clipboard", xp: 1000 },
    { level: 5, award: "Pathfinder", desc: "You're mapping your future path.", icon: "icon-compass", xp: 1500 },
    { level: 6, award: "Rising Star", desc: "Your profile is taking shape.", icon: "icon-star", xp: 2100 },
    { level: 7, award: "Achiever", desc: "Consistent effort — keep going.", icon: "icon-target", xp: 2800 },
    { level: 8, award: "Scholar", desc: "Academic excellence in sight.", icon: "icon-graduation", xp: 3600 },
    { level: 9, award: "Trailblazer", desc: "Leading your own growth.", icon: "icon-bolt", xp: 4500 },
    { level: 10, award: "Xedu Master", desc: "Top-tier self-assessment champion.", icon: "icon-chart", xp: 5500 },
  ],
  emailConfig: {
    gmailConfigured: false,
    smtpConfigured: false,
    provider: null,
  },
  state: {
    totalXp: 0,
    level: 1,
    currentLevelXp: 0,
    nextLevelXp: 250,
    xpIntoLevel: 0,
    xpToNext: 250,
    progressPercent: 0,
    previousLevel: 1,
    nextLevel: 2,
    maxLevel: 100,
  },
  stats: {
    assessmentsCompleted: 0,
    tasksCompleted: 0,
    reflectionsCompleted: 0,
    improvementsCompleted: 0,
  },
  activity: [],
  lastNotification: null,
  taskValues: {
    assessment: 75,
    advisorTask: 100,
    reflection: 40,
    improvement: 60,
  },
  popupTimer: null,

  getProfile() {
    try {
      const raw = localStorage.getItem(this.profileKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  async request(path, payload = {}) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "XP request failed.");
    return data;
  },

  async refresh() {
    try {
      const data = await this.request("/api/xp/state", { profile: this.getProfile() });
      this.stats = data.stats || this.stats;
      this.activity = Array.isArray(data.activity) ? data.activity : [];
      this.lastNotification = data.lastNotification || null;
      this.taskValues = data.taskValues || this.taskValues;
      this.emailConfig = data.emailConfig || this.emailConfig;
      this.applyState(data.state, { animate: false });
      return data.state;
    } catch (e) {
      console.warn("XP state unavailable", e);
      this.updateUI();
      return this.state;
    }
  },

  async completeTask(taskType, taskId, metadata = {}, options = {}) {
    const profile = this.getProfile();
    const previousState = { ...this.state };
    const data = await this.request("/api/xp/complete-task", {
      taskType,
      taskId,
      metadata,
      profile,
    });

    this.stats = data.stats || this.stats;
    this.activity = Array.isArray(data.activity) ? data.activity : this.activity;
    this.lastNotification = data.lastNotification || this.lastNotification;
    this.taskValues = data.taskValues || this.taskValues;
    this.emailConfig = data.emailConfig || this.emailConfig;
    this.applyState(data.state, { animate: true, previousState: data.previousState || previousState });

    if (!data.duplicate && data.awardedXp > 0 && options.showPopup !== false) {
      this.showPopup(`+${data.awardedXp.toLocaleString()} XP`);
    }

    if (data.levelUp) {
      this.showLevelUpLoading(data.levelUp);
      const emailResult = await this.notifyAdvisorLevelUp(data.levelUp, data.email || {});
      this.celebrateLevelUp(data.levelUp, emailResult || data.email || {});
    }

    return data;
  },

  async notifyAdvisorLevelUp(levelUp, emailResult = {}) {
    if ((emailResult.sent || 0) > 0 || (emailResult.skippedDuplicates || []).length) {
      return emailResult;
    }
    const profile = this.getProfile();
    const advisors = Array.isArray(profile.advisorEmails) ? profile.advisorEmails.filter(Boolean) : [];
    if (!advisors.length) {
      return { ok: false, message: "Unable to notify advisor — no advisor emails on file." };
    }
    try {
      const res = await fetch("/api/notify-level-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: profile.studentName || "Student",
          studentEmail: profile.studentEmail || "",
          advisorEmails: advisors,
          level: levelUp.newLevel,
          previousLevel: levelUp.previousLevel,
          totalXp: this.state.totalXp,
          xp: this.state.totalXp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Notify failed");
      return data;
    } catch (e) {
      console.warn("Advisor notify failed", e);
      return { ok: false, message: "Unable to notify advisor", error: e.message };
    }
  },

  applyState(nextState, { animate = true, previousState = this.state } = {}) {
    if (!nextState) return;
    const from = previousState || this.state;
    this.state = { ...this.state, ...nextState };
    this.updateUI(animate ? from : this.state);
  },

  get() {
    return this.state.totalXp || 0;
  },

  level() {
    return this.state.level || 1;
  },

  progressInLevel() {
    return this.state.progressPercent || 0;
  },

  getLevelInfo(levelNum) {
    const level = Math.max(1, Math.min(this.state.maxLevel || 100, Number(levelNum) || 1));
    return this.levels.find((l) => l.level === level) || { level, label: `Level ${level}`, award: `Level ${level}`, desc: "", icon: "icon-star", xp: 0 };
  },

  isLevelUnlocked(levelNum) {
    return (this.state.level || 1) >= levelNum;
  },

  animateNumber(el, from, to) {
    if (!el) return;
    const start = Number(from) || 0;
    const end = Number(to) || 0;
    if (start === end) {
      el.textContent = end.toLocaleString();
      return;
    }
    const duration = 650;
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + (end - start) * eased);
      el.textContent = value.toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  updateUI(previousState = this.state) {
    const state = this.state;
    const elTotal = document.getElementById("xp-total");
    const elLevel = document.getElementById("level");
    const elBar = document.getElementById("xp-bar");

    this.animateNumber(elTotal, previousState.totalXp, state.totalXp);
    if (elLevel) elLevel.textContent = state.level;
    if (elBar) elBar.style.width = `${state.progressPercent || 0}%`;

    this.renderAdvisorPanel("xp-advisor-panel");
  },

  renderAdvisorPanel(containerId = "xp-advisor-panel") {
    const el = document.getElementById(containerId);
    if (!el) return;
    const profile = this.getProfile();
    const emails = Array.isArray(profile.advisorEmails) ? profile.advisorEmails.filter(Boolean) : [];
    const nextLevel = this.state.nextLevel || Math.min(100, this.level() + 1);
    const xpToNext = this.state.xpToNext || 0;
    const emailReady = Boolean(this.emailConfig?.gmailConfigured || this.emailConfig?.smtpConfigured);
    const providerLabel =
      this.emailConfig?.provider === "gmail_api"
        ? "Gmail API"
        : this.emailConfig?.provider === "smtp"
          ? "SMTP"
          : "not configured";

    if (!emails.length) {
      el.innerHTML = `
        <div class="xp-advisor-panel xp-advisor-panel--setup">
          <div class="xp-advisor-panel-icon" aria-hidden="true"><svg><use href="assets/icons.svg#icon-document"></use></svg></div>
          <div>
            <h3>Advisor alerts not set up yet</h3>
            <p>Add advisor email details in the assessment. Configure Gmail in <code>.env.local</code> — see <strong>GMAIL_SETUP.md</strong> — level-ups email advisors automatically.</p>
            <a href="assessment.html" class="btn btn-primary btn-sm">Add advisor details</a>
          </div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="xp-advisor-panel xp-advisor-panel--active">
        <div class="xp-advisor-panel-icon" aria-hidden="true"><svg><use href="assets/icons.svg#icon-document"></use></svg></div>
        <div class="xp-advisor-panel-body">
          <h3>Advisor level alerts ${emailReady ? "are on" : "need server setup"}</h3>
          <p class="xp-advisor-lead">${emailReady ? "Emails send automatically via Gmail when you unlock a new level." : "Add EMAIL_USER and EMAIL_APP_PASSWORD to .env.local (see GMAIL_SETUP.md)."}</p>
          <ul class="xp-advisor-meta">
            <li><strong>Advisor email(s):</strong> ${emails.map((e) => this.escHtml(e)).join(", ")}</li>
            <li><strong>Next alert:</strong> Level ${nextLevel} (${xpToNext.toLocaleString()} XP to go)</li>
            <li><strong>Email provider:</strong> ${this.escHtml(providerLabel)}</li>
          </ul>
        </div>
      </div>`;
  },

  escHtml(text) {
    const d = document.createElement("div");
    d.textContent = text || "";
    return d.innerHTML;
  },

  ensureOverlays() {
    if (!document.getElementById("xp-popup")) {
      const popup = document.createElement("div");
      popup.id = "xp-popup";
      popup.className = "xp-popup hidden";
      popup.setAttribute("role", "status");
      popup.setAttribute("aria-live", "polite");
      popup.innerHTML = `<span class="xp-popup-icon" aria-hidden="true">+</span><span class="xp-popup-text">+0 XP</span>`;
      document.body.appendChild(popup);
    }

    if (!document.getElementById("levelup-modal")) {
      const modal = document.createElement("div");
      modal.id = "levelup-modal";
      modal.className = "levelup-modal hidden";
      modal.innerHTML = `
        <div class="levelup-backdrop"></div>
        <div class="levelup-card" role="dialog" aria-modal="true" aria-labelledby="levelup-title">
          <div class="levelup-badge">Level Up!</div>
          <div class="levelup-advisor-feature" id="levelup-advisor-feature">
            <span class="levelup-advisor-icon" aria-hidden="true"><svg><use href="assets/icons.svg#icon-document"></use></svg></span>
            <p class="levelup-advisor-headline" id="levelup-advisor-headline">Advisor update</p>
            <p class="levelup-advisor-notify" id="levelup-advisor-notify"></p>
          </div>
          <div class="levelup-icon" id="levelup-icon">2</div>
          <h2 id="levelup-title">Level <span id="levelup-num">2</span></h2>
          <p class="levelup-desc" id="levelup-desc"></p>
          <button type="button" class="btn btn-primary" id="levelup-close">Continue</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector(".levelup-backdrop")?.addEventListener("click", () => this.hideLevelUp());
      document.getElementById("levelup-close")?.addEventListener("click", () => this.hideLevelUp());
    }
  },

  showPopup(text) {
    this.ensureOverlays();
    const popup = document.getElementById("xp-popup");
    const textEl = popup?.querySelector(".xp-popup-text");
    if (!popup || !textEl) return;

    clearTimeout(this.popupTimer);
    textEl.textContent = text;
    popup.classList.remove("hidden");
    requestAnimationFrame(() => popup.classList.add("is-show"));
    this.bumpHeader();

    this.popupTimer = setTimeout(() => {
      popup.classList.remove("is-show");
      setTimeout(() => popup.classList.add("hidden"), 280);
    }, 2200);
  },

  bumpHeader() {
    document.querySelectorAll(".sparx-xp").forEach((el) => {
      el.classList.remove("xp-bump");
      void el.offsetHeight;
      el.classList.add("xp-bump");
      setTimeout(() => el.classList.remove("xp-bump"), 600);
    });
  },

  showLevelUpLoading(levelUp) {
    this.ensureOverlays();
    const modal = document.getElementById("levelup-modal");
    const featureEl = document.getElementById("levelup-advisor-feature");
    const headlineEl = document.getElementById("levelup-advisor-headline");
    const notifyEl = document.getElementById("levelup-advisor-notify");
    const newLevel = levelUp.newLevel || this.level();

    document.getElementById("levelup-num").textContent = newLevel;
    document.getElementById("levelup-icon").textContent = newLevel;
    document.getElementById("levelup-desc").textContent = "Saving your progress and notifying your advisor…";

    if (featureEl && headlineEl && notifyEl) {
      featureEl.classList.remove("xp-advisor-sent", "xp-advisor-missed", "xp-advisor-setup");
      headlineEl.textContent = "Notifying advisor";
      notifyEl.textContent = "Sending level-up email…";
    }

    modal?.classList.remove("hidden");
    requestAnimationFrame(() => modal?.classList.add("is-open"));
    document.body.style.overflow = "hidden";
  },

  celebrateLevelUp(levelUp, email = {}) {
    this.ensureOverlays();
    const modal = document.getElementById("levelup-modal");
    const newLevel = levelUp.newLevel || this.level();
    const previousLevel = levelUp.previousLevel || Math.max(1, newLevel - 1);
    const featureEl = document.getElementById("levelup-advisor-feature");
    const headlineEl = document.getElementById("levelup-advisor-headline");
    const notifyEl = document.getElementById("levelup-advisor-notify");

    document.getElementById("levelup-num").textContent = newLevel;
    document.getElementById("levelup-icon").textContent = newLevel;
    document.getElementById("levelup-desc").textContent =
      `You progressed from Level ${previousLevel} to Level ${newLevel}. Total XP: ${this.get().toLocaleString()}.`;

    if (featureEl && headlineEl && notifyEl) {
      featureEl.classList.remove("xp-advisor-sent", "xp-advisor-missed", "xp-advisor-setup");
      const sent = Number(email.sent || 0);
      const dup = Array.isArray(email.skippedDuplicates) && email.skippedDuplicates.length > 0;
      const msg = email.message || "";

      if (sent > 0 || msg.includes("notified successfully")) {
        featureEl.classList.add("xp-advisor-sent");
        headlineEl.textContent = "Advisor notified";
        notifyEl.textContent = "✓ Advisor notified successfully";
      } else if (dup || msg.includes("already notified")) {
        featureEl.classList.add("xp-advisor-sent");
        headlineEl.textContent = "Advisor already notified";
        notifyEl.textContent = "✓ Advisor notified successfully";
      } else if (!this.getProfile().advisorEmails?.length) {
        featureEl.classList.add("xp-advisor-setup");
        headlineEl.textContent = "No advisor email";
        notifyEl.textContent = "Add advisor emails in the assessment to enable notifications.";
      } else {
        featureEl.classList.add("xp-advisor-missed");
        headlineEl.textContent = "Notification skipped";
        notifyEl.textContent = email.message || "Unable to notify advisor — check GMAIL_SETUP.md";
      }
    }

    modal?.classList.remove("hidden");
    requestAnimationFrame(() => modal?.classList.add("is-open"));
    document.body.style.overflow = "hidden";
    this.fireConfetti();
  },

  hideLevelUp() {
    const modal = document.getElementById("levelup-modal");
    modal?.classList.remove("is-open");
    setTimeout(() => {
      modal?.classList.add("hidden");
      document.body.style.overflow = "";
    }, 200);
  },

  fireConfetti() {
    const canvas = document.createElement("canvas");
    canvas.className = "confetti-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const colors = ["#073861", "#3b7ed8", "#64b5f6", "#ffffff", "#90caf9"];
    const particles = Array.from({ length: 150 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 160,
      y: canvas.height * 0.3 + (Math.random() - 0.5) * 80,
      w: Math.random() * 8 + 5,
      h: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 10,
      vy: -(Math.random() * 13 + 7),
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 14,
      gravity: 0.24 + Math.random() * 0.1,
    }));

    let frame = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame += 1;
      if (frame < 210) requestAnimationFrame(tick);
      else canvas.remove();
    };
    tick();
  },

  reset() {
    console.warn("XP reset is backend-managed. Delete .xedu-xp-store.json during local development if needed.");
  },

  init() {
    this.ensureOverlays();
    this.updateUI(this.state);
    this.refresh();
  },
};

XP.init();
