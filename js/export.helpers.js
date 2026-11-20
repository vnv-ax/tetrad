

export function deriveFilename(text, ext) {
  let name = "";
  const first = (text || "").split("\n").map(l => l.trim()).find(Boolean);
  if (first && first.length <= 60 && !/^\d+\s*[-–—]?\s*$/.test(first)) {
    name = first.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  }
  if (!name) {
    const d = new Date;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    name = `document-${d.getFullYear()}-${mm}-${dd}`;
  }
  return `${name}.${ext}`;
}

function classify(lines) {
  return lines.map(raw => {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) return {
      kind: "empty",
      text: line
    };
    if (/^#{1,3}\s+/.test(t)) return {
      kind: "heading",
      level: t.match(/^#+/)[0].length,
      text: t.replace(/^#+\s+/, "")
    };
    if (/^[-*•]\s+/.test(t)) return {
      kind: "bullet",
      text: t.replace(/^[-*•]\s+/, "")
    };
    if (/^\d+[.)]\s+/.test(t)) return {
      kind: "numbered",
      text: t
    };
    const isShortStandalone = t.length <= 80 && !/[.,;:!?…]$/.test(t) && !/[.!?…]/.test(t.slice(0, -1));
    return {
      kind: "para",
      text: t,
      maybeTitle: isShortStandalone
    };
  });
}

export function buildMarkdown(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const items = classify(lines);
  const out = [];
  let firstParaDone = false;
  let prevEmpty = true;
  for (const it of items) {
    switch (it.kind) {
     case "empty":
      if (!prevEmpty) out.push("");
      prevEmpty = true;
      break;

     case "heading":
      if (!prevEmpty) out.push("");
      out.push(`${"#".repeat(Math.min(it.level, 3))} ${it.text}`, "");
      prevEmpty = true;
      firstParaDone = true;
      break;

     case "bullet":
      out.push(`- ${it.text}`);
      prevEmpty = false;
      break;

     case "numbered":
      out.push(it.text);
      prevEmpty = false;
      break;

     default:
      {
        if (!firstParaDone && it.maybeTitle) {
          out.push(`# ${it.text}`, "");
        } else {
          out.push(it.text, "");
        }
        firstParaDone = true;
        prevEmpty = true;
      }
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n\n").trim() + "\n";
}

export function textBlocks(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const items = classify(lines);
  const blocks = [];
  let titleUsed = false;
  for (const it of items) {
    if (it.kind === "empty") continue;
    if (!titleUsed && it.kind === "para" && it.maybeTitle) {
      blocks.push({
        kind: "heading",
        text: it.text,
        level: 1
      });
      titleUsed = true;
    } else if (it.kind === "heading") {
      blocks.push({
        kind: "heading",
        text: it.text,
        level: Math.min(it.level + 1, 3)
      });
    } else if (it.kind === "bullet") {
      blocks.push({
        kind: "bullet",
        text: it.text
      });
    } else {
      blocks.push({
        kind: "para",
        text: it.text
      });
    }
  }
  return blocks;
}

function nodeRuns(nodes) {
  const runs = [];
  for (const n of nodes || []) {
    if (n.type === "text") {
      const run = {
        text: n.text || "",
        bold: false,
        italic: false,
        underline: false,
        highlight: null
      };
      for (const m of n.marks || []) {
        if (m.type === "bold") run.bold = true; else if (m.type === "italic") run.italic = true; else if (m.type === "underline") run.underline = true; else if (m.type === "highlight") run.highlight = (m.attrs && m.attrs.color) || "#FFFF00";
      }
      const last = runs[runs.length - 1];
      const sig = `${run.bold}|${run.italic}|${run.underline}|${run.highlight}`;
      const lastSig = last ? `${last.bold}|${last.italic}|${last.underline}|${last.highlight}` : "";
      if (last && lastSig === sig) last.text += run.text; else runs.push(run);
    } else if (n.type === "hardBreak") {
      runs.push({
        text: "\n",
        bold: false,
        italic: false,
        underline: false,
        highlight: null
      });
    }

  }
  return runs;
}

function runsToPlain(runs) {
  return runs.map(r => r.text).join("");
}

const INLINE_ONLY = {
  kind: "para",
  runs: []
};

function normalizeBlocks(blocks) {

  const out = [];
  for (const b of blocks) {
    const empty = b.kind === "para" && !b.runs.length;
    if (empty && (out.length === 0 || (out[out.length - 1].kind === "para" && !out[out.length - 1].runs.length))) continue;
    out.push(b);
  }
  while (out.length && out[out.length - 1].kind === "para" && !out[out.length - 1].runs.length) out.pop();
  return out;
}

function collect(node, listDepth, blocks) {
  for (const n of node.content || []) {
    switch (n.type) {
     case "paragraph":
      blocks.push({
        kind: "para",
        runs: nodeRuns(n.content)
      });
      break;

     case "heading":
      blocks.push({
        kind: "heading",
        level: Math.min(Math.max((n.attrs && n.attrs.level) || 2, 1), 3),
        runs: nodeRuns(n.content)
      });
      break;

     case "bulletList":
      collectLists(n, listDepth, "bullet", blocks);
      break;

     case "orderedList":
      collectLists(n, listDepth, "numbered", blocks);
      break;

     case "blockquote":
      for (const q of n.content || []) {
        if (q.type === "paragraph") blocks.push({
          kind: "quote",
          runs: nodeRuns(q.content)
        }); else collect(q, listDepth, blocks);
      }
      break;

     case "horizontalRule":
      blocks.push({
        kind: "rule",
        runs: []
      });
      break;

     case "codeBlock":
      blocks.push({
        kind: "para",
        runs: nodeRuns(n.content).map(r => ({
          ...r,
          text: r.text.replace(/\n/g, "\n")
        }))
      });
      break;

     default:
      if (n.content) collect(n, listDepth, blocks); else blocks.push({
        ...INLINE_ONLY,
        runs: nodeRuns([ n ])
      });
    }
  }
  return blocks;
}

function collectLists(listNode, depth, kind, blocks) {
  let idx = 0;
  for (const item of listNode.content || []) {
    if (item.type !== "listItem") continue;
    idx += 1;
    let firstPara = true;
    for (const p of item.content || []) {
      if (p.type === "paragraph") {
        const runs = nodeRuns(p.content);
        if (firstPara) {
          firstPara = false;
          if (kind === "bullet") blocks.push({
            kind: "bullet",
            level: Math.min(depth, 2),
            runs: runs
          }); else blocks.push({
            kind: "numbered",
            level: Math.min(depth, 2),
            no: idx,
            runs: runs
          });
        } else blocks.push({
          kind: "para",
          runs: runs
        });
      } else if (p.type === "bulletList" || p.type === "orderedList") {
        collectLists(p, depth + 1, p.type === "bulletList" ? "bullet" : "numbered", blocks);
      } else collect(p, depth, blocks);
    }
  }
}

export function docFromJson(json) {
  if (!json || json.type !== "doc") return null;
  const blocks = collect(json, 0, []);
  const norm = normalizeBlocks(blocks);
  if (!norm.length) return null;
  return {
    blocks: norm,
    title: (norm.find(b => b.kind === "heading") || norm.find(b => b.kind === "para") || {
      runs: []
    }).runs.map(r => r.text).join("").trim().slice(0, 120) || "Документ",
    text: norm.map(b => {
      if (b.kind === "bullet") return `${"  ".repeat(b.level || 0)}— ${runsToPlain(b.runs)}`;
      if (b.kind === "numbered") return `${"  ".repeat(b.level || 0)}${b.no}. ${runsToPlain(b.runs)}`;
      if (b.kind === "rule") return "―――";
      return runsToPlain(b.runs);
    }).join("\n")
  };
}

export function docFromText(text) {
  return {
    blocks: textBlocks(text),
    title: (text || "").split("\n").map(l => l.trim()).find(Boolean) || "Документ",
    text: text
  };
}

export function normalizeDoc(doc, text) {
  if (doc && Array.isArray(doc.blocks) && doc.blocks.length) return doc;
  return docFromText(text || (doc && doc.text) || "");
}
