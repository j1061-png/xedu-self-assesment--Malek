/** Rewards page — summary, awards grid, activity, and advisor status. */
(function () {
  if (typeof XP === "undefined") return;

  const $ = (id) => document.getElementById(id);
  const fmt = (value) => Number(value || 0).toLocaleString();
  const esc = (value) => XP.escHtml(String(value || ""));

  const SOURCE_ROWS = [
    { type: "assessment", label: "Assessment complete" },
    { type: "improvement", label: "Improvement tasks" },
    { type: "reflection", label: "Weekly goals" },
    { type: "advisorTask", label: "Advisor feedback" },
  ];

  function renderSummary() {
    const state = XP.state;
    $("rewards-level")?.replaceChildren(document.createTextNode(String(state.level || 1)));
    $("rewards-xp")?.replaceChildren(document.createTextNode(fmt(state.totalXp)));
    $("rewards-progress-fill")?.style.setProperty("width", `${state.progressPercent || 0}%`);

    const nextText =
      state.level >= (state.maxLevel || 100)
        ? "Max level reached!"
        : `${fmt(state.xpToNext)} XP to Level ${state.nextLevel}`;
    $("rewards-next")?.replaceChildren(document.createTextNode(nextText));
  }

  function renderAwards() {
    const grid = $("awards-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const current = XP.state.level || 1;

    XP.levels.forEach((info) => {
      const unlocked = current >= info.level;
      const card = document.createElement("article");
      card.className = `award-card reveal${unlocked ? " unlocked" : " locked"}${info.level === current ? " current" : ""}`;

      card.innerHTML = `
        <div class="award-icon">
          <svg aria-hidden="true"><use href="assets/icons.svg#${info.icon}"></use></svg>
          ${unlocked ? "" : '<span class="award-lock"><svg aria-hidden="true"><use href="assets/icons.svg#icon-lock"></use></svg></span>'}
        </div>
        <div class="award-level">Level ${info.level}</div>
        <h3 class="award-name">${esc(info.award)}</h3>
        <p class="award-desc">${esc(info.desc)}</p>
        <div class="award-xp">${fmt(info.xp)} XP</div>
        ${unlocked ? '<span class="award-badge">Unlocked</span>' : '<span class="award-badge locked-badge">Locked</span>'}
      `;
      grid.appendChild(card);
    });
  }

  function renderBreakdown() {
    const el = $("xp-breakdown");
    if (!el) return;
    const values = XP.taskValues || {};
    el.innerHTML = "";
    SOURCE_ROWS.forEach((item) => {
      const row = document.createElement("div");
      row.className = "xp-source-row";
      row.innerHTML = `
        <span>${esc(item.label)}</span>
        <strong>+${fmt(values[item.type] || 0)} XP</strong>
      `;
      el.appendChild(row);
    });
  }

  function renderActivity() {
    const el = $("xp-activity-feed");
    if (!el) return;
    const items = Array.isArray(XP.activity) ? XP.activity : [];
    if (!items.length) {
      el.innerHTML = `
        <div class="activity-empty">
          <strong>No XP activity yet</strong>
          <span>Complete an assessment or improvement task to start earning XP.</span>
        </div>
      `;
      return;
    }

    el.innerHTML = "";
    items.slice(0, 8).forEach((item) => {
      const row = document.createElement("article");
      row.className = "activity-item";
      row.innerHTML = `
        <span class="activity-xp">+${fmt(item.xp)} XP</span>
        <div>
          <strong>${esc(item.label || "Completed task")}</strong>
          <time>${formatDate(item.createdAt)}</time>
        </div>
      `;
      el.appendChild(row);
    });
  }

  function renderLastNotification() {
    const el = $("rewards-last-notification");
    if (!el) return;
    const note = XP.lastNotification;
    if (!note || !note.newLevel) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }

    const sent = Number(note.sent || 0);
    el.classList.remove("hidden");
    el.textContent = sent > 0
      ? `Level ${note.newLevel} reached — advisor email sent (${sent} recipient${sent === 1 ? "" : "s"}).`
      : `Level ${note.newLevel} reached — advisor email was not sent (check advisor email or server Gmail setup).`;
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function render() {
    renderSummary();
    renderAwards();
    XP.renderAdvisorPanel("xp-advisor-panel");
    renderBreakdown();
    renderActivity();
    renderLastNotification();
  }

  render();
  XP.refresh().then(render).catch(render);
})();
