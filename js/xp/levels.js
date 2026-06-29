/** Level titles and award metadata (cosmetic — thresholds come from calculations). */
(function (global) {
  const { XP_PER_LEVEL } = global.XPConstants;
  const { xpThresholdForLevel } = global.XPCalculations;

  const AWARD_TEMPLATES = [
    { award: "First Steps", desc: "Welcome to Xedu — your journey begins.", icon: "icon-sparkle" },
    { award: "Curious Mind", desc: "You completed your first self-assessment.", icon: "icon-chat" },
    { award: "Focus Finder", desc: "You defined what Xedu should assess.", icon: "icon-document" },
    { award: "Reflection Pro", desc: "You're building self-awareness.", icon: "icon-clipboard" },
    { award: "Pathfinder", desc: "You're mapping your future path.", icon: "icon-compass" },
    { award: "Rising Star", desc: "Your profile is taking shape.", icon: "icon-star" },
    { award: "Achiever", desc: "Consistent effort — keep going.", icon: "icon-target" },
    { award: "Scholar", desc: "Academic excellence in sight.", icon: "icon-graduation" },
    { award: "Trailblazer", desc: "Leading your own growth.", icon: "icon-bolt" },
    { award: "Xedu Master", desc: "Top-tier self-assessment champion.", icon: "icon-chart" },
  ];

  function getLevelMeta(levelNum) {
    const level = Math.max(1, Math.floor(Number(levelNum) || 1));
    const template = AWARD_TEMPLATES[(level - 1) % AWARD_TEMPLATES.length];
    const xpRequired = xpThresholdForLevel(level);
    return {
      level,
      award: template.award,
      desc: level > AWARD_TEMPLATES.length
        ? `Level ${level} milestone — keep pushing forward.`
        : template.desc,
      icon: template.icon,
      xpRequired,
      xpLabel: `${xpRequired.toLocaleString()} XP`,
    };
  }

  /** Show a small window of levels around the player (never all 100). */
  function getDisplayLevels(currentLevel, windowSize = 6) {
    const { MAX_LEVEL } = global.XPConstants;
    const current = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(currentLevel) || 1)));
    const span = Math.max(4, Math.min(windowSize, 8));
    let end = Math.min(MAX_LEVEL, current + 3);
    let start = Math.max(1, end - span + 1);
    end = Math.min(MAX_LEVEL, start + span - 1);
    const levels = [];
    for (let lv = start; lv <= end; lv += 1) {
      levels.push(getLevelMeta(lv));
    }
    return levels;
  }

  function isLevelUnlocked(currentLevel, targetLevel) {
    return Math.floor(Number(currentLevel) || 1) >= Math.floor(Number(targetLevel) || 1);
  }

  global.XPLevels = {
    AWARD_TEMPLATES,
    XP_PER_LEVEL,
    getLevelMeta,
    getDisplayLevels,
    isLevelUnlocked,
  };
})(window);
