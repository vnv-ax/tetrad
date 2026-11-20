
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
const mm = v => `${v}mm`;

function runsInto(node, runs, bold) {
  runs.forEach(r => {
    if (r.text === "\n") { node.appendChild(document.createElement("br")); return; }
    const need = r.bold || r.italic || r.underline || bold;
    if (!need) { node.appendChild(document.createTextNode(r.text)); return; }
    const s = document.createElement(r.bold || bold ? "strong" : "span");
    if (r.italic) s.style.fontStyle = "italic";
    if (r.underline) s.style.textDecoration = "underline";
    s.textContent = r.text;
    node.appendChild(s);
  });
}
function paraNode(it, L, colW) {
  const n = el("div", `gp al-${it.align}`);
  if (it.req) n.dataset.req = it.req;
  n.style.marginLeft = mm(it.indL); n.style.marginRight = mm(it.indR);
  n.style.textIndent = mm((it.first || 0) - (it.hang || 0));
  n.style.marginTop = mm(it.before || 0); n.style.marginBottom = mm(it.after || 0);
  n.style.lineHeight = String(it.line || 1);
  if (it.pt) n.style.fontSize = `${it.pt}pt`;
  runsInto(n, it.runs || [], it.bold);

  const boxW = (colW ?? L.page.tw) - (it.indL || 0) - (it.indR || 0);
  (it.tab || []).forEach(t => {
    if (!t.text) return;
    const s = el("span");
    s.style.position = "absolute"; s.style.top = "0";
    s.style.whiteSpace = "pre";
    if (t.align === "right") { s.style.right = mm(Math.max(0, boxW - t.pos)); }
    else if (t.align === "center") { s.style.left = mm(t.pos); s.style.transform = "translateX(-50%)"; }
    else { s.style.left = mm(t.pos); }
    s.textContent = t.text;
    n.appendChild(s);
  });
  return n;
}
function itemNode(it, L, colW) {
  if (it.type === "para") return paraNode(it, L, colW);
  if (it.type === "cols") {
    const colsArr = it.cols || [{ w: it.leftW, items: it.left }, { w: it.rightW, items: it.right }];
    const wrap = el("div", "gs-cols");
    wrap.style.marginTop = mm(Math.max(0, ...colsArr.map(c => c.items[0]?.before || 0)));
    colsArr.forEach((c, i) => {
      if (i && it.gap > 0) { const g = el("div"); g.style.width = mm(it.gap); g.style.flex = "0 0 auto"; wrap.appendChild(g); }
      const col = el("div", "gs-col"); col.style.width = mm(c.w);
      c.items.forEach((x, j) => { const p = itemNode(x, L, c.w); if (j === 0) p.style.marginTop = "0"; col.appendChild(p); });
      wrap.appendChild(col);
    });
    return wrap;
  }
  if (it.type === "image") {
    const w = el("div", "gs-img"); w.style.marginTop = mm(it.before || 0);
    w.style.justifyContent = it.align === "center" ? "center" : it.align === "right" ? "flex-end" : "flex-start";
    const img = document.createElement("img"); img.src = it.src; img.alt = "";
    img.style.width = mm(it.wMm); img.style.height = mm(it.hMm);
    w.appendChild(img); return w;
  }
  if (it.type === "stamp") {
    const b = el("div", "gs-stamp"); b.style.marginTop = mm(it.before || 0); b.style.width = mm(it.wMm);
    b.style.fontSize = `${it.pt}pt`; b.style.lineHeight = "1";
    it.lines.forEach((t, i) => { const p = el("div", "gp al-left"); p.textContent = t; if (i) p.style.marginTop = "1mm"; b.appendChild(p); });
    return b;
  }
  return el("div");
}
function groups(items) {
  const out = []; let cur = null;
  items.forEach(it => {
    if (it.type === "pagebreak") { out.push({ break: true }); cur = null; return; }
    if (it.keep) { if (!cur) { cur = { items: [] }; out.push(cur); } cur.items.push(it); }
    else { cur = null; out.push({ items: [it] }); }
  });
  return out;
}

export function renderPreview(host, L, st, previewFamily) {
  host.textContent = "";
  const inner = el("div", "gs-stage-inner");
  const pages = el("div", "gs-pages");
  inner.appendChild(pages); host.appendChild(inner);
  const { page } = L;
  let pageEl = null, bodyEl = null, count = 0;

  const newPage = () => {
    pageEl = el("div", "gs-page");
    pageEl.dataset.guides = st.guides ? "1" : "0";
    pageEl.style.setProperty("--ml", mm(page.mL)); pageEl.style.setProperty("--mr", mm(page.mR));
    pageEl.style.setProperty("--mt", mm(page.mT)); pageEl.style.setProperty("--mb", mm(page.mB));
    pageEl.style.setProperty("--docfont", previewFamily || `"PT Astra Serif", "Times New Roman", serif`);
    pageEl.style.setProperty("--docpt", `${L.font.pt}pt`);
    pageEl.style.setProperty("--docline", String(L.font.line));
    bodyEl = el("div", "gs-body");
    pageEl.appendChild(bodyEl);
    const gm = el("div", "gs-guide gs-gm"); pageEl.appendChild(gm);
    const zone = st.layout === "corner" ? 80 : 120;
    [[page.mL, zone, "зона реквизитов"], [page.W - page.mR - zone, zone, "адресат / грифы"]].forEach(([x, w, label]) => {
      const z = el("div", "gs-guide gs-gz");
      z.style.left = mm(x); z.style.width = mm(w); z.style.top = mm(page.mT); z.style.height = "60mm";
      const t = el("span", "gs-gl"); t.textContent = `${label} · ${w} мм`; t.style.left = "0"; t.style.top = "-4mm";
      z.appendChild(t); pageEl.appendChild(z);
    });
    const pn = el("div", "gs-pnum"); pn.textContent = `лист ${count + 1}`; pageEl.appendChild(pn);
    if (count === 0) {
      if (L.header.emblem) { const e = el("div", "gs-emblem"); const i = document.createElement("img");
        i.src = L.header.emblem.dataUrl; i.alt = ""; i.style.width = mm(L.header.emblem.wMm); i.style.height = mm(L.header.emblem.hMm);
        e.appendChild(i); pageEl.appendChild(e); }
      if (L.header.control) { const c = el("div", "gs-ctrl"); c.textContent = "Контроль"; pageEl.appendChild(c); }
      if (L.footer.qr || L.footer.executor.length) {
        const f = el("div", "gs-foot");
        const t = el("div", "gs-foot-e"); t.style.fontSize = `${L.footer.executorPt}pt`;
        t.textContent = L.footer.executor.join(", "); f.appendChild(t);
        if (L.footer.qr) { const i = document.createElement("img"); i.src = L.footer.qr.dataUrl; i.alt = "";
          i.style.width = mm(L.footer.qr.wMm); i.style.height = mm(L.footer.qr.hMm); f.appendChild(i); }
        pageEl.appendChild(f);
      }
    } else if (L.header.number) {
      const n = el("div", "gs-pageno"); n.textContent = String(count + 1); pageEl.appendChild(n);
    }
    pages.appendChild(pageEl); count++;
    return bodyEl;
  };

  newPage();
  const overflow = b => b.scrollHeight > b.clientHeight + 1;
  groups(L.items).forEach(g => {
    if (g.break) { newPage(); return; }
    const wrap = el("div", g.items.length > 1 ? "gs-keep" : "");
    g.items.forEach(it => wrap.appendChild(itemNode(it, L)));
    bodyEl.appendChild(wrap);
    if (overflow(bodyEl)) {
      if (bodyEl.children.length > 1) { bodyEl.removeChild(wrap); newPage(); bodyEl.appendChild(wrap); }
      if (overflow(bodyEl) && wrap.children.length > 1) {
        const kids = [...wrap.children];
        bodyEl.removeChild(wrap);
        kids.forEach(k => { bodyEl.appendChild(k); if (overflow(bodyEl) && bodyEl.children.length > 1) { bodyEl.removeChild(k); newPage(); bodyEl.appendChild(k); } });
      }
    }
  });
  if (!L.items.length) { const e = el("div", "gs-empty"); e.textContent = "Документ пуст — заполните блоки справа"; bodyEl.appendChild(e); }
  return { pages: count, inner };
}
