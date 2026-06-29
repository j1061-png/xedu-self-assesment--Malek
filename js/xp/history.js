/** XP event history — sorted newest first. */
(function (global) {
  const { STORAGE_KEYS } = global.XPConstants;

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    const xp = Math.max(0, Number(raw.xp) || 0);
    const level = Math.max(1, Number(raw.level) || 1);
    const action = String(raw.action || raw.taskType || "unknown");
    const label = String(raw.label || raw.action || "XP earned");
    const createdAt = raw.createdAt || new Date().toISOString();
    const id = String(raw.id || `${action}:${createdAt}`);
    return { id, action, label, xp, level, createdAt, taskType: raw.taskType || action };
  }

  function sortNewestFirst(entries) {
    return [...entries].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return tb - ta;
    });
  }

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.history);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return sortNewestFirst(parsed.map(normalizeEntry).filter(Boolean));
    } catch {
      return [];
    }
  }

  function write(entries) {
    const clean = sortNewestFirst(entries.map(normalizeEntry).filter(Boolean)).slice(0, 50);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(clean));
    return clean;
  }

  function mergeFromServer(serverActivity) {
    const local = read();
    const byId = new Map(local.map((e) => [e.id, e]));
    (Array.isArray(serverActivity) ? serverActivity : []).forEach((item) => {
      const entry = normalizeEntry(item);
      if (entry) byId.set(entry.id, entry);
    });
    return write([...byId.values()]);
  }

  function prepend(entry) {
    const normalized = normalizeEntry(entry);
    if (!normalized) return read();
    const next = [normalized, ...read().filter((e) => e.id !== normalized.id)];
    return write(next);
  }

  global.XPHistory = { read, write, mergeFromServer, prepend, sortNewestFirst, normalizeEntry };
})(window);
