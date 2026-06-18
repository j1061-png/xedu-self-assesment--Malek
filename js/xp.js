/**
 * XP system — points, levels, awards, confetti, and level-up celebrations.
 */
const XP = {
  key: "xedu-xp",
  xpPerLevel: 100,
  popupTimer: null,
  rewards: {
    assessmentBase: 40,
  },

  levels: [
    { level: 1, award: "First Steps", desc: "Welcome to Xedu — your journey begins.", icon: "icon-sparkle", xp: 0 },
    { level: 2, award: "Curious Mind", desc: "You completed your first self-assessment.", icon: "icon-chat", xp: 100 },
    { level: 3, award: "Focus Finder", desc: "You defined what Xedu should assess.", icon: "icon-document", xp: 200 },
    { level: 4, award: "Reflection Pro", desc: "You're building self-awareness.", icon: "icon-clipboard", xp: 300 },
    { level: 5, award: "Pathfinder", desc: "You're mapping your future path.", icon: "icon-compass", xp: 400 },
    { level: 6, award: "Rising Star", desc: "Your profile is taking shape.", icon: "icon-star", xp: 500 },
    { level: 7, award: "Achiever", desc: "Consistent effort — keep going.", icon: "icon-target", xp: 600 },
    { level: 8, award: "Scholar", desc: "Academic excellence in sight.", icon: "icon-graduation", xp: 700 },
    { level: 9, award: "Trailblazer", desc: "Leading your own growth.", icon: "icon-bolt", xp: 800 },
    { level: 10, award: "Xedu Master", desc: "Top-tier self-assessment champion.", icon: "icon-chart", xp: 900 },
  ],

  get() {
    return parseInt(localStorage.getItem(this.key) || "0", 10);
  },

  set(total) {
    localStorage.setItem(this.key, String(total));
    this.updateUI();
  },

  levelFromXp(total) {
    return Math.floor(total / this.xpPerLevel) + 1;
  },

  level() {
    return this.levelFromXp(this.get());
  },

  progressInLevel() {
    return this.get() % this.xpPerLevel;
  },

  getLevelInfo(levelNum) {
    return this.levels.find((l) => l.level === levelNum) || this.levels[this.levels.length - 1];
  },

  isLevelUnlocked(levelNum) {
    return this.level() >= levelNum;
  },

  add(amount, showPopup = true) {
    const prevTotal = this.get();
    const prevLevel = this.levelFromXp(prevTotal);
    const newTotal = prevTotal + amount;
    const newLevel = this.levelFromXp(newTotal);

    this.set(newTotal);
    if (showPopup) this.showPopup(`+${amount} XP`);

    if (newLevel > prevLevel) {
      setTimeout(() => this.celebrateLevelUp(newLevel), showPopup ? 600 : 0);
    }
    return newTotal;
  },

  /** XP only from self-assessment — score + improvement vs last session */
  awardAssessment(score) {
    const prevKey = "xedu-last-score";
    const prev = parseInt(localStorage.getItem(prevKey) || "0", 10);
    localStorage.setItem(prevKey, String(score));

    const base = this.rewards.assessmentBase;
    const scoreXp = Math.round(score * 0.6);
    let improvementXp = 0;
    if (prev > 0 && score > prev) {
      improvementXp = Math.min(40, (score - prev) * 2);
    }

    const total = base + scoreXp + improvementXp;
    this.add(total, true);
    return { base, scoreXp, improvementXp, total, improved: improvementXp > 0 };
  },

  updateUI() {
    const total = this.get();
    const level = this.level();
    const progress = this.progressInLevel();

    const elTotal = document.getElementById("xp-total");
    const elLevel = document.getElementById("level");
    const elBar = document.getElementById("xp-bar");

    if (elTotal) elTotal.textContent = total;
    if (elLevel) elLevel.textContent = level;
    if (elBar) elBar.style.width = `${progress}%`;
  },

  bumpHeader() {
    document.querySelectorAll(".sparx-xp").forEach((el) => {
      el.classList.remove("xp-bump");
      el.offsetHeight;
      el.classList.add("xp-bump");
      setTimeout(() => el.classList.remove("xp-bump"), 600);
    });
  },

  ensureOverlays() {
    if (!document.getElementById("xp-popup")) {
      const popup = document.createElement("div");
      popup.id = "xp-popup";
      popup.className = "xp-popup hidden";
      popup.setAttribute("role", "status");
      popup.setAttribute("aria-live", "polite");
      popup.innerHTML = `<span class="xp-popup-icon" aria-hidden="true">★</span><span class="xp-popup-text">+15 XP</span>`;
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
          <div class="levelup-icon" id="levelup-icon"></div>
          <h2 id="levelup-title">Level <span id="levelup-num">2</span></h2>
          <p class="levelup-award" id="levelup-award">Curious Mind</p>
          <p class="levelup-desc" id="levelup-desc"></p>
          <button type="button" class="btn btn-primary" id="levelup-close">Awesome!</button>
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

  celebrateLevelUp(levelNum) {
    this.ensureOverlays();
    const info = this.getLevelInfo(levelNum);
    const modal = document.getElementById("levelup-modal");

    document.getElementById("levelup-num").textContent = levelNum;
    document.getElementById("levelup-award").textContent = info.award;
    document.getElementById("levelup-desc").textContent = info.desc;
    document.getElementById("levelup-icon").innerHTML =
      `<svg aria-hidden="true"><use href="assets/icons.svg#${info.icon}"></use></svg>`;

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
    const cx = canvas.width / 2;
    const particles = Array.from({ length: 180 }, () => ({
      x: cx + (Math.random() - 0.5) * 160,
      y: canvas.height * 0.32 + (Math.random() - 0.5) * 80,
      w: Math.random() * 9 + 5,
      h: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 10,
      vy: -(Math.random() * 14 + 7),
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 14,
      gravity: 0.24 + Math.random() * 0.1,
    }));

    let frame = 0;
    const maxFrames = 220;

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
      frame++;
      if (frame < maxFrames) requestAnimationFrame(tick);
      else canvas.remove();
    };
    tick();
  },

  reset() {
    localStorage.removeItem(this.key);
    this.updateUI();
  },

  init() {
    this.ensureOverlays();
    this.updateUI();
  },
};

XP.init();
