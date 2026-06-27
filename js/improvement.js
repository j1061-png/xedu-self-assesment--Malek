/** Shared action plan UI — checkboxes, progress, and AI feedback per task */
const Improvement = {
  progressKey: "xedu-self-improvement-progress",
  planKey: "xedu-self-improvement-plan",

  esc(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  },

  getProgress() {
    try {
      const raw = localStorage.getItem(this.progressKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  setProgress(progress) {
    localStorage.setItem(this.progressKey, JSON.stringify(progress || {}));
  },

  hashString(value) {
    const text = String(value || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  },

  getPlanContext() {
    try {
      const raw = localStorage.getItem(this.planKey);
      if (!raw) return "";
      const plan = JSON.parse(raw);
      if (!plan || typeof plan !== "object") return "";
      const actionPlan = (plan.actionPlan || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
      const weeklyTasks = (plan.weeklyTasks || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
      return `Student focus: ${plan.assessmentFocus || "Not specified"}
Score: ${plan.assessmentScore ?? "N/A"}%
Summary: ${plan.summary || ""}
Biggest gap: ${plan.biggestGap || ""}
Next step: ${plan.nextStep || ""}

Action plan:
${actionPlan || "None"}

Weekly tasks:
${weeklyTasks || "None"}`;
    } catch (e) {
      return "";
    }
  },

  updateProgressLabels() {
    const pairs = [
      { listId: "result-action-plan", labelId: "action-plan-progress" },
      { listId: "result-weekly-tasks", labelId: "weekly-tasks-progress" },
      { listId: "improvement-action-plan", labelId: "action-plan-progress" },
      { listId: "improvement-weekly-tasks", labelId: "weekly-tasks-progress" },
    ];
    const progress = this.getProgress();
    pairs.forEach(({ listId, labelId }) => {
      const list = document.getElementById(listId);
      const label = document.getElementById(labelId);
      if (!list || !label) return;
      const items = list.querySelectorAll(".improvement-item");
      if (!items.length) {
        label.textContent = "";
        label.classList.add("hidden");
        return;
      }
      const done = list.querySelectorAll(".improvement-item.done").length;
      label.textContent = `${done} of ${items.length} completed`;
      label.classList.toggle("hidden", false);
    });
  },

  async fetchTaskFeedback(taskText, listType, assessmentContext = "") {
    const context = assessmentContext || this.getPlanContext();
    const res = await fetch("/api/task-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: taskText,
        listType,
        assessmentContext: context,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not get feedback.");
    return data.feedback;
  },

  renderList(targetId, items, listType = "", options = {}) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const clean = (items || []).filter((item) => typeof item === "string" && item.trim().length > 0);
    const progress = this.getProgress();
    const assessmentContext = options.assessmentContext || "";
    el.innerHTML = "";

    if (!clean.length) {
      const li = document.createElement("li");
      li.textContent = "No items provided yet.";
      el.appendChild(li);
      this.updateProgressLabels();
      return;
    }

    clean.forEach((item, index) => {
      const key = `${listType}:${index}`;
      const feedbackKey = `feedback:${key}`;
      const isDone = Boolean(progress[key]);
      const savedFeedback = progress[feedbackKey] || "";

      const li = document.createElement("li");
      li.className = "improvement-item" + (isDone ? " done" : "");
      li.innerHTML = `
        <label class="improvement-check">
          <input type="checkbox" ${isDone ? "checked" : ""} />
          <span>${this.esc(item)}</span>
        </label>
        <div class="improvement-feedback ${isDone && savedFeedback ? "" : "hidden"}" aria-live="polite">${savedFeedback ? this.esc(savedFeedback) : ""}</div>
      `;

      const checkbox = li.querySelector("input[type='checkbox']");
      const feedbackEl = li.querySelector(".improvement-feedback");

      checkbox?.addEventListener("change", async () => {
        const current = this.getProgress();
        const checked = checkbox.checked;
        current[key] = checked;
        this.setProgress(current);
        li.classList.toggle("done", checked);
        this.updateProgressLabels();

        if (!checked) {
          feedbackEl?.classList.add("hidden");
          return;
        }

        if (current[feedbackKey]) {
          if (feedbackEl) {
            feedbackEl.textContent = current[feedbackKey];
            feedbackEl.classList.remove("hidden", "loading");
          }
        } else if (feedbackEl) {
          feedbackEl.textContent = "Getting feedback from Xedu…";
          feedbackEl.classList.remove("hidden");
          feedbackEl.classList.add("loading");
          try {
            const reply = await this.fetchTaskFeedback(item, listType, assessmentContext);
            const latest = this.getProgress();
            latest[feedbackKey] = reply;
            this.setProgress(latest);
            feedbackEl.textContent = reply;
            feedbackEl.classList.remove("loading");
          } catch (err) {
            feedbackEl.textContent = err.message || "Feedback unavailable right now.";
            feedbackEl.classList.remove("loading");
          }
        }

        if (checked && typeof XP !== "undefined") {
          try {
            await XP.completeTask(
              "improvement",
              `improvement:${listType}:${index}:${this.hashString(item)}`,
              { listType, item },
              { showPopup: true }
            );
          } catch (err) {
            console.warn("Improvement XP award failed", err);
          }
        }
      });

      el.appendChild(li);
    });

    this.updateProgressLabels();
  },
};
