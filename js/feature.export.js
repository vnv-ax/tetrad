

import {
  deriveFilename,
  buildMarkdown,
  normalizeDoc,
  docFromJson
} from "./export.helpers.js";

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 32768;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function hex6(color) {
  if (typeof color === "string" && /^#?[0-9a-fA-F]{6}$/.test(color)) {
    return color.replace("#", "").toUpperCase();
  }
  return "FFFF00";
}

function hexToRgb(color) {
  const h = hex6(color);
  return [ parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16) ];
}

function docxRuns(run, TextRun, ShadingType) {

  const parts = (run.text || "").split("\n");
  const out = [];
  parts.forEach((part, i) => {
    out.push(new TextRun({
      text: part,
      bold: run.bold || undefined,
      italics: run.italic || undefined,
      underline: run.underline ? {} : undefined,
      shading: run.highlight ? {
        type: ShadingType && ShadingType.CLEAR ? ShadingType.CLEAR : "clear",
        fill: hex6(run.highlight)
      } : undefined,
      size: 24,
      break: i > 0 ? 1 : undefined
    }));
  });
  return out;
}

function docxBlock(b, lib) {
  const {Paragraph: Paragraph, TextRun: TextRun, HeadingLevel: HeadingLevel, ShadingType: ShadingType} = lib;
  const runs = b.runs || [];
  if (b.kind === "heading") {
    const level = b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
    return new Paragraph({
      heading: level,
      children: runs.flatMap(r => docxRuns(r, TextRun, ShadingType))
    });
  }
  if (b.kind === "bullet") {
    return new Paragraph({
      bullet: {
        level: Math.min(b.level || 0, 2)
      },
      children: runs.flatMap(r => docxRuns(r, TextRun, ShadingType))
    });
  }
  if (b.kind === "numbered") {
    return new Paragraph({
      indent: {
        left: 360 * (b.level || 0) + 360
      },
      children: [ new TextRun({
        text: `${b.no}. `,
        size: 24
      }) ].concat(runs.flatMap(r => docxRuns(r, TextRun, ShadingType)))
    });
  }
  if (b.kind === "quote") {
    return new Paragraph({
      indent: {
        left: 567
      },
      children: runs.map(r => ({
        ...r,
        italic: true
      })).flatMap(r => docxRuns(r, TextRun, ShadingType)),
      spacing: {
        after: 120
      }
    });
  }
  if (b.kind === "rule") {
    return new Paragraph({
      border: {
        bottom: {
          style: "single",
          size: 6,
          color: "999999",
          space: 1
        }
      },
      spacing: {
        after: 120
      }
    });
  }
  return new Paragraph({
    children: runs.flatMap(r => docxRuns(r, TextRun, ShadingType)),
    spacing: {
      after: 120
    }
  });
}

async function buildDocxBlob(normDoc) {
  await ensureDocx();
  const lib = self.docx;
  const {Document: Document, Packer: Packer} = lib;
  const children = normDoc.blocks.map(b => docxBlock(b, lib));
  const doc = new Document({
    creator: "Тетрадь",
    title: normDoc.title,
    sections: [ {
      properties: {},
      children: children
    } ]
  });
  return Packer.toBlob(doc);
}

const PAGE_W = 210, PAGE_H = 297, MARGIN = 20;

function pdfTokens(runs) {

  const tokens = [];
  for (const r of runs) {
    const style = r.bold ? "bold" : "normal";
    const italic = !!r.italic;
    for (const piece of String(r.text || "").split("\n")) {
      if (piece) {
        for (const word of piece.split(/(\s+)/)) {
          if (!word) continue;
          tokens.push({
            text: word,
            style: style,
            italic: italic,
            highlight: r.highlight,
            underline: r.underline,
            space: /^\s+$/.test(word)
          });
        }
      }
      tokens.push({
        br: true
      });
    }
    if (tokens.length) tokens.pop();
  }
  return tokens;
}

function pdfDrawLine(doc, line, x0, y, size) {
  let x = x0;
  for (const t of line) {
    x += t.sepW;
    doc.setFont("PTSans", t.style);
    if (t.highlight) {
      const [ r, g, b ] = hexToRgb(t.highlight);
      doc.setFillColor(r, g, b);
      doc.rect(x - .4, y - size * .25, t.w + .8, size * .33, "F");
    }
    doc.setTextColor(20, 20, 20);
    doc.text(t.text, x, y);
    if (t.underline) {
      doc.setDrawColor(20, 20, 20);
      doc.setLineWidth(.25);
      doc.line(x, y + 1, x + t.w, y + 1);
    }
    x += t.w;
  }
}

function pdfParagraph(doc, normDoc, block, state) {
  const size = block.kind === "heading" ? (block.level === 1 ? 16 : block.level === 2 ? 14 : 12.5) : 11.5;
  const lineH = block.kind === "heading" ? size * .44 : size * .47;
  const indent = block.kind === "quote" ? 6 : block.kind === "bullet" ? 6 * ((block.level || 0) + 1) : block.kind === "numbered" ? 8 * ((block.level || 0) + 1) : 0;
  const x0 = MARGIN + indent;
  const maxW = PAGE_W - MARGIN * 2 - indent - (block.kind === "bullet" || block.kind === "numbered" ? 2 : 0);
  let tokens;
  if (block.kind === "bullet") tokens = pdfTokens(block.runs);
  else if (block.kind === "numbered") tokens = pdfTokens(block.runs);
  else tokens = pdfTokens(block.runs);
  if (block.kind === "quote") tokens.forEach(t => {
    if (!t.br) t.italic = true;
  });
  if (block.kind === "heading") tokens.forEach(t => {
    if (!t.br) t.style = "bold";
  });

  for (const t of tokens) {
    if (t.br) continue;
    doc.setFont("PTSans", t.style);
    doc.setFontSize(size);
    t.w = doc.getTextWidth(t.text);
  }
  const spaceW = (() => {
    doc.setFont("PTSans", "normal");
    doc.setFontSize(size);
    return doc.getTextWidth(" ");
  })();

  const lines = [];
  let line = [];
  let lineW = 0;
  const flush = () => {
    if (line.length) lines.push(line);
    line = [];
    lineW = 0;
  };
  for (const t of tokens) {
    if (t.br) {
      flush();
      continue;
    }
    if (t.space && !line.length) continue;
    const sepW = line.length ? spaceW : 0;
    if (line.length && lineW + sepW + t.w > maxW) {
      flush();
      if (t.space) continue;
      line.push({
        ...t,
        sepW: 0
      });
      lineW = t.w;
    } else {
      line.push({
        ...t,
        sepW: sepW
      });
      lineW += sepW + t.w;
    }
  }
  flush();
  if (!lines.length) {
    state.y += lineH * .6;
    return;
  }
  const need = lines.length * lineH;
  if (state.y + need > PAGE_H - MARGIN) {
    doc.addPage();
    state.y = MARGIN;
  }

  let marker = null;
  if (block.kind === "bullet") marker = "—"; else if (block.kind === "numbered") marker = `${block.no}.`;
  if (marker) {
    doc.setFont("PTSans", "normal");
    doc.setFontSize(size);
    doc.text(marker, MARGIN + (block.level || 0) * 6, state.y + size * .348);
  }
  for (const ln of lines) {
    pdfDrawLine(doc, ln, x0, state.y + size * .348, size);
    state.y += lineH;
  }
  state.y += block.kind === "heading" ? 2 : 1.4;
  void normDoc;
}

async function buildPdfBlob(normDoc) {
  const doc = await newPdfDoc();
  doc.setFont("PTSans", "normal");
  doc.setFontSize(11.5);
  const state = {
    y: MARGIN
  };
  for (const b of normDoc.blocks) {
    if (b.kind === "rule") {
      if (state.y + 6 > PAGE_H - MARGIN) {
        doc.addPage();
        state.y = MARGIN;
      }
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(.3);
      doc.line(MARGIN, state.y + 3, PAGE_W - MARGIN, state.y + 3);
      state.y += 6;
      continue;
    }
    pdfParagraph(doc, normDoc, b, state);
  }
  return doc.output("blob");
}

const loaded = {
  docx: false,
  pdfLib: null,
  fonts: null
};

async function ensureDocx() {
  if (loaded.docx) return;
  await (import("../lib/docx/docx.umd.js"));
  if (!self.docx) throw new Error("Библиотека DOCX не загрузилась");
  loaded.docx = true;
}

async function ensurePdfLib() {
  if (loaded.pdfLib) return loaded.pdfLib;
  await (import("../lib/jspdf/jspdf.umd.min.js"));
  const JsPdf = self.jspdf?.jsPDF;
  if (!JsPdf) throw new Error("Библиотека PDF не загрузилась");
  loaded.pdfLib = JsPdf;
  return JsPdf;
}

async function ensureFonts() {
  if (loaded.fonts) return loaded.fonts;
  const fonts = {};
  for (const [file, style] of [ [ "PTSans-Regular.ttf", "normal" ], [ "PTSans-Bold.ttf", "bold" ] ]) {
    const buf = await fetch(`../lib/fonts/${file}`).then(r => {
      if (!r.ok) throw new Error("Не удалось загрузить шрифт для PDF");
      return r.arrayBuffer();
    });
    fonts[style] = {
      name: file,
      base64: arrayBufferToBase64(buf)
    };
  }
  loaded.fonts = fonts;
  return fonts;
}

async function newPdfDoc() {
  const JsPdf = await ensurePdfLib();
  const fonts = await ensureFonts();
  const doc = new JsPdf({
    unit: "mm",
    format: "a4"
  });
  for (const style of [ "normal", "bold" ]) {
    doc.addFileToVFS(fonts[style].name, fonts[style].base64);
    doc.addFont(fonts[style].name, "PTSans", style);
  }
  return doc;
}

export function createExporter() {
  return {
    async init(format) {
      if (format === "docx") await ensureDocx(); else if (format === "pdf") await newPdfDoc();
    },
    async buildBlob(doc, format = "txt") {
      const text = (doc && doc.text) || "";
      if (!String(text).trim()) throw new Error("Текст пуст");
      switch (format) {
       case "txt":
        return new Blob([ text ], {
          type: "text/plain;charset=utf-8"
        });

       case "md":
        return new Blob([ buildMarkdown(text) ], {
          type: "text/markdown;charset=utf-8"
        });

       case "docx":
       case "pdf":
        {
          const normDoc = normalizeDoc(docFromJson(doc && doc.json), text);
          return format === "docx" ? buildDocxBlob(normDoc) : buildPdfBlob(normDoc);
        }

       default:
        throw new Error("Неизвестный формат: " + format);
      }
    },
    async run(doc, format = "txt") {
      const text = (doc && doc.text) || "";
      if (!String(text).trim()) throw new Error("Текст пуст — нечего экспортировать");
      const blob = await this.buildBlob(doc, format);
      download(blob, deriveFilename(text, format));
      return format;
    },
    destroy() {
      loaded.docx = false;
      loaded.pdfLib = null;
      loaded.fonts = null;
    }
  };
}
