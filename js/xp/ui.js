/** DOM rendering, animations, level-up modal. */
(function (global) {
  const { ACTIONS } = global.XPConstants;

  let popupTimer = null;
  let levelBadgeAnimating = false;

  function escHtml(text) {
    const d = document.createElement("div");
    d.textContent = text || "";
    return d.innerHTML;
  }

  function animateNumber(el, from, to) {
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
      el.textContent = Math.round(start + (end - start) * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function bumpHeader() {
    document.querySelectorAll(".sparx-xp").forEach((el) => {
      el.classList.remove("xp-bump");
      void el.offsetHeight;
      el.classList.add("xp-bump");
      setTimeout(() => el.classList.remove("xp-bump"), 600);
    });
  }

  function pulseLevelBadge() {
    document.querySelectorAll(".sparx-level").forEach((el) => {
      el.classList.remove("level-pulse");
      void el.offsetHeight;
      el.classList.add("level-pulse");
      setTimeout(() => el.classList.remove("level-pulse"), 900);
    });
  }

  function renderNav(state, previousState = state) {
    animateNumber(document.getElementById("xp-total"), previousState.totalXp, state.totalXp);
    const levelEl = document.getElementById("level");
    if (levelEl) {
      const prev = previousState.level || 1;
      const next = state.level || 1;
      levelEl.textContent = next;
      if (next > prev) pulseLevelBadge();
    }
    const perLevel = state.xpPerLevel || 1000;
    const progressEl = document.getElementById("xp-progress-text");
    if (progressEl) {
      progressEl.textContent = state.level >= (state.maxLevel || 100)
        ? "Max level reached"
        : `${(state.xpIntoLevel || 0).toLocaleString()} / ${perLevel.toLocaleString()} XP`;
    }
    document.querySelectorAll(".sparx-xp").forEach((link) => {
      link.setAttribute(
        "title",
        state.level >= (state.maxLevel || 100)
          ? `Level ${state.level} · ${(state.totalXp || 0).toLocaleString()} total XP`
          : `Level ${state.level} · ${(state.xpIntoLevel || 0).toLocaleString()} / ${perLevel.toLocaleString()} XP to Level ${state.nextLevel}`
      );
    });
    const bar = document.getElementById("xp-bar");
    if (bar) {
      bar.style.width = `${state.progressPercent || 0}%`;
      if ((state.progressPercent || 0) !== (previousState.progressPercent || 0)) {
        bar.classList.add("xp-bar-animate");
        setTimeout(() => bar.classList.remove("xp-bar-animate"), 700);
      }
    }
  }

  function renderRewardsSummary(state, previousState = state) {
    document.getElementById("rewards-level")?.replaceChildren(document.createTextNode(String(state.level || 1)));
    const xpEl = document.getElementById("rewards-xp");
    if (xpEl) animateNumber(xpEl, previousState.totalXp, state.totalXp);
    document.getElementById("rewards-progress-fill")?.style.setProperty("width", `${state.progressPercent || 0}%`);
    const nextEl = document.getElementById("rewards-next");
    if (nextEl) {
      nextEl.textContent = state.level >= (state.maxLevel || 100)
        ? "Max level reached!"
        : `${(state.xpToNext || 0).toLocaleString()} XP to Level ${state.nextLevel}`;
    }
  }

  function renderStats(stats) {
    const map = {
      "stat-assessments": stats.assessmentsCompleted,
      "stat-improvements": stats.improvementsCompleted,
      "stat-weekly": stats.reflectionsCompleted,
      "stat-advisor": stats.tasksCompleted,
    };
    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = Number(value || 0).toLocaleString();
    });
  }

  function renderBreakdown(taskValues) {
    const el = document.getElementById("xp-breakdown");
    if (!el) return;
    el.innerHTML = "";
    Object.entries(ACTIONS).forEach(([type, meta]) => {
      const row = document.createElement("div");
      row.className = "xp-source-row";
      row.innerHTML = `
        <div class="xp-source-copy">
          <span>${escHtml(meta.label)}</span>
          ${meta.hint ? `<small>${escHtml(meta.hint)}</small>` : ""}
        </div>
        <strong>+${Number(taskValues[type] ?? meta.xp).toLocaleString()} XP</strong>
      `;
      el.appendChild(row);
    });
  }

  function renderEarnGuide(taskValues) {
    const el = document.getElementById("xp-earn-guide");
    if (!el) return;
    el.innerHTML = "";
    Object.entries(ACTIONS).forEach(([type, meta]) => {
      const card = document.createElement("article");
      card.className = "xp-earn-card";
      card.innerHTML = `
        <div class="xp-earn-amount">+${Number(taskValues[type] ?? meta.xp).toLocaleString()} XP</div>
        <h3>${escHtml(meta.label)}</h3>
        <p>${escHtml(meta.hint || "")}</p>
      `;
      el.appendChild(card);
    });
  }

  function renderHistory(history) {
    const el = document.getElementById("xp-activity-feed");
    if (!el) return;
    const items = Array.isArray(history) ? history : [];
    if (!items.length) {
      el.innerHTML = `
        <div class="activity-empty">
          <strong>No XP activity yet</strong>
          <span>Complete an assessment or improvement task to start earning XP.</span>
        </div>`;
      return;
    }
    el.innerHTML = "";
    items.slice(0, 12).forEach((item) => {
      const row = document.createElement("article");
      row.className = "activity-item";
      row.innerHTML = `
        <span class="activity-xp">+${Number(item.xp || 0).toLocaleString()} XP</span>
        <div>
          <strong>${escHtml(item.label || item.action)}</strong>
          <span class="activity-meta">Level ${item.level || "—"} · ${formatDate(item.createdAt)}</span>
        </div>
      `;
      el.appendChild(row);
    });
  }

  function renderTimeline(state, previousState) {
    if (global.XPTimeline && document.getElementById("level-timeline-viewport")) {
      global.XPTimeline.update(state, previousState || state);
    }
  }

  function renderLastLevelUp(note) {
    const el = document.getElementById("rewards-last-levelup");
    if (!el) return;
    if (!note || !note.newLevel) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.classList.remove("hidden");
    el.textContent = `Last level up: Level ${note.newLevel} (${formatDate(note.createdAt)})`;
  }

  function renderLevelHint(state) {
    const el = document.getElementById("rewards-level-hint");
    if (!el) return;
    const max = state.maxLevel || 100;
    el.textContent = `Levels 1–${max} · ${(state.xpPerLevel || 1000).toLocaleString()} XP per level`;
  }

  function renderAll(ctx, previousState) {
    const state = ctx.state || {};
    const prev = previousState || state;
    renderNav(state, prev);

    if (document.getElementById("progression-path")) {
      renderTimeline(state, prev);
      return;
    }

    renderRewardsSummary(state, prev);
    renderLevelHint(state);
    renderStats(ctx.stats || {});
    renderBreakdown(ctx.taskValues || {});
    renderEarnGuide(ctx.taskValues || {});
    renderHistory(ctx.history || []);
    renderTimeline(state, prev);
    renderLastLevelUp(ctx.lastLevelUp);
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function ensureOverlays() {
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
          <div class="levelup-glow" aria-hidden="true"></div>
          <div class="levelup-badge">🎉 Level Up!</div>
          <div class="levelup-icon-wrap">
            <div class="levelup-icon" id="levelup-icon">2</div>
          </div>
          <h2 id="levelup-title">You reached Level <span id="levelup-num">2</span></h2>
          <p class="levelup-desc" id="levelup-desc"></p>
              <div class="levelup-stats">
            <div class="levelup-stat"><span>Levels gained</span><strong id="levelup-levels-gained">+1</strong></div>
            <div class="levelup-stat"><span>XP earned</span><strong id="levelup-xp-earned">+0</strong></div>
          </div>
          <button type="button" class="btn btn-primary" id="levelup-close">Continue</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector(".levelup-backdrop")?.addEventListener("click", () => hideLevelUp());
      document.getElementById("levelup-close")?.addEventListener("click", () => hideLevelUp());
    }
  }

  function showPopup(text) {
    ensureOverlays();
    const popup = document.getElementById("xp-popup");
    const textEl = popup?.querySelector(".xp-popup-text");
    if (!popup || !textEl) return;
    clearTimeout(popupTimer);
    textEl.textContent = text;
    popup.classList.remove("hidden");
    requestAnimationFrame(() => popup.classList.add("is-show"));
    bumpHeader();
    popupTimer = setTimeout(() => {
      popup.classList.remove("is-show");
      setTimeout(() => popup.classList.add("hidden"), 280);
    }, 2200);
  }

  function celebrateLevelUp(levelUp, awardedXp) {
    ensureOverlays();
    const newLevel = levelUp.newLevel || 1;
    const previousLevel = levelUp.previousLevel || Math.max(1, newLevel - 1);
    const levelsGained = Math.max(1, newLevel - previousLevel);

    document.getElementById("levelup-num").textContent = newLevel;
    document.getElementById("levelup-icon").textContent = newLevel;
    document.getElementById("levelup-desc").textContent =
      `You progressed from Level ${previousLevel} to Level ${newLevel}. Keep going — max level is 100.`;
    document.getElementById("levelup-levels-gained").textContent = `+${levelsGained}`;
    document.getElementById("levelup-xp-earned").textContent = `+${Number(awardedXp || 0).toLocaleString()}`;

    openLevelModal();
    fireConfetti();
  }

  function openLevelModal() {
    const modal = document.getElementById("levelup-modal");
    modal?.classList.remove("hidden");
    requestAnimationFrame(() => modal?.classList.add("is-open"));
    document.body.style.overflow = "hidden";
  }

  function hideLevelUp() {
    const modal = document.getElementById("levelup-modal");
    modal?.classList.remove("is-open");
    setTimeout(() => {
      modal?.classList.add("hidden");
      document.body.style.overflow = "";
    }, 200);
  }

  function fireConfetti() {
    const canvas = document.createElement("canvas");
    canvas.className = "confetti-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ["#073861", "#3b7ed8", "#64b5f6", "#ffffff", "#90caf9"];
    const particles = Array.from({ length: 140 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 160,
      y: canvas.height * 0.32,
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
  }

  global.XPUI = {
    escHtml,
    renderAll,
    renderNav,
    showPopup,
    celebrateLevelUp,
    hideLevelUp,
    ensureOverlays,
    bumpHeader,
  };
})(window);
