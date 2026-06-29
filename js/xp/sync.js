/** Backend synchronization for authoritative XP. */
(function (global) {
  const { TASK_VALUES } = global.XPConstants;
  const { buildState } = global.XPCalculations;
  const { readProfile, writeCache } = global.XPStorage;
  const { mergeFromServer } = global.XPHistory;

  let inFlight = null;

  async function request(path, payload = {}) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "XP request failed.");
    return data;
  }

  function applyPayload(data) {
    const state = data.state || buildState(0);
    const history = mergeFromServer(data.history || data.activity || []);
    writeCache({
      state,
      stats: data.stats || {},
      history,
      lastLevelUp: data.lastLevelUp || null,
      taskValues: data.taskValues || TASK_VALUES,
    });
    return { state, history, raw: data };
  }

  async function fetchState() {
    const data = await request("/api/xp/state", { profile: readProfile() });
    return applyPayload(data);
  }

  async function completeTask(taskType, taskId, metadata = {}) {
    if (inFlight) await inFlight;
    const run = (async () => {
      const data = await request("/api/xp/complete-task", {
        taskType,
        taskId,
        metadata,
        profile: readProfile(),
      });
      return applyPayload(data);
    })();
    inFlight = run.finally(() => { inFlight = null; });
    const result = await run;
    return result.raw;
  }

  global.XPSync = { fetchState, completeTask, applyPayload };
})(window);
