

import { toast, downloadText, warnOnce } from "./common.js";
import { sendToOffice } from "./editor.js";
import { IdbKV } from "./idb.js";
import { ensurePersistentStorage } from "./storage.js";

const $ = id => document.getElementById(id);

const OCR_REV = "3cbb26882389013ed863b66a78e52376b5ff0f0a";
const HF_BASE = `https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/${OCR_REV}`;

const MB = 1024 * 1024;

const CATALOG = {
  ru: [ {
    kind: "detection",
    url: `${HF_BASE}/detection/PP-OCRv5_mobile_det_infer.onnx`,
    sha256: "d7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924",
    approxBytes: 4.5 * MB
  }, {
    kind: "recognition",
    url: `${HF_BASE}/recognition/multi/cyrillic/v5/cyrillic_PP-OCRv5_mobile_rec_infer.onnx`,
    sha256: "0d91040605ef7bdca6868fad6cad1664840d031e9f6d40d54607df5b50fa280a",
    approxBytes: 7.7 * MB
  }, {
    kind: "dictionary",
    url: `${HF_BASE}/recognition/multi/cyrillic/v5/ppocrv5_cyrillic_dict.txt`,
    sha256: "90822a96058eb83f8e637ace75f90cbd36c41253f9dbdfb88fcf5a2bdd50d669",
    approxBytes: .05 * MB
  } ],
  en: [ {
    kind: "detection",
    url: `${HF_BASE}/detection/PP-OCRv5_mobile_det_infer.ort`,
    sha256: "30acfc4e21f2a23669d01a75aaeb92190f96874613108a0f7086bed264420abc",
    approxBytes: 4.7 * MB
  }, {
    kind: "recognition",
    url: `${HF_BASE}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort`,
    sha256: "74ff9e508379375b5149a3c7764221fa9ba7680b7e2f2e458f26b7c7993a89b0",
    approxBytes: 7.6 * MB
  }, {
    kind: "dictionary",
    url: `${HF_BASE}/recognition/multi/en/v5/ppocrv5_en_dict.txt`,
    sha256: "c60d46e9e01d500ed6388fe8681051eac9cf6692e0d57238315be171927a0a1b",
    approxBytes: .01 * MB
  } ],
  multi: [ {
    kind: "detection",
    url: `${HF_BASE}/detection/ort/PP-OCRv6_tiny_det.ort`,
    sha256: "2816e82d26a09d6af722492f80f3059d458377c084eca88f34d84ddf9b385580",
    approxBytes: 1.8 * MB
  }, {
    kind: "recognition",
    url: `${HF_BASE}/recognition/ort/PP-OCRv6_tiny_rec.ort`,
    sha256: "efc46adf1bde1e05b58748268abb0e71791bfa8616c435676bbca13d1ea47767",
    approxBytes: 4.3 * MB
  }, {
    kind: "dictionary",
    url: `${HF_BASE}/recognition/ppocrv6_tiny_dict.txt`,
    sha256: "2f3717bbd530b681b6db3be35cc485e8a41a932b9558b833986bf0894eb21f2d",
    approxBytes: .04 * MB
  } ]
};

const LANG_NAMES = {
  ru: "русский / кириллица",
  en: "английский",
  multi: "мультиязычный"
};

const zone = $("dropZone"), fileInput = $("fileInput");
const status = $("ocrStatus"), progress = $("dlProgress"), bar = $("dlBar"), ptext = $("dlText");
const resultTa = $("ocrResult"), meta = $("ocrMeta");
let worker = null;
let readyLang = null;
let lastBackend = "?";
let busy = false;
let reqId = 0;
const pending = new Map;

function showStatus(text) {
  status.hidden = !text;
  status.textContent = text;
}

function showProgress(on, frac, label) {
  progress.hidden = !on;
  if (on) {
    bar.style.width = `${Math.round(frac * 100)}%`;
    ptext.textContent = label || "";
  }
}

function rejectAllPending(message) {
  for (const [, p] of pending) p.reject(new Error(message));
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker("js/ocr.worker.js", {
    type: "module"
  });
  worker.onmessage = e => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.type === "error") p.reject(new Error(msg.message)); else p.resolve(msg);
  };
  worker.onerror = e => {
    rejectAllPending(e.message || "Ошибка воркера распознавания");
    showStatus(`Ошибка: ${e.message || "не удалось запустить движок распознавания"}`);
    busy = false;
    showProgress(false);
  };
  return worker;
}

function workerCall(msg, transfer, timeoutMs) {
  return new Promise((resolve, reject) => {
    msg.id = ++reqId;
    pending.set(msg.id, {
      resolve: resolve,
      reject: reject
    });
    ensureWorker().postMessage(msg, transfer || []);
    setTimeout(() => {
      if (pending.has(msg.id)) {
        pending.delete(msg.id);
        reject(new Error("Превышено время ожидания — попробуйте ещё раз"));
      }
    }, timeoutMs || 5 * 60 * 1e3);
  });
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [ ...new Uint8Array(digest) ].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchWithProgress(url, expectedSha, onBump) {
  let resp;
  try {
    resp = await fetch(url, {
      mode: "cors"
    });
  } catch {
    throw new Error(`Не удалось загрузить ${url.split("/").pop()}: проверьте сеть`);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} для ${url.split("/").pop()}`);
  let buf;
  if (!resp.body) {
    buf = await resp.arrayBuffer();
    onBump(buf.byteLength);
  } else {
    const reader = resp.body.getReader();
    const chunks = [];
    for (;;) {
      const {done: done, value: value} = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        onBump(value.byteLength);
      }
    }
    buf = await new Blob(chunks).arrayBuffer();
  }

  const hex = await sha256Hex(buf);
  if (expectedSha && hex !== expectedSha) {
    throw new Error(`Файл ${url.split("/").pop()} не прошёл проверку целостности — скачивание прервано`);
  }
  return buf;
}

async function loadLanguage(lang, opts = {}) {
  const quiet = !!opts.quiet;
  const files = CATALOG[lang];
  const total = files.reduce((s, f) => s + f.approxBytes, 0);
  let received = 0, cachedAll = true;
  const buffers = {};
  const bump = n => {
    received += n;
    if (!quiet) showProgress(true, received / total, `Загрузка языкового пакета… ${fmtMB(received)} / ${fmtMB(total)}`);
  };
  if (!quiet) showStatus(`Готовлю пакет «${LANG_NAMES[lang]}»…`);
  for (const f of files) {
    let buf;
    try {
      buf = await IdbKV.get(f.url);
    } catch {
      buf = undefined;
    }
    if (buf) {
      buffers[f.kind] = buf;
      bump(buf.byteLength);
      continue;
    }
    cachedAll = false;

    await ensurePersistentStorage();
    buf = await fetchWithProgress(f.url, f.sha256, bump);
    try {
      await IdbKV.put(f.url, buf.slice(0));
    } catch (err) {

      warnOnce("ocr-cache-put", "Кэш модели не сохранился (" + f.kind + "):", err);
    }
    buffers[f.kind] = buf;
  }
  if (!buffers.detection || !buffers.recognition || !buffers.dictionary) {
    throw new Error("Неполный набор файлов модели");
  }
  if (!quiet) showStatus(cachedAll ? "Пакет уже в кэше — запускаю движок…" : "Пакет скачан — запускаю движок…");
  if (!quiet) showProgress(true, 1, "Инициализация движка…");
  const resp = await workerCall({
    type: "init",
    modelId: lang,
    detection: buffers.detection,
    recognition: buffers.recognition,
    dictionary: buffers.dictionary
  }, [ buffers.detection, buffers.recognition, buffers.dictionary ], 3.5 * 60 * 1e3);
  readyLang = lang;
  if (!quiet) showProgress(false);
  return resp;
}

export async function ocrLangCached(lang) {
  try {
    for (const f of CATALOG[lang]) {
      const buf = await IdbKV.get(f.url);
      if (!buf) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function ocrPreload(lang) {
  await loadLanguage(lang, {
    quiet: true
  });
}

const fmtMB = n => `${(n / MB).toFixed(1)} МБ`;

async function ensureEngine(lang) {
  if (readyLang === lang) return;
  const resp = await loadLanguage(lang);
  lastBackend = resp.backend || "wasm";
  meta.textContent = `движок: ${lastBackend} · пакет «${LANG_NAMES[lang]}»`;
  toast("Движок распознавания готов ✓");
}

async function runOne(source) {
  const buf = await source.arrayBuffer();
  const r = await workerCall({
    type: "recognize",
    image: buf
  }, [ buf ]);
  return r;
}

async function recognize(source) {
  if (busy) return;
  busy = true;
  const lang = $("langSelect").value;
  try {
    await ensureEngine(lang);
    showStatus("Распознаю текст…");
    const r = await runOne(source);
    resultTa.value = r.text || "";
    const conf = r.confidence != null ? ` · уверенность ${Math.round(r.confidence * 100)}%` : "";
    showStatus("");
    meta.textContent = `движок: ${lastBackend} · ${(r.elapsedMs / 1e3).toFixed(1)} с · ${LANG_NAMES[lang]}${conf}`;
    if (!resultTa.value) toast("Текст не найден — попробуйте более чёткое фото"); else toast("Готово ✓");
  } catch (err) {
    showStatus(`Ошибка: ${err.message}`);
    readyLang = null;
  } finally {
    busy = false;
    showProgress(false);
  }
}

function withSteadyRaf() {
  let fired = false;
  requestAnimationFrame(() => {
    fired = true;
  });
  return new Promise(resolve => {
    setTimeout(() => {
      if (fired) return resolve(null);
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
      resolve(() => {
        window.requestAnimationFrame = orig;
      });
    }, 300);
  });
}

async function renderPdfPages(file) {
  const pdfjs = await (import("../lib/pdfjs/pdf.min.js"));
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../lib/pdfjs/pdf.worker.min.js", new URL("js/", document.baseURI)).href;
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: data
  }).promise;
  const pages = [];
  const unshim = await withSteadyRaf();
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      showStatus(`Готовлю страницу ${n} из ${doc.numPages}…`);
      const page = await doc.getPage(n);
      const base = page.getViewport({
        scale: 1
      });
      const scale = Math.min(2.2, Math.max(1.2, 1600 / Math.max(base.width, base.height)));
      const viewport = page.getViewport({
        scale: scale
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;
      pages.push(canvas);
    }
  } finally {
    if (unshim) unshim();
  }
  return pages;
}

async function recognizePdf(file) {
  if (busy) return;
  busy = true;
  const lang = $("langSelect").value;
  try {
    await ensureEngine(lang);
    const canvases = await renderPdfPages(file);
    const parts = [];
    let elapsed = 0;
    for (let i = 0; i < canvases.length; i++) {
      showStatus(`Распознаю страницу ${i + 1} из ${canvases.length}…`);
      const blob = await new Promise(res => canvases[i].toBlob(res, "image/png"));
      const r = await runOne(blob);
      elapsed += r.elapsedMs;
      if (r.text) parts.push(r.text);
    }
    resultTa.value = parts.join("\n\n");
    showStatus("");
    meta.textContent = `движок: ${lastBackend} · ${(elapsed / 1e3).toFixed(1)} с · страниц: ${canvases.length} · ${LANG_NAMES[lang]}`;
    toast(resultTa.value ? "Готово ✓" : "Текст не найден — попробуйте более чёткий скан");
  } catch (err) {
    showStatus(`Ошибка: ${err.message}`);
    readyLang = null;
  } finally {
    busy = false;
    showProgress(false);
  }
}

function handleFile(file) {
  if (!file) return;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf && !/^image\//.test(file.type)) return toast("Нужен файл PDF, JPG, PNG или WEBP");
  if (isPdf && file.size > 60 * MB) return toast("PDF слишком большой (до 60 МБ)");
  if (!isPdf) {
    const url = URL.createObjectURL(file);
    $("previewImg").src = url;
    $("previewWrap").hidden = false;
  }
  if (isPdf) recognizePdf(file); else recognize(file);
}

zone.addEventListener("click", () => fileInput.click());
zone.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
  fileInput.value = "";
});

[ "dragenter", "dragover" ].forEach(ev => zone.addEventListener(ev, e => {
  e.preventDefault();
  zone.classList.add("dragover");
}));

[ "dragleave", "drop" ].forEach(ev => zone.addEventListener(ev, e => {
  e.preventDefault();
  zone.classList.remove("dragover");
}));

zone.addEventListener("drop", e => {
  const f = e.dataTransfer?.files?.[0];
  if (f) handleFile(f);
});

document.addEventListener("paste", e => {
  if (document.getElementById("scan").hidden) return;
  const item = [ ...e.clipboardData?.items || [] ].find(i => /^image\//.test(i.type));
  if (item) {
    handleFile(item.getAsFile());
    e.preventDefault();
  }
});

$("langSelect").addEventListener("change", () => {
  if (readyLang && readyLang !== $("langSelect").value) readyLang = null;
});

$("btnOcrCopy").addEventListener("click", async () => {
  if (!resultTa.value) return toast("Пока нечего копировать");
  try {
    await navigator.clipboard.writeText(resultTa.value);
    toast("Скопировано ✓");
  } catch (err) {
    warnOnce("clipboard", "Буфер обмена недоступен:", err);
    toast("Не удалось скопировать — браузер запретил доступ к буферу");
  }
});

$("btnOcrDownload").addEventListener("click", () => {
  if (!resultTa.value) return toast("Пока нечего скачивать");
  downloadText(resultTa.value, "scan.txt");
});

$("btnOcrToOffice").addEventListener("click", () => {
  if (!resultTa.value) return toast("Пока нечего передавать");
  sendToOffice(resultTa.value, "Текст передан в редактор");
});

$("btnOcrClear").addEventListener("click", () => {
  resultTa.value = "";
  showStatus("");
  meta.textContent = "движок не запущен";
});
