

import { createReadability } from "./feature.readability.js";

import { createDiff } from "./feature.diff.js";

import { createExporter } from "./feature.export.js";

import { summarize, RU_STOPWORDS } from "./summarize.core.js";

import { toast, closePops, warnOnce, lsGet, lsSet } from "./common.js";

import { getEditorText, getEditorJson, setEditorText, applyTextOp } from "./editor.js";

import { kvGetString, kvSet, ensurePersistentStorage } from "./storage.js";

import { PRESETS as PRESETS_MAP } from "./presets.js";

import { ocrLangCached, ocrPreload } from "./ocr.js";

import { asrModelCached, asrPreload } from "./dictate.js";

import { escapeHtml } from "./text.core.js";

const $ = id => document.getElementById(id);

const PRESET_FN = id => {
  const preset = PRESETS_MAP.find(p => p.id === id);
  return preset ? preset.fn : undefined;
};

const esc = escapeHtml;

const OPS = [ {
  label: "Типографика",
  id: "typo",
  cat: 1
}, {
  label: "Ёфикация",
  id: "yo",
  cat: 1
}, {
  label: "Переносы",
  id: "noline",
  tip: "Убрать лишние переносы",
  cat: 1
}, {
  label: "Пробелы",
  id: "spaces",
  tip: "Убрать лишние пробелы",
  cat: 1
}, {
  label: "Строки",
  id: "noempty",
  tip: "Убрать пустые строки",
  cat: 1
}, {
  label: "Абзацы",
  id: "nltospace",
  tip: "Убрать абзацы",
  cat: 1
}, {
  label: "РЕГИСТР",
  id: "upper",
  tip: "Верхний регистр",
  cat: 1
}, {
  label: "регистр",
  id: "lower",
  tip: "Нижний регистр",
  cat: 1
}, {
  label: "Заглавные",
  id: "title",
  tip: "Каждое слово с заглавной",
  cat: 1
}, {
  label: "Нормальные",
  id: "sent",
  tip: "Заглавные и строчные как в предложениях",
  cat: 1
}, {
  label: "А-Я",
  id: "sort",
  tip: "Сортировать строки в алфавитном порядке",
  cat: 1
}, {
  label: "Я-А",
  id: "rsort",
  tip: "Сортировать строки в обратном порядке",
  cat: 1
}, {
  label: "На слова",
  id: "wordline",
  tip: "Каждое слово с новой строки",
  cat: 1
}, {
  label: "На предложения",
  id: "sentline",
  tip: "Каждое предложение с новой строки",
  cat: 1
}, {
  label: "Русифицировать",
  id: "translit-back",
  tip: "Латиницу в кириллицу",
  cat: 1
}, {
  label: "Латинизировать",
  id: "translit",
  tip: "Кириллицу в латиницу",
  cat: 1
}, {
  label: "Без дубликатов",
  id: "dedupe",
  tip: "Убрать дубликаты строк",
  cat: 1
}, {
  label: "Без эмодзи",
  id: "noemoji",
  tip: "Убрать эмодзи и значки",
  cat: 1
}, {
  label: "Нумерация",
  id: "number",
  tip: "Нумеровать строки",
  cat: 1
}, {
  label: "Обратить строки",
  id: "reverse",
  tip: "Обратить порядок строк",
  cat: 1
}, {
  label: "Гомоглифы",
  id: "homo",
  tip: "Кириллические буквы-двойники в латиницу",
  cat: 1
}, {
  label: "Без HTML",
  id: "nohtml",
  tip: "Убрать HTML-теги",
  cat: 1
}, {
  label: "Без Markdown",
  id: "nomd",
  tip: "Очистить разметку Markdown",
  cat: 1
}, {
  label: "Без пунктуации",
  id: "nopunct",
  tip: "Убрать знаки препинания",
  cat: 1
}, {
  label: "Частотный словарь",
  id: "freq",
  cat: 2
}, {
  label: "Краткий пересказ",
  id: "summarize",
  tip: "Выделить главные предложения",
  cat: 2
}, {
  label: "Сравнение текстов",
  id: "diff",
  cat: 2
}, {
  label: "Найти и заменить",
  id: "findreplace",
  tip: "Поиск с заменой в отдельном окне",
  cat: 2
}, {
  label: "Ссылки",
  id: "urls",
  tip: "Извлечь ссылки",
  cat: 2
}, {
  label: "E-mail",
  id: "emails",
  tip: "Извлечь адреса почты",
  cat: 2
}, {
  label: "Телефоны",
  id: "phones",
  tip: "Извлечь телефоны",
  cat: 2
}, {
  label: "Даты",
  id: "dates",
  tip: "Извлечь даты",
  cat: 2
}, {
  label: "Числа",
  id: "numbers",
  tip: "Извлечь числа",
  cat: 2
}, {
  label: "Буквы и цифры",
  id: "alnum",
  tip: "Оставить только буквы и цифры",
  cat: 2
} ];

const opsMenu = $("opsMenu");

function buildOpsMenu() {
  const cat1 = OPS.filter(o => o.cat === 1);
  const cat2 = OPS.filter(o => o.cat === 2);
  $("opsList").innerHTML = `<p class="pop-label">Преобразования</p>` + cat1.map(o => `<button type="button" class="pop-item" data-op="${o.id}" ${o.tip ? `data-tip="${o.tip}"` : ""}>${o.label}</button>`).join("") + `<p class="pop-label pop-label-mt">Анализ и извлечение</p>` + cat2.map(o => `<button type="button" class="pop-item" data-op="${o.id}" ${o.tip ? `data-tip="${o.tip}"` : ""}>${o.label}</button>`).join("");
}

buildOpsMenu();

opsMenu.addEventListener("click", e => {
  const item = e.target.closest(".pop-item");
  if (!item) return;
  const action = item.dataset.action;
  if (action === "print") {
    closePops();
    window.print();
    return;
  }
  if (action === "export") {
    const formats = $("exportFormats");
    formats.hidden = !formats.hidden;
    return;
  }
  if (action === "autosave") {
    closePops();
    autoSaveToggle();
    return;
  }
  if (action === "snaps") {
    closePops();
    openSnapsModal();
    return;
  }
  if (action === "offline") {
    closePops();
    openOfflineModal();
    return;
  }
  if (action === "controls") {
    closePops();
    openControlsModal();
    return;
  }
  if (item.dataset.format) {
    closePops();
    $("exportFormats").hidden = true;
    const format = item.dataset.format;
    const doc = {
      text: getEditorText(),
      json: getEditorJson()
    };
    if (!doc.text.trim()) return toast("Текст пуст — нечего экспортировать");
    item.disabled = true;
    exporter.run(doc, format).then(() => {
      toast(`Скачан файл ${format.toUpperCase()} ✓`);
      item.disabled = false;
    }).catch(err => {
      toast("Экспорт не удался: " + err.message);
      item.disabled = false;
    });
    return;
  }
  const op = OPS.find(o => o.id === item.dataset.op);
  if (!op) return;
  closePops();
  if (op.cat === 1) {
    snapNow(`операция «${op.label}»`);
    applyTextOp(op.id);
  } else {
    runWindowOp(op);
  }
});

function openControlsModal() {
  const rows = [ [ "Отменить", "Контроль+я" ], [ "Вернуть", "Контроль+н" ], [ "Кегль больше", "Контроль +" ], [ "Кегль меньше", "Контроль −" ], [ "Полужирный", "Контроль+и" ], [ "Курсивный", "Контроль+л" ], [ "Подчёркнутый", "Контроль+г" ], [ "Выделение маркером", "Контроль+↑" ], [ "Снять маркер", "Контроль+↓" ], [ "Абзац", "Контроль+0" ], [ "Подзаголовок верхний", "Контроль+1" ], [ "Подзаголовок нижний", "Контроль+2" ], [ "Редакторская метка", "Левый альтернативный+выделение текста" ], [ "Снять редакторскую метку", "Левый альтернативный+выделение текста" ] ];
  openModal("Управление", `\n    <table class="controls-table">\n      ${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}\n    </table>`);
}


const overlay = $("modalOverlay");
let lastModalTrigger = null;

function modalFocusables() {
  return [ ...overlay.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ].filter(el => !el.disabled && el.hidden !== true && el.offsetParent !== null);
}

overlay.addEventListener("keydown", e => {
  if (e.key !== "Tab") return;
  const list = modalFocusables();
  if (!list.length) {
    e.preventDefault();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (!overlay.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
    return;
  }
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function openModal(title, bodyHTML) {
  lastModalTrigger = document.activeElement;
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHTML;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  const first = modalFocusables()[0];
  if (first) first.focus(); else overlay.querySelector(".modal-card").focus();
}

function closeModal() {
  overlay.hidden = true;
  document.body.style.overflow = "";
  $("modalBody").innerHTML = "";
  const t = lastModalTrigger;
  lastModalTrigger = null;
  if (t && t.isConnected && typeof t.focus === "function") t.focus();
}

overlay.addEventListener("click", e => {
  if (e.target === overlay) closeModal();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !overlay.hidden) closeModal();
});

function setEditorFromModal(text) {
  if (text !== undefined) setEditorText(text || "");
  closeModal();
}

function runWindowOp(op) {
  const text = getEditorText();
  if (op.id === "diff") return openDiffModal();
  if (op.id === "freq") return openFreqModal(text);
  if (op.id === "findreplace") return openFindReplaceModal();
  if (op.id === "summarize") return openSummarizeModal();
  if (op.id === "alnum") {
    openResultModal(op.label, text ? PRESET_FN("alnum")(text) || "—" : "");
    return;
  }
  const fn = PRESET_FN(op.id);
  if (!fn) return;
  if (!text.trim()) return toast("Текст пуст — нечего извлекать");
  openResultModal(op.label, fn(text) || "Ничего не найдено");
}

function openResultModal(title, content) {
  openModal(title, `\n    <textarea class="modal-text" readonly>${esc(content)}</textarea>\n    <div class="row-between mt-9">\n      <button type="button" class="btn btn-ghost" id="modalCopy">Скопировать</button>\n      <button type="button" class="btn btn-primary" id="modalReplace">Заменить текст в редакторе</button>\n    </div>`);
  $("modalCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("modalBody .modal-text").value);
      toast("Скопировано ✓");
    } catch (err) {
      warnOnce("clipboard", "Буфер обмена недоступен:", err);
      toast("Не удалось скопировать — браузер запретил доступ к буферу");
    }
  });
  $("modalReplace").addEventListener("click", () => {
    setEditorFromModal($("modalBody .modal-text").value);
    toast("Текст заменён в редакторе");
  });
}

function openFreqModal(text) {
  if (!text.trim()) return toast("Текст пуст");
  const words = (text.toLocaleLowerCase("ru").match(/[а-яёa-z0-9]{3,}/gu) || []).filter(w => !RU_STOPWORDS.has(w));
  const counts = new Map;
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  const top = [ ...counts.entries() ].sort((a, b) => b[1] - a[1]).slice(0, 30);
  openModal("Частотный словарь", `\n    ${top.length ? `<div class="freq-list">${top.map(([w, n]) => `<span class="freq-chip">${esc(w)}<b>${n}</b></span>`).join("")}</div>` : `<p class="card-note">Слова не найдены.</p>`}\n    <p class="card-note mt-9">Всего слов: ${words.length.toLocaleString("ru")} · уникальных: ${counts.size.toLocaleString("ru")}</p>`);
}

function openDiffModal() {
  openModal("Сравнение текстов", `\n    <div class="diff-grid">\n      <div><p class="pop-label">Версия A</p><textarea id="diffA" class="modal-area" placeholder="Первая версия…"></textarea></div>\n      <div><p class="pop-label">Версия B</p><textarea id="diffB" class="modal-area" placeholder="Вторая версия…"></textarea></div>\n    </div>\n    <div class="row-between my-9">\n      <div class="check-row m-0">\n        <label class="check"><span class="sub-note">Режим:</span>\n          <select id="diffMode" class="select">\n            <option value="words">по словам</option>\n            <option value="chars">по символам</option>\n            <option value="lines">по строкам</option>\n          </select>\n        </label>\n        <label class="check"><input type="checkbox" id="chkDiffCase"><span class="box" aria-hidden="true"></span><span>Игнорировать регистр</span></label>\n        <label class="check"><input type="checkbox" id="chkDiffSpace"><span class="box" aria-hidden="true"></span><span>Игнорировать пробелы</span></label>\n      </div>\n      <button type="button" class="btn btn-primary" id="btnDiff">Сравнить</button>\n    </div>\n    <div id="diffOut" class="diff-out" hidden></div>`);
  $("diffA").value = getEditorText();
  const differ = createDiff();
  $("btnDiff").addEventListener("click", async () => {
    const a = $("diffA").value, b = $("diffB").value;
    const out = $("diffOut");
    if (!a.trim() && !b.trim()) return toast("Заполните хотя бы одно поле");
    out.hidden = false;
    out.innerHTML = `<span class="card-note">Сравниваю…</span>`;
    try {
      const {parts: parts, added: added, removed: removed} = await differ.run({
        a: a,
        b: b,
        mode: $("diffMode").value,
        ignoreCase: $("chkDiffCase").checked,
        ignoreSpace: $("chkDiffSpace").checked
      });
      const MAX = 3e3;
      const n = Math.min(parts.length, MAX);
      let html = "";
      for (let i = 0; i < n; i++) {
        const p = parts[i];
        html += p.added ? `<ins>${esc(p.value)}</ins>` : p.removed ? `<del>${esc(p.value)}</del>` : esc(p.value);
      }
      if (parts.length > MAX) html += `<span class="card-note"> …показаны первые ${MAX} различий</span>`;
      out.innerHTML = `<p class="card-note diff-stats">Добавлено: ${added.toLocaleString("ru")} · Удалено: ${removed.toLocaleString("ru")}${!added && !removed ? " · тексты совпадают" : ""}</p>` + `<div class="diff-text">${html || "<span class='card-note'>Различий нет</span>"}</div>`;
    } catch (e) {
      out.innerHTML = `<span class="card-note">Ошибка: ${e.message}</span>`;
    }
  });
}

function openFindReplaceModal() {
  openModal("Найти и заменить", `\n    <div class="replace-grid">\n      <input id="frFind" type="text" placeholder="Что искать…">\n      <input id="frReplace" type="text" placeholder="Чем заменить…">\n    </div>\n    <div class="check-row">\n      <label class="check"><input type="checkbox" id="frRegex"><span class="box" aria-hidden="true"></span><span>Регулярное выражение</span></label>\n      <label class="check"><input type="checkbox" id="frCase"><span class="box" aria-hidden="true"></span><span>Учитывать регистр</span></label>\n      <label class="check"><input type="checkbox" id="frWord"><span class="box" aria-hidden="true"></span><span>Целое слово</span></label>\n    </div>\n    <div class="row-between mt-9">\n      <span class="card-note" id="frCount">совпадений: —</span>\n      <button type="button" class="btn btn-primary" id="frReplaceAll">Заменить всё</button>\n    </div>`);
  const body = $("modalBody");
  const buildRegex = () => {
    const find = body.querySelector("#frFind").value;
    if (!find) return null;
    try {
      if (body.querySelector("#frRegex").checked) return new RegExp(find, body.querySelector("#frCase").checked ? "g" : "gi");
      const escRe = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wrapped = body.querySelector("#frWord").checked ? `\\b(?:${escRe})\\b` : escRe;
      return new RegExp(wrapped, body.querySelector("#frCase").checked ? "g" : "gi");
    } catch {
      toast("Неверное регулярное выражение");
      return null;
    }
  };
  const COUNT_CAP = 2e5;
  const updateCount = () => {
    const re = buildRegex();
    const el = body.querySelector("#frCount");
    if (!re) {
      el.textContent = "совпадений: —";
      return;
    }
    const text = getEditorText();
    const capped = text.length > COUNT_CAP ? text.slice(0, COUNT_CAP) : text;
    const n = (capped.match(re) || []).length;
    el.textContent = `совпадений: ${n.toLocaleString("ru")}` + (text.length > COUNT_CAP ? ` · счёт по первым ${COUNT_CAP.toLocaleString("ru")} знаков` : "");
  };
  [ "frFind", "frRegex", "frCase", "frWord" ].forEach(id => body.querySelector(`#${id}`).addEventListener("input", updateCount));
  body.querySelector("#frRegex").addEventListener("change", updateCount);
  body.querySelector("#frCase").addEventListener("change", updateCount);
  body.querySelector("#frWord").addEventListener("change", updateCount);
  body.querySelector("#frFind").focus();
  body.querySelector("#frReplaceAll").addEventListener("click", () => {
    const re = buildRegex();
    if (!re) return toast("Укажите, что искать");
    const text = getEditorText();
    const replaced = text.replace(re, body.querySelector("#frReplace").value);
    snapNow("замена по тексту");
    setEditorText(replaced);
    updateCount();
    toast("Замена выполнена");
  });
}

function openSummarizeModal() {
  const text = getEditorText();
  if (!text.trim()) return toast("Текст пуст — пересказывать нечего");
  openModal("Краткий пересказ", `\n    <label class="check sum-range"><span class="sub-note">Объём: <b id="sumPct">30</b>% предложений</span>\n      <input type="range" id="sumPercent" min="10" max="60" step="5" value="30">\n    </label>\n    <div id="sumOut" class="sum-out"></div>\n    <div class="row-between mt-9">\n      <button type="button" class="btn btn-ghost" id="sumCopy">Скопировать</button>\n      <button type="button" class="btn btn-primary" id="sumReplace">Заменить текст в редакторе</button>\n    </div>`);
  let current = null;
  const render = pct => {
    const r = summarize(text, {
      percent: pct
    });
    $("sumPct").textContent = String(pct);
    $("sumOut").innerHTML = r.sentences.length ? `<ul class="sum-list">${r.sentences.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` + (r.keywords.length ? `<p class="card-note">Ключевые слова: ${r.keywords.map(k => esc(k.word)).join(", ")}</p>` : "") : `<p class="card-note">Предложений не найдено.</p>`;
    current = r;
    return r;
  };
  render(30);
  $("sumPercent").addEventListener("input", e => render(Number(e.target.value)));
  $("sumCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(current.sentences.join("\n"));
      toast("Скопировано ✓");
    } catch (err) {
      warnOnce("clipboard", "Буфер обмена недоступен:", err);
      toast("Не удалось скопировать — браузер запретил доступ к буферу");
    }
  });
  $("sumReplace").addEventListener("click", () => {
    snapNow("краткий пересказ");
    setEditorText(current.sentences.join("\n"));
    closeModal();
    toast("Пересказ вставлен в редактор");
  });
}


const OFFLINE_ITEMS = [ {
  id: "ocr-ru",
  name: "Распознавание «русский / кириллица»",
  size: "≈12 МБ",
  check: () => ocrLangCached("ru"),
  run: () => ocrPreload("ru")
}, {
  id: "ocr-en",
  name: "Распознавание «английский»",
  size: "≈12 МБ",
  check: () => ocrLangCached("en"),
  run: () => ocrPreload("en")
}, {
  id: "ocr-multi",
  name: "Распознавание «другой»",
  size: "≈6 МБ",
  check: () => ocrLangCached("multi"),
  run: () => ocrPreload("multi")
}, {
  id: "asr",
  name: "Диктовка GigaAM",
  size: "≈225 МБ",
  check: asrModelCached,
  run: () => asrPreload()
} ];

async function openOfflineModal() {
  const rows = OFFLINE_ITEMS.map(it => `\n      <div class="off-row" data-off="${it.id}">\n        <span class="off-dot" aria-hidden="true"></span>\n        <span class="off-name">${it.name}</span>\n        <span class="off-size">${it.size}</span>\n        <button type="button" class="btn btn-ghost btn-sm" data-off-run="${it.id}">Скачать</button>\n      </div>`).join("");
  openModal("Офлайн-режим", `\n    <p class="card-note">Пакеты скачиваются один раз и хранятся в браузере. После этого распознавание и диктовка работают без интернета.</p>\n    <div class="off-list">${rows}</div>\n    <p class="card-note" id="offPersist" hidden></p>\n    <div class="row-between mt-9">\n      <span class="card-note" id="offStatus">Готовность проверяю…</span>\n      <button type="button" class="btn btn-primary" id="offAll">Скачать всё</button>\n    </div>`);

  const persistNote = $("offPersist");
  ensurePersistentStorage().then(persisted => {
    if (!persistNote) return;
    persistNote.hidden = false;
    persistNote.textContent = persisted
      ? "Хранилище: постоянное — браузер не вычистит модели при нехватке места."
      : "Хранилище: временное — браузер может вычистить модели, если им понадобится место (Safari — через 7 дней без посещения).";
  }).catch(() => {});
  const setRow = (id, cls, label) => {
    const row = $(`modalBody`).querySelector(`[data-off="${id}"]`);
    if (!row) return;
    row.classList.remove("ready", "busy", "failed");
    if (cls) row.classList.add(cls);
    const btn = row.querySelector("button");
    btn.textContent = label;
    btn.disabled = cls === "busy";
  };
  const refresh = async () => {
    for (const it of OFFLINE_ITEMS) {
      const ready = await it.check().catch(() => false);
      setRow(it.id, ready ? "ready" : "", ready ? "Готово ✓" : "Скачать");
    }
    const all = (await Promise.all(OFFLINE_ITEMS.map(it => it.check().catch(() => false)))).every(Boolean);

    const offStatus = $("offStatus");
    if (offStatus) offStatus.textContent = all ? "Всё для офлайна скачано ✓" : "Готовность проверяю…";
    return all;
  };
  refresh();
  const runOne = async it => {
    setRow(it.id, "busy", "Качаю…");
    try {
      await it.run();
      setRow(it.id, "ready", "Готово ✓");
      return true;
    } catch (err) {
      setRow(it.id, "failed", "Ошибка — повторить");
      toast(`Не удалось скачать «${it.name}»: ${err.message}`);
      return false;
    }
  };
  $(`modalBody`).querySelectorAll("[data-off-run]").forEach(btn => {
    btn.addEventListener("click", () => {
      const it = OFFLINE_ITEMS.find(x => x.id === btn.dataset.offRun);
      if (it) runOne(it).then(refresh);
    });
  });
  $("offAll").addEventListener("click", async () => {
    $("offAll").disabled = true;
    for (const it of OFFLINE_ITEMS) {
      if (!(await it.check().catch(() => false))) await runOne(it);
    }
    $("offAll").disabled = false;
    await refresh();
  });
}

const CNT_LIMIT = 2e5;

const cntTimers = {};

function fmtLimit(n) {
  return n.toLocaleString("ru");
}

function updateCntInfo(n, len) {
  const bar = $(`cnt${n}Info`).firstElementChild;
  bar.style.width = `${Math.min(100, Math.round(len / CNT_LIMIT * 100))}%`;
  $(`cnt${n}Info`).classList.toggle("full", len >= CNT_LIMIT);
}

function saveCnt(n, value) {
  clearTimeout(cntTimers[n]);
  cntTimers[n] = setTimeout(() => {
    kvSet(`cabinet-cnt${n}`, value, `— ящик ${n} не сохранился`).catch(() => {});
  }, 400);
}

async function initContainer(n) {
  const area = $(`cnt${n}`);
  try {
    area.value = (await kvGetString(`cabinet-cnt${n}`)) || "";
  } catch (err) {
    warnOnce("cnt-read:" + n, "Содержимое ящика не прочитано:", err);
  }
  updateCntInfo(n, area.value.length);
  area.addEventListener("input", () => {
    if (area.value.length > CNT_LIMIT) {
      area.value = area.value.slice(0, CNT_LIMIT);
      toast(`Контейнер вмещает до ${fmtLimit(CNT_LIMIT)} знаков — лишнее обрезано`);
    }
    updateCntInfo(n, area.value.length);
    saveCnt(n, area.value);
  });
}

initContainer(1);

initContainer(2);

const readability = createReadability();

let readInited = false, readTimer = null;

function fmt1(n) {
  return (Math.round(n * 10) / 10).toLocaleString("ru");
}

function gradeWord(v) {
  if (v < 7) return "простой";
  if (v < 10) return "средний";
  if (v < 13) return "для старших классов";
  return "для вуза";
}

function renderReadability(r) {
  const out = $("readOut");
  let metrics;
  if (r.script === "cyrillic") {

    metrics = [ {
      name: "Лёгкость",
      value: fmt1(r.obornevaEase),
      tip: "Индекс Оборневой (Флеш для русского): чем больше, тем проще"
    }, {
      name: "Класс",
      value: `${fmt1(r.automatedReadabilityIndex)} кл.`,
      tip: `ARI: класс по средней длине слов и предложений — ${gradeWord(r.automatedReadabilityIndex)}`
    }, {
      name: "Кольман–Лиау",
      value: `${fmt1(r.colemanLiauIndex)} кл.`,
      tip: `Буквенный индекс: класс по средней длине слов — ${gradeWord(r.colemanLiauIndex)}`
    } ];
  } else {
    metrics = [ {
      name: "Лёгкость",
      value: fmt1(r.fleschReadingEase),
      tip: `Индекс Флеша: лёгкость текста — чем больше, тем проще (${(r.easeLabel || "").toLowerCase()})`
    }, {
      name: "Школа",
      value: `${fmt1(r.fleschKincaidGrade)} кл.`,
      tip: `Флеша–Кинкейда: классов школы нужно для понимания — ${gradeWord(r.fleschKincaidGrade)}`
    }, {
      name: "Туман",
      value: `${fmt1(r.gunningFog)} кл.`,
      tip: `Индекс тумана Ганнинга: лет обучения — ${gradeWord(r.gunningFog)}`
    }, {
      name: "Сложные слова",
      value: `${fmt1(r.smogIndex)} кл.`,
      tip: `SMOG: класс по доле многосложных слов — ${gradeWord(r.smogIndex)}`
    }, {
      name: "Длина",
      value: `${fmt1(r.automatedReadabilityIndex)} кл.`,
      tip: `ARI: класс по средней длине слов и предложений — ${gradeWord(r.automatedReadabilityIndex)}`
    } ];
  }
  out.innerHTML = metrics.map((m, i) => `${i ? `<span class="rl-sep">·</span>` : ""}<span data-tip="${m.tip}">${m.name} <b>${m.value}</b></span>`).join("");
  out.hidden = false;
}

async function runReadability() {
  const text = getEditorText();
  const out = $("readOut");
  if (!text.trim()) {
    out.hidden = true;
    $("readInfo").textContent = "Текст пуст";
    return;
  }
  $("readInfo").textContent = "Считаю…";
  try {
    if (!readInited) {
      await readability.init();
      readInited = true;
    }
    const r = await readability.run(text);
    $("readInfo").textContent = "Готово";
    renderReadability(r);
  } catch (e) {
    $("readInfo").textContent = "Ошибка: " + e.message;
  }
}

$("chkReadAuto").addEventListener("change", () => {
  if ($("chkReadAuto").checked) runReadability();
});

document.getElementById("editor").addEventListener("editorinput", () => {
  if (!$("chkReadAuto").checked) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(runReadability, 800);
});

if ($("chkReadAuto").checked) runReadability();

window.addEventListener("roomchange", e => {
  if (e.detail.room === "office" && $("chkReadAuto").checked) {
    clearTimeout(readTimer);
    readTimer = setTimeout(runReadability, 250);
  }
});

const SNAP_KEY = "cabinet-snapshots";

const SNAP_MAX = 20;

import { IdbKV } from "./idb.js";

async function loadSnaps() {
  try {
    return await IdbKV.get(SNAP_KEY) || [];
  } catch {
    return [];
  }
}

async function saveSnaps(list) {
  try {
    await IdbKV.put(SNAP_KEY, list);
  } catch (err) {

    warnOnce("snaps-put", "Слепки не сохранились:", err);
  }
}

let lastSnapText = null;

async function snapNow(why) {
  const text = getEditorText();
  if (!text.trim()) {

    lastSnapText = null;
    return;
  }
  if (lastSnapText !== null && lastSnapText === text) return;
  lastSnapText = text;
  const list = await loadSnaps();
  list.push({
    t: Date.now(),
    why: why || "авто",
    text: text
  });
  while (list.length > SNAP_MAX) list.shift();
  await saveSnaps(list);
}

function fmtSnapTime(t) {
  const d = new Date(t);
  return d.toLocaleDateString("ru", {
    day: "numeric",
    month: "short"
  }) + " " + d.toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function openSnapsModal() {
  const list = (await loadSnaps()).slice().reverse();
  if (!list.length) {
    openModal("Слепки документа", `<p class="card-note">Слепков пока нет. Они появляются автоматически каждые 5 минут и перед каждой операцией над текстом.</p>`);
    return;
  }
  openModal("Слепки документа", `\n    <p class="card-note mb-9">Последние ${SNAP_MAX} снимков (новые сверху). «Восстановить» заменит текст в редакторе — обычная отмена вернёт как было.</p>\n    ${list.map((s, i) => `\n      <div class="snap-row">\n        <div class="snap-meta">\n          <b>${fmtSnapTime(s.t)}</b>\n          <span class="snap-why">${esc(s.why)}</span>\n          <span class="snap-size">${fmtLimit(s.text.length)} зн.</span>\n        </div>\n        <button type="button" class="btn btn-ghost btn-sm" data-snap-restore="${i}">Восстановить</button>\n      </div>`).join("")}`);
  $("modalBody").querySelectorAll("[data-snap-restore]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const s = list[Number(btn.dataset.snapRestore)];
      await snapNow("перед восстановлением слепка");
      setEditorText(s.text);
      closeModal();
      toast(`Восстановлен слепок от ${fmtSnapTime(s.t)}`);
    });
  });
}

setInterval(() => snapNow("каждые 5 минут"), 5 * 60 * 1e3);

const exporter = createExporter();

const exportFormats = $("exportFormats");

new MutationObserver(() => {
  if (opsMenu.hidden && !exportFormats.hidden) exportFormats.hidden = true;
}).observe(opsMenu, {
  attributes: true,
  attributeFilter: [ "hidden" ]
});

(function initPlanCard() {
  const area = document.getElementById("planText");
  if (!area) return;
  kvGetString("cabinet-plan").then(v => {
    area.value = v || "";
  }).catch(() => {});
  let saveT = null;
  area.addEventListener("input", () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      kvSet("cabinet-plan", area.value, "— план не сохранился").catch(() => {});
    }, 400);
  });
})();

const AUTO_KEY = "autosave-handle";

const AUTO_INTERVAL = 2 * 60 * 1e3;

let autoHandle = null, autoTimer = null, autoFormat = "txt";

$("btnCharity").addEventListener("click", () => {
  openModal("Реквизиты", `<p class="charity-text">Реквизиты</p>`);
});

const STATS_KEY = "cabinet-stats";

const statTiles = [ ...document.querySelectorAll(".stat[data-k]") ];

const statsModeFull = $("statsModeFull");

const statsModeBrief = $("statsModeBrief");

const statsPickBtn = $("statsPick");

const statsPop = $("statsPop");

const statsState = {
  mode: "full",
  pick: [ "stWords", "stChars", "stRead" ]
};

try {
  const savedStats = JSON.parse(lsGet(STATS_KEY) || "null");
  if (savedStats && (savedStats.mode === "full" || savedStats.mode === "brief")) {
    statsState.mode = savedStats.mode;
    if (Array.isArray(savedStats.pick) && savedStats.pick.length) statsState.pick = savedStats.pick.filter(k => statTiles.some(t => t.dataset.k === k));
  }
} catch (err) {
  warnOnce("stats-parse", "Настройки статистики повреждены — используем стандартные:", err);
}

function saveStatsState() {
  lsSet(STATS_KEY, JSON.stringify(statsState));
}

function applyStatsMode() {
  const brief = statsState.mode === "brief";
  statsModeFull.classList.toggle("active", !brief);
  statsModeBrief.classList.toggle("active", brief);
  statsPickBtn.hidden = !brief;
  statTiles.forEach(tile => {
    const show = !brief || statsState.pick.includes(tile.dataset.k);
    tile.hidden = !show;
  });
}

statsModeFull.addEventListener("click", () => {
  statsState.mode = "full";
  saveStatsState();
  applyStatsMode();
});

statsModeBrief.addEventListener("click", () => {
  statsState.mode = "brief";
  saveStatsState();
  applyStatsMode();
});

statsPop.innerHTML = `<p class="pop-label">Три показателя</p>` + statTiles.map(tile => {
  const k = tile.dataset.k;
  const label = tile.querySelector("i").textContent;
  return `<label class="check check-stat"><input type="checkbox" data-k="${k}" ${statsState.pick.includes(k) ? "checked" : ""}><span class="box" aria-hidden="true"></span><span>${label}</span></label>`;
}).join("");

statsPop.querySelectorAll("input[type='checkbox']").forEach(input => {
  input.addEventListener("change", () => {
    const k = input.dataset.k;
    if (input.checked) {
      if (statsState.pick.length >= 3) {
        input.checked = false;
        toast("Три показателя — снимите один из выбранных");
        return;
      }
      statsState.pick.push(k);
    } else {
      statsState.pick = statsState.pick.filter(x => x !== k);
    }
    saveStatsState();
    applyStatsMode();
  });
});

applyStatsMode();

function setAutoInfo(text) {
  $("autoSaveInfo").textContent = text;
}

function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

async function autoSaveNow() {
  if (!autoHandle) return;
  try {
    const blob = await exporter.buildBlob({
      text: getEditorText(),
      json: getEditorJson()
    }, autoFormat);
    const w = await autoHandle.createWritable();
    await w.write(blob);
    await w.close();
    const t = (new Date).toLocaleTimeString("ru", {
      hour: "2-digit",
      minute: "2-digit"
    });
    setAutoInfo(`автосохран: ${t} · ${autoHandle.name}`);
  } catch (e) {
    stopAuto();
    setAutoInfo("автосохран: нет доступа к файлу — включите заново");
  }
}

function startAuto() {
  stopAuto();
  autoTimer = setInterval(autoSaveNow, AUTO_INTERVAL);
  autoSaveNow();
}

async function autoSaveToggle() {
  if (autoTimer) {
    stopAuto();
    setAutoInfo("автосохран: выключено");
    toast("Автосохранение выключено");
    return;
  }
  if (!window.showSaveFilePicker) {
    return toast("Автосохранение в файл поддерживают Chrome и Edge");
  }
  if (!autoHandle) {
    try {
      const first = getEditorText().split("\n").map(l => l.trim()).find(Boolean);
      const base = (first || "заметки").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "заметки";
      autoHandle = await window.showSaveFilePicker({
        suggestedName: `${base}.txt`,
        types: [ {
          description: "Текст",
          accept: {
            "text/plain": [ ".txt" ]
          }
        }, {
          description: "Word",
          accept: {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [ ".docx" ]
          }
        } ]
      });
      autoFormat = autoHandle.name.toLowerCase().endsWith(".docx") ? "docx" : "txt";
      try {
        await IdbKV.put(AUTO_KEY, autoHandle);
      } catch (err) {
        warnOnce("auto-put", "Хэндл файла автосохранения не сохранён — после перезагрузки выберите файл заново:", err);
      }
      startAuto();
      toast(`Автосохранение включено: ${autoHandle.name}`);
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
      autoHandle = null;
      return toast("Не удалось открыть файл: " + (e.message || e));
    }
  }
  try {
    let perm = "granted";
    if (autoHandle.queryPermission) perm = await autoHandle.queryPermission({
      mode: "readwrite"
    });
    if (perm !== "granted" && autoHandle.requestPermission) {
      perm = await autoHandle.requestPermission({
        mode: "readwrite"
      });
    }
    if (perm !== "granted") {
      setAutoInfo("автосохран: доступ к файлу не выдан");
      return;
    }
    startAuto();
    toast(`Автосохранение включено: ${autoHandle.name}`);
  } catch (e) {
    autoHandle = null;
    setAutoInfo("");
    toast("Файл больше недоступен — выберите заново");
  }
}

(async () => {
  try {
    const handle = await IdbKV.get(AUTO_KEY);
    if (!handle) return;
    autoHandle = handle;
    autoFormat = handle.name && handle.name.toLowerCase().endsWith(".docx") ? "docx" : "txt";
    let perm = "granted";
    if (handle.queryPermission) perm = await handle.queryPermission({
      mode: "readwrite"
    });
    if (perm === "granted") {
      startAuto();
      setAutoInfo(`автосохран: включено · ${handle.name}`);
    } else {
      setAutoInfo(`автосохран: нажмите, чтобы продолжить запись в ${handle.name}`);
    }
  } catch (err) {
    warnOnce("auto-restore", "Автосохранение не восстановлено:", err);
  }
})();

(function initDocs() {
  const SHELL = !!(window.TetrSite && window.TetrSite.isShell);
  const box = $("appFiles"), list = $("docsList"), note = $("filesNote"), empty = $("docsEmpty");
  if (!box || !list) return;
  if (!SHELL || !window.TetrSite.listDocs) {
    box.hidden = true;
    return;
  }
  const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " МБ" : Math.max(1, Math.round(n / 1024)) + " КБ";
  async function refreshDocs() {
    const r = await window.TetrSite.listDocs();
    if (!r.ok) return;
    box.hidden = !r.items.length;
    empty.hidden = !!r.items.length;
    note.textContent = r.items.length ? "файлов: " + r.items.length : "папка data\\docs пуста";
    list.innerHTML = "";
    for (const it of r.items.slice(0, 50)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "doc-item";
      const nm = document.createElement("span");
      nm.className = "doc-name";
      nm.textContent = it.name;
      nm.title = it.name;
      const sz = document.createElement("span");
      sz.className = "doc-size";
      sz.textContent = fmtSize(it.bytes);
      b.append(nm, sz);
      b.addEventListener("click", () => openDocFile(it.name));
      list.appendChild(b);
    }
  }
  async function openDocFile(name) {
    const r = await window.TetrSite.readDoc(name);
    if (!r.ok) return toast("Не удалось открыть: " + r.reason);
    openModal(name, `
      <textarea class="modal-text" readonly>${esc(r.text.slice(0, 200000))}</textarea>
      <div class="row-between mt-9">
        <button type="button" class="btn btn-ghost" id="docCopy">Скопировать</button>
        <button type="button" class="btn btn-ghost" id="docAppend">Дописать в конец</button>
        <button type="button" class="btn btn-primary" id="docOpen">Открыть в Кабинете</button>
      </div>`);
    $("docCopy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(r.text);
        toast("Скопировано ✓");
      } catch (err) {
        warnOnce("clipboard", "Буфер обмена недоступен:", err);
        toast("Не удалось скопировать — браузер запретил доступ к буферу");
      }
    });
    $("docAppend").addEventListener("click", () => {
      setEditorText(getEditorText() + "\n\n" + r.text);
      toast("Дописано в конец документа");
    });
    $("docOpen").addEventListener("click", () => {
      snapNow("открыт файл " + name);
      setEditorText(r.text);
      toast("Открыт: " + name);
    });
  }
  refreshDocs();
})();

