
import { mmTwip, mmPx } from "./gost.model.js";

let libp = null;
export function loadDocx() {
  if (self.docx) return Promise.resolve(self.docx);
  if (!libp) libp = import(  new URL("../lib/docx/docx.umd.js", import.meta.url).href)
    .then(() => { if (!self.docx) throw new Error("Библиотека DOCX не загрузилась (lib/docx/docx.umd.js)"); return self.docx; });
  return libp;
}
const imgType = src => /^data:image\/jpe?g/i.test(src) ? "jpg" : /^data:image\/gif/i.test(src) ? "gif" : /^data:image\/bmp/i.test(src) ? "bmp" : "png";
function imgData(src) {
  const bin = atob(String(src).split(",")[1] || "");
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export async function exportDocx(L, st) {
  const D = await loadDocx();
  const { Document, Packer, Paragraph, TextRun, AlignmentType, TabStopType, Header, Footer, PageNumber,
    LineRuleType, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, NumberFormat } = D;
  const A = AlignmentType, family = L.font.family, base = L.font.pt * 2;
  const tw = L.page.tw, right = mmTwip(tw);
  const align = a => a === "center" ? A.CENTER : a === "right" ? A.RIGHT : a === "justify" ? A.JUSTIFIED : A.LEFT;
  const runs = (arr, bold, pt) => (arr || []).flatMap(r => String(r.text).split("\n").map((t, i) =>
    new TextRun({ text: t, bold: !!(r.bold || bold), italics: !!r.italic, underline: r.underline ? {} : undefined,
      font: family, size: (pt || L.font.pt) * 2, break: i ? 1 : undefined })));

  const para = it => {
    const kids = runs(it.runs, it.bold, it.pt);
    const tabs = (it.tab || []).filter(t => t.text).map(t => {
      kids.push(new TextRun({ text: "\t" + t.text, font: family, size: (it.pt || L.font.pt) * 2 }));
      return { type: t.align === "center" ? TabStopType.CENTER : t.align === "right" ? TabStopType.RIGHT : TabStopType.LEFT,
        position: mmTwip(t.pos) };
    });
    return new Paragraph({
      alignment: align(it.align),
      indent: { left: mmTwip(it.indL || 0), right: mmTwip(it.indR || 0),
        firstLine: it.first ? mmTwip(it.first) : undefined, hanging: it.hang ? mmTwip(it.hang) : undefined },
      spacing: { line: Math.round(240 * (it.line || 1)), lineRule: LineRuleType.AUTO,
        before: Math.round((it.before || 0) * 56.7), after: Math.round((it.after || 0) * 56.7) },
      keepLines: !!it.keep, keepNext: !!it.keep, tabStops: tabs.length ? tabs : undefined,
      children: kids.length ? kids : [new TextRun({ text: "", font: family, size: base })]
    });
  };
  const image = it => new Paragraph({
    alignment: it.align === "center" ? A.CENTER : it.align === "right" ? A.RIGHT : A.LEFT,
    spacing: { before: Math.round((it.before || 0) * 56.7), line: 240, lineRule: LineRuleType.AUTO },
    children: [new ImageRun({ type: imgType(it.src), data: imgData(it.src),
      transformation: { width: Math.round(mmPx(it.wMm)), height: Math.round(mmPx(it.hMm)) } })]
  });
  const stamp = it => it.lines.map((t, i) => new Paragraph({
    alignment: A.LEFT,
    spacing: { line: 240, lineRule: LineRuleType.AUTO, before: i ? 0 : Math.round((it.before || 0) * 56.7) },
    indent: { right: mmTwip(Math.max(0, tw - it.wMm)) },
    border: { top: { color: "000000", space: 2, style: "single", size: 4 }, bottom: { color: "000000", space: 2, style: "single", size: 4 },
      left: { color: "000000", space: 4, style: "single", size: 4 }, right: { color: "000000", space: 4, style: "single", size: 4 } },
    children: [new TextRun({ text: t, font: family, size: it.pt * 2 })]
  }));
  const noB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

  const cols = it => {
    const colsArr = it.cols || [{ w: it.leftW, items: it.left }, { w: it.rightW, items: it.right }];
    const row = [];
    colsArr.forEach((c, i) => {
      if (i && it.gap > 0) row.push(new TableCell({ width: { size: mmTwip(it.gap), type: WidthType.DXA }, borders: { top: noB, bottom: noB, left: noB, right: noB }, children: [new Paragraph("")] }));
      row.push(new TableCell({ width: { size: mmTwip(c.w), type: WidthType.DXA }, borders: { top: noB, bottom: noB, left: noB, right: noB },
        children: c.items.length ? c.items.map(x => x.type === "image" ? image(x) : para(x)) : [new Paragraph("")] }));
    });
    return new Table({
      width: { size: mmTwip(tw), type: WidthType.DXA },
      borders: { top: noB, bottom: noB, left: noB, right: noB, insideHorizontal: noB, insideVertical: noB },
      rows: [new TableRow({ children: row })]
    });
  };

  const children = [];
  L.items.forEach((it, i) => {
    if (it.type === "pagebreak") { children.push(new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: "", font: family, size: base })] })); return; }
    if (it.type === "cols") {
      children.push(cols(it));

      if (L.items[i + 1]?.type === "cols")
        children.push(new Paragraph({ spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
          children: [new TextRun({ text: "", font: family, size: 2 })] }));
      return;
    }
    if (it.type === "image") { children.push(image(it)); return; }
    if (it.type === "stamp") { children.push(...stamp(it)); return; }
    children.push(para(it));
  });
  if (!children.length) children.push(new Paragraph(""));

  const empty = () => new Paragraph({ children: [new TextRun({ text: "", font: family, size: base })] });
  const firstHeaderKids = [];
  if (L.header.emblem) firstHeaderKids.push(image({ type: "image", src: L.header.emblem.dataUrl, wMm: L.header.emblem.wMm, hMm: L.header.emblem.hMm, align: "center", before: 0 }));
  if (L.header.control) firstHeaderKids.push(new Paragraph({ alignment: A.LEFT, children: [new TextRun({ text: "Контроль", font: family, size: base })] }));
  if (!firstHeaderKids.length) firstHeaderKids.push(empty());

  const footRuns = [];
  if (L.footer.executor.length) footRuns.push(new TextRun({ text: L.footer.executor.join(", "), font: family, size: L.footer.executorPt * 2 }));
  const firstFootKids = [];
  if (L.footer.qr || footRuns.length) {
    const kids = footRuns.slice();
    if (L.footer.qr) {
      if (kids.length) kids.push(new TextRun({ text: "\t", font: family, size: base }));
      kids.push(new ImageRun({ type: imgType(L.footer.qr.dataUrl), data: imgData(L.footer.qr.dataUrl),
        transformation: { width: Math.round(mmPx(L.footer.qr.wMm)), height: Math.round(mmPx(L.footer.qr.hMm)) } }));
    }
    firstFootKids.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: right }],
      spacing: { line: 240, lineRule: LineRuleType.AUTO }, children: kids }));
  } else firstFootKids.push(empty());

  const props = {
    titlePage: true,
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: mmTwip(L.page.mT), right: mmTwip(L.page.mR), bottom: mmTwip(L.page.mB), left: mmTwip(L.page.mL),
        header: mmTwip(L.page.header), footer: mmTwip(L.page.footer) }
    }
  };
  if (NumberFormat) props.page.pageNumbers = { start: 1, formatType: NumberFormat.DECIMAL };

  const doc = new Document({
    creator: "Приёмная · ГОСТ-конструктор",
    title: st.title || "Документ",
    description: "Оформление по ГОСТ Р 7.0.97-2025",
    styles: { default: { document: { run: { font: family, size: base },
      paragraph: { spacing: { line: Math.round(240 * L.font.line), lineRule: LineRuleType.AUTO } } } } },
    sections: [{
      properties: props,
      headers: {
        first: new Header({ children: firstHeaderKids }),
        default: new Header({ children: [new Paragraph({ alignment: A.CENTER,
          spacing: { line: 240, lineRule: LineRuleType.AUTO },
          children: L.header.number ? [new TextRun({ children: [PageNumber.CURRENT], font: family, size: base })] : [new TextRun({ text: "", font: family, size: base })] })] })
      },
      footers: {
        first: new Footer({ children: firstFootKids }),
        default: new Footer({ children: [L.footer.executor.length
          ? new Paragraph({ spacing: { line: 240, lineRule: LineRuleType.AUTO }, children: footRuns })
          : empty()] })
      },
      children
    }]
  });
  return Packer.toBlob(doc);
}
