/** Self improvement page — load latest plan, share, download, regenerate AI tasks */
(function () {
  const STORAGE_KEY = Improvement.planKey;
  const PROGRESS_KEY = Improvement.progressKey;
  let currentPlan = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function savePlan(plan) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    currentPlan = plan;
  }

  function showStatus(message, isError = false) {
    const el = byId("improvement-share-status");
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? "var(--error)" : "var(--muted)";
    el.classList.remove("hidden");
    clearTimeout(showStatus._timer);
    showStatus._timer = setTimeout(() => el.classList.add("hidden"), 6000);
  }

  function migratePlan(plan) {
    if (!plan || typeof plan !== "object") return plan;

    const ctx = plan.studentContext || {};
    const assessment = ctx.assessment || {};

    const mergedAssessment = {
      assessmentScore: assessment.assessmentScore ?? plan.assessmentScore ?? null,
      scoreLabel: assessment.scoreLabel || plan.scoreLabel || "",
      summary: assessment.summary || plan.summary || "",
      biggestGap: assessment.biggestGap || plan.biggestGap || "",
      nextStep: assessment.nextStep || plan.nextStep || "",
      strengths: assessment.strengths || plan.strengths || [],
    };

    plan.studentContext = {
      answers: ctx.answers || {},
      questions: ctx.questions || [],
      assessment: mergedAssessment,
    };

    return plan;
  }

  function buildRegeneratePayload(plan) {
    const migrated = migratePlan({ ...plan });
    const ctx = migrated.studentContext || {};
    const assessment = ctx.assessment || {};

    const hasContext =
      assessment.summary ||
      assessment.biggestGap ||
      assessment.nextStep ||
      assessment.assessmentScore != null ||
      migrated.assessmentFocus;

    if (!hasContext) return null;

    return {
      assessmentFocus: migrated.assessmentFocus || "",
      assessmentScore: migrated.assessmentScore,
      scoreLabel: migrated.scoreLabel,
      summary: migrated.summary,
      biggestGap: migrated.biggestGap,
      nextStep: migrated.nextStep,
      strengths: migrated.strengths || assessment.strengths || [],
      answers: ctx.answers || {},
      questions: ctx.questions || [],
      assessment,
    };
  }

  async function parseJsonResponse(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        throw new Error("Server not reachable. Run python3 server.py and refresh.");
      }
      throw new Error("Unexpected server response. Run python3 server.py and try again.");
    }
  }

  function buildPlanText(plan) {
    const actionPlan = (plan.actionPlan || []).map((item, i) => `${i + 1}. ${item}`).join("\n");
    const weeklyTasks = (plan.weeklyTasks || []).map((item, i) => `${i + 1}. ${item}`).join("\n");
    return `My Xedu Self-Improvement Plan

Focus: ${plan.assessmentFocus || "Not specified"}
Score: ${typeof plan.assessmentScore === "number" ? `${plan.assessmentScore}%` : "N/A"} ${plan.scoreLabel ? `(${plan.scoreLabel})` : ""}
Summary: ${plan.summary || "Not available"}
Biggest gap: ${plan.biggestGap || "Not available"}
Next step: ${plan.nextStep || "Not available"}

Action plan:
${actionPlan || "Not available"}

Weekly tasks:
${weeklyTasks || "Not available"}`;
  }

  async function sharePlan(plan) {
    const text = buildPlanText(plan);
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Xedu Action Plan", text });
        showStatus("Action plan shared.");
        return;
      }
      throw new Error("Web Share not supported");
    } catch (shareErr) {
      if (shareErr?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        showStatus("Action plan copied. Paste it anywhere to share.");
      } catch (copyErr) {
        showStatus("Could not share automatically. Please copy manually.", true);
      }
    }
  }

  function downloadPlan(plan) {
    const text = buildPlanText(plan);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xedu-self-improvement-plan.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatus("Downloaded action plan.");
  }

  function renderPlan(plan) {
    currentPlan = plan;
    const scorePart = typeof plan.assessmentScore === "number" ? `${plan.assessmentScore}%` : "N/A";
    byId("improvement-overview").textContent =
      `Focus: ${plan.assessmentFocus || "Not specified"} | Score: ${scorePart} ${plan.scoreLabel || ""}`.trim();
    byId("improvement-summary").textContent = plan.summary || "No summary available.";
    byId("improvement-gap").textContent = plan.biggestGap || "No gap identified yet.";
    byId("improvement-next-step").textContent = plan.nextStep || "Complete your assessment to get a next step.";

    const generated = plan.generatedAt ? new Date(plan.generatedAt) : null;
    byId("improvement-generated-at").textContent = generated
      ? `Generated: ${generated.toLocaleString()}`
      : "Generated recently";

    Improvement.renderList("improvement-action-plan", plan.actionPlan || [], "actionPlan");
    Improvement.renderList("improvement-weekly-tasks", plan.weeklyTasks || [], "weeklyTasks");
  }

  async function regenerateTasks(plan) {
    const payload = buildRegeneratePayload(plan);
    if (!payload) {
      showStatus("Complete an assessment first to generate tasks.", true);
      return;
    }

    if ((payload.assessmentFocus || "").trim().length < 5) {
      showStatus("Your saved plan is missing an assessment focus. Complete a new assessment.", true);
      return;
    }

    const btn = byId("improvement-regenerate-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating tasks…";
    }
    showStatus("Asking Xedu to build your personalized tasks…");

    try {
      const res = await fetch("/api/generate-action-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || "Could not generate tasks.");

      const actionPlan = data.actionPlan || [];
      const weeklyTasks = data.weeklyTasks || [];
      if (!actionPlan.length && !weeklyTasks.length) {
        throw new Error("AI returned no tasks. Please try again.");
      }

      localStorage.removeItem(PROGRESS_KEY);
      const updated = migratePlan({
        ...plan,
        generatedAt: new Date().toISOString(),
        actionPlan,
        weeklyTasks,
        studentContext: {
          answers: payload.answers,
          questions: payload.questions,
          assessment: payload.assessment,
        },
      });
      savePlan(updated);
      renderPlan(updated);
      showStatus(`New AI tasks ready — ${actionPlan.length} action steps, ${weeklyTasks.length} weekly tasks.`);
    } catch (err) {
      showStatus(err.message || "Task generation failed.", true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Regenerate AI Tasks";
      }
    }
  }

  function init() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      byId("improvement-empty")?.classList.remove("hidden");
      showStatus("Could not access saved plan in this browser session.", true);
      return;
    }

    if (!raw) {
      byId("improvement-empty")?.classList.remove("hidden");
      byId("improvement-content")?.classList.add("hidden");
      return;
    }

    let plan = null;
    try {
      plan = migratePlan(JSON.parse(raw));
      savePlan(plan);
    } catch (e) {
      byId("improvement-empty")?.classList.remove("hidden");
      byId("improvement-content")?.classList.add("hidden");
      return;
    }

    byId("improvement-empty")?.classList.add("hidden");
    byId("improvement-content")?.classList.remove("hidden");
    renderPlan(plan);

    byId("improvement-share-btn")?.addEventListener("click", () => sharePlan(currentPlan || plan));
    byId("improvement-download-btn")?.addEventListener("click", () => downloadPlan(currentPlan || plan));
    byId("improvement-regenerate-btn")?.addEventListener("click", () => regenerateTasks(currentPlan || plan));
    byId("improvement-reset-progress-btn")?.addEventListener("click", () => {
      localStorage.removeItem(PROGRESS_KEY);
      localStorage.removeItem(STORAGE_KEY);
      currentPlan = null;
      byId("improvement-content")?.classList.add("hidden");
      byId("improvement-empty")?.classList.remove("hidden");
      showStatus("Improvement plan reset.");
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
