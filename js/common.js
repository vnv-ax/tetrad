

import { RoomTransition } from "./room-transition.js";
import { notice } from "./tips.js";

const warned = new Set;

export function warnOnce(key, ...args) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn("[тетрадь]", ...args);
}

export function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    warnOnce("ls:" + key, "localStorage недоступен (" + key + "):", err);
    return null;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    warnOnce("ls:" + key, "localStorage не сохранил (" + key + "):", err);
    return false;
  }
}

export function lsDel(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    warnOnce("ls:" + key, "localStorage не удалил (" + key + "):", err);
  }
}

export const toast = function(msg, ms = 2600) {
  notice(msg, typeof ms === "number" ? ms : 2600);
};

const POP_TRIGGERS = [ [ "opsBtn", "opsMenu" ], [ "crumbBoard", "shadeMenu" ], [ "statsPick", "statsPop" ] ];

function setPop(menu, open, fromBtnId) {
  menu.hidden = !open;
  if (menu.id === "opsMenu") menu.classList.toggle("pop-dock", open && fromBtnId === "dockPlus");
  const trigger = POP_TRIGGERS.find(([, m]) => m === menu.id);
  if (trigger) {
    const btn = document.getElementById(trigger[0]);
    if (btn) btn.setAttribute("aria-expanded", String(open));
  }
}

export function closePops() {
  POP_TRIGGERS.forEach(([, m]) => {
    const el = document.getElementById(m);
    if (el) el.hidden = true;
  });
}

POP_TRIGGERS.forEach(([btnId, menuId]) => {
  const btn = document.getElementById(btnId), menu = document.getElementById(menuId);
  if (!btn || !menu) return;
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closePops();
    setPop(menu, willOpen, btnId);
  });
});

document.addEventListener("click", e => {
  if (e.target.closest(".menu-wrap")) return;
  closePops();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closePops();
});

const THEME_KEY = "cabinet-theme";

function applyTheme(t) {
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = t === "dark" ? "dark" : "light";
  window.dispatchEvent(new CustomEvent("themechange", {
    detail: t
  }));
}

function hslHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return "#" + f(0) + f(8) + f(4);
}

function shadeOf(theme, i) {
  if (i <= 0) return theme === "dark" ? {
    bg: ""
  } : {
    bg: ""
  };
  const t = (i - 1) / 26;
  const hue = t * 360;
  if (theme === "light") {
    const sat = .1 + .34 * t;
    const lit = .93 - .06 * t;
    return {
      bg: hslHex(hue, sat, lit)
    };
  }
  const sat = .08 + .3 * t;
  const lit = .04 + .08 * t;
  return {
    bg: hslHex(hue, sat, lit)
  };
}

const SHADE_KEY = "cabinet-shade-";
const SHADE_COUNT = 28;

function applyShade(theme, i) {
  const root = document.documentElement;
  if (i < 0) {
    root.style.removeProperty("--bg");
    lsDel(SHADE_KEY + theme);
    return;
  }
  const {bg: bg} = shadeOf(theme, i);
  root.style.setProperty("--bg", bg);
  lsSet(SHADE_KEY + theme, String(i));
}

function currentShade(theme) {
  const v = lsGet(SHADE_KEY + theme);
  if (v === null) return theme === "dark" ? 10 : -1;
  return Math.min(SHADE_COUNT - 1, Math.max(-1, parseInt(v, 10) || 0));
}

function shadeRow(theme) {
  let html = '<div class="shade-row">';
  for (let i = 0; i < SHADE_COUNT; i++) {

    html += `<button type="button" class="swatch ${theme}" data-i="${i}" data-tip="${theme === "dark" ? "Тёмный" : "Светлый"} оттенок ${i === 0 ? "· как в доме" : i}"></button>`;
  }
  return html + "</div>";
}

function swatchColor(theme, i) {
  const col = shadeOf(theme, i);
  return col.bg || (theme === "dark" ? "#171410" : "#EAE3D4");
}

function buildShadeGrid() {
  const grid = document.getElementById("shadeGrid");
  if (!grid) return;
  grid.innerHTML = `${shadeRow("light")}` + `<div class="shade-sep"></div>` + `${shadeRow("dark")}`;
  grid.querySelectorAll(".swatch").forEach(b => {
    const theme = b.classList.contains("dark") ? "dark" : "light";
    b.style.background = swatchColor(theme, Number(b.dataset.i));
    b.addEventListener("click", () => {
      const theme = b.classList.contains("dark") ? "dark" : "light";
      const i = Number(b.dataset.i);
      lsSet(THEME_KEY, theme);
      const set = () => {
        applyTheme(theme);
        applyShade(theme, i);
      };
      if (document.startViewTransition) document.startViewTransition(set); else set();
    });
  });
}

let saved = lsGet(THEME_KEY);
if (!saved) saved = "dark";

function applyThemeWithShade(t) {
  applyTheme(t);
  applyShade(t, currentShade(t));
}
applyThemeWithShade(saved);
buildShadeGrid();

const ROOMS = [ "office", "scan" ];
const ROOM_TITLES = {
  office: "Кабинет",
  scan: "Приёмная"
};
const app = document.querySelector(".app");
const sections = document.querySelectorAll("[data-section]");
let currentRoom = null;

function applyRoom(name) {
  sections.forEach(s => {
    s.hidden = s.id !== name;
  });
  app.dataset.room = name;
  const opsBtn = document.getElementById("opsBtn");
  if (opsBtn) opsBtn.disabled = name === "scan";
  document.querySelectorAll(".door[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  const crumb = document.getElementById("crumbBoard");
  if (crumb) crumb.textContent = ROOM_TITLES[name];
  document.title = name === "scan" ? "Приёмная — Тетрадь" : "Тетрадь";
  try {
    sessionStorage.setItem("cabinet-room", name);
  } catch {}
  currentRoom = name;
  app.classList.remove("side-open");
  const backdrop = document.getElementById("sbBackdrop");
  if (backdrop) backdrop.hidden = true;
  window.dispatchEvent(new CustomEvent("roomchange", { detail: { room: name } }));
  setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
}

export function showTab(name) {
  if (!ROOMS.includes(name)) name = "office";
  const apply = () => applyRoom(name);

  if (currentRoom !== null && currentRoom !== name) {
    RoomTransition.run(apply);
  } else {
    apply();
  }
}

document.querySelectorAll(".door[data-tab]").forEach(b => {
  b.addEventListener("click", () => showTab(b.dataset.tab));
});

export function roomName() {
  return currentRoom;
}

function fromSession() {
  let name = "office";
  try {
    name = sessionStorage.getItem("cabinet-room") || "office";
  } catch {}
  showTab(name);
}

fromSession();

const btnSidebar = document.getElementById("btnSidebar");
const backdrop = document.getElementById("sbBackdrop");
const SIDE_KEY = "cabinet-side";

function applySide(collapsed) {
  app.classList.toggle("side-hidden", collapsed);
  lsSet(SIDE_KEY, collapsed ? "hidden" : "shown");
}

(function initSide() {
  applySide(lsGet(SIDE_KEY) === "hidden");
})();

btnSidebar.addEventListener("click", () => {
  if (window.matchMedia("(max-width: 880px)").matches) {
    const open = app.classList.toggle("side-open");
    if (backdrop) backdrop.hidden = !open;
  } else {
    applySide(!app.classList.contains("side-hidden"));
  }
});

backdrop && backdrop.addEventListener("click", () => {
  app.classList.remove("side-open");
  backdrop.hidden = true;
});

const SLIP_KEY = "cabinet-slip";
const pins = [ ...document.querySelectorAll(".pin[data-slip]") ];

function slipEl(name) {
  return document.getElementById("slip-" + name);
}

function setSlip(name) {
  pins.forEach(p => p.classList.toggle("on", p.dataset.slip === name));
  pins.forEach(p => p.setAttribute("aria-selected", String(p.dataset.slip === name)));
  [ "info", "plan", "voice", "boxes" ].forEach(n => {
    const el = slipEl(n);
    if (el) el.hidden = n !== name;
  });
  app.classList.toggle("margin-open", !!name);
  if (name) lsSet(SLIP_KEY, name); else lsDel(SLIP_KEY);
  setTimeout(() => window.dispatchEvent(new Event("resize")), 330);
}

pins.forEach(p => {
  p.addEventListener("click", () => {
    const name = app.classList.contains("margin-open") && p.classList.contains("on") ? null : p.dataset.slip;
    setSlip(name);
  });
});

(function initSlip() {
  const v = lsGet(SLIP_KEY);
  setSlip(v && slipEl(v) ? v : null);
})();

(function initClock() {
  const timeEl = document.getElementById("clockTime");
  const wdEl = document.getElementById("clockWd");
  const dtEl = document.getElementById("clockDt");
  if (!timeEl) return;
  function tick() {
    const d = new Date;
    const time = d.toLocaleTimeString("ru", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const wd = d.toLocaleDateString("ru", {
      weekday: "short"
    }).toUpperCase().replace(".", "");
    const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    timeEl.textContent = time;
    wdEl.textContent = wd;
    dtEl.textContent = date;
  }

  let timer = null;
  function start() {
    if (timer) return;
    tick();
    timer = setInterval(tick, 5e3);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
  }
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  if (!document.hidden) start();
})();

export function updateFading(el) {
  if (!el) return;
  const can = el.scrollHeight > el.clientHeight + 4;
  el.classList.toggle("fading", can);
}

document.querySelectorAll("textarea.note-area").forEach(el => {
  el.addEventListener("input", () => updateFading(el), {
    passive: true
  });
  el.addEventListener("scroll", () => updateFading(el), {
    passive: true
  });
  updateFading(el);
});

export function downloadText(text, filename) {
  const blob = new Blob([ text ], {
    type: "text/plain;charset=utf-8"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5e3);
}

export function adoptTitles(root) {
  (root || document).querySelectorAll("[title]").forEach(el => {
    if (el === tip) return;
    if (el.dataset.tip) return;
    el.dataset.tip = el.getAttribute("title");
    el.removeAttribute("title");
  });
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

if (document.readyState === "loading") {

  document.addEventListener("DOMContentLoaded", () => adoptTitles());
} else {
  adoptTitles();
}
