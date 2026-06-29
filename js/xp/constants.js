/** Fixed XP economy — single source of truth (mirrored in server.py). */
(function (global) {
  const XP_PER_LEVEL = 1000;
  const MAX_LEVEL = 100;

  /** @type {Record<string, { xp: number, label: string, hint: string, statKey?: string }>} */
  const ACTIONS = {
    assessment: {
      xp: 250,
      label: "Complete self-assessment",
      hint: "Finish all 7 questions and receive your AI results.",
      statKey: "assessmentsCompleted",
    },
    scoreImprovement: {
      xp: 250,
      label: "Improve assessment score 5%+",
      hint: "Retake the assessment and beat your previous score by at least 5 points.",
      statKey: "assessmentsCompleted",
    },
    improvement: {
      xp: 100,
      label: "Complete improvement task",
      hint: "Check off an item on your self-improvement action plan.",
      statKey: "improvementsCompleted",
    },
    reflection: {
      xp: 150,
      label: "Complete weekly goal",
      hint: "Finish a weekly task from your improvement plan.",
      statKey: "reflectionsCompleted",
    },
    dailyLogin: {
      xp: 25,
      label: "Daily login",
      hint: "Open Xedu once per day to collect a small bonus.",
      statKey: "loginsCompleted",
    },
    advisorTask: {
      xp: 250,
      label: "Advisor-approved task",
      hint: "Complete a task your advisor has signed off on.",
      statKey: "tasksCompleted",
    },
  };

  const TASK_VALUES = Object.fromEntries(
    Object.entries(ACTIONS).map(([key, value]) => [key, value.xp])
  );

  const STORAGE_KEYS = {
    profile: "xedu-profile",
    history: "xedu-xp-history",
    lastAssessmentScore: "xedu-last-assessment-score",
    cache: "xedu-xp-cache",
  };

  global.XPConstants = {
    XP_PER_LEVEL,
    MAX_LEVEL,
    ACTIONS,
    TASK_VALUES,
    STORAGE_KEYS,
  };
})(window);
