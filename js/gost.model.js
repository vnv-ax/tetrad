

export const STD = "ГОСТ Р 7.0.97-2025";
export const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
export const KINDS = [
  ["letter","Деловое письмо"], ["order","Приказ"], ["instruction","Распоряжение"], ["act","Акт"],
  ["protocol","Протокол"], ["contract","Договор"], ["regulation","Положение / инструкция"],
  ["statement","Заявление (физлицо)"], ["complaint","Жалоба (физлицо)"], ["report","Сообщение о преступлении"],
  ["other","Другой документ"]
];
export const DOC_TYPE_BY_KIND = { order:"ПРИКАЗ", instruction:"РАСПОРЯЖЕНИЕ", act:"АКТ", protocol:"ПРОТОКОЛ",
  contract:"ДОГОВОР", regulation:"ПОЛОЖЕНИЕ", statement:"ЗАЯВЛЕНИЕ", complaint:"ЖАЛОБА",
  report:"СООБЩЕНИЕ О ПРЕСТУПЛЕНИИ" };
export const FONT_NAMES = ["Times New Roman","PT Serif","PT Sans","Arial","Liberation Serif","Calibri","PT Astra Sans"];

export const mmTwip = mm => Math.ceil(mm * 1440 / 25.4);
export const mmPx = mm => mm * 96 / 25.4;
export const uid = () => Math.random().toString(36).slice(2, 10);
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export function formatDate(iso, style = "words") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  const [, y, mo, d] = m;
  return style === "digits" ? `${d}.${mo}.${y}` : `${d} ${MONTHS[+mo - 1]} ${y} г.`;
}
export function isoFromAny(s) {
  const t = String(s || "").trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  m = /^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i.exec(t);
  if (m) { const i = MONTHS.indexOf(m[2].toLowerCase()); if (i >= 0) return `${m[3]}-${String(i+1).padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

export function normalizeName(s) {
  let t = String(s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  let m = /^([А-ЯЁA-Z])\.\s*([А-ЯЁA-Z])\.\s*(.+)$/.exec(t);
  if (m) return `${m[1]}.${m[2]}. ${m[3]}`;
  m = /^([А-ЯЁ][а-яё-]+)\s+([А-ЯЁ])[а-яё]+\s+([А-ЯЁ])[а-яё]+$/.exec(t);
  if (m) return `${m[2]}.${m[3]}. ${m[1]}`;
  m = /^([А-ЯЁ][а-яё-]+)\s+([А-ЯЁ])\.\s*([А-ЯЁ])\.$/.exec(t);
  if (m) return `${m[2]}.${m[3]}. ${m[1]}`;
  return t;
}

export function normalizeEtiquette(s) {
  let t = String(s || "").trim().replace(/[.;!]+$/, "");
  if (!t) return "";
  t = t[0].toUpperCase() + t.slice(1);
  return t.endsWith(",") ? t : t + ",";
}
export const isLetter = st => st.kind === "letter";

export const isPersonalDoc = st => st.kind === "statement" || st.kind === "complaint" || st.kind === "report";
export const noDocType = st => isLetter(st);

const NOTE_RE = /записк|докладн/i;
export const noPlace = st => isLetter(st) || (st.kind === "other" && NOTE_RE.test((st.docType || "").trim()));
export const docTypeText = st => noDocType(st) ? "" :
  (st.kind === "other" ? (st.docType || "") : (DOC_TYPE_BY_KIND[st.kind] || st.docType || "")).toUpperCase();

const ATT_FORBIDDEN_KINDS = ["order", "instruction", "contract", "regulation"];
const ATT_FORBIDDEN_RE = /приказ|распоряжен|постановлен|решени|положен|инструкц|правил|договор|план|отчет|отчёт/i;
export const noAttMark = st => ATT_FORBIDDEN_KINDS.includes(st.kind) ||
  (st.kind === "other" && ATT_FORBIDDEN_RE.test((st.docType || "").trim()));

export const ATT_REF_BY_TYPE = { "ПРИКАЗ": "приказу", "РАСПОРЯЖЕНИЕ": "распоряжению", "АКТ": "акту",
  "ПРОТОКОЛ": "протоколу", "ДОГОВОР": "договору", "ПОЛОЖЕНИЕ": "положению", "ЗАЯВЛЕНИЕ": "заявлению",
  "ЖАЛОБА": "жалобе", "СООБЩЕНИЕ О ПРЕСТУПЛЕНИИ": "сообщению о преступлении" };

export function defaultState() {
  return {
    v: 1, kind: "letter", docType: "", layout: "corner", reqAlign: "flag",
    font: "Times New Roman", pt: 14, spacing: 1.5, longStorage: true,
    dateStyle: "words", numbering: true, titlePage: false,
    boldOrg: true, boldDocType: true, boldTitle: false, titleCenter: false, headingCenter: true,
    emblem: null, formCode: "", control: false,
    org: { parent: "", name: "", short: "", unit: "", position: "", info: "" },
    access: { text: "", copy: "" },
    date: todayISO(), number: "", replyNumber: "", replyDate: "", place: "",
    approval: { on: false, kind: "person", word: "УТВЕРЖДАЮ", position: "", name: "", date: "", docKind: "", org: "", docDate: "", docNumber: "", board: "", protDate: "", protNumber: "" },
    agreement: { on: false, place: "bottom", kind: "person", word: "СОГЛАСОВАНО", position: "", name: "", date: "", docKind: "", org: "", docDate: "", docNumber: "", board: "", protDate: "", protNumber: "" },
    addressees: [], title: "", salutation: "", etiquette: "", sender: "",
    blocks: [],
    attachments: { on: false, namedInText: false, sheets: false, items: [] },
    signers: [], ep: { on: false, kind: "uq", cert: "", owner: "", from: "", to: "", signedAt: "", custom: "" },
    seal: false,
    executor: { on: false, fio: "", unit: "", position: "", phone: "", email: "", asFooter: false },
    visas: [], copyCert: { on: false, position: "", name: "", date: "", storage: "", fileNo: "", year: "" },
    toFile: { on: false, no: "", year: "", position: "", date: "" },
    qr: null, guides: false, zoom: 0.85
  };
}

export function seedState(blocks) {
  const s = defaultState();

  s.org = { parent: "", name: 'Общество с ограниченной ответственностью\n«Ромашка»', short: 'ООО «Ромашка»',
    unit: "", position: "", info: "125167, г. Москва, ул. Образцова, д. 12, стр. 1\nтел. +7 (495) 000-00-00, e-mail: info@romashka.example, www.romashka.example\nОКПО 00000000; ОГРН 1000000000000; ИНН/КПП 7700000000/770001001" };
  s.number = "04-17/128"; s.place = "";
  s.addressees = [{ id: uid(), lines: 'Директору ООО «Северный проектный институт»\nСмирнову А.В.', address: "" }];
  s.title = "О предоставлении копии акта проверки";
  s.salutation = "Уважаемый Алексей Владимирович!";
  s.etiquette = "С уважением,";
  s.blocks = (blocks && blocks.length) ? blocks : [
    { id: uid(), type: "p", text: "Просим направить в адрес ООО «Ромашка» копию акта проверки проектной документации по объекту «Речной вокзал», заверенную в установленном порядке.", runs: null, bold: false },
    { id: uid(), type: "p", text: "Копия необходима для подготовки сводного заключения по разделу «Конструктивные решения» в срок до 01.12.2026.", runs: null, bold: false }
  ];
  s.attachments = { on: true, namedInText: false, items: [{ id: uid(), title: "Перечень запрашиваемых документов", pages: "2", copies: "1", firstOnly: false, bound: false }] };
  s.signers = [{ id: uid(), position: "Генеральный директор", name: "И.И. Иванов", includeOrg: false, equal: false }];
  s.executor = { on: true, fio: "Иван Иванович Иванов", unit: "управление делопроизводства", position: "специалист", phone: "+7 (495) 000-00-00", email: "info@romashka.example", asFooter: false };
  return s;
}

export const PRESETS = [
  { id: "p-letter", name: "Письмо организации", build: b => seedState(b) },
  { id: "p-order", name: "Приказ", build: b => { const s = seedState(b); s.kind = "order"; s.layout = "long"; s.place = "Москва";
      s.number = "128-к"; s.addressees = []; s.salutation = ""; s.etiquette = ""; s.attachments.on = false;
      s.title = "О создании аттестационной комиссии";
      s.blocks = (b && b.length) ? b : [
        { id: uid(), type: "p", text: "В целях проведения аттестации работников проектного отдела", runs: null, bold: false },
        { id: uid(), type: "p", text: "ПРИКАЗЫВАЮ:", runs: null, bold: true },
        { id: uid(), type: "num", text: "Создать аттестационную комиссию в составе: председатель — заместитель генерального директора Сидоров С.С.; члены комиссии — начальник проектного отдела Кузнецов К.К., специалист службы кадров Сидорова А.И.", runs: null, bold: false },
        { id: uid(), type: "num", text: "Комиссии представить результаты аттестации в срок до 25.12.2026.", runs: null, bold: false },
        { id: uid(), type: "num", text: "Контроль за исполнением приказа оставляю за собой.", runs: null, bold: false }];
      return s; } },
  { id: "p-stmt", name: "Заявление физлица", build: b => { const s = defaultState(); s.kind = "statement"; s.layout = "long";
      s.addressees = [{ id: uid(), lines: 'Генеральному директору\nООО «Ромашка»\nИ.И. Иванову', address: "" }];
      s.org.name = ""; s.org.info = ""; s.title = ""; s.etiquette = "";
      s.sender = "от Сидоровой Анны Ивановны,\nведущего специалиста проектного отдела";
      s.blocks = (b && b.length) ? b : [{ id: uid(), type: "p", text: "Прошу предоставить мне часть ежегодного оплачиваемого отпуска продолжительностью 5 календарных дней с 07.12.2026 по 11.12.2026.", runs: null, bold: false }];
      s.signers = [{ id: uid(), position: "", name: "А.И. Сидорова", includeOrg: false, equal: false }];
      return s; } },
  { id: "p-complaint", name: "Жалоба в госорган", build: b => { const s = defaultState(); s.kind = "complaint"; s.layout = "long";
      s.addressees = [{ id: uid(), lines: "Прокурору Заречного района г. Москвы\nСмирнову А.В.", address: "" }];
      s.org.name = ""; s.org.info = ""; s.title = ""; s.salutation = ""; s.etiquette = "";
      s.sender = "от Сидоровой Анны Ивановны,\nпроживающей по адресу: 125167, г. Москва,\nул. Образцова, д. 12, кв. 5,\nтел. +7 (495) 000-00-00";
      s.blocks = (b && b.length) ? b : [
        { id: uid(), type: "p", text: "14.11.2026 я направила в управляющую компанию ООО «Ромашка» заявление о протечке кровли жилого дома по адресу: 125167, г. Москва, ул. Образцова, д. 12. Ответ на заявление в установленный срок не поступил, повреждения кровли не устранены.", runs: null, bold: false },
        { id: uid(), type: "p", text: "Полагаю, что бездействие управляющей компании нарушает требования Жилищного кодекса Российской Федерации и Федерального закона от 02.05.2006 № 59-ФЗ «О порядке рассмотрения обращений граждан Российской Федерации».", runs: null, bold: false },
        { id: uid(), type: "p", text: "На основании изложенного, руководствуясь Федеральным законом от 17.01.1992 № 2202-1 «О прокуратуре Российской Федерации», прошу:", runs: null, bold: false },
        { id: uid(), type: "num", text: "провести проверку изложенных в жалобе фактов;", runs: null, bold: false },
        { id: uid(), type: "num", text: "принять меры прокурорского реагирования к ООО «Ромашка»;", runs: null, bold: false },
        { id: uid(), type: "num", text: "направить мне письменный ответ в установленный законом срок.", runs: null, bold: false }];
      s.signers = [{ id: uid(), position: "", name: "А.И. Сидорова", includeOrg: false, equal: false }];
      return s; } },
  { id: "p-report", name: "Сообщение о преступлении", build: b => { const s = defaultState(); s.kind = "report"; s.layout = "long";
      s.addressees = [{ id: uid(), lines: "Начальнику Отдела МВД России\nпо Заречному району г. Москвы\nСмирнову А.В.", address: "" }];
      s.org.name = ""; s.org.info = ""; s.title = ""; s.salutation = ""; s.etiquette = "";
      s.sender = "от Иванова Ивана Ивановича,\nпроживающего по адресу: 125167, г. Москва,\nул. Образцова, д. 12, кв. 7,\nтел. +7 (495) 000-00-00";
      s.blocks = (b && b.length) ? b : [
        { id: uid(), type: "p", text: "Сообщаю о совершенном преступлении: в ночь с 14 на 15 ноября 2026 года со склада, расположенного по адресу: 125167, г. Москва, ул. Образцова, д. 14, стр. 2, похищены электроинструменты. В хищении чужого имущества усматриваются признаки преступления, предусмотренного частью 1 статьи 158 Уголовного кодекса Российской Федерации.", runs: null, bold: false },
        { id: uid(), type: "p", text: "На основании изложенного, руководствуясь статьями 141, 144 и 145 Уголовно-процессуального кодекса Российской Федерации, прошу:", runs: null, bold: false },
        { id: uid(), type: "num", text: "провести проверку сообщения о преступлении;", runs: null, bold: false },
        { id: uid(), type: "num", text: "принять решение о возбуждении уголовного дела;", runs: null, bold: false },
        { id: uid(), type: "num", text: "уведомить меня о принятом решении.", runs: null, bold: false },
        { id: uid(), type: "p", text: "Об уголовной ответственности за заведомо ложный донос в соответствии со статьёй 306 Уголовного кодекса Российской Федерации предупреждён.", runs: null, bold: false }];
      s.signers = [{ id: uid(), position: "", name: "И.И. Иванов", includeOrg: false, equal: false }];
      return s; } }
];

let mctx = null;
export function measureMm(text, font, pt, bold) {
  try {
    mctx = mctx || document.createElement("canvas").getContext("2d");
    mctx.font = `${bold ? "700 " : ""}${pt}pt ${font}, serif`;
    return mctx.measureText(text).width * 25.4 / 96;
  } catch { return 0; }
}
export function validate(st) {
  const out = [];
  const add = (level, clause, text, focus) => out.push({ level, clause, text, focus });
  const zone = st.layout === "corner" ? 80 : 120;
  if (!st.title.trim() && !isPersonalDoc(st)) add("err", "5.17", "Заголовок к тексту обязателен для всех документов.", '[data-bind="title"]');
  else if (st.title && !/^(О|Об)\b/i.test(st.title.trim()) && !isPersonalDoc(st)) add("info", "5.17", "Заголовок обычно формулируется с предлогом «О» («Об»).", '[data-bind="title"]');
  if (!noDocType(st) && !docTypeText(st)) add("err", "5.9", "Не указано наименование вида документа.", '[data-bind="docType"]');
  if (isLetter(st) && st.docType) add("info", "5.9", "На деловых письмах наименование вида документа не указывается.", "#g-blank");
  if (!st.date) add("err", "5.10", "Не указана дата документа.", '[data-bind="date"]');
  if (!st.signers.filter(s => s.name || s.position).length) add("err", "5.22", "Не оформлена подпись.", "#g-sign");
  st.signers.forEach(s => { if (s.name && normalizeName(s.name) !== s.name.trim()) add("info", "5.22", `Расшифровка подписи будет приведена к виду «${normalizeName(s.name)}».`, "#g-sign"); });
  if (st.addressees.length > 4) add("err", "5.15", "В одном документе не должно быть более четырёх адресатов — оформите список рассылки.", "#g-addr");
  if (!st.addressees.length && (isLetter(st) || isPersonalDoc(st))) add("warn", "5.15", "Для письма, заявления, жалобы или сообщения нужен адресат.", "#g-addr");
  if (st.etiquette && !/,$/.test(st.etiquette.trim())) add("info", "5.18", "Этикетная фраза будет завершена запятой.", '[data-bind="etiquette"]');

  const orgFirst = String(st.org.name || "").split("\n").map(x => x.trim()).filter(Boolean)[0] || "";
  if (st.place && orgFirst && orgFirst.toLowerCase().includes(st.place.trim().toLowerCase()))
    add("info", "5.13", "Место составления уже содержится в наименовании организации — реквизит 13 можно не указывать.", "#g-req");
  if (st.attachments.on && st.attachments.items.length && noAttMark(st))
    add("warn", "5.19", "У распорядительных документов, положений, правил, инструкций, договоров, планов и отчётов отметка о приложении не оформляется: сведения укажите в тексте «(приложение 1)», а на первом листе приложения — «Приложение N» со ссылкой на основной документ. Отметка в основном документе выводиться не будет.", "#g-att");
  if (![12,13,14].includes(+st.pt)) add("warn", "3.3", "Рекомендованы размеры шрифта 12, 13, 14.", '[data-bind="pt"]');
  if (![1,1.5].includes(+st.spacing)) add("warn", "3.4", "Текст печатается через 1—1,5 межстрочных интервала.", '[data-bind="spacing"]');
  if (st.longStorage) add("ok", "6.1", "Левое поле 30 мм — для документов со сроком хранения свыше 10 лет.", '[data-bind="longStorage"]');
  else add("info", "6.1", "Левое поле 20 мм допустимо; при хранении свыше 10 лет требуется 30 мм.", '[data-bind="longStorage"]');
  const lines = [];
  if (st.org.name) lines.push(...st.org.name.split("\n"));
  if (st.org.short) lines.push(`(${st.org.short})`);
  st.addressees.forEach(a => lines.push(...String(a.lines || "").split("\n")));
  const over = lines.filter(l => l.trim() && measureMm(l.trim(), st.font, st.pt, false) > zone);
  if (over.length) add("warn", "3.5", `Строки реквизитов длиннее ${zone} мм (${over.length} шт.) — перенесите слова вручную.`, "#g-blank");
  const deep = st.blocks.filter(b => /^\d+(\.\d+){3,}\s/.test(b.text || ""));
  if (deep.length) add("warn", "5.18", "Уровней рубрикации текста не должно быть более четырёх.", "#g-text");

  const logoType = st.emblem?.type || "emblem";
  if (st.emblem && logoType === "tm") add("ok", "5.3", "Товарный знак (03): по центру верхнего поля или слева на уровне наименования организации (6.5).", "#g-blank");
  else if (st.emblem && logoType === "herb") add("ok", "5.1", "Герб (01) — по центру верхнего поля, 10 мм от края. Герб и эмблема одновременно не допускаются.", "#g-blank");
  else if (st.emblem) add("ok", "5.2", "Эмблема (02) — по центру верхнего поля, 10 мм от края. Герб и эмблема одновременно не допускаются.", "#g-blank");
  if (st.qr) add("ok", "5.31", "Штрих-код (QR-код) размещается в правом нижнем углу первого листа.", "#g-marks");
  if (st.ep.on && st.ep.kind !== "simple" && (!st.ep.cert || !st.ep.owner || !st.ep.from || !st.ep.to))
    add("warn", "5.23", "Отметка об усиленной ЭП: нужны номер сертификата, владелец и срок действия.", "#g-sign");
  if (st.executor.on && !st.executor.phone) add("warn", "5.25", "Отметка об исполнителе включает номер телефона.", "#g-marks");
  if (st.blocks.filter(b => (b.text || "").trim()).length === 0) add("err", "5.18", "Текст документа пуст.", "#g-text");
  return out;
}

const SKIP = "svg,.rough-notation,[data-handmark],script,style";
function runsOf(node) {
  const out = [];
  const walk = (n, f) => {
    if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, " "); if (t.trim() || t === " ") out.push({ text: t, ...f }); return; }
    if (n.nodeType !== 1) return;
    const el = n, tag = el.tagName;
    if (el.matches && el.matches(SKIP)) return;
    if (tag === "BR") { out.push({ text: "\n", ...f }); return; }
    const nf = { ...f };
    if (tag === "STRONG" || tag === "B" || el.style?.fontWeight >= 600) nf.bold = true;
    if (tag === "EM" || tag === "I") nf.italic = true;
    if (tag === "U") nf.underline = true;
    el.childNodes.forEach(c => walk(c, nf));
  };
  walk(node, {});
  const merged = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && !!last.bold === !!r.bold && !!last.italic === !!r.italic && !!last.underline === !!r.underline) last.text += r.text;
    else merged.push({ ...r });
  }
  return merged.map(r => ({ ...r, text: r.text.replace(/^\s+|\s+$/g, m => m.includes("\n") ? "\n" : "") })).filter(r => r.text);
}
export function blocksFromHTML(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const blocks = [];
  const push = (type, el, extra = {}) => {
    const runs = runsOf(el);
    const text = runs.map(r => r.text).join("").replace(/\s*\n\s*/g, " ").trim();
    if (text) blocks.push({ id: uid(), type, text, runs, bold: false, ...extra });
  };
  const walk = root => {
    [...root.children].forEach(el => {
      if (el.matches && el.matches(SKIP)) return;
      const tag = el.tagName;
      if (tag === "UL" || tag === "OL") {
        [...el.children].filter(c => c.tagName === "LI").forEach((li, i) =>
          push(tag === "OL" ? "num" : "li", li, tag === "OL" ? { n: i + 1 } : {}));
      } else if (/^H[1-6]$/.test(tag)) push(+tag[1] <= 2 ? "h1" : "h2", el);
      else if (tag === "P" || tag === "DIV" || tag === "BLOCKQUOTE" || tag === "PRE") {
        if (el.querySelector("p,div,ul,ol,h1,h2,h3")) walk(el); else push("p", el);
      }
    });
  };
  walk(doc.body);
  if (!blocks.length) return blocksFromPlain(doc.body.textContent || "");
  return blocks;
}
export function blocksFromPlain(text) {
  return String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}|\n/).map(l => l.trim()).filter(Boolean)
    .map(l => {
      if (/^#{1,6}\s/.test(l)) return { id: uid(), type: "h1", text: l.replace(/^#+\s*/, ""), runs: null, bold: true };
      if (/^[-–—*•]\s/.test(l)) return { id: uid(), type: "li", text: l.replace(/^[-–—*•]\s*/, ""), runs: null, bold: false };
      if (/^\d+[.)]\s/.test(l)) return { id: uid(), type: "num", text: l.replace(/^\d+[.)]\s*/, ""), runs: null, bold: false };
      return { id: uid(), type: "p", text: l, runs: null, bold: false };
    });
}

const DB = "gost-studio", VER = 1;
let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!("indexedDB" in self)) return rej(new Error("IndexedDB недоступен"));
    const rq = indexedDB.open(DB, VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      ["profiles", "dict", "meta"].forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === "meta" ? "k" : "id" }); });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error || new Error("IndexedDB"));
    rq.onblocked = () => rej(new Error("IndexedDB заблокирован"));
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && "result" in rq ? rq.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const lsKey = s => `gost:${s}`;
const lsRead = (s, def) => { try { return JSON.parse(localStorage.getItem(lsKey(s)) || "null") ?? def; } catch { return def; } };
const lsWrite = (s, v) => { try { localStorage.setItem(lsKey(s), JSON.stringify(v)); } catch {} };
async function all(store) { try { return (await tx(store, "readonly", s => s.getAll())) || []; } catch { return lsRead(store, []); } }
async function put(store, val) {
  try { await tx(store, "readwrite", s => s.put(val)); }
  catch { const arr = lsRead(store, []).filter(x => (x.id || x.k) !== (val.id || val.k)); arr.push(val); lsWrite(store, arr); }
}
async function del(store, id) {
  try { await tx(store, "readwrite", s => s.delete(id)); }
  catch { lsWrite(store, lsRead(store, []).filter(x => (x.id || x.k) !== id)); }
}
export const store = {
  async profiles() { return (await all("profiles")).sort((a, b) => (b.updated || 0) - (a.updated || 0)); },
  async saveProfile(name, state, id) {
    const rec = { id: id || uid(), name: name || "Без названия", updated: Date.now(), state: JSON.parse(JSON.stringify(state)) };
    await put("profiles", rec); return rec;
  },
  async removeProfile(id) { await del("profiles", id); },
  async saveLast(state) { await put("meta", { k: "last", state: JSON.parse(JSON.stringify(state)), updated: Date.now() }); },
  async loadLast() { const arr = await all("meta"); return (arr.find(x => x.k === "last") || {}).state || null; },
  async dict(type) { return (await all("dict")).filter(x => x.type === type).sort((a, b) => (b.updated || 0) - (a.updated || 0)); },
  async dictAdd(type, label, data) { const rec = { id: uid(), type, label, data, updated: Date.now() }; await put("dict", rec); return rec; },
  async dictDel(id) { await del("dict", id); },
  async fontPut(k, name, buf) { try { await tx("meta", "readwrite", s => s.put({ k, name, buf })); return true; } catch { return false; } },
  async fontGet(k) { const arr = await all("meta"); return arr.find(x => x.k === k) || null; }
};
export function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 15000);
}
export function fileTitle(st) {
  const base = (st.title || docTypeText(st) || "Документ").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
  const d = st.date ? ` ${formatDate(st.date, "digits")}` : "";
  const n = st.number ? ` №${st.number}`.replace(/[\\/:*?"<>|]+/g, "-") : "";
  return `${base}${n}${d}`;
}
