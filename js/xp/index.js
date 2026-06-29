/**
 * XEdu XP — orchestrator. Calculation modules live in js/xp/*.
 */
(function (global) {
  const { TASK_VALUES } = global.XPConstants;
  const { buildState } = global.XPCalculations;
  const { getLevelMeta, getDisplayLevels, isLevelUnlocked } = global.XPLevels;
  const { read, mergeFromServer } = global.XPHistory;
  const { readProfile, readCache, writeCache, readLastAssessmentScore, writeLastAssessmentScore, todayKey } = global.XPStorage;
  const { fetchState, completeTask: syncCompleteTask } = global.XPSync;
  const { emitXpChange, emitLevelUp, onXpChange } = global.XPEvents;
  const { renderAll, showPopup, celebrateLevelUp, ensureOverlays, escHtml } = global.XPUI;

  let ctx = {
    state: buildState(0),
    stats: {},
    history: [],
    lastLevelUp: null,
    taskValues: { ...TASK_VALUES },
  };
  let levelUpLock = false;

  function setContext(next, previousState) {
    const prev = previousState || ctx.state;
    ctx = { ...ctx, ...next };
    writeCache(ctx);
    renderAll(ctx, prev);
    emitXpChange({ ctx, previousState: prev, state: ctx.state });
    return ctx;
  }

  function loadCache() {
    const cached = readCache();
    if (!cached?.state) return;
    ctx = {
      state: cached.state,
      stats: cached.stats || {},
      history: cached.history || read(),
      lastLevelUp: cached.lastLevelUp || null,
      taskValues: cached.taskValues || { ...TASK_VALUES },
    };
    renderAll(ctx, ctx.state);
  }

  async function refresh() {
    try {
      const result = await fetchState();
      setContext({
        state: result.state,
        stats: result.raw.stats || {},
        history: result.history,
        lastLevelUp: result.raw.lastLevelUp || null,
        taskValues: result.raw.taskValues || { ...TASK_VALUES },
      });
      return ctx.state;
    } catch (e) {
      console.warn("XP refresh failed — using cache", e);
      loadCache();
      return ctx.state;
    }
  }

  async function completeTask(taskType, taskId, metadata = {}, options = {}) {
    const previousState = { ...ctx.state };
    try {
      const data = await syncCompleteTask(taskType, taskId, metadata);
      setContext({
        state: data.state || ctx.state,
        stats: data.stats || ctx.stats,
        history: mergeFromServer(data.history || data.activity || ctx.history),
        lastLevelUp: data.lastLevelUp || ctx.lastLevelUp,
        taskValues: data.taskValues || ctx.taskValues,
      }, data.previousState || previousState);

      if (!data.duplicate && data.awardedXp > 0 && options.showPopup !== false) {
        showPopup(`+${Number(data.awardedXp).toLocaleString()} XP`);
      }

      if (data.levelUp && !levelUpLock) {
        levelUpLock = true;
        try {
          celebrateLevelUp(data.levelUp, data.awardedXp);
          emitLevelUp({ levelUp: data.levelUp, awardedXp: data.awardedXp });
        } finally {
          setTimeout(() => { levelUpLock = false; }, 800);
        }
      }

      return data;
    } catch (e) {
      console.warn("XP completeTask failed", e);
      throw e;
    }
  }

  async function tryDailyLogin() {
    const day = todayKey();
    try {
      await completeTask("dailyLogin", `dailyLogin:${day}`, { day }, { showPopup: false });
    } catch {
      /* offline */
    }
  }

  async function tryScoreImprovement(score, taskIdBase) {
    const previous = readLastAssessmentScore();
    writeLastAssessmentScore(score);
    if (previous == null || score <= previous) return null;
    if (score - previous < 5) return null;
    return completeTask(
      "scoreImprovement",
      `${taskIdBase}:improve:${previous}->${score}`,
      { previousScore: previous, newScore: score, improvement: score - previous },
      { showPopup: true }
    );
  }

  const XP = {
    profileKey: "xedu-profile",
    get state() { return ctx.state; },
    get stats() { return ctx.stats; },
    get activity() { return ctx.history; },
    get history() { return ctx.history; },
    get lastLevelUp() { return ctx.lastLevelUp; },
    get taskValues() { return ctx.taskValues; },
    get levels() { return getDisplayLevels(ctx.state.level || 1); },

    getProfile: readProfile,
    get: () => ctx.state.totalXp || 0,
    level: () => ctx.state.level || 1,
    progressInLevel: () => ctx.state.progressPercent || 0,
    getLevelInfo: getLevelMeta,
    isLevelUnlocked: (n) => isLevelUnlocked(ctx.state.level, n),
    escHtml,

    refresh,
    completeTask,
    tryDailyLogin,
    tryScoreImprovement,

    applyState(nextState, opts = {}) {
      setContext({ state: { ...ctx.state, ...nextState } }, opts.previousState || ctx.state);
    },
    updateUI(previousState) {
      renderAll(ctx, previousState || ctx.state);
    },

    calc: global.XPCalculations,
    constants: global.XPConstants,

    init() {
      ensureOverlays();
      loadCache();
      refresh().then(() => tryDailyLogin()).catch(() => tryDailyLogin());
    },
  };

  global.XP = XP;
  onXpChange(() => {});

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => XP.init());
  } else {
    XP.init();
  }
})(window);
