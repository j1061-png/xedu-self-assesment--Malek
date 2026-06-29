/** Rewards page — listens for global XP updates */
(function () {
  if (typeof XP === "undefined") return;

  function render(previousState) {
    XP.updateUI(previousState);
  }

  document.addEventListener("xedu:xp-change", (e) => render(e.detail?.previousState));
  document.addEventListener("xedu:level-up", () => render());

  render();
  XP.refresh().then(() => render()).catch(() => render());
})();
