(function () {
  window.__themeBoot = true;
  try {
    var t = localStorage.getItem("cabinet-theme");
    if (t === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.style.colorScheme = "dark";
    } else if (t === "light") {
      document.documentElement.style.colorScheme = "light";
    }
  } catch (e) {}

  try {
    var theme = "dark";
    try { theme = localStorage.getItem("cabinet-theme") || "dark"; } catch (e) {}
    if (theme !== "dark" && theme !== "light") theme = "dark";
    var i = parseInt(localStorage.getItem("cabinet-shade-" + theme), 10);
    if (!isNaN(i) && i > 0) {
      i = Math.min(27, i);
      var k = (i - 1) / 26, hue = k * 360;
      var sat, lit;
      if (theme === "light") { sat = .1 + .34 * k; lit = .93 - .06 * k; }
      else { sat = .08 + .3 * k; lit = .04 + .08 * k; }
      var a = sat * Math.min(lit, 1 - lit);
      var f = function (n) {
        var k = (n + hue / 30) % 12;
        var c = lit - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
        return Math.round(255 * c).toString(16).padStart(2, "0");
      };
      document.documentElement.style.setProperty("--bg", "#" + f(0) + f(8) + f(4));
    }
  } catch (e) {}

  var BOOT_MIN_MS = 400;
  var BOOT_FADE_MS = 800;
  var startedAt = Date.now();
  var hidden = false;

  function hide() {
    if (hidden) return;
    hidden = true;
    var boot = document.getElementById("boot");
    if (!boot) return;
    boot.classList.add("boot-hide");
    setTimeout(function () {
      if (boot.parentNode) boot.parentNode.removeChild(boot);
    }, BOOT_FADE_MS);
  }

  function cap(promise, ms) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise(function (r) { setTimeout(r, ms); })
    ]);
  }

  function firstPaint() {
    return new Promise(function (r) {
      requestAnimationFrame(function () { requestAnimationFrame(r); });
    });
  }

  function setupBoot() {
    var fonts = (document.fonts && document.fonts.ready) || Promise.resolve();
    var loaded = new Promise(function (r) {
      if (document.readyState === "complete") r();
      else window.addEventListener("load", function () { r(); }, { once: true });
    });
    var minShow = new Promise(function (r) {
      setTimeout(r, Math.max(0, BOOT_MIN_MS - (Date.now() - startedAt)));
    });
    Promise.all([
      cap(fonts, 3000),
      cap(loaded, 2500),
      firstPaint(),
      minShow
    ]).then(hide, hide);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupBoot, { once: true });
  } else {
    setupBoot();
  }

  setTimeout(hide, 6000);
})();
