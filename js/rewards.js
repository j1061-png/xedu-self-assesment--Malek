/** Rewards page — renders level awards grid */
(function () {
  const grid = document.getElementById("awards-grid");
  if (!grid || typeof XP === "undefined") return;

  const current = XP.level();
  const total = XP.get();
  const nextLevel = XP.levels.find((l) => l.level === current + 1);
  const xpToNext = nextLevel ? nextLevel.xp - total : 0;

  document.getElementById("rewards-level")?.replaceChildren(document.createTextNode(String(current)));
  document.getElementById("rewards-xp")?.replaceChildren(document.createTextNode(String(total)));
  document.getElementById("rewards-progress-fill")?.style.setProperty("width", `${XP.progressInLevel()}%`);
  document.getElementById("rewards-next")?.replaceChildren(
    document.createTextNode(nextLevel ? `${xpToNext} XP to Level ${nextLevel.level}` : "Max level reached!")
  );

  XP.levels.forEach((info) => {
    const unlocked = XP.isLevelUnlocked(info.level);
    const card = document.createElement("article");
    card.className = `award-card reveal${unlocked ? " unlocked" : " locked"}${info.level === current ? " current" : ""}`;

    card.innerHTML = `
      <div class="award-icon">
        <svg aria-hidden="true"><use href="assets/icons.svg#${info.icon}"></use></svg>
        ${unlocked ? "" : '<span class="award-lock"><svg aria-hidden="true"><use href="assets/icons.svg#icon-lock"></use></svg></span>'}
      </div>
      <div class="award-level">Level ${info.level}</div>
      <h3 class="award-name">${info.award}</h3>
      <p class="award-desc">${info.desc}</p>
      <div class="award-xp">${info.xp} XP</div>
      ${unlocked ? '<span class="award-badge">Unlocked</span>' : '<span class="award-badge locked-badge">Locked</span>'}
    `;
    grid.appendChild(card);
  });
})();
