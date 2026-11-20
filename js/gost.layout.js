
import { ATT_REF_BY_TYPE, docTypeText, formatDate, isLetter, isPersonalDoc, measureMm, noAttMark, noPlace, normalizeEtiquette, normalizeName } from "./gost.model.js";

const P = o => ({ type: "para", runs: [], align: "left", pt: null, line: 1, before: 0, after: 0,
  indL: 0, indR: 0, first: 0, hang: 0, keep: false, req: "", bold: false, tab: null, ...o });
const R = (text, o = {}) => ({ text: String(text ?? ""), ...o });
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);

function stampLines(cfg, word) {
  const out = [];
  if (cfg.kind === "person") {
    out.push(word);
    lines(cfg.position).forEach(l => out.push(l));
    out.push(`__________ ${normalizeName(cfg.name)}`);
    if (cfg.date) out.push(formatDate(cfg.date, "digits"));
  } else if (cfg.kind === "document") {
    out.push(cfg.word || word);
    out.push([cfg.docKind, cfg.org].filter(Boolean).join(" "));
    out.push([cfg.docDate ? `от ${formatDate(cfg.docDate, "words")}` : "", cfg.docNumber ? `№ ${cfg.docNumber}` : ""].filter(Boolean).join(" "));
  } else {
    out.push(cfg.word || word);
    if (cfg.board) out.push(cfg.board);
    out.push(`(протокол ${cfg.protDate ? `от ${formatDate(cfg.protDate, "digits")}` : "от ________"}${cfg.protNumber ? ` № ${cfg.protNumber}` : " № ____"})`);
  }
  return out.filter(Boolean);
}

export function buildLayout(st) {
  const pt = +st.pt || 14;
  const textLine = +st.spacing === 1 ? 1 : 1.5;
  const mL = st.longStorage ? 30 : 20, mR = 10;
  const emblemTop = st.emblem && st.emblem.place === "center";
  const mT = 20 + (emblemTop ? st.emblem.hMm + 5 : 0);
  const mB = 20 + (st.qr ? st.qr.hMm + 4 : 0) + (st.executor.on && st.executor.asFooter ? 9 : 0);
  const W = 210, H = 297, tw = W - mL - mR;
  const zone = st.layout === "corner" ? 80 : 120;
  const zL = { indR: Math.max(0, tw - zone) };
  const zR = { indL: Math.max(0, tw - zone) };
  const zC = { indL: Math.max(0, (tw - zone) / 2), indR: Math.max(0, (tw - zone) / 2) };
  const reqAlign = st.reqAlign === "center" ? "center" : "left";
  const extra = pt * 0.3527778 * 1.15 * textLine;
  const items = [];
  const push = (...xs) => items.push(...xs);
  const req = (text, o = {}) => P({ runs: [R(text, { bold: o.bold })], line: 1, keep: true, align: reqAlign, ...o });
  const reqBlock = (arr, o = {}) => arr.map((t, i) => req(t, { ...o, before: i === 0 ? (o.before ?? extra) : 0, req: o.req || "" }));
  const body = (runs, o = {}) => P({ runs, align: "justify", first: 12.5, line: textLine, ...o });

  if (st.titlePage) {

    const tpAgr = st.agreement.on ? stampLines(st.agreement, "СОГЛАСОВАНО").map(t => req(t, { align: "left", req: "20" })) : [];
    const tpApr = st.approval.on ? stampLines(st.approval, "УТВЕРЖДАЮ").map(t => req(t, { align: "right", req: "16" })) : [];
    if (st.org.name) push(...lines(st.org.name).map(t => req(t, { align: "center", ...zC, bold: st.boldOrg, req: "05" })));
    if (st.org.short) push(req(`(${st.org.short})`, { align: "center", ...zC, req: "05" }));
    push(P({ runs: [], before: extra * 2, keep: false }));
    if (tpAgr.length || tpApr.length)
      push({ type: "cols", gap: 0, cols: [{ w: Math.floor(tw / 2), items: tpAgr }, { w: Math.ceil(tw / 2), items: tpApr }] });
    push(P({ runs: [], before: extra * 6, keep: false }));
    if (docTypeText(st)) push(req(docTypeText(st), { align: "center", bold: st.boldDocType, req: "09" }));
    if (st.title) push(...lines(st.title).map(t => req(t, { align: "center", ...zC, bold: st.boldTitle, before: extra, req: "17" })));
    push(P({ runs: [], before: extra * 10 }));
    const py = [st.place, st.date ? String(+st.date.slice(0, 4)) : ""].filter(Boolean).join(" — ");
    if (py) push(req(py, { align: "center", req: "13" }));
    push({ type: "pagebreak" });
  }

  if (st.formCode) push(req(st.formCode, { align: "right", before: 0, req: "04" }));
  if (st.access.text) {
    push(...reqBlock(lines(st.access.text), { align: "right", before: 0, req: "14" }));
    if (st.access.copy) push(req(`Экз. № ${st.access.copy}`, { align: "right", req: "14" }));
  }

  const orgLines = [];
  if (st.org.parent) orgLines.push(...lines(st.org.parent));
  orgLines.push(...lines(st.org.name));
  if (st.org.short) orgLines.push(`(${st.org.short})`);
  if (st.org.unit) orgLines.push(...lines(st.org.unit));
  if (st.org.position) orgLines.push(st.org.position.toUpperCase());
  const infoLines = isLetter(st) ? lines(st.org.info) : [];
  const addrItems = [];
  st.addressees.forEach(a => {
    lines(a.lines).forEach((t, j) => addrItems.push(req(t, { ...zR, before: j === 0 ? extra : 0, req: "15" })));
    lines(a.address).forEach(t => addrItems.push(req(t, { ...zR, req: "15" })));
  });

  const apprItems = st.approval.on && !st.titlePage ? stampLines(st.approval, "УТВЕРЖДАЮ").map((t, i) => req(t, { ...zR, before: i ? 0 : extra, req: "16" })) : [];
  const agrTop = st.agreement.on && st.agreement.place === "top" && !st.titlePage
    ? stampLines(st.agreement, "СОГЛАСОВАНО").map(t => req(t, { req: "20" })) : [];

  const orgItems = [
    ...orgLines.map((t, i) => req(t, { bold: st.boldOrg, before: 0, req: i === 0 ? "05" : "" })),
    ...infoLines.map((t, i) => req(t, { pt: pt - 1, before: i ? 0 : extra / 2, req: "08" }))
  ];

  const logoType = st.emblem?.type || "emblem";
  const logoReqNo = logoType === "herb" ? "01" : logoType === "tm" ? "03" : "02";
  const logoLeft = !!(st.emblem && st.emblem.place === "left");
  const logoItem = logoLeft ? { type: "image", src: st.emblem.dataUrl, wMm: st.emblem.wMm, hMm: st.emblem.hMm, align: "left", before: 0, req: logoReqNo } : null;
  const strip = x => ({ ...x, indL: 0, indR: 0 });

  if (isPersonalDoc(st)) {
    if (logoItem) push(logoItem);
    if (addrItems.length) push(...addrItems.map((x, i) => ({ ...x, before: i === 0 ? 0 : x.before })));
    if (st.sender) push(...lines(st.sender).map((t, i) => req(t, { ...zR, before: i ? 0 : extra / 2, req: "15" })));
  } else if (st.layout === "corner" && orgItems.length && (addrItems.length || apprItems.length)) {

    if (logoItem) {

      const orgW = Math.max(40, zone - st.emblem.wMm - 4);
      push({ type: "cols", gap: 4, cols: [
        { w: st.emblem.wMm, items: [logoItem] },
        { w: orgW, items: [...agrTop, ...orgItems].map(strip) },
        { w: tw - st.emblem.wMm - orgW - 8, items: [...apprItems, ...addrItems].map(strip) } ] });
    } else {
      push({ type: "cols", gap: tw - zone * 2, cols: [
        { w: zone, items: [...agrTop, ...orgItems].map(strip) },
        { w: zone, items: [...apprItems, ...addrItems].map(strip) } ] });
    }
  } else {
    if (agrTop.length) push(...agrTop);
    if (logoItem && orgItems.length) {

      push({ type: "cols", gap: 4, cols: [
        { w: st.emblem.wMm, items: [logoItem] },
        { w: tw - st.emblem.wMm - 4, items: orgItems.map(strip) } ] });
    } else {
      if (logoItem) push(logoItem);
      if (orgItems.length) push(...(st.layout === "long"
        ? orgItems.map(x => ({ ...x, align: "center", ...zC }))
        : orgItems.map(x => ({ ...x, ...zL }))));
    }
    if (apprItems.length) push(...apprItems);
    if (addrItems.length) push(...addrItems);
  }

  const d = formatDate(st.date, st.dateStyle);
  const num = st.number ? `№ ${st.number}` : "";
  if (st.layout === "long" && !isPersonalDoc(st)) {
    push(P({ runs: [R(d)], line: 1, keep: true, before: extra, req: "10",
      tab: [{ pos: tw / 2, text: num, align: "center" }, { pos: tw, text: noPlace(st) ? "" : st.place, align: "right" }] }));
  } else {
    push(P({ runs: [R(d)], line: 1, keep: true, before: extra, req: "10", ...(isPersonalDoc(st) ? {} : zL),
      tab: [{ pos: isPersonalDoc(st) ? tw : zone, text: num, align: "right" }] }));
  }
  if (st.replyNumber || st.replyDate) {
    const t = `На № ${st.replyNumber || "________"}${st.replyDate ? ` от ${formatDate(st.replyDate, st.dateStyle)}` : ""}`;
    push(req(t, { ...(st.layout === "long" ? {} : zL), req: "12" }));
  }
  if (!noPlace(st) && st.place && (st.layout !== "long" || isPersonalDoc(st)))
    push(req(st.place, { req: "13" }));

  const dt = docTypeText(st);
  if (dt) push(req(dt, { align: st.layout === "long" || isPersonalDoc(st) ? "center" : "left", bold: st.boldDocType, before: extra, req: "09" }));
  if (st.title) push(...lines(st.title).map((t, i) => req(t, { align: st.titleCenter ? "center" : "left",
    ...(st.titleCenter ? zC : {}), bold: st.boldTitle, before: i ? 0 : extra, req: i ? "" : "17" })));

  if (st.salutation) push(P({ runs: [R(st.salutation)], line: textLine, before: extra, after: extra, req: "18" }));
  let counter = 0;
  st.blocks.forEach(b => {
    const text = (b.text || "").trim();
    if (!text) { counter = 0; return; }
    const runs = (b.runs && b.runs.length && b.runs.map(r => r.text).join("").trim() === text)
      ? b.runs.map(r => ({ ...r, bold: r.bold || b.bold })) : [R(text, { bold: b.bold })];
    if (b.type === "h1" || b.type === "h2") {
      counter = 0;
      push(P({ runs: runs.map(r => ({ ...r, bold: true })), line: textLine, keep: true, before: extra, after: extra / 2,
        align: st.headingCenter ? "center" : "justify", first: st.headingCenter ? 0 : 12.5, req: "18" }));
    } else if (b.type === "li") {
      counter = 0;
      push(body([R("– "), ...runs], { indL: 7, hang: 7, first: 0 }));
    } else if (b.type === "num") {
      counter = b.n || counter + 1;
      push(body([R(`${counter}. `), ...runs], { indL: 9, hang: 9, first: 0 }));
    } else { counter = 0; push(body(runs)); }
  });
  if (st.etiquette) push(P({ runs: [R(normalizeEtiquette(st.etiquette))], line: textLine, before: extra, req: "18" }));

  const atts = (st.attachments.items || []).filter(a => a.title || a.pages || a.copies);
  if (st.attachments.on && !noAttMark(st) && (atts.length || st.attachments.namedInText)) {
    const tail = a => [a.bound ? "" : (a.pages ? `на ${a.pages} л.` : ""), a.copies ? `в ${a.copies} экз.` : "", a.firstOnly ? "только в первый адрес." : ""]
      .filter(Boolean).join(" ");
    if (st.attachments.namedInText || (atts.length === 1 && !atts[0].title)) {
      push(req(`Приложение: ${tail(atts[0] || {})}`.trim(), { before: extra, req: "19" }));
    } else {
      push(req(atts.length === 1 ? "Приложение:" : "Приложения:", { before: extra, req: "19" }));
      atts.forEach((a, i) => push(req(`${atts.length > 1 ? `${i + 1}. ` : ""}${a.title}${tail(a) ? ` ${tail(a)}` : ""}`,
        { indL: atts.length > 1 ? 7 : 0, hang: atts.length > 1 ? 7 : 0, keep: i < atts.length - 1, req: "19" })));
    }
  }

  if (st.agreement.on && st.agreement.place === "bottom" && !st.titlePage)
    push(...stampLines(st.agreement, "СОГЛАСОВАНО").map((t, i) => req(t, { before: i ? 0 : extra * 1.5, req: "20" })));

  const sigs = st.signers.filter(s => s.name || s.position);
  const sigLines = s => {
    let pos = lines(s.position);
    if (isPersonalDoc(st)) pos = [];
    if (st.org.position && st.layout === "long" && !isPersonalDoc(st)) pos = [];
    if (s.includeOrg && st.org.short) pos = pos.length ? [pos[0] + " " + st.org.short, ...pos.slice(1)] : [st.org.short];
    return pos;
  };
  const sigItems = (s, w) => {
    const out = [];
    const pos = sigLines(s);
    const name = normalizeName(s.name);
    const tabW = w || tw;
    if (isPersonalDoc(st)) {
      out.push(P({ runs: [R(formatDate(st.date, st.dateStyle))], line: 1, keep: true, before: extra * 2, req: "22",
        tab: [{ pos: tabW, text: name, align: "right" }] }));
    } else if (pos.length) {
      pos.forEach((l, i) => {
        const last = i === pos.length - 1;
        out.push(P({ runs: [R(l)], line: 1, keep: true, before: i ? 0 : extra * 2, req: "22",
          tab: last ? [{ pos: tabW, text: name, align: "right" }] : null }));
      });
    } else out.push(P({ runs: [], line: 1, keep: true, before: extra * 2, req: "22", tab: [{ pos: tabW, text: name, align: "right" }] }));
    return out;
  };

  const sigW = s => {
    const nm = normalizeName(s.name);
    const ws = sigLines(s).map(l => measureMm(l, st.font, pt, false));
    const nmW = nm ? measureMm(nm, st.font, pt, false) : 0;
    let w = Math.max(0, ...ws);
    if (ws.length) w = Math.max(w, (ws[ws.length - 1] || 0) + nmW + 6);
    else w = Math.max(w, nmW + 20);
    return w;
  };
  const sigRuns = [];
  sigs.forEach(s => {
    const g = sigRuns[sigRuns.length - 1];
    if (s.equal && g && g[0].equal) g.push(s); else sigRuns.push([s]);
  });
  sigRuns.forEach(g => {
    if (g.length > 1) {
      const gap2 = 10;
      const need = Math.max(...g.map(sigW), 40);
      const k = Math.max(2, Math.min(g.length, Math.floor((tw + gap2) / (need + gap2))));
      const colW = (tw - gap2 * (k - 1)) / k;
      for (let i = 0; i < g.length; i += k)
        push({ type: "cols", gap: gap2, cols: g.slice(i, i + k).map(s => ({ w: colW, items: sigItems(s, colW) })) });
    } else push(...sigItems(g[0]));
  });

  if (st.ep.on) {
    const l = st.ep.kind === "simple"
      ? lines(st.ep.custom || "Документ подписан простой электронной подписью")
      : ["Документ подписан электронной подписью",
         st.ep.cert ? `Сертификат ${st.ep.cert}` : "",
         st.ep.owner ? `Владелец ${st.ep.owner}` : "",
         (st.ep.from || st.ep.to) ? `Действителен с ${formatDate(st.ep.from, "digits")} по ${formatDate(st.ep.to, "digits")}` : "",
         st.ep.signedAt ? `Дата и время подписания ${st.ep.signedAt.replace("T", " ")}` : ""].filter(Boolean);
    push({ type: "stamp", lines: l, pt: pt - 3, wMm: Math.min(100, tw), before: extra, req: "23" });
  }
  if (st.seal) push(req("МП", { before: extra, req: "24" }));

  st.visas.forEach(v => {
    if (v.remarks) push(req("Замечания прилагаются.", { before: extra * 1.5, req: "21" }));
    lines(v.position).forEach((t, i) => push(req(t, { before: i ? 0 : (v.remarks ? 0 : extra * 1.5), req: "21" })));
    push(P({ runs: [R("__________")], line: 1, keep: true, req: "21", tab: [{ pos: tw, text: normalizeName(v.name), align: "right" }] }));
    if (v.date) push(req(formatDate(v.date, "digits"), { req: "21" }));
  });
  if (st.copyCert.on) {
    push(req("Верно", { before: extra * 1.5, req: "26" }));
    lines(st.copyCert.position).forEach(t => push(req(t, { req: "26" })));
    push(P({ runs: [R("__________")], line: 1, keep: true, req: "26", tab: [{ pos: tw, text: normalizeName(st.copyCert.name), align: "right" }] }));
    if (st.copyCert.date) push(req(formatDate(st.copyCert.date, "digits"), { req: "26" }));
    if (st.copyCert.storage) push(req(`Подлинник документа находится в ${st.copyCert.storage}${st.copyCert.fileNo ? ` в деле № ${st.copyCert.fileNo}` : ""}${st.copyCert.year ? ` за ${st.copyCert.year} год` : ""}`, { req: "26" }));
  }
  if (st.toFile.on) {
    push(req(`В дело № ${st.toFile.no || "____"}${st.toFile.year ? ` за ${st.toFile.year} г.` : ""}`, { before: extra * 1.5, req: "30" }));
    lines(st.toFile.position).forEach(t => push(req(t, { req: "30" })));
    if (st.toFile.date) push(req(formatDate(st.toFile.date, "digits"), { req: "30" }));
  }
  const execText = st.executor.on ? [
    [st.executor.fio, st.executor.unit, st.executor.position].filter(Boolean).join(", "),
    [st.executor.phone, st.executor.email].filter(Boolean).join(", ")
  ].filter(Boolean) : [];
  if (execText.length && !st.executor.asFooter)
    execText.forEach((t, i) => push(req(t, { pt: pt - 2, before: i ? 0 : extra * 2, req: "25" })));

  if (st.attachments.sheets && st.attachments.items.length) {
    const refType = docTypeText(st);
    const refKind = refType ? (ATT_REF_BY_TYPE[refType] || refType.toLowerCase()) : "";
    const refOrg = st.org.short || lines(st.org.name)[0] || "";
    st.attachments.items.filter(a => a.title || a.pages || a.copies).forEach((a, i) => {
      push({ type: "pagebreak" });
      const ref = [`Приложение № ${i + 1}`];
      if (refKind || refOrg) ref.push(`к ${[refKind, refOrg].filter(Boolean).join(" ")}`);
      const third = [st.date ? `от ${formatDate(st.date, "words")}` : (st.number ? "от ________" : ""),
        st.number ? `№ ${st.number}` : ""].filter(Boolean).join(" ");
      if (third) ref.push(third);

      ref.forEach(t => push(req(t, { ...zR, align: "left", req: "19" })));
      if (a.title) push(P({ runs: [R(a.title)], align: "center", ...zC, bold: st.boldTitle, before: extra * 4, keep: true }));
    });
  }

  return {
    page: { W, H, mL, mR, mT, mB, header: 10, footer: 10, tw },
    font: { family: st.font, pt, line: textLine },
    items,
    header: { number: st.numbering, emblem: emblemTop ? st.emblem : null, control: st.control },
    footer: { qr: st.qr || null, executor: st.executor.on && st.executor.asFooter ? execText : [], executorPt: pt - 2 },
    extra
  };
}
