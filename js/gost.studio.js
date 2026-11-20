
import {
  STD, KINDS, FONT_NAMES, PRESETS, blocksFromHTML, blocksFromPlain, defaultState, docTypeText, download, fileTitle,
  formatDate, normalizeName, noPlace, seedState, store, todayISO, uid, validate
} from "./gost.model.js";
import { buildLayout } from "./gost.layout.js";
import { renderPreview } from "./gost.preview.js";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const F = (l, p, v, type = "text", ph = "") => `<label class="gf"><span class="gf-l">${l}</span><input class="gi" type="${type}" data-bind="${p}" value="${esc(v)}" placeholder="${esc(ph)}"></label>`;
const TA = (l, p, v, rows = 2, ph = "") => `<label class="gf"><span class="gf-l">${l}</span><textarea class="gi gt" rows="${rows}" data-bind="${p}" placeholder="${esc(ph)}">${esc(v)}</textarea></label>`;
const SEL = (l, p, v, opts) => `<label class="gf"><span class="gf-l">${l}</span><select class="gi" data-bind="${p}">${opts.map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? " selected" : ""}>${esc(o[1])}</option>`).join("")}</select></label>`;
const TOG = (l, p, v, hint = "") => `<label class="gt2"><input type="checkbox" data-bind="${p}"${v ? " checked" : ""}><span class="gsw"></span><span class="gt2-l">${l}${hint ? `<i>${hint}</i>` : ""}</span></label>`;
const SEG = (l, p, v, opts) => `<div class="gf"><span class="gf-l">${l}</span><div class="gs-seg" data-seg="${p}">${opts.map(o => `<button type="button" data-val="${esc(o[0])}"${String(o[0]) === String(v) ? ' class="on"' : ""}>${esc(o[1])}</button>`).join("")}</div></div>`;
const RNG = (l, p, v, min, max, step, unit) => `<div class="gf"><span class="gf-l">${l}</span><div class="gs-range"><input type="range" data-bind="${p}" data-cast="num" min="${min}" max="${max}" step="${step}" value="${v}"><b data-out="${p}">${v}${unit}</b></div></div>`;
const ICON = {
  doc: '<svg viewBox="0 0 24 24"><path d="M6 2h8l6 6v14H6zM14 3.5V9h5.5"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M4 4h12l4 4v12H4zm4 0v6h8V4zm0 10v6h8v-6z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 20h16" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 21V10m0 0 4 4m-4-4-4 4M4 4h16" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M6 3h12v5H6zM6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>'
};

let root = null, st = null, L = null, opts = {}, currentProfile = null;
let tPreview = 0, tSave = 0, lastFocus = null, printHandler = null;

const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const k = p.split("."); const last = k.pop(); const t = k.reduce((a, x) => (a[x] = a[x] ?? {}), o); t[last] = v; };
const $ = s => root.querySelector(s);
const $$ = s => [...root.querySelectorAll(s)];

function toast(msg, kind = "") {
  const t = $("#gsToast"); t.textContent = msg; t.className = `gs-toast on ${kind}`;
  clearTimeout(t._t); t._t = setTimeout(() => { t.className = "gs-toast"; }, 3600);
}

function sourceEl() {
  const sels = [opts.source, "#ocrResult", "#editor"].filter(Boolean);
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) continue;
    const v = /^(TEXTAREA|INPUT)$/.test(el.tagName) ? el.value : el.textContent;
    if (v.trim()) return el;
  }
  return document.querySelector(opts.source || "#ocrResult");
}
function editorHTML() {
  const src = sourceEl();
  if (!src) return "";
  return /^(TEXTAREA|INPUT)$/.test(src.tagName) ? "" : src.innerHTML;
}
function sourceBlocks() {
  const src = sourceEl();
  if (!src) return [];
  if (/^(TEXTAREA|INPUT)$/.test(src.tagName)) return blocksFromPlain(src.value);
  return blocksFromHTML(src.innerHTML);
}
function pullText(silent) {
  const blocks = sourceBlocks();
  if (!blocks.length) { if (!silent) toast("Источник текста пуст", "err"); return 0; }
  st.blocks = blocks; renderText(); update();
  if (!silent) toast(`Из источника взято блоков: ${blocks.length}`, "ok");
  return blocks.length;
}

function shell() {
  return `
<div class="gs-shell" data-mode="wide" data-tab="build">
  <header class="gs-top">
    <div class="gs-brand">
      <span class="gs-mark">${ICON.doc}</span>
      <span><span class="gs-ttl">Конструктор документа</span><br><span class="gs-sub">${STD} · делопроизводство</span></span>
    </div>
    <div class="gs-prof">
      <select class="gi" id="gsProfile" title="Сохранённые наборы реквизитов"></select>
      <button type="button" class="gb gb-s" id="gsSave" title="Сохранить набор (Ctrl+S)">${ICON.save}Сохранить</button>
      <button type="button" class="gb gb-s gb-i" id="gsSaveAs" title="Сохранить как новый">＋</button>
      <button type="button" class="gb gb-s gb-i" id="gsDelProfile" title="Удалить набор">${ICON.x}</button>
      <button type="button" class="gb gb-s gb-i" id="gsExportJson" title="Выгрузить набор в .json">${ICON.down}</button>
      <button type="button" class="gb gb-s gb-i" id="gsImportJson" title="Загрузить набор из .json">${ICON.up}</button>
    </div>
    <div class="gs-top-sp"></div>
    <div class="gs-actions">
      <button type="button" class="gb" id="gsDocx" title="Скачать документ в Word">${ICON.down}DOCX</button>
      <button type="button" class="gb gb-p" id="gsPrint" title="Печать · Ctrl+P">${ICON.print}Печать</button>
      <button type="button" class="gb gb-i" id="gsClose" title="Закрыть (Esc)">${ICON.x}</button>
    </div>
  </header>
  <div class="gs-tabs">
    <button type="button" data-tab="rail">Оформление</button>
    <button type="button" data-tab="build" class="on">Реквизиты</button>
    <button type="button" data-tab="stage">Лист</button>
  </div>
  <aside class="gs-rail" id="gsRail"></aside>
  <section class="gs-stage-wrap">
    <div class="gs-stage-bar">
      <button type="button" class="gb gb-s" id="gsPull">${ICON.refresh}Взять текст из источника</button>
      <span class="gs-badge" id="gsPageBadge">листов: 1</span>
      <div class="gs-top-sp"></div>
      ${TOG("Направляющие и зоны", "guides", false)}
      <div class="gf"><span class="gf-l">Масштаб</span>
        <div class="gs-range"><input type="range" id="gsZoom" min="0.4" max="1.6" step="0.05" value="0.85"><b id="gsZoomOut">85%</b></div>
      </div>
      <button type="button" class="gb gb-s" id="gsFit">По ширине</button>
    </div>
    <div class="gs-stage" id="gsStage"></div>
  </section>
  <aside class="gs-build" id="gsBuild"></aside>
</div>
<div class="gs-toast" id="gsToast" role="status" aria-live="polite"></div>
<div class="gs-print" id="gsPrintHost" aria-hidden="true"></div>
<input type="file" id="gsFileImg" accept="image/png,image/jpeg,image/webp" hidden>
<input type="file" id="gsFileQr" accept="image/png,image/jpeg" hidden>
<input type="file" id="gsFileJson" accept=".json,application/json" hidden>`;
}

function railHTML() {
  const s = st;
  return `
<div class="gs-card">
  <h3>Документ</h3>
  ${SEL("Вид документа", "kind", s.kind, KINDS)}
  ${F("Наименование вида <i>09</i>", "docType", s.docType, "text", "СПРАВКА")}
  ${SEG("Раскладка бланка", "layout", s.layout, [["corner", "Угловая"], ["long", "Продольная"]])}
  ${SEG("Строки реквизитов <i>6.5</i>", "reqAlign", s.reqAlign, [["flag", "Флагом"], ["center", "По центру"]])}
  ${SEG("Дата <i>5.10</i>", "dateStyle", s.dateStyle, [["words", "05 июня 2026 г."], ["digits", "05.06.2026"]])}
</div>
<div class="gs-card">
  <h3>Текст и поля</h3>
  ${SEL("Гарнитура (DOCX) <i>3.3</i>", "font", s.font, FONT_NAMES.map(f => [f, f]))}
  <div class="gs-grid">
    ${SEL("Кегль", "pt", s.pt, [[12, "12"], [13, "13"], [14, "14"]])}
    ${SEL("Интервал <i>3.4</i>", "spacing", s.spacing, [[1, "1"], [1.5, "1,5"]])}
  </div>
  ${TOG("Хранение свыше 10 лет", "longStorage", s.longStorage, "6.1 · левое поле 30 мм, иначе 20 мм")}
  ${TOG("Заголовки разделов по центру", "headingCenter", s.headingCenter, "3.4")}
  ${TOG("Полужирный: организация", "boldOrg", s.boldOrg, "3.6 — по ЛНА")}
  ${TOG("Полужирный: вид документа", "boldDocType", s.boldDocType)}
  ${TOG("Полужирный: заголовок к тексту", "boldTitle", s.boldTitle)}
  ${TOG("Заголовок по центру", "titleCenter", s.titleCenter, "5.17 · продольные бланки органов власти")}
  ${TOG("Нумерация со 2-го листа", "numbering", s.numbering, "3.2 · по центру, 10 мм от края")}
  ${TOG("Титульный лист", "titlePage", s.titlePage, "3.7 · приложение А")}
</div>
<div class="gs-card">
  <h3>Проверка</h3>
  <div class="gs-check" id="gsCheck"></div>
</div>
<div class="gs-card gs-help">
  <details>
    <summary>Справка: правила и реквизиты</summary>
    <h4>Ключевые правила</h4>
    <table>
      <tr><td>6.1</td><td>Поля: ≥20 мм слева/сверху/снизу, ≥10 справа; хранение &gt;10 лет — левое ≥30</td></tr>
      <tr><td>3.3</td><td>Гарнитуру и кегль устанавливает организация; рекомендованы 12, 13, 14</td></tr>
      <tr><td>3.4</td><td>Текст через 1—1,5 интервала; абзацный отступ 1,25 см; реквизиты через 1</td></tr>
      <tr><td>3.5</td><td>Текст по ширине; строка реквизита ≤80 мм (угловой) / ≤120 мм (продольный)</td></tr>
      <tr><td>3.2</td><td>Нумерация со 2-й страницы, посередине верхнего поля, 10 мм от края</td></tr>
      <tr><td>5.9</td><td>Наименование вида документа — на всех, кроме писем</td></tr>
      <tr><td>5.10</td><td>Дата: 05.06.2026 или 05 июня 2026 г. (с нулём)</td></tr>
      <tr><td>5.15</td><td>Адресат справа; не более четырёх; «Копия» не пишется</td></tr>
      <tr><td>5.17</td><td>Заголовок к тексту слева от границы левого поля, «О/Об…»</td></tr>
      <tr><td>5.18</td><td>Обращение и этикетная фраза — от левого поля, доп. интервал; фраза с запятой</td></tr>
      <tr><td>5.13</td><td>Место составления — во всех документах, кроме деловых писем и внутренних записок; не указывается, если уже есть в наименовании организации</td></tr>
      <tr><td>5.19</td><td>«Приложение:» / «Приложения:»; у распорядительных документов, положений, правил, инструкций, договоров, планов и отчётов отметки нет</td></tr>
      <tr><td>5.22</td><td>Подпись: должность, подпись, И.О. Фамилия (между инициалами пробела нет)</td></tr>
      <tr><td>5.25</td><td>Исполнитель: ФИО полностью и телефон, кегль на 2 пт меньше</td></tr>
      <tr><td>5.31</td><td>Штрих-код (QR-код) — правый нижний угол первого листа</td></tr>
    </table>
    <h4>Реквизиты 01–31</h4>
    <p class="gs-note">Поддержаны: 01/02/03 (герб, эмблема, товарный знак — загружаются как изображение), 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24 (МП), 25, 26, 29, 30, 31.
    Не оформляются автором документа: 27 отметка о поступлении, 28 резолюция — они проставляются получателем.</p>
  </details>
</div>
<div class="gs-card">
  <h3>Заготовки</h3>
  <div class="gs-chips">${PRESETS.map(p => `<button type="button" class="gs-chip" data-preset="${p.id}">${esc(p.name)}</button>`).join("")}
  <button type="button" class="gs-chip" id="gsReset">Сбросить всё</button></div>
</div>`;
}

function buildHTML() {
  const s = st;
  const appr = (key, num, title) => {
    const c = s[key];
    return `
<div class="gs-card" id="g-${key}">
  <h3><b>${num}</b>${title}</h3>
  ${TOG("Оформлять", `${key}.on`, c.on)}
  <div data-show="${key}.on">
    ${SEG("Кем", `${key}.kind`, c.kind, [["person", "Должностным лицом"], ["document", "Документом"], ["board", "Коллегиальным органом"]])}
    <div data-show="${key}.kind=person">
      ${TA("Должность", `${key}.position`, c.position, 2)}
      <div class="gs-grid">${F("И.О. Фамилия", `${key}.name`, c.name)}${F("Дата", `${key}.date`, c.date, "date")}</div>
    </div>
    <div data-show="${key}.kind=document">
      ${F("Слово", `${key}.word`, c.word, "text", key === "approval" ? "УТВЕРЖДЕН" : "СОГЛАСОВАН")}
      <div class="gs-grid">${F("Вид документа (твор. падеж)", `${key}.docKind`, c.docKind, "text", "приказом")}${F("Организация", `${key}.org`, c.org, "text", 'АО «Профиль»')}</div>
      <div class="gs-grid">${F("Дата", `${key}.docDate`, c.docDate, "date")}${F("Номер", `${key}.docNumber`, c.docNumber)}</div>
    </div>
    <div data-show="${key}.kind=board">
      ${TA("Орган", `${key}.board`, c.board, 2, 'Советом директоров АО «Профиль»')}
      <div class="gs-grid">${F("Дата протокола", `${key}.protDate`, c.protDate, "date")}${F("№ протокола", `${key}.protNumber`, c.protNumber)}</div>
    </div>
    ${key === "agreement" ? SEG("Место", "agreement.place", c.place, [["top", "Левый верхний угол"], ["bottom", "Под текстом"]]) : ""}
  </div>
</div>`;
  };
  return `
<div class="gs-nav">
  <button type="button" data-goto="g-blank">Бланк</button>
  <button type="button" data-goto="g-req">Реквизиты</button>
  <button type="button" data-goto="g-addr">Адресат</button>
  <button type="button" data-goto="g-text">Текст</button>
  <button type="button" data-goto="g-att">Приложения</button>
  <button type="button" data-goto="g-sign">Подписи</button>
  <button type="button" data-goto="g-marks">Отметки</button>
</div>

<div class="gs-card" id="g-blank">
  <h3><b>05–08</b>Бланк организации</h3>
  <div class="gs-chips" id="gsOrgDict"></div>
  ${TA("Наименование организации", "org.name", s.org.name, 2, 'Общество с ограниченной ответственностью\n«Северный проектный институт»')}
  <div class="gs-grid">${F("Сокращённое (в скобках)", "org.short", s.org.short, "text", 'ООО «СПИ»')}${F("Вышестоящая организация", "org.parent", s.org.parent)}</div>
  <div class="gs-grid">${F("Подразделение <i>06</i>", "org.unit", s.org.unit)}${F("Должность (бланк должн. лица) <i>07</i>", "org.position", s.org.position)}</div>
  ${TA("Справочные данные <i>08</i>", "org.info", s.org.info, 3, "адрес, телефон, e-mail, сайт, ОКПО; ОГРН; ИНН/КПП")}
  <div class="gs-row">
    <button type="button" class="gb gb-s" id="gsOrgSave">★ В справочник</button>
    <button type="button" class="gb gb-s" id="gsEmblem">${ICON.up}Герб / эмблема / товарный знак</button>
    <button type="button" class="gb gb-s" id="gsEmblemDel" ${s.emblem ? "" : "hidden"}>${ICON.x}</button>
  </div>
  <div data-show="emblem">
    ${SEG("Тип <i>01–03</i>", "emblem.type", s.emblem?.type || "emblem", [["herb", "Герб"], ["emblem", "Эмблема"], ["tm", "Товарный знак"]])}
    ${SEG("Размещение", "emblem.place", s.emblem?.place || "center", (!s.emblem || (s.emblem.type || "emblem") === "tm")
      ? [["center", "По центру сверху"], ["left", "Слева на уровне наименования"]] : [["center", "По центру сверху"]])}
    ${RNG("Ширина, мм", "emblem.wMm", s.emblem?.wMm || 20, 8, 45, 1, " мм")}
  </div>
  <p class="gs-note">На бланке — один из реквизитов: 01 герб, 02 эмблема или 03 товарный знак (6.7). Запрещается совмещать Государственный герб РФ и герб субъекта РФ, герб и эмблему (5.1). Герб и эмблема — по центру верхнего поля, 10 мм от края (5.1, 5.2); товарный знак — по центру или слева на уровне наименования организации (5.3, 6.5).</p>
</div>

<div class="gs-card" id="g-req">
  <h3><b>04·10–14·29</b>Реквизиты документа</h3>
  <div class="gs-grid">${F("Дата <i>10</i>", "date", s.date, "date")}${F("Рег. номер <i>11</i>", "number", s.number, "text", "04-17/128")}</div>
  <div class="gs-grid">${F("Ссылка: № <i>12</i>", "replyNumber", s.replyNumber)}${F("Ссылка: дата", "replyDate", s.replyDate, "date")}</div>
  <div class="gs-grid">${F("Место составления <i>13</i>", "place", s.place, "text", "Москва")}${F("Код формы <i>04</i>", "formCode", s.formCode, "text", "Форма по ОКУД 0211151")}</div>
  <div class="gs-grid">${F("Гриф ограничения <i>14</i>", "access.text", s.access.text, "text", "Коммерческая тайна")}${F("Экз. №", "access.copy", s.access.copy)}</div>
  ${TOG("Отметка «Контроль» <i>29</i>", "control", s.control, "верхнее поле первого листа")}
</div>

${appr("approval", "16", "Гриф утверждения")}
${appr("agreement", "20", "Гриф согласования")}

<div class="gs-card" id="g-addr">
  <h3><b>15</b>Адресат</h3>
  <div class="gs-list" id="gsAddr"></div>
  <div class="gs-row"><button type="button" class="gb gb-s" data-add="addr">${ICON.plus}Адресат</button></div>
  ${TA("От кого (заявление)", "sender", s.sender || "", 2, "от Сидоровой Анны Ивановны,\nведущего специалиста…")}
  <p class="gs-note">Должность — в дательном падеже, фамилия и инициалы после должности. Организация — в именительном. Не более четырёх адресатов; слово «Копия» не пишется.</p>
</div>

<div class="gs-card" id="g-text">
  <h3><b>17·18</b>Заголовок и текст</h3>
  ${F("Заголовок к тексту", "title", s.title, "text", "О предоставлении копии акта проверки")}
  <div class="gs-grid">${F("Вступительное обращение", "salutation", s.salutation, "text", "Уважаемый Иван Иванович!")}${F("Этикетная фраза", "etiquette", s.etiquette, "text", "С уважением,")}</div>
  <div class="gs-list" id="gsBlocks"></div>
  <div class="gs-row">
    <button type="button" class="gb gb-s" data-add="p">${ICON.plus}Абзац</button>
    <button type="button" class="gb gb-s" data-add="h1">Заголовок</button>
    <button type="button" class="gb gb-s" data-add="num">Пункт</button>
    <button type="button" class="gb gb-s" data-add="li">Список</button>
    <button type="button" class="gb gb-s" id="gsPaste">Вставить текст</button>
  </div>
  <div id="gsPasteBox" hidden>${TA("Текст (абзацы — с новой строки)", "pasteBuf", "", 5)}</div>
  <p class="gs-note">Блоки можно тянуть за ⠿, менять тип и порядок. Полужирный/курсив из редактора сохраняются.</p>
</div>

<div class="gs-card" id="g-att">
  <h3><b>19</b>Отметка о приложении</h3>
  ${TOG("Оформлять", "attachments.on", s.attachments.on)}
  <div data-show="attachments.on">
    ${TOG("Приложение названо в тексте", "attachments.namedInText", s.attachments.namedInText, "тогда — «Приложение: на 2 л. в 1 экз.»")}
    <div class="gs-list" id="gsAtt"></div>
    <div class="gs-row"><button type="button" class="gb gb-s" data-add="att">${ICON.plus}Приложение</button></div>
  </div>
  ${TOG("Первый лист для каждого приложения", "attachments.sheets", s.attachments.sheets, "5.19 · «Приложение N» со ссылкой на основной документ в правом верхнем углу")}
  <p class="gs-note">У распорядительных документов, положений, правил, инструкций, договоров, планов и отчётов отметка о приложении не оформляется (5.19) — включите первый лист приложения; у протоколов, актов и сопроводительных писем отметка допустима.</p>
</div>

<div class="gs-card" id="g-sign">
  <h3><b>22·23·24</b>Подпись</h3>
  <div class="gs-chips" id="gsSignDict"></div>
  <div class="gs-list" id="gsSign"></div>
  <div class="gs-row">
    <button type="button" class="gb gb-s" data-add="sign">${ICON.plus}Подписант</button>
    <button type="button" class="gb gb-s" id="gsSignSave">★ В справочник</button>
  </div>
  ${TOG("Отметка «МП»", "seal", s.seal, "5.24 · место печати")}
  ${TOG("Отметка об электронной подписи", "ep.on", s.ep.on, "5.23")}
  <div data-show="ep.on">
    ${SEG("Вид ЭП", "ep.kind", s.ep.kind, [["uq", "Усиленная квалиф."], ["un", "Усиленная неквалиф."], ["simple", "Простая"]])}
    <div data-show="ep.kind=simple">${TA("Текст отметки (по ЛНА)", "ep.custom", s.ep.custom, 2)}</div>
    <div data-show="ep.kind!=simple">
      ${F("№ сертификата", "ep.cert", s.ep.cert)}
      ${F("Владелец (ФИО полностью)", "ep.owner", s.ep.owner)}
      <div class="gs-grid">${F("Действителен с", "ep.from", s.ep.from, "date")}${F("по", "ep.to", s.ep.to, "date")}</div>
      ${F("Дата и время подписания", "ep.signedAt", s.ep.signedAt, "datetime-local")}
    </div>
  </div>
</div>

<div class="gs-card" id="g-marks">
  <h3><b>21·25·26·30·31</b>Отметки</h3>
  ${TOG("Исполнитель <i>25</i>", "executor.on", s.executor.on)}
  <div data-show="executor.on">
    ${F("ФИО полностью", "executor.fio", s.executor.fio)}
    <div class="gs-grid">${F("Подразделение", "executor.unit", s.executor.unit)}${F("Должность", "executor.position", s.executor.position)}</div>
    <div class="gs-grid">${F("Телефон", "executor.phone", s.executor.phone)}${F("E-mail", "executor.email", s.executor.email)}</div>
    ${TOG("Как нижний колонтитул", "executor.asFooter", s.executor.asFooter, "кегль на 2 пт меньше")}
  </div>
  <div class="gs-list" id="gsVisa"></div>
  <div class="gs-row"><button type="button" class="gb gb-s" data-add="visa">${ICON.plus}Виза <i>21</i></button></div>
  ${TOG("Заверение копии <i>26</i>", "copyCert.on", s.copyCert.on)}
  <div data-show="copyCert.on">
    <div class="gs-grid">${F("Должность", "copyCert.position", s.copyCert.position)}${F("И.О. Фамилия", "copyCert.name", s.copyCert.name)}</div>
    <div class="gs-grid">${F("Дата заверения", "copyCert.date", s.copyCert.date, "date")}${F("Организация-хранитель", "copyCert.storage", s.copyCert.storage)}</div>
    <div class="gs-grid">${F("Дело №", "copyCert.fileNo", s.copyCert.fileNo)}${F("За год", "copyCert.year", s.copyCert.year)}</div>
  </div>
  ${TOG("Направление в дело <i>30</i>", "toFile.on", s.toFile.on)}
  <div data-show="toFile.on">
    <div class="gs-grid">${F("Дело №", "toFile.no", s.toFile.no)}${F("За год", "toFile.year", s.toFile.year)}</div>
    <div class="gs-grid">${F("Должность", "toFile.position", s.toFile.position)}${F("Дата", "toFile.date", s.toFile.date, "date")}</div>
  </div>
  <div class="gs-row">
    <button type="button" class="gb gb-s" id="gsQr">${ICON.up}Штрих-код / QR <i>31</i></button>
    <button type="button" class="gb gb-s" id="gsQrDel" ${s.qr ? "" : "hidden"}>${ICON.x}</button>
  </div>
  <div data-show="qr">${RNG("Ширина QR, мм", "qr.wMm", s.qr?.wMm || 20, 10, 35, 1, " мм")}</div>
</div>`;
}

function itemHead(label, kind, id, extra = "") {
  return `<div class="gs-item-head"><span class="gs-drag" draggable="true" data-drag="${kind}:${id}" title="Перетащить">⠿</span><b>${esc(label)}</b>${extra}
    <button type="button" class="gs-mini" data-move="${kind}:${id}:-1">↑</button>
    <button type="button" class="gs-mini" data-move="${kind}:${id}:1">↓</button>
    <button type="button" class="gs-mini d" data-del="${kind}:${id}">✕</button></div>`;
}
function renderAddr() {
  $("#gsAddr").innerHTML = st.addressees.map((a, i) => `<div class="gs-item" data-item="addr:${a.id}">
    ${itemHead(`Адресат ${i + 1}`, "addr", a.id)}
    <textarea class="gi gt" rows="3" data-list="addr" data-id="${a.id}" data-key="lines" placeholder="Директору АО «Профиль»&#10;Иванову И.И.">${esc(a.lines)}</textarea>
    <textarea class="gi gt" rows="2" data-list="addr" data-id="${a.id}" data-key="address" placeholder="Почтовый адрес (при необходимости)">${esc(a.address)}</textarea>
  </div>`).join("") || `<p class="gs-note">Адресатов нет.</p>`;
}
function renderAtt() {
  $("#gsAtt").innerHTML = st.attachments.items.map((a, i) => `<div class="gs-item" data-item="att:${a.id}">
    ${itemHead(`Приложение ${i + 1}`, "att", a.id)}
    <input class="gi" data-list="att" data-id="${a.id}" data-key="title" value="${esc(a.title)}" placeholder="Название документа-приложения">
    <div class="gs-grid">
      <label class="gf"><span class="gf-l">Листов</span><input class="gi" data-list="att" data-id="${a.id}" data-key="pages" value="${esc(a.pages)}"></label>
      <label class="gf"><span class="gf-l">Экземпляров</span><input class="gi" data-list="att" data-id="${a.id}" data-key="copies" value="${esc(a.copies)}"></label>
    </div>
    <label class="gt2"><input type="checkbox" data-list="att" data-id="${a.id}" data-key="firstOnly"${a.firstOnly ? " checked" : ""}><span class="gsw"></span><span class="gt2-l">Только в первый адрес</span></label>
    <label class="gt2"><input type="checkbox" data-list="att" data-id="${a.id}" data-key="bound"${a.bound ? " checked" : ""}><span class="gsw"></span><span class="gt2-l">Сброшюровано</span></label>
  </div>`).join("") || `<p class="gs-note">Приложений нет.</p>`;
}
function renderSign() {
  $("#gsSign").innerHTML = st.signers.map((s, i) => `<div class="gs-item" data-item="sign:${s.id}">
    ${itemHead(`Подписант ${i + 1}`, "sign", s.id)}
    <input class="gi" data-list="sign" data-id="${s.id}" data-key="position" value="${esc(s.position)}" placeholder="Генеральный директор">
    <input class="gi" data-list="sign" data-id="${s.id}" data-key="name" value="${esc(s.name)}" placeholder="Петров Пётр Петрович → П.П. Петров">
    <label class="gt2"><input type="checkbox" data-list="sign" data-id="${s.id}" data-key="includeOrg"${s.includeOrg ? " checked" : ""}><span class="gsw"></span><span class="gt2-l">Добавить организацию в должность<i>5.22 · документ не на бланке</i></span></label>
    <label class="gt2"><input type="checkbox" data-list="sign" data-id="${s.id}" data-key="equal"${s.equal ? " checked" : ""}><span class="gsw"></span><span class="gt2-l">Равные должности — на одном уровне</span></label>
  </div>`).join("") || `<p class="gs-note">Подписантов нет.</p>`;
}
function renderVisa() {
  $("#gsVisa").innerHTML = st.visas.map((v, i) => `<div class="gs-item" data-item="visa:${v.id}">
    ${itemHead(`Виза ${i + 1}`, "visa", v.id)}
    <input class="gi" data-list="visa" data-id="${v.id}" data-key="position" value="${esc(v.position)}" placeholder="Руководитель юридического отдела">
    <div class="gs-grid">
      <input class="gi" data-list="visa" data-id="${v.id}" data-key="name" value="${esc(v.name)}" placeholder="И.О. Фамилия">
      <input class="gi" type="date" data-list="visa" data-id="${v.id}" data-key="date" value="${esc(v.date)}">
    </div>
    <label class="gt2"><input type="checkbox" data-list="visa" data-id="${v.id}" data-key="remarks"${v.remarks ? " checked" : ""}><span class="gsw"></span><span class="gt2-l">Замечания прилагаются</span></label>
  </div>`).join("");
}
const BLOCK_TYPES = [["p", "Абзац"], ["h1", "Заголовок раздела"], ["h2", "Подзаголовок"], ["num", "Нумерованный пункт"], ["li", "Пункт списка"]];
function renderText() {
  $("#gsBlocks").innerHTML = st.blocks.map((b, i) => `<div class="gs-item" data-item="blk:${b.id}">
    ${itemHead(`${i + 1}`, "blk", b.id, `<select class="gi" data-list="blk" data-id="${b.id}" data-key="type">${BLOCK_TYPES.map(t => `<option value="${t[0]}"${b.type === t[0] ? " selected" : ""}>${t[1]}</option>`).join("")}</select>`)}
    <textarea class="gi gt gs-blk-text" rows="2" data-list="blk" data-id="${b.id}" data-key="text">${esc(b.text)}</textarea>
    <label class="gt2"><input type="checkbox" data-list="blk" data-id="${b.id}" data-key="bold"${b.bold ? " checked" : ""}><span class="gsw"></span><span class="gt2-l">Полужирный целиком</span></label>
  </div>`).join("") || `<p class="gs-note">Текста нет — нажмите «Взять текст из источника» или добавьте блоки.</p>`;
}
const LIST = { addr: () => st.addressees, att: () => st.attachments.items, sign: () => st.signers, visa: () => st.visas, blk: () => st.blocks };
const RERENDER = { addr: renderAddr, att: renderAtt, sign: renderSign, visa: renderVisa, blk: renderText };

async function renderDicts() {
  const orgs = await store.dict("org"), signs = await store.dict("signer");
  $("#gsOrgDict").innerHTML = orgs.map(o => `<span class="gs-chip" data-dict="org:${o.id}">${esc(o.label)}<x data-dictdel="${o.id}">✕</x></span>`).join("")
    || `<span class="gs-note">Справочник организаций пуст — заполните бланк и нажмите ★.</span>`;
  $("#gsSignDict").innerHTML = signs.map(o => `<span class="gs-chip" data-dict="signer:${o.id}">${esc(o.label)}<x data-dictdel="${o.id}">✕</x></span>`).join("")
    || `<span class="gs-note">Справочник подписантов пуст.</span>`;
}

function syncShows() {
  $$("[data-show]").forEach(n => {
    const expr = n.dataset.show;
    let on;
    if (expr.includes("!=")) { const [p, v] = expr.split("!="); on = String(getPath(st, p)) !== v; }
    else if (expr.includes("=")) { const [p, v] = expr.split("="); on = String(getPath(st, p)) === v; }
    else on = !!getPath(st, expr);
    n.hidden = !on;
  });
  const dt = $('[data-bind="docType"]'); if (dt) dt.disabled = st.kind !== "other";
  const pl = $('[data-bind="place"]'); if (pl) pl.disabled = noPlace(st);
  $("#gsEmblemDel").hidden = !st.emblem;
  $("#gsQrDel").hidden = !st.qr;
}
function renderCheck() {
  const list = validate(st);
  $("#gsCheck").innerHTML = list.map(v => `<div class="gs-v ${v.level}" data-focus="${esc(v.focus || "")}"><code>${v.clause}</code><span>${esc(v.text)}</span></div>`).join("")
    || `<div class="gs-v ok"><code>OK</code><span>Замечаний нет.</span></div>`;
}
function paint() {
  L = buildLayout(st);
  const res = renderPreview($("#gsStage"), L, st, null);
  renderPrintPages();
  $("#gsPageBadge").textContent = `листов: ${res.pages}`;
  const z = +st.zoom || 0.85;
  res.inner.style.zoom = String(z);
  $("#gsZoom").value = String(z);
  $("#gsZoomOut").textContent = `${Math.round(z * 100)}%`;
}
function update(immediate) {
  syncShows(); renderCheck();
  clearTimeout(tPreview);
  tPreview = setTimeout(paint, immediate ? 0 : 170);
  clearTimeout(tSave);
  tSave = setTimeout(() => store.saveLast(st).catch(() => {}), 700);
}
function applyState(next, profileId) {
  st = next; currentProfile = profileId || null;
  $("#gsRail").innerHTML = railHTML();
  $("#gsBuild").innerHTML = buildHTML();
  renderAddr(); renderAtt(); renderSign(); renderVisa(); renderText(); renderDicts();
  $("#gsProfile").value = currentProfile || "";
  update(true);
}

async function refreshProfiles(select) {
  const list = await store.profiles();
  $("#gsProfile").innerHTML = `<option value="">— набор не выбран —</option>` +
    list.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("#gsProfile").value = select || currentProfile || "";
}
async function saveProfile(asNew) {
  const list = await store.profiles();
  const cur = list.find(p => p.id === currentProfile);
  let name = cur && !asNew ? cur.name : "";
  if (!name) {
    const def = `${KINDS.find(k => k[0] === st.kind)?.[1] || "Документ"}${st.org.short ? ` · ${st.org.short}` : ""}`;
    name = await inlinePrompt("Название набора", def);
    if (!name) return;
  }
  const rec = await store.saveProfile(name, st, asNew ? null : currentProfile);
  currentProfile = rec.id;
  await refreshProfiles(rec.id);
  toast(`Набор «${rec.name}» сохранён`, "ok");
}
function inlinePrompt(label, value) {
  return new Promise(res => {
    const host = $("#gsRail");
    const box = document.createElement("div");
    box.className = "gs-card";
    box.innerHTML = `<h3>${esc(label)}</h3><div class="gs-save-row"><input class="gi" value="${esc(value)}"><button type="button" class="gb gb-s gb-p">OK</button><button type="button" class="gb gb-s">✕</button></div>`;
    host.prepend(box);
    const inp = box.querySelector("input"); inp.focus(); inp.select();
    const done = v => { box.remove(); res(v); };
    box.querySelectorAll("button")[0].onclick = () => done(inp.value.trim());
    box.querySelectorAll("button")[1].onclick = () => done("");
    inp.onkeydown = e => { if (e.key === "Enter") done(inp.value.trim()); if (e.key === "Escape") done(""); };
  });
}

function pickImage(input, cb) {
  input.value = "";
  input.onchange = () => {
    const f = input.files?.[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => cb(fr.result, img.naturalWidth / img.naturalHeight);
      img.onerror = () => toast("Не удалось прочитать изображение", "err");
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  };
  input.click();
}

function renderPrintPages() {
  const host = $("#gsPrintHost");
  if (!host || !st) return;
  try {
    const stPrint = { ...st, guides: false, zoom: 1 };
    renderPreview(host, L || buildLayout(stPrint), stPrint, null);
  } catch (e) { console.warn("[gost] печатная копия не подготовлена:", e); }
}

function wire() {
  const shellEl = $(".gs-shell");
  const mode = () => {
    const tabs = window.matchMedia("(max-width:900px)").matches;
    shellEl.dataset.mode = tabs ? "tabs" : "wide";
  };
  mode(); window.addEventListener("resize", mode);
  root._mode = mode;

  printHandler = renderPrintPages;
  window.addEventListener("beforeprint", printHandler);

  root.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.bind) {
      let v = t.type === "checkbox" ? t.checked : t.value;
      if (t.dataset.cast === "num" || ["pt", "spacing", "zoom"].includes(t.dataset.bind)) v = parseFloat(v);
      setPath(st, t.dataset.bind, v);
      if (t.dataset.bind === "emblem.wMm" && st.emblem) st.emblem.hMm = st.emblem.wMm / st.emblem.ratio;
      if (t.dataset.bind === "qr.wMm" && st.qr) st.qr.hMm = st.qr.wMm / st.qr.ratio;
      const out = root.querySelector(`[data-out="${t.dataset.bind}"]`);
      if (out) out.textContent = `${v} мм`;
      if (t.dataset.bind === "kind") { st.layout = st.kind === "letter" ? "corner" : "long"; applyState(st, currentProfile); return; }
      update();
      return;
    }
    if (t.dataset.list) {
      const arr = LIST[t.dataset.list](), it = arr.find(x => x.id === t.dataset.id);
      if (!it) return;
      it[t.dataset.key] = t.type === "checkbox" ? t.checked : t.value;
      if (t.dataset.list === "blk" && t.dataset.key === "text") it.runs = null;
      if (t.dataset.list === "blk" && t.dataset.key === "type") renderText();
      update();
      return;
    }
    if (t.id === "gsZoom") { st.zoom = parseFloat(t.value); paint(); }
  });

  root.addEventListener("click", async e => {
    const t = e.target;
    const seg = t.closest("[data-seg] button");
    if (seg) {
      const p = seg.parentElement.dataset.seg;
      let v = seg.dataset.val;
      setPath(st, p, v);
      [...seg.parentElement.children].forEach(b => b.classList.toggle("on", b === seg));
      if (p === "emblem.type") {
        if (st.emblem && st.emblem.type !== "tm" && st.emblem.place === "left") st.emblem.place = "center";
        applyState(st, currentProfile); return;
      }
      if (p === "emblem.place" || p === "layout") update(true); else update();
      return;
    }
    const goto = t.closest("[data-goto]");
    if (goto) { const g = root.querySelector(`#${goto.dataset.goto}`); g?.scrollIntoView({ behavior: "smooth", block: "start" }); g?.classList.add("flash"); setTimeout(() => g?.classList.remove("flash"), 1200); return; }
    const add = t.closest("[data-add]");
    if (add) {
      const k = add.dataset.add;
      if (k === "addr") { st.addressees.push({ id: uid(), lines: "", address: "" }); renderAddr(); }
      else if (k === "att") { st.attachments.items.push({ id: uid(), title: "", pages: "", copies: "", firstOnly: false, bound: false }); renderAtt(); }
      else if (k === "sign") { st.signers.push({ id: uid(), position: "", name: "", includeOrg: false, equal: false }); renderSign(); }
      else if (k === "visa") { st.visas.push({ id: uid(), position: "", name: "", date: "", remarks: false }); renderVisa(); }
      else { st.blocks.push({ id: uid(), type: k, text: "", runs: null, bold: k === "h1" }); renderText(); }
      update(); return;
    }
    const mv = t.closest("[data-move]");
    if (mv) {
      const [k, id, d] = mv.dataset.move.split(":");
      const arr = LIST[k](), i = arr.findIndex(x => x.id === id), j = i + (+d);
      if (i >= 0 && j >= 0 && j < arr.length) { [arr[i], arr[j]] = [arr[j], arr[i]]; RERENDER[k](); update(); }
      return;
    }
    const dl = t.closest("[data-del]");
    if (dl) {
      const [k, id] = dl.dataset.del.split(":");
      const arr = LIST[k](), i = arr.findIndex(x => x.id === id);
      if (i >= 0) { arr.splice(i, 1); RERENDER[k](); update(); }
      return;
    }
    const dchip = t.closest("[data-dictdel]");
    if (dchip) { await store.dictDel(dchip.dataset.dictdel); renderDicts(); toast("Удалено из справочника"); return; }
    const chip = t.closest("[data-dict]");
    if (chip) {
      const [type, id] = chip.dataset.dict.split(":");
      const rec = (await store.dict(type)).find(x => x.id === id);
      if (!rec) return;
      if (type === "org") st.org = { ...st.org, ...rec.data };
      else st.signers = [{ id: uid(), ...rec.data }];
      applyState(st, currentProfile);
      toast(`Подставлено: ${rec.label}`, "ok"); return;
    }
    const pre = t.closest("[data-preset]");
    if (pre) {
      const p = PRESETS.find(x => x.id === pre.dataset.preset);
      const blocks = st.blocks.filter(b => (b.text || "").trim());
      applyState(p.build(blocks.length ? blocks : null), null);
      toast(`Заготовка: ${p.name}`, "ok"); return;
    }
    const focus = t.closest("[data-focus]");
    if (focus && focus.dataset.focus) {
      const target = root.querySelector(focus.dataset.focus);
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.focus?.(); target.classList?.add("flash"); setTimeout(() => target.classList?.remove("flash"), 1200); }
      return;
    }
    const tab = t.closest(".gs-tabs button");
    if (tab) { shellEl.dataset.tab = tab.dataset.tab; [...tab.parentElement.children].forEach(b => b.classList.toggle("on", b === tab)); if (tab.dataset.tab === "stage") paint(); return; }

    switch (t.closest("button")?.id) {
      case "gsClose": close(); break;
      case "gsPull": pullText(); break;
      case "gsFit": {
        const w = $("#gsStage").clientWidth - 40;
        st.zoom = Math.max(0.4, Math.min(1.6, w / (210 * 96 / 25.4))); paint(); break;
      }
      case "gsSave": saveProfile(false); break;
      case "gsSaveAs": saveProfile(true); break;
      case "gsDelProfile": {
        if (!currentProfile) { toast("Набор не выбран", "err"); break; }
        await store.removeProfile(currentProfile); currentProfile = null; await refreshProfiles(""); toast("Набор удалён"); break;
      }
      case "gsExportJson": download(new Blob([JSON.stringify({ std: STD, state: st }, null, 2)], { type: "application/json" }), `${fileTitle(st)}.json`); break;
      case "gsImportJson": {
        const inp = $("#gsFileJson"); inp.value = "";
        inp.onchange = () => { const f = inp.files?.[0]; if (!f) return; const fr = new FileReader();
          fr.onload = () => { try { const j = JSON.parse(fr.result); applyState({ ...defaultState(), ...(j.state || j) }, null); toast("Набор загружен", "ok"); } catch { toast("Некорректный .json", "err"); } };
          fr.readAsText(f); };
        inp.click(); break;
      }
      case "gsOrgSave": {
        const label = st.org.short || st.org.name.split("\n")[0];
        if (!label) { toast("Заполните наименование организации", "err"); break; }
        await store.dictAdd("org", label, { ...st.org }); renderDicts(); toast("Организация в справочнике", "ok"); break;
      }
      case "gsSignSave": {
        const s = st.signers[st.signers.length - 1];
        if (!s || !s.name) { toast("Заполните подписанта", "err"); break; }
        await store.dictAdd("signer", `${normalizeName(s.name)}${s.position ? ` · ${s.position}` : ""}`, { position: s.position, name: normalizeName(s.name), includeOrg: s.includeOrg, equal: false });
        renderDicts(); toast("Подписант в справочнике", "ok"); break;
      }
      case "gsEmblem": pickImage($("#gsFileImg"), (src, ratio) => { st.emblem = { dataUrl: src, ratio, wMm: 20, hMm: 20 / ratio, type: st.emblem?.type || "emblem", place: st.emblem?.place || "center" }; applyState(st, currentProfile); }); break;
      case "gsEmblemDel": st.emblem = null; applyState(st, currentProfile); break;
      case "gsQr": pickImage($("#gsFileQr"), (src, ratio) => { st.qr = { dataUrl: src, ratio, wMm: 20, hMm: 20 / ratio }; applyState(st, currentProfile); }); break;
      case "gsQrDel": st.qr = null; applyState(st, currentProfile); break;
      case "gsPaste": {
        const box = $("#gsPasteBox"); box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector("textarea").focus();
        else { const v = box.querySelector("textarea").value; if (v.trim()) { st.blocks.push(...blocksFromPlain(v)); renderText(); update(); toast("Текст добавлен", "ok"); } }
        break;
      }
      case "gsDocx": {
        const btn = t.closest("button");
        btn.classList.add("busy"); btn.disabled = true;
        try {
          L = buildLayout(st);
          const blob = await (await import("./gost.docx.js")).exportDocx(L, st);
          download(blob, `${fileTitle(st)}.docx`);
          toast("DOCX сохранён", "ok");
        } catch (err) { console.error(err); toast(`Ошибка: ${err.message}`, "err"); }
        btn.classList.remove("busy"); btn.disabled = false;
        break;
      }
      case "gsPrint": {
        renderPrintPages();
        requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
        break;
      }
    }
  });

  $("#gsProfile").addEventListener("change", async e => {
    const id = e.target.value; if (!id) { currentProfile = null; return; }
    const rec = (await store.profiles()).find(p => p.id === id);
    if (rec) { applyState({ ...defaultState(), ...rec.state }, id); toast(`Набор «${rec.name}» применён`, "ok"); }
  });

  let dragId = null;
  root.addEventListener("dragstart", e => {
    const h = e.target.closest("[data-drag]"); if (!h) return;
    dragId = h.dataset.drag;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragId); } catch {}
    h.closest(".gs-item")?.classList.add("drag");
  });
  root.addEventListener("dragover", e => {
    if (!dragId) return;
    const item = e.target.closest(".gs-item"); if (!item) return;
    e.preventDefault();
    $$(".gs-item.over").forEach(n => n.classList.remove("over"));
    item.classList.add("over");
  });
  root.addEventListener("drop", e => {
    if (!dragId) return;
    const item = e.target.closest(".gs-item"); if (!item) return;
    e.preventDefault();
    const [k1, id1] = dragId.split(":"), [k2, id2] = item.dataset.item.split(":");
    if (k1 === k2 && id1 !== id2) {
      const arr = LIST[k1](), i = arr.findIndex(x => x.id === id1), j = arr.findIndex(x => x.id === id2);
      if (i >= 0 && j >= 0) { const [m] = arr.splice(i, 1); arr.splice(j, 0, m); RERENDER[k1](); update(); }
    }
    dragId = null; $$(".gs-item").forEach(n => n.classList.remove("drag", "over"));
  });
  root.addEventListener("dragend", () => { dragId = null; $$(".gs-item").forEach(n => n.classList.remove("drag", "over")); });

  root.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveProfile(false); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); $("#gsDocx").click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); $("#gsPrint").click(); return; }
    if (e.key === "Tab") {
      const f = $$('button,input,select,textarea,[tabindex]:not([tabindex="-1"])').filter(n => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

function close() {
  store.saveLast(st).catch(() => {});
  window.removeEventListener("resize", root._mode);
  if (printHandler) window.removeEventListener("beforeprint", printHandler);
  printHandler = null;
  root.remove(); root = null;
  document.documentElement.classList.remove("gost-lock");
  lastFocus?.focus?.();
}

export async function openGostStudio(o = {}) {
  if (root) { root.querySelector("#gsClose")?.focus(); return; }
  opts = o; lastFocus = document.activeElement;
  root = document.createElement("div");
  root.className = "gost-root"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "ГОСТ-конструктор");
  root.innerHTML = shell();
  document.body.appendChild(root);
  document.documentElement.classList.add("gost-lock");
  const saved = await store.loadLast().catch(() => null);
  const blocks = sourceBlocks();
  st = saved ? { ...defaultState(), ...saved } : seedState(blocks);

  if (blocks.length) {
    const cur = st.blocks || [];
    const same = cur.length === blocks.length && cur.every((b, i) => (b.text || "").trim() === (blocks[i].text || "").trim());
    if (!same) st.blocks = blocks;
  }
  wire();
  applyState(st, null);
  await refreshProfiles("");
  $("#gsClose").focus();
}
