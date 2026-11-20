

import { lsGet, lsSet } from "./common.js";

  const TYPES = {
    "underline": "Подчеркнуть",
    "box": "Рамка",
    "circle": "Овал",
    "highlight": "Маркер",
    "strike-through": "Зачеркнуть",
    "crossed-off": "Крест",
    "bracket": "Скобки"
  };

  const PALETTE = [
    { c: "#ff5c5c", n: "Красный" },
    { c: "#ffb020", n: "Янтарь" },
    { c: "#43d17c", n: "Зелёный" },
    { c: "#4da3ff", n: "Синий" },
    { c: "#c48bff", n: "Лиловый" }
  ];

  const PREFS_KEY = "cabinet-handmark";
  const DRAW_MS = 750;
  const MAX_ITEMS = 500;

  let prefs = { type: "underline", color: PALETTE[0].c };
  try {
    const saved = JSON.parse(lsGet(PREFS_KEY) || "null");
    if (saved && TYPES[saved.type] && isValidColor(saved.color)) prefs = { type: saved.type, color: saved.color };
  } catch {}

  function isValidColor(c) {
    return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
  }

  function savePrefs() {
    lsSet(PREFS_KEY, JSON.stringify(prefs));
  }

  function setPrefs(patch) {
    if (patch.type && TYPES[patch.type]) prefs.type = patch.type;
    if (patch.color && isValidColor(patch.color)) prefs.color = patch.color;
    savePrefs();
  }

  const store = {
    editor: null,
    overlay: null,
    seq: 0,
    items: [],
    hosts: new Map(),
    raf: 0,
    ro: null,
    destroyed: false,
    pendingRestore: null
  };

  function lineRects(view, from, to) {
    let rawRects;
    try {
      const a = view.domAtPos(from);
      const b = view.domAtPos(to);
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      rawRects = textNodeRects(range);
    } catch { return []; }
    let lineH = 0;
    try {
      const caret = view.coordsAtPos(Math.min(from + 1, to));
      if (caret) lineH = caret.bottom - caret.top;
    } catch {}
    const maxH = lineH ? lineH * 2.2 : 0;
    const rows = [];
    for (const r of rawRects) {
      if (r.width < 1 || r.height < 2) continue;
      if (maxH && r.height > maxH) continue;
      rows.push(r);
    }
    rows.sort((x, y) => x.top - y.top || x.left - y.left);
    const lines = [];
    const sameRow = (p, q) => Math.abs(p.top - q.top) < 4 ||
      (Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)) > 0.4 * Math.min(p.bottom - p.top, q.bottom - q.top);
    for (const r of rows) {
      const last = lines[lines.length - 1];
      if (last && sameRow(last, r)) {
        last.left = Math.min(last.left, r.left);
        last.right = Math.max(last.right, r.right);
        last.top = Math.min(last.top, r.top);
        last.bottom = Math.max(last.bottom, r.bottom);
      } else {
        lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
    }
    return lines;
  }

  function textNodeRects(range) {
    if (range.collapsed) return [];
    const rects = [];
    for (const [node, s, e] of textSubRanges(range)) {
      try {
        const sub = document.createRange();
        sub.setStart(node, s);
        sub.setEnd(node, e);
        for (const r of sub.getClientRects()) rects.push(r);
      } catch {}
    }
    return rects;
  }

  function textSubRanges(range) {
    const out = [];
    const root = range.commonAncestorContainer;
    const rootEl = root.nodeType === Node.ELEMENT_NODE ? root : root.parentNode;
    if (!rootEl) return out;
    const startN = range.startContainer, endN = range.endContainer;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || !range.intersectsNode(n)) continue;
      let s = 0, e = n.nodeValue.length;
      if (n === startN) s = range.startOffset;
      if (n === endN) e = range.endOffset;
      if (n !== startN && n !== endN) {
        let p0 = 0, p1 = 0;
        try { p0 = range.comparePoint(n, 0); p1 = range.comparePoint(n, e); } catch { continue; }
        if (p1 === -1 || (p1 === 0 && p0 === -1)) continue;
        if (p0 === 1 || (p0 === 0 && p1 === 1)) continue;
      }
      if (e > s) out.push([n, s, e]);
    }
    return out;
  }

  const sameBoxes = (a, b) => a.length === b.length && a.every((x, i) =>
    Math.abs(x.left - b[i].left) <= 1 && Math.abs(x.top - b[i].top) <= 1 &&
    Math.abs(x.width - b[i].width) <= 1 && Math.abs(x.height - b[i].height) <= 1);

  function drawItem(item, overlayBox) {
    const lines = lineRects(store.editor.view, item.from, item.to);
    const boxes = lines.map(l => ({
      left: Math.round(l.left - overlayBox.left),
      top: Math.round(l.top - overlayBox.top),
      width: Math.round(l.right - l.left),
      height: Math.round(l.bottom - l.top)
    }));
    const entry = store.hosts.get(item.id);
    if (entry && sameBoxes(entry.boxes, boxes)) return;

    if (entry && entry.hosts.length === boxes.length) {
      entry.boxes = boxes;
      entry.hosts.forEach((h, i) => {
        h.el.style.left = boxes[i].left + "px";
        h.el.style.top = boxes[i].top + "px";
        h.el.style.width = boxes[i].width + "px";
        h.el.style.height = boxes[i].height + "px";
        h.ann.show();
      });
      return;
    }

    disposeEntry(entry);
    store.hosts.delete(item.id);
    if (!boxes.length) return;
    const hosts = boxes.map(b => {
      const el = document.createElement("i");
      el.className = "rn-host";
      el.style.left = b.left + "px";
      el.style.top = b.top + "px";
      el.style.width = b.width + "px";
      el.style.height = b.height + "px";
      store.overlay.appendChild(el);
      const ann = window.RoughNotation.annotate(el, {
        type: item.type,
        color: item.color,
        strokeWidth: 2,
        padding: 3,
        animate: true,
        animationDuration: DRAW_MS,
        iterations: 2
      });
      ann.show();
      return { el, ann };
    });
    store.hosts.set(item.id, { boxes, hosts });
  }

  function disposeEntry(entry) {
    if (!entry) return;
    for (const h of entry.hosts) {
      try { h.ann.remove(); } catch {}
      h.el.remove();
    }
  }

  function layout() {
    store.raf = 0;
    const ed = store.editor;
    if (!ed || store.destroyed || !store.overlay || !window.RoughNotation) return;
    const overlayBox = store.overlay.getBoundingClientRect();
    const size = ed.state.doc.content.size;
    const alive = new Set();
    for (const item of store.items) {
      if (item.to > item.from && item.to <= size) {
        alive.add(item.id);
        drawItem(item, overlayBox);
      }
    }
    for (const id of Array.from(store.hosts.keys())) {
      if (!alive.has(id)) {
        disposeEntry(store.hosts.get(id));
        store.hosts.delete(id);
      }
    }
  }

  function queueLayout() {
    if (store.raf || store.destroyed) return;
    store.raf = requestAnimationFrame(layout);
  }

  function remap(mapping) {
    if (!store.items.length) return;
    const doc = store.editor.state.doc;
    const kept = [];
    for (const item of store.items) {

      const from = mapping.map(item.from, 1);
      const to = mapping.map(item.to, -1);
      if (to <= from) continue;
      item.from = Math.max(0, Math.min(from, doc.content.size));
      item.to = Math.max(item.from, Math.min(to, doc.content.size));
      item.text = doc.textBetween(item.from, item.to, "\n");
      kept.push(item);
    }
    store.items = kept;
  }

  function toggleHits(from, to) {
    const hits = [];
    for (const m of store.items) {
      const inter = Math.min(to, m.to) - Math.max(from, m.from);
      if (inter <= 0) continue;
      const selInside = from >= m.from && to <= m.to;
      const markInside = m.from >= from && m.to <= to;
      if (selInside || markInside || inter * 2 >= m.to - m.from) hits.push(m.id);
    }
    return hits;
  }

  function removeByIds(ids) {
    if (!ids.length) return 0;
    const dead = new Set(ids);
    store.items = store.items.filter(m => !dead.has(m.id));
    notifyChange();
    queueLayout();
    return dead.size;
  }

  function addOrToggle(from, to, attrs) {
    const hits = toggleHits(from, to);
    if (hits.length) {
      removeByIds(hits);
      return null;
    }
    return addItem(from, to, attrs);
  }

  function eraseRange(from, to) {
    if (!store.editor) return 0;
    const size = store.editor.state.doc.content.size;
    const a = Math.max(0, Math.min(from, size));
    const b = Math.max(0, Math.min(to, size));
    const kept = [];
    let removed = 0;
    for (const m of store.items) {
      if (Math.min(b, m.to) - Math.max(a, m.from) > 0) removed++; else kept.push(m);
    }
    if (removed) {
      store.items = kept;
      notifyChange();
      queueLayout();
    }
    return removed;
  }

  function addItem(from, to, attrs) {
    const ed = store.editor;
    if (!ed || !(to > from)) return null;
    const doc = ed.state.doc;
    if (from < 0 || to > doc.content.size) return null;
    const text = doc.textBetween(from, to, "\n");
    if (!text.trim()) return null;
    if (store.items.length >= MAX_ITEMS) return null;
    const a = attrs || {};
    const item = {
      id: "hm" + (++store.seq) + "-" + Math.random().toString(36).slice(2, 8),
      from,
      to,
      type: TYPES[a.type] ? a.type : prefs.type,
      color: isValidColor(a.color) ? a.color : prefs.color,
      text
    };
    store.items.push(item);
    notifyChange();
    queueLayout();
    return item;
  }

  function clearAll() {
    if (!store.items.length) return false;
    store.items = [];
    notifyChange();
    queueLayout();
    return true;
  }

  function notifyChange() {

    if (typeof HandMarks?.onChange === "function") {
      try { HandMarks.onChange(); } catch {}
    }
  }

  function attach(editor) {
    store.editor = editor;
    const scroller = editor.view.dom.closest(".sheet-scroll") || editor.view.dom.parentElement;
    const overlay = document.createElement("div");
    overlay.className = "rn-overlay";
    overlay.setAttribute("aria-hidden", "true");
    if (scroller) {

      scroller.insertBefore(overlay, scroller.firstElementChild);
    }
    store.overlay = overlay;
    if ("ResizeObserver" in window) {
      store.ro = new ResizeObserver(() => queueLayout());
      store.ro.observe(editor.view.dom);
    }
    window.addEventListener("resize", queueLayout, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => queueLayout()).catch(() => {});
    if (store.pendingRestore !== null) {
      const pending = store.pendingRestore;
      store.pendingRestore = null;
      restore(pending);
    }
    queueLayout();
  }

  function destroy() {
    store.destroyed = true;
    if (store.ro) { store.ro.disconnect(); store.ro = null; }
    window.removeEventListener("resize", queueLayout);
    for (const entry of store.hosts.values()) disposeEntry(entry);
    store.hosts.clear();
    store.items = [];
    if (store.overlay) { store.overlay.remove(); store.overlay = null; }
  }

  function makeExtension() {
    const HandMarkExt = window.TipTapLib.Extension.create({
      name: "handMark",
      addCommands() {
        return {

          addHandMark: attrs => ({ editor }) => {
            const { from, to } = editor.state.selection;
            if (from === to) return false;
            addOrToggle(from, to, attrs);
            return true;
          },

          clearHandMarks: () => () => clearAll()
        };
      },
      onCreate() {
        attach(this.editor);
      },
      onTransaction({ transaction }) {
        if (!store.editor || store.destroyed) return;
        if (transaction.docChanged) remap(transaction.mapping);
        queueLayout();
      },
      onDestroy() {
        destroy();
      }
    });
    return HandMarkExt;
  }

  function serialize() {
    return {
      v: 1,
      items: store.items.map(it => ({ id: it.id, from: it.from, to: it.to, type: it.type, color: it.color, text: it.text }))
    };
  }

  function restore(data) {
    if (!store.editor) {
      store.pendingRestore = data || null;
      return;
    }
    store.items = [];
    store.seq = 0;
    const doc = store.editor.state.doc;
    if (data && Array.isArray(data.items)) {
      let dropped = 0;
      for (const raw of data.items.slice(0, MAX_ITEMS)) {
        try {
          const from = Math.round(Number(raw.from));
          const to = Math.round(Number(raw.to));
          if (!(from >= 1 && to > from && to <= doc.content.size)) { dropped++; continue; }
          const $f = doc.resolve(from);
          const $t = doc.resolve(to);
          if (!$f.parent.isTextblock || !$t.parent.isTextblock) { dropped++; continue; }
          const text = doc.textBetween(from, to, "\n");
          if (typeof raw.text === "string" && text !== raw.text) { dropped++; continue; }
          if (!TYPES[raw.type] || !isValidColor(raw.color)) { dropped++; continue; }
          store.items.push({
            id: String(raw.id || "hm" + (++store.seq) + "-r"),
            from,
            to,
            type: raw.type,
            color: raw.color,
            text
          });
        } catch { dropped++; }
      }
      if (dropped) console.info("Рукописные пометки: " + dropped + " не восстановлено (текст не сошёлся)");
    }
    queueLayout();
  }

  export const HandMarks = {
    extension: () => window.TipTapLib ? makeExtension() : null,
    types: TYPES,
    palette: PALETTE,
    prefs,
    setPrefs,
    add: (from, to, attrs) => addItem(from, to, attrs),

    toggle: (from, to, attrs) => addOrToggle(from, to, attrs),

    erase: (from, to) => eraseRange(from, to),
    clear: () => clearAll(),
    count: () => store.items.length,
    items: () => store.items.slice(),
    serialize,
    restore,
    relayout: () => queueLayout(),

    onChange: null
  };
