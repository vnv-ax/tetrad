

import { toast } from "./common.js";
import { kvGetMigrated, kvSet } from "./storage.js";

const PREP_KEY = "gost-prep-v1";
const prep = document.getElementById("prepText");
const prepInfo = document.getElementById("prepSaveInfo");

let prepTimer = null;

function savePrep() {
  clearTimeout(prepTimer);
  prepTimer = setTimeout(() => {
    const text = prep ? prep.value : "";
    kvSet(PREP_KEY, text, "черновика документа").then(() => {
      if (!prepInfo) return;
      const t = new Date();
      const hh = String(t.getHours()).padStart(2, "0");
      const mm = String(t.getMinutes()).padStart(2, "0");
      prepInfo.textContent = `ЧЕРНОВИК СОХРАНЁН · ${hh}:${mm}`;
    }).catch(() => {});
  }, 500);
}

async function loadPrep() {
  if (!prep) return;
  try {
    const saved = await kvGetMigrated(PREP_KEY);
    if (typeof saved === "string" && saved && !prep.value) {
      prep.value = saved;
      if (prepInfo) prepInfo.textContent = "ЧЕРНОВИК ВОССТАНОВЛЕН";
    }
  } catch (err) {
    console.warn("[тетрадь] черновик «Подготовки документа» не восстановился:", err);
  }
}

if (prep) {
  prep.addEventListener("input", savePrep);
  const btnClear = document.getElementById("btnPrepClear");
  if (btnClear) btnClear.addEventListener("click", () => {
    if (!prep.value) return;
    prep.value = "";
    prep.focus();
    savePrep();
    toast("Текст «Подготовки документа» очищен");
  });
  loadPrep();
}

function sourceSelector() {
  const prep2 = document.getElementById("prepText");
  if (prep2 && prep2.value.trim()) return "#prepText";
  const ocr = document.getElementById("ocrResult");
  if (ocr && ocr.value.trim()) return "#ocrResult";
  const ed = document.getElementById("editor");
  if (ed && ed.textContent.trim()) return "#editor";
  return "#prepText";
}

let opening = false;
async function open() {
  if (opening) return;
  opening = true;
  try {
    const m = await import(new URL("./gost.studio.js", import.meta.url).href);
    await m.openGostStudio({ source: sourceSelector() });
  } catch (e) {
    console.error("[gost]", e);
    toast("Конструктор не загрузился: " + e.message, 4200);
  } finally { opening = false; }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-gost-open]");
  if (b) { e.preventDefault(); e.stopPropagation(); open(); }
}, true);
document.addEventListener("keydown", e => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyG") { e.preventDefault(); open(); }
});
window.GostStudio = { open };
