/** XP pub/sub — decouple UI from core logic. */
(function (global) {
  const EVENT_XP = "xedu:xp-change";
  const EVENT_LEVEL = "xedu:level-up";

  function emitXpChange(detail) {
    document.dispatchEvent(new CustomEvent(EVENT_XP, { detail }));
  }

  function emitLevelUp(detail) {
    document.dispatchEvent(new CustomEvent(EVENT_LEVEL, { detail }));
  }

  function onXpChange(handler) {
    document.addEventListener(EVENT_XP, (e) => handler(e.detail));
  }

  function onLevelUp(handler) {
    document.addEventListener(EVENT_LEVEL, (e) => handler(e.detail));
  }

  global.XPEvents = { EVENT_XP, EVENT_LEVEL, emitXpChange, emitLevelUp, onXpChange, onLevelUp };
})(window);
