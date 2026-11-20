

const OUT_MS = 180;
const SETTLE_MS = 480;

let busy = false;
let queued = null;

function reduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {}
  return false;
}

function nextFrame() {
  return new Promise(r => requestAnimationFrame(() => r()));
}

async function play(apply) {
  const app = document.getElementById("app");
  if (!app) { apply(); return; }

  app.classList.add("room-out");
  await new Promise(r => setTimeout(r, OUT_MS));

  try {
    apply();
  } finally {

    await nextFrame();
    await nextFrame();
    app.classList.remove("room-out");
    await new Promise(r => setTimeout(r, SETTLE_MS));
  }
}

function start(apply) {
  busy = true;
  Promise.resolve()
    .then(() => play(apply))
    .catch(() => {})
    .then(() => {
      busy = false;
      if (queued) {
        const next = queued;
        queued = null;
        start(next);
      }
    });
}

function run(apply) {
  if (typeof apply !== "function") return;
  if (reduced() || document.hidden) { apply(); return; }
  if (busy) { queued = apply; return; }
  start(apply);
}

export const RoomTransition = {
  run,
  enabled: () => !reduced()
};
