/** Shared layout — mobile nav, XP bar, smooth interactions */
(function () {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");

  function closeNav() {
    nav?.classList.remove("open");
    toggle?.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
  }

  function openNav() {
    nav?.classList.add("open");
    toggle?.classList.add("open");
    toggle?.setAttribute("aria-expanded", "true");
    document.body.classList.add("nav-open");
  }

  toggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (nav?.classList.contains("open")) closeNav();
    else openNav();
  });

  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  document.addEventListener("click", (e) => {
    if (!nav?.classList.contains("open")) return;
    if (nav.contains(e.target) || toggle?.contains(e.target)) return;
    closeNav();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNav();
  });

  if (typeof XP !== "undefined") XP.updateUI();
})();
