

  const MAX_ITEMS = 300;

  const store = {
    editor: null,
    overlay: null,
    pop: null,
    popFor: null,
    seq: 0,
    items: [],
    hosts: new Map(),
    raf: 0,
    fallback: 0,
    ro: null,
    destroyed: false,
    pendingRestore: null
  };

  const SVG_BOOKMARK = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M168 32H88A24 24 0 0 0 64 56V224a8 8 0 0 0 12.24 6.78L128 199.42l51.77 31.36A8 8 0 0 0 192 224V56A24 24 0 0 0 168 32Zm8 177.11-43.76-26.53a8 8 0 0 0-8.23 0L80 209.11V56a8 8 0 0 1 8-8h80a8 8 0 0 1 8 8Z"></path></svg>';

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
    if (entry && sameBoxes(entry.boxes, boxes)) {
      updatePin(item);
      return;
    }

    if (entry) { entry.el.remove(); store.hosts.delete(item.id); }
    if (!boxes.length) return;

    const el = document.createElement("i");
    el.className = "bm-host";
    el.dataset.bmId = item.id;
    el.style.left = boxes[0].left + "px";
    el.style.top = boxes[0].top + "px";
    el.style.width = Math.max(...boxes.map(b => b.left + b.width)) - boxes[0].left + "px";
    el.style.height = Math.max(...boxes.map(b => b.top + b.height)) - boxes[0].top + "px";

    for (const b of boxes) {
      const stripe = document.createElement("u");
      stripe.style.left = `${b.left - boxes[0].left}px`;
      stripe.style.top = `${b.top - boxes[0].top}px`;
      stripe.style.width = `${b.width}px`;
      stripe.style.height = `${b.height}px`;
      el.appendChild(stripe);
    }
    store.overlay.appendChild(el);
    store.hosts.set(item.id, { boxes, el });

    updatePin(item, boxes[0].top);
  }

  function updatePin(item, top) {
    let pin = store.overlay.querySelector(`.bm-pin[data-bm-id="${item.id}"]`);
    if (!pin) {
      pin = document.createElement("button");
      pin.type = "button";
      pin.className = "bm-pin";
      pin.dataset.bmId = item.id;
      pin.innerHTML = SVG_BOOKMARK;
      pin.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        openPop(item.id);
      });
      store.overlay.appendChild(pin);
    }
    if (top != null) pin.style.top = `${Math.round(top)}px`;
    pin.dataset.tip = item.comment ? "Закладка: открыть комментарий" : "Закладка: написать комментарий";
    pin.setAttribute("aria-label", pin.dataset.tip);
    if (item.comment) pin.classList.add("has-note"); else pin.classList.remove("has-note");
  }

  function layout() {
    store.raf = 0;
    clearTimeout(store.fallback);
    const ed = store.editor;
    if (!ed || store.destroyed || !store.overlay) return;
    const overlayBox = store.overlay.getBoundingClientRect();
    const size = ed.state.doc.content.size;
    const alive = new Set();
    for (const item of store.items) {
      if (item.to > item.from && item.to <= size) {
        alive.add(item.id);
        drawItem(item, overlayBox);
      }
    }
    for (const [id, entry] of Array.from(store.hosts)) {
      if (!alive.has(id)) {
        entry.el.remove();
        store.hosts.delete(id);
      }
    }
    for (const el of Array.from(store.overlay.querySelectorAll(".bm-pin"))) {
      if (!alive.has(el.dataset.bmId)) el.remove();
    }

    const stacked = Array.from(store.overlay.querySelectorAll(".bm-pin"))
      .sort((a, b) => parseInt(a.style.top) - parseInt(b.style.top));
    let lastTop = -100;
    for (const el of stacked) {
      let top = parseInt(el.style.top);
      if (top - lastTop < 22) top = lastTop + 22;
      el.style.top = `${top}px`;
      lastTop = top;
    }
    if (store.popFor && !alive.has(store.popFor)) closePop();
    else if (store.popFor) positionPop();
  }

  function queueLayout() {
    if (store.raf || store.destroyed) return;

    store.raf = requestAnimationFrame(() => { clearTimeout(store.fallback); layout(); });
    store.fallback = setTimeout(() => { cancelAnimationFrame(store.raf); layout(); }, 200);
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

  function notifyChange() {
    if (typeof Bookmarks?.onChange === "function") {
      try { Bookmarks.onChange(); } catch {}
    }
  }

  function addItem(from, to) {
    const ed = store.editor;
    if (!ed || !(to > from)) return null;
    const doc = ed.state.doc;
    if (from < 0 || to > doc.content.size) return null;
    const text = doc.textBetween(from, to, "\n");
    if (!text.trim()) return null;
    const hit = store.items.find(m => Math.min(to, m.to) - Math.max(from, m.from) > 0);
    if (hit) return hit.id;
    if (store.items.length >= MAX_ITEMS) return null;
    const item = {
      id: "bm" + (++store.seq) + "-" + Math.random().toString(36).slice(2, 8),
      from,
      to,
      comment: "",
      text
    };
    store.items.push(item);
    notifyChange();
    queueLayout();
    return item.id;
  }

  function setComment(id, comment) {
    const item = store.items.find(i => i.id === id);
    if (!item) return false;
    item.comment = String(comment || "");
    notifyChange();
    queueLayout();
    return true;
  }

  function removeById(id) {
    const before = store.items.length;
    store.items = store.items.filter(i => i.id !== id);
    if (store.items.length === before) return false;
    notifyChange();
    queueLayout();
    return true;
  }

  function clearAll() {
    if (!store.items.length) return false;
    store.items = [];
    notifyChange();
    queueLayout();
    return true;
  }

  function ensurePop() {
    if (store.pop) return store.pop;
    const pop = document.createElement("div");
    pop.className = "pop bm-pop";
    pop.hidden = true;
    pop.innerHTML =
      '<p class="pop-label">Закладка</p>' +
      '<textarea class="bm-note" rows="3" placeholder="Комментарий к выделенному тексту…"></textarea>' +
      '<div class="bm-pop-tools">' +
      '<button type="button" class="chip-btn bm-del">Удалить</button>' +
      '<span class="bm-pop-spacer"></span>' +
      '<button type="button" class="chip-btn bm-save">Сохранить</button>' +
      "</div>";
    document.body.appendChild(pop);
    const ta = pop.querySelector(".bm-note");
    pop.querySelector(".bm-save").addEventListener("click", () => {
      if (store.popFor) {
        setComment(store.popFor, ta.value.trim());
        try { window.dispatchEvent(new CustomEvent("bm-toast", { detail: "Комментарий сохранён" })); } catch {}
      }
      closePop();
    });
    pop.querySelector(".bm-del").addEventListener("click", () => {
      if (store.popFor) {
        removeById(store.popFor);
        try { window.dispatchEvent(new CustomEvent("bm-toast", { detail: "Закладка удалена" })); } catch {}
      }
      closePop();
    });
    pop.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.stopPropagation(); closePop(); }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        pop.querySelector(".bm-save").click();
      }
    });
    store.pop = pop;
    return pop;
  }

  function positionPop() {
    if (!store.pop || !store.popFor) return;
    const ed = store.editor;
    if (!ed) return;
    const item = store.items.find(i => i.id === store.popFor);
    if (!item) return;
    let rect;
    try {
      const coords = ed.view.coordsAtPos(item.from);
      rect = { left: coords.left, top: coords.top, bottom: coords.bottom };
    } catch { return; }
    const pop = store.pop;
    const pw = pop.offsetWidth || 240, ph = pop.offsetHeight || 160;
    let x = rect.left - 30;
    x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
    let y = rect.bottom + 8;
    if (y + ph > window.innerHeight - 8) y = Math.max(8, rect.top - ph - 8);
    pop.style.left = `${Math.round(x)}px`;
    pop.style.top = `${Math.round(y)}px`;
  }

  function openPop(id) {
    const pop = ensurePop();
    const item = store.items.find(i => i.id === id);
    if (!item) return;
    store.popFor = id;
    pop.querySelector(".bm-note").value = item.comment || "";
    pop.hidden = false;
    positionPop();
    requestAnimationFrame(positionPop);
    pop.querySelector(".bm-note").focus();
  }

  function closePop() {
    if (!store.pop || store.pop.hidden) return;
    store.pop.hidden = true;
    store.popFor = null;
  }

  function attach(editor) {
    store.editor = editor;
    const scroller = editor.view.dom.closest(".sheet-scroll") || editor.view.dom.parentElement;
    const overlay = document.createElement("div");
    overlay.className = "bm-overlay";
    overlay.setAttribute("aria-label", "Закладки");
    if (scroller) {

      scroller.insertBefore(overlay, scroller.firstElementChild);
    }
    store.overlay = overlay;
    if ("ResizeObserver" in window) {
      store.ro = new ResizeObserver(() => queueLayout());
      store.ro.observe(editor.view.dom);
    }
    window.addEventListener("resize", queueLayout, { passive: true });

    editor.view.dom.addEventListener("click", e => {
      let pos = null;
      try { pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY }); } catch {}
      if (pos == null) return;
      const hit = store.items.find(i => pos.pos >= i.from && pos.pos <= i.to);
      if (hit) { e.preventDefault(); openPop(hit.id); }
    });

    document.addEventListener("pointerdown", e => {
      if (!store.pop || store.pop.hidden) return;
      if (store.pop.contains(e.target)) return;
      if (store.overlay && store.overlay.contains(e.target)) return;
      closePop();
    }, true);
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
    for (const entry of store.hosts.values()) entry.el.remove();
    store.hosts.clear();
    store.items = [];
    if (store.overlay) { store.overlay.remove(); store.overlay = null; }
    if (store.pop) { store.pop.remove(); store.pop = null; }
  }

  function makeExtension() {
    return window.TipTapLib.Extension.create({
      name: "bookmark",
      addCommands() {
        return {

          addBookmark: () => ({ editor }) => {
            const { from, to } = editor.state.selection;
            if (from === to) return false;
            const id = addItem(from, to);
            return Boolean(id);
          },
          clearBookmarks: () => () => clearAll()
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
  }

  function serialize() {
    return {
      v: 1,
      items: store.items.map(it => ({ id: it.id, from: it.from, to: it.to, comment: it.comment, text: it.text }))
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
          store.items.push({
            id: String(raw.id || "bm" + (++store.seq) + "-r"),
            from,
            to,
            comment: typeof raw.comment === "string" ? raw.comment : "",
            text
          });
        } catch { dropped++; }
      }
      if (dropped) console.info("Закладки: " + dropped + " не восстановлено (текст не сошёлся)");
    }
    queueLayout();
  }

  export const Bookmarks = {
    extension: () => window.TipTapLib ? makeExtension() : null,
    add: (from, to) => addItem(from, to),
    setComment: (id, c) => setComment(id, c),
    remove: id => removeById(id),
    open: id => openPop(id),
    clear: () => clearAll(),
    count: () => store.items.length,
    items: () => store.items.slice(),
    serialize,
    restore,
    relayout: () => queueLayout(),

    onChange: null
  };
