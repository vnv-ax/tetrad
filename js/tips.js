

const tip = document.createElement("div");
tip.className = "tip";
tip.setAttribute("role", "status");
(document.querySelector(".plinth-tools") || document.body).appendChild(tip);

let tipTarget = null, tipTimer = null, tipHideTimer = null;
let noticeUntil = 0;

export function notice(text, ms = 2600) {
  clearTimeout(tipTimer);
  clearTimeout(tipHideTimer);
  tipTarget = null;
  tip.textContent = text;
  tip.classList.add("on");
  noticeUntil = Date.now() + ms;
  setTimeout(() => {
    if (Date.now() >= noticeUntil) tip.classList.remove("on");
  }, ms + 30);
}

function noticeActive() {
  return Date.now() < noticeUntil;
}

function showTip(el) {
  tipTarget = el;
  clearTimeout(tipTimer);
  clearTimeout(tipHideTimer);
  const text = el.dataset.tip || "";
  if (!text || document.hidden) return;
  tip.textContent = text;
  tip.classList.add("on");
}

function hideTip(immediate) {
  clearTimeout(tipTimer);
  if (!tipTarget && !tip.classList.contains("on")) return;
  const done = () => {
    tip.classList.remove("on");
    tipTarget = null;
  };
  if (immediate) done(); else {
    clearTimeout(tipHideTimer);
    tipHideTimer = setTimeout(done, 150);
  }
}

const insideTools = t => t && t.closest && t.closest(".plinth-tools");

document.addEventListener("mouseover", e => {
  if (noticeActive()) return;
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (el) showTip(el);
  else if (tipTarget && !insideTools(e.target)) hideTip();
});

document.addEventListener("mouseout", e => {
  if (noticeActive()) return;
  if (tipTarget && !insideTools(e.relatedTarget)) hideTip();
});

document.addEventListener("focusin", e => {
  if (noticeActive()) return;
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (el) showTip(el);
});

window.addEventListener("scroll", e => { if (!insideTools(e.target) && !noticeActive()) hideTip(); }, true);

window.addEventListener("blur", () => { if (!noticeActive()) hideTip(true); });
