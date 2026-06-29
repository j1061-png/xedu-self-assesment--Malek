/** Local persistence cache for XP state between refreshes. */
(function (global) {
  const { STORAGE_KEYS } = global.XPConstants;

  function readProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.profile);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.cache);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeCache(payload) {
    try {
      localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify({
        ...payload,
        cachedAt: new Date().toISOString(),
      }));
    } catch {
      /* quota */
    }
  }

  function readLastAssessmentScore() {
    const value = localStorage.getItem(STORAGE_KEYS.lastAssessmentScore);
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function writeLastAssessmentScore(score) {
    localStorage.setItem(STORAGE_KEYS.lastAssessmentScore, String(Math.max(0, Number(score) || 0)));
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  global.XPStorage = {
    readProfile,
    readCache,
    writeCache,
    readLastAssessmentScore,
    writeLastAssessmentScore,
    todayKey,
  };
})(window);
