/**
 * Trophy-road progression — virtualized horizontal path (100 levels, ~7 visible).
 */
(function (global) {
  const { MAX_LEVEL, XP_PER_LEVEL } = global.XPConstants;
  const { xpThresholdForLevel } = global.XPCalculations;

  const STEP = 92;
  const BUFFER = 4;
  const SNAP_DEBOUNCE = 120;

  let viewport = null;
  let track = null;
  let nodesLayer = null;
  let lineBg = null;
  let lineFill = null;
  let jumpBtn = null;
  let tooltip = null;
  let hudLevel = null;
  let hudFill = null;
  let hudXp = null;
  let currentState = null;
  let scrollRaf = null;
  let snapTimer = null;
  let initialized = false;
  let mounted = false;
  let userAway = false;
  let lastRendered = "";

  function status(playerLv, lv) {
    if (lv < playerLv) return "completed";
    if (lv === playerLv) return "current";
    return "locked";
  }

  function sidePad() {
    if (!viewport) return 0;
    return Math.max(STEP, viewport.clientWidth / 2 - STEP / 2);
  }

  function trackW() {
    return sidePad() * 2 + MAX_LEVEL * STEP;
  }

  function nodeCenterX(level) {
    return sidePad() + (level - 1) * STEP + STEP / 2;
  }

  function lineGeometry() {
    const start = nodeCenterX(1);
    const end = nodeCenterX(MAX_LEVEL);
    return { start, span: end - start };
  }

  function scrollLeftForLevel(level) {
    return Math.max(0, nodeCenterX(level) - viewport.clientWidth / 2);
  }

  function levelAtCenter() {
    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    const raw = (center - sidePad() - STEP / 2) / STEP + 1;
    return Math.max(1, Math.min(MAX_LEVEL, Math.round(raw)));
  }

  function visibleRange() {
    const pad = sidePad();
    const left = viewport.scrollLeft;
    const right = left + viewport.clientWidth;
    const start = Math.max(1, Math.floor((left - pad) / STEP) + 1 - BUFFER);
    const end = Math.min(MAX_LEVEL, Math.ceil((right - pad) / STEP) + BUFFER);
    return { start, end };
  }

  function progressFillPx(state) {
    const { start, span } = lineGeometry();
    const lv = state.level || 1;
    const into = lv >= (state.maxLevel || MAX_LEVEL) ? 1 : (state.progressPercent || 0) / 100;
    const units = (lv - 1) + into;
    return Math.min(span, units * STEP);
  }

  function nodeHtml(lv, playerLv, state) {
    const st = status(playerLv, lv);
    const xpReq = xpThresholdForLevel(lv);
    const core = st === "completed"
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>`
      : st === "current"
        ? `<span aria-hidden="true">★</span>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/></svg>`;

    const xpChip = st === "current"
      ? `<span class="prog-node-xp">${(state.xpIntoLevel || 0).toLocaleString()} / ${(state.xpPerLevel || XP_PER_LEVEL).toLocaleString()} XP</span>`
      : "";

    return `
      <div class="prog-node-wrap" style="left:${nodeCenterX(lv)}px" data-level="${lv}">
        <button type="button" class="prog-node prog-node--${st}" data-level="${lv}"
          aria-label="Level ${lv}, ${st}">
          <span class="prog-node-core">${core}</span>
        </button>
        <span class="prog-node-label">L${lv}</span>
        ${xpChip}
      </div>`;
  }

  function renderVisible(force) {
    if (!nodesLayer || !currentState) return;
    const playerLv = currentState.level || 1;
    const { start, end } = visibleRange();
    const key = `${start}-${end}-${playerLv}-${currentState.progressPercent}-${currentState.xpIntoLevel}`;
    if (!force && key === lastRendered) return;
    lastRendered = key;

    const chunks = [];
    for (let lv = start; lv <= end; lv += 1) {
      chunks.push(nodeHtml(lv, playerLv, currentState));
    }
    nodesLayer.innerHTML = chunks.join("");
  }

  function layoutTrack() {
    if (!track || !currentState) return;
    const w = trackW();
    track.style.width = `${w}px`;

    const { start, span } = lineGeometry();
    if (lineBg) {
      lineBg.style.left = `${start}px`;
      lineBg.style.width = `${span}px`;
    }
    if (lineFill) {
      lineFill.style.left = `${start}px`;
      lineFill.style.width = `${progressFillPx(currentState)}px`;
    }
  }

  function updateHud(state) {
    if (hudLevel) hudLevel.textContent = String(state.level || 1);
    if (hudFill) hudFill.style.width = `${state.progressPercent || 0}%`;
    if (hudXp) {
      const per = state.xpPerLevel || XP_PER_LEVEL;
      hudXp.textContent = state.level >= (state.maxLevel || MAX_LEVEL)
        ? `${(state.totalXp || 0).toLocaleString()} XP total`
        : `${(state.xpIntoLevel || 0).toLocaleString()} / ${per.toLocaleString()} XP`;
    }
  }

  function updateJumpBtn() {
    if (!jumpBtn || !currentState) return;
    const away = Math.abs(levelAtCenter() - (currentState.level || 1)) > 2;
    userAway = away;
    jumpBtn.classList.toggle("hidden", !away);
  }

  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      renderVisible(false);
      updateJumpBtn();
    });

    clearTimeout(snapTimer);
    snapTimer = setTimeout(snapToNearest, SNAP_DEBOUNCE);
  }

  function snapToNearest() {
    if (!viewport || !currentState) return;
    const target = levelAtCenter();
    const ideal = scrollLeftForLevel(target);
    if (Math.abs(viewport.scrollLeft - ideal) > 4) {
      viewport.scrollTo({ left: ideal, behavior: "smooth" });
    }
  }

  function scrollToLevel(level, smooth) {
    if (!viewport) return;
    userAway = false;
    viewport.scrollTo({ left: scrollLeftForLevel(level), behavior: smooth ? "smooth" : "auto" });
    updateJumpBtn();
  }

  function showTooltip(el, level) {
    if (!tooltip || !currentState) return;
    const st = status(currentState.level || 1, level);
    const xpReq = xpThresholdForLevel(level);
    const stLabel = st === "completed" ? "Completed" : st === "current" ? "Current" : "Locked";
    tooltip.innerHTML = `
      <strong>Level ${level}</strong>
      ${xpReq.toLocaleString()} XP required
      <span class="tt-status tt-status--${st}">${stLabel}</span>`;
    tooltip.classList.remove("hidden");
    const rect = el.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 10}px`;
  }

  function hideTooltip() {
    tooltip?.classList.add("hidden");
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;

    viewport.addEventListener("scroll", onScroll, { passive: true });

    viewport.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      viewport.scrollLeft += e.deltaY;
    }, { passive: false });

    document.getElementById("timeline-prev")?.addEventListener("click", () => {
      const cur = levelAtCenter();
      scrollToLevel(Math.max(1, cur - 1), true);
    });

    document.getElementById("timeline-next")?.addEventListener("click", () => {
      const cur = levelAtCenter();
      scrollToLevel(Math.min(MAX_LEVEL, cur + 1), true);
    });

    jumpBtn?.addEventListener("click", () => {
      if (currentState) scrollToLevel(currentState.level || 1, true);
    });

    nodesLayer.addEventListener("mouseover", (e) => {
      const wrap = e.target.closest(".prog-node-wrap");
      if (!wrap) return;
      showTooltip(wrap, Number(wrap.dataset.level));
    });

    nodesLayer.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget || !nodesLayer.contains(e.relatedTarget)) hideTooltip();
    });

    window.addEventListener("resize", () => {
      if (!mounted || !currentState) return;
      lastRendered = "";
      layoutTrack();
      renderVisible(true);
      scrollToLevel(currentState.level || 1, false);
    });
  }

  function bindDom() {
    viewport = document.getElementById("level-timeline-viewport");
    track = document.getElementById("level-timeline-track");
    nodesLayer = document.getElementById("level-timeline-nodes");
    lineBg = document.getElementById("level-timeline-line-bg");
    lineFill = document.getElementById("level-timeline-line-fill");
    jumpBtn = document.getElementById("timeline-back-to-current");
    tooltip = document.getElementById("prog-tooltip");
    hudLevel = document.getElementById("prog-hud-level");
    hudFill = document.getElementById("prog-hud-fill");
    hudXp = document.getElementById("prog-hud-xp");
    if (!viewport || !track || !nodesLayer) return false;
    bindEvents();
    return true;
  }

  function init(state) {
    if (!bindDom()) return;
    mounted = true;
    currentState = state;
    lastRendered = "";
    layoutTrack();
    updateHud(state);
    renderVisible(true);
    requestAnimationFrame(() => {
      scrollToLevel(state.level || 1, false);
      renderVisible(true);
      updateJumpBtn();
    });
  }

  function update(state, previousState) {
    if (!bindDom()) return;
    if (!mounted) {
      init(state);
      return;
    }
    const prevLv = previousState?.level || currentState?.level || 1;
    const newLv = state.level || 1;
    currentState = state;
    lastRendered = "";
    layoutTrack();
    updateHud(state);
    renderVisible(true);

    if (newLv > prevLv || !userAway) {
      scrollToLevel(newLv, true);
    } else {
      updateJumpBtn();
    }
  }

  global.XPTimeline = { init, update, scrollToLevel };
})(window);
