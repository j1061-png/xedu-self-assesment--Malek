/** Pure XP / level math — no DOM, no network. */
(function (global) {
  const { XP_PER_LEVEL, MAX_LEVEL } = global.XPConstants;

  function clampXp(totalXp) {
    return Math.max(0, Math.floor(Number(totalXp) || 0));
  }

  function xpThresholdForLevel(level) {
    const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)));
    return (lv - 1) * XP_PER_LEVEL;
  }

  function getCurrentLevel(totalXp) {
    const xp = clampXp(totalXp);
    const level = Math.floor(xp / XP_PER_LEVEL) + 1;
    return Math.min(MAX_LEVEL, Math.max(1, level));
  }

  function getXPIntoLevel(totalXp) {
    const xp = clampXp(totalXp);
    return xp - xpThresholdForLevel(getCurrentLevel(xp));
  }

  function getNextLevelXP(totalXp) {
    const level = getCurrentLevel(totalXp);
    if (level >= MAX_LEVEL) return null;
    return level * XP_PER_LEVEL;
  }

  function getXPRemaining(totalXp) {
    const level = getCurrentLevel(totalXp);
    if (level >= MAX_LEVEL) return 0;
    return getNextLevelXP(totalXp) - clampXp(totalXp);
  }

  function getLevelProgress(totalXp) {
    const level = getCurrentLevel(totalXp);
    if (level >= MAX_LEVEL) return 100;
    return Math.round((getXPIntoLevel(totalXp) / XP_PER_LEVEL) * 100);
  }

  function canLevelUp(previousXp, nextXp) {
    return getCurrentLevel(nextXp) > getCurrentLevel(previousXp);
  }

  function buildState(totalXp) {
    const xp = clampXp(totalXp);
    const level = getCurrentLevel(xp);
    const into = getXPIntoLevel(xp);
    const nextThreshold = getNextLevelXP(xp);
    return {
      totalXp: xp,
      level,
      currentLevelXp: xpThresholdForLevel(level),
      nextLevelXp: nextThreshold,
      xpIntoLevel: into,
      xpToNext: getXPRemaining(xp),
      progressPercent: getLevelProgress(xp),
      previousLevel: Math.max(1, level - 1),
      nextLevel: Math.min(MAX_LEVEL, level + 1),
      maxLevel: MAX_LEVEL,
      xpPerLevel: XP_PER_LEVEL,
    };
  }

  function awardXP(currentTotal, amount) {
    const before = clampXp(currentTotal);
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    const after = before + delta;
    return {
      before,
      after,
      awarded: delta,
      stateBefore: buildState(before),
      stateAfter: buildState(after),
      leveledUp: canLevelUp(before, after),
      levelsGained: getCurrentLevel(after) - getCurrentLevel(before),
    };
  }

  global.XPCalculations = {
    clampXp,
    xpThresholdForLevel,
    getCurrentLevel,
    getXPIntoLevel,
    getNextLevelXP,
    getXPRemaining,
    getLevelProgress,
    canLevelUp,
    buildState,
    awardXP,
  };
})(window);
