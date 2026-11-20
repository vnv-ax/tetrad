

import { toast, showTab, roomName, warnOnce } from "./common.js";
import { PRESETS } from "./presets.js";
import { HandMarks } from "./handmarks.js";
import { Bookmarks } from "./bookmarks.js";
import { kvGetMigrated, kvSet } from "./storage.js";
import { countStats, escapeHtml } from "./text.core.js";

const $ = id => document.getElementById(id);
const mount = $("editor");
const PAGE_KEY = "cabinet-editor-v3";

export let editorInstance = null;

export function changeFont() {}

export function applyTextOp(id) {
  toast("Редактор не запустился — преобразование недоступно");
  warnOnce("editor-dead", "Операция «" + id + "» требует запущенного редактора");
}

export function getEditorText() {
  return "";
}

export function getEditorJson() {
  return {};
}

export function setEditorText() {}

export function sendToOffice(text, note) {
  if (roomName() !== "office") showTab("office");
  if (note) toast(note);
}

if (!mount || !window.TipTapLib) {
  editorFailed(new Error(!mount ? "в разметке нет #editor" : "window.TipTapLib не загрузился"));
} else {
  try {
    initEditor();
  } catch (err) {
    editorFailed(err);
  }
}

function editorFailed(err) {
  warnOnce("editor-init", "Редактор не запустился:", err);
  if (mount) {
    const note = document.createElement("p");
    note.className = "editor-broken";
    note.textContent = "Редактор не запустился — проверьте консоль браузера.";
    mount.appendChild(note);
  }
  toast("Редактор не запустился — остальные функции работают");
}

function initEditor() {
  const vp = $("editorScroll");
  let userPages = 1;
  let fontSize = 20;
  const MIN_FS = 14, MAX_FS = 30;
  let draftTimer = null;
  const {Editor: Editor, StarterKit: StarterKit, Underline: Underline, Highlight: Highlight, Extension: Extension} = window.TipTapLib;

  const MarkHighlight = Highlight.configure({ multicolor: true }).extend({
    addAttributes() {
      return {
        color: {
          default: null,
          parseHTML: el => el.getAttribute("data-color") || el.style.backgroundColor,
          renderHTML: attrs => attrs.color ? { "data-color": attrs.color } : {}
        }
      };
    }
  });

  function changeFontSize(d) {
    fontSize = Math.min(MAX_FS, Math.max(MIN_FS, fontSize + d));
    applyFontSize();
    saveDraft();
  }

  changeFont = changeFontSize;

  const markColor = () => HandMarks.prefs.color;

  const SoftEnter = Extension.create({
    name: "softEnter",
    addKeyboardShortcuts() {
      const size = d => () => {
        changeFontSize(d);
        return true;
      };
      return {
        Enter: () => {
          if (!this.editor.isActive("heading")) return false;
          return this.editor.chain().splitBlock().setParagraph().run();
        },
        "Mod-ArrowUp": () => this.editor.commands.setHighlight({ color: markColor() }),
        "Mod-ArrowDown": () => this.editor.commands.unsetHighlight(),
        "Mod-0": () => this.editor.commands.setParagraph(),
        "Mod-1": () => this.editor.commands.setHeading({
          level: 2
        }),
        "Mod-2": () => this.editor.commands.setHeading({
          level: 3
        }),
        "Mod-=": size(1),
        "Mod-+": size(1),
        "Mod--": size(-1),
        "Mod-k": () => this.editor.commands.toggleItalic(),
        "Mod-л": () => this.editor.commands.toggleItalic(),
        "Mod-я": () => this.editor.commands.undo(),
        "Mod-н": () => this.editor.commands.redo()
      };
    }
  });
  const editor = new Editor({
    element: mount,
    injectCSS: false,
    editorProps: {
      attributes: {
        spellcheck: "true"
      }
    },
    extensions: [ StarterKit.configure({
      heading: {
        levels: [ 2, 3 ]
      }
    }), Underline, MarkHighlight, SoftEnter, HandMarks.extension(), Bookmarks.extension() ],
    content: ""
  });
  editorInstance = editor;
  mount.addEventListener("mousedown", e => {
    if (e.target !== mount) return;
    const last = mount.lastElementChild;
    if (last && e.clientY > last.getBoundingClientRect().bottom) {
      e.preventDefault();
      editor.commands.focus("end");
    }
  });
  vp && vp.addEventListener("mousedown", e => {
    if (e.target !== vp) return;
    const last = mount.lastElementChild;
    if (last && e.clientY > last.getBoundingClientRect().bottom) {
      e.preventDefault();
      editor.commands.focus("end");
    }
  });
  const paraIO = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        paraIO.unobserve(en.target);
      }
    }
  }, {
    rootMargin: "0px 0px -8% 0px"
  });
  function observeBlocks() {
    mount.querySelectorAll("p, h2, h3, li").forEach(el => paraIO.observe(el));
  }
  let obsTimer = null;
  editor.on("update", () => {
    clearTimeout(obsTimer);
    obsTimer = setTimeout(observeBlocks, 250);
  });
  const PAGE_SPAN = 8.5;
  function pageHeight() {
    if (vp && vp.clientHeight > 60) return Math.round(vp.clientHeight * PAGE_SPAN);
    const w = mount.clientWidth || 700;
    return Math.round(w * 1.2 * PAGE_SPAN);
  }
  function applyPages() {
    mount.style.minHeight = `${Math.round(userPages * pageHeight())}px`;
    renderMarks();
  }
  function computePages() {
    const natural = Math.ceil(mount.scrollHeight / pageHeight());
    const pages = Math.max(userPages, natural);
    $("pageCount").textContent = `стр: ${pages}`;
    renderMarks(pages);
  }
  const marksWrap = document.createElement("div");
  marksWrap.className = "sheet-marks";
  marksWrap.setAttribute("aria-hidden", "true");
  let marksShown = -1;
  function renderMarks(forcePages) {
    if (!vp) return;
    const pages = forcePages != null ? forcePages : Math.max(userPages, Math.ceil(mount.scrollHeight / pageHeight()));
    if (pages === marksShown && marksWrap.childElementCount) return;
    if (pages !== marksShown) {
      marksShown = pages;
      marksWrap.innerHTML = "";
      for (let k = 1; k < pages; k++) {
        const m = document.createElement("div");
        m.className = "page-mark";
        m.style.top = `${Math.round(k * pageHeight())}px`;
        m.innerHTML = `<i>${k + 1}</i>`;
        marksWrap.appendChild(m);
      }
    }
    if (!marksWrap.parentNode) vp.appendChild(marksWrap);
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      marksShown = -1;
      applyPages();
      computePages();
    }, 120);
  });
  function applyFontSize() {
    mount.style.fontSize = `${fontSize}px`;
  }
  const chain = () => editor.chain().focus();
  const FMT_HANDLERS = {
    bold: () => chain().toggleBold().run(),
    italic: () => chain().toggleItalic().run(),
    underline: () => chain().toggleUnderline().run(),

    hilite: () => chain().toggleHighlight({ color: markColor() }).run(),
    p: () => chain().setParagraph().run(),
    h2: () => chain().toggleHeading({
      level: 2
    }).run(),
    h3: () => chain().toggleHeading({
      level: 3
    }).run(),
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run(),
    sizeDown: () => changeFontSize(-1),
    sizeUp: () => changeFontSize(1)
  };
  document.querySelectorAll("[data-fmt]").forEach(btn => {
    btn.addEventListener("click", () => {
      const h = FMT_HANDLERS[btn.dataset.fmt];
      if (h) h();
    });
  });

  const tools = document.querySelector(".plinth-tools");
  let closeRnPops = () => {};
  tools && tools.addEventListener("pointerdown", e => {
    if (e.target.closest(".rn-select")) return;
    e.preventDefault();
  });

  {

    HandMarks.onChange = saveDraft;

    const rnBtn = $("rnTypeBtn");
    const rnLabel = $("rnTypeLabel");
    const rnPop = $("rnTypePop");
    const rnColorBtn = $("rnColorBtn");
    const rnColorDot = rnColorBtn && rnColorBtn.querySelector(".rn-cdot");
    const rnColorPop = $("rnColorPop");
    const rnClear = $("btnMarksClear");
    const bbHilite = document.querySelector('[data-fmt="hilite"]');
    Object.keys(HandMarks.types).forEach(value => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "pop-item rn-option";
      opt.dataset.type = value;
      opt.setAttribute("role", "option");
      opt.innerHTML = '<i class="rn-check" aria-hidden="true"></i><span>' + HandMarks.types[value] + "</span>";
      opt.addEventListener("click", () => {
        HandMarks.setPrefs({ type: value });
        syncRnUi();
        closeRnPops();
      });
      rnPop.appendChild(opt);
    });
    HandMarks.palette.forEach(({ c, n }) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "pop-item rn-option rn-coption";
      opt.dataset.color = c;
      opt.setAttribute("role", "option");

      opt.innerHTML = '<i class="rn-check" aria-hidden="true"></i><i class="rn-cdot" data-color="' + c + '" aria-hidden="true"></i><span>' + n + "</span>";
      opt.addEventListener("click", () => {
        HandMarks.setPrefs({ color: c });
        syncRnUi();
        closeRnPops();
      });
      rnColorPop.appendChild(opt);
    });
    function syncRnUi() {
      rnLabel.textContent = HandMarks.types[HandMarks.prefs.type] || HandMarks.prefs.type;
      rnPop.querySelectorAll(".rn-option").forEach(opt => {
        opt.classList.toggle("active", opt.dataset.type === HandMarks.prefs.type);
        opt.setAttribute("aria-selected", String(opt.dataset.type === HandMarks.prefs.type));
      });

      rnColorBtn.dataset.color = HandMarks.prefs.color;
      if (rnColorDot) rnColorDot.dataset.color = HandMarks.prefs.color;
      if (bbHilite) bbHilite.dataset.color = HandMarks.prefs.color;
      rnColorPop.querySelectorAll(".rn-coption").forEach(opt => {
        opt.classList.toggle("active", opt.dataset.color === HandMarks.prefs.color);
        opt.setAttribute("aria-selected", String(opt.dataset.color === HandMarks.prefs.color));
      });
    }
    closeRnPops = () => {
      [[rnBtn, rnPop], [rnColorBtn, rnColorPop]].forEach(([btn, pop]) => {
        if (pop.hidden) return;
        pop.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      });
    };
    rnBtn.addEventListener("click", () => {
      const willOpen = rnPop.hidden;
      closeRnPops();
      rnPop.hidden = !willOpen;
      rnBtn.setAttribute("aria-expanded", String(willOpen));
    });
    rnColorBtn.addEventListener("click", () => {
      const willOpen = rnColorPop.hidden;
      closeRnPops();
      rnColorPop.hidden = !willOpen;
      rnColorBtn.setAttribute("aria-expanded", String(willOpen));
    });

    document.addEventListener("click", e => {
      if (e.target.closest(".rn-select")) return;
      closeRnPops();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeRnPops();
    });
    rnClear.addEventListener("click", () => {
      const had = HandMarks.count();
      if (!had) return toast("Пометок нет");
      HandMarks.clear();
      toast("Все пометки убраны");
    });
    syncRnUi();

    let rnAlt = false, rnPending = false, rnErase = false;
    const rnReset = () => { rnAlt = false; rnPending = false; rnErase = false; };
    window.addEventListener("keydown", e => {
      if (e.code !== "AltLeft" && e.code !== "AltRight") return;
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey) return;
      rnAlt = true;
      rnPending = false;
      rnErase = e.shiftKey;
    }, true);
    window.addEventListener("keyup", e => {
      if (e.code !== "AltLeft" && e.code !== "AltRight") return;
      e.preventDefault();
      if (e.shiftKey) rnErase = true;
      if (rnPending) rnCommit();
      rnReset();
    }, true);
    window.addEventListener("blur", rnReset);
    editor.on("selectionUpdate", () => {
      if (!rnAlt) return;
      rnPending = !editor.state.selection.empty;
    });
    document.addEventListener("mouseup", e => {
      if (!rnAlt || !rnPending) return;
      if (e.shiftKey) rnErase = true;
      if ((mount.contains(e.target) || vp && vp.contains(e.target))) rnCommit();
    });
    function rnCommit() {
      if (!rnPending) return;
      rnPending = false;
      if (rnErase) {
        const { from, to } = editor.state.selection;
        const n = HandMarks.erase(from, to);
        toast(n ? "Снято пометок: " + n : "В выделении нет пометок");
        return;
      }
      const before = HandMarks.count();
      editor.commands.addHandMark();
      if (HandMarks.count() < before) toast("Пометка снята");
    }
  }

  {
    Bookmarks.onChange = saveDraft;
    window.addEventListener("bm-toast", e => toast(e.detail));
    $("btnBookmark").addEventListener("click", () => {
      const { from, to } = editor.state.selection;
      const id = from < to ? Bookmarks.add(from, to) : null;
      if (!id) return toast("Выделите текст — на нём ставится закладка");
      Bookmarks.open(id);
    });
    vp && vp.addEventListener("scroll", Bookmarks.relayout, { passive: true });
  }

  function updateActiveStates() {
    const set = (fmt, active) => {
      const el = document.querySelector(`[data-fmt="${fmt}"]`);
      if (el) el.classList.toggle("active", active);
    };
    set("bold", editor.isActive("bold"));
    set("italic", editor.isActive("italic"));
    set("underline", editor.isActive("underline"));
    set("hilite", editor.isActive("highlight"));
  }
  editor.on("transaction", updateActiveStates);
  function textToDocHtml(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    return lines.map(l => `<p>${escapeHtml(l) || "<br>"}</p>`).join("");
  }
  function replaceWholeDoc(html) {
    return editor.chain().insertContentAt({
      from: 0,
      to: editor.state.doc.content.size
    }, html, {
      updateSelection: true
    }).run();
  }
  applyTextOp = function realApplyTextOp(id) {
    const preset = PRESETS.find(p => p.id === id);
    if (!preset) return;
    const text = getEditorText();
    if (!text.trim()) return toast("Текст пуст — нечего преобразовывать");
    const result = preset.fn(text);
    if (result === text) return toast("Изменений нет");
    replaceWholeDoc(textToDocHtml(result));
    toast(`Готово: ${preset.title}`);
  };
  getEditorText = function realGetEditorText() {
    return editor.getText({
      blockSeparator: "\n"
    });
  };
  getEditorJson = function realGetEditorJson() {
    return editor.getJSON();
  };
  setEditorText = function realSetEditorText(text) {
    if (!text || !text.trim()) {
      editor.commands.clearContent(true);
    } else {
      replaceWholeDoc(textToDocHtml(text));
    }
    editor.commands.focus();
    if (vp) vp.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };
  sendToOffice = function realSendToOffice(text, note) {
    if (roomName() !== "office") showTab("office");
    setEditorText(text);
    if (note) toast(note);
  };
  function updateStats() {
    const s = countStats(getEditorText());
    const map = {
      stChars: s.chars,
      stCharsNS: s.charsNS,
      stWords: s.words,
      stSent: s.sentences,
      stLines: s.lines,
      stUnique: s.unique,
      stRead: s.read,
      stSpeak: s.speak,
      stTokens: s.tokens
    };
    for (const id in map) $(id).textContent = fmtNum(map[id]);
  }
  function fmtNum(n) {
    return n >= 100 ? Math.round(n).toLocaleString("ru") : (Math.round(n * 10) / 10).toLocaleString("ru");
  }
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const payload = JSON.stringify({
        json: editor.getJSON(),
        pages: userPages,
        fs: fontSize,
        marks: HandMarks.serialize(),
        bookmarks: Bookmarks.serialize()
      });
      kvSet(PAGE_KEY, payload, "черновик").catch(() => {});
    }, 500);
  }
  async function loadDraft() {
    try {
      const raw = await kvGetMigrated(PAGE_KEY);
      const d = JSON.parse(raw || "null");
      if (raw && !d) warnDraftBroken(new Error("черновик не является JSON"));
      if (d) {
        if (d.json) {
          editor.commands.setContent(d.json, {
            emitUpdate: false,
            errorOnInvalidContent: false
          });
        } else if (d.html) {
          editor.commands.setContent(d.html, {
            emitUpdate: false,
            errorOnInvalidContent: false
          });
        }

        userPages = Math.max(1, Math.min(99, Math.round(Number(d.pages) || 1)));
        fontSize = d.fs || 20;
        HandMarks.restore(d.marks || null);
        Bookmarks.restore(d.bookmarks || null);
      }
    } catch (err) {
      warnDraftBroken(err);
    }
    applyFontSize();
    applyPages();
    updateStats();
    computePages();
    editor.commands.focus();
  }
  function warnDraftBroken(err) {
    console.warn("[тетрадь] черновик не восстановился — файл повреждён:", err);
  }
  function onEditorUpdate() {
    normalizeEmptyHeading();
    updateStats();
    computePages();
    saveDraft();
    mount.dispatchEvent(new CustomEvent("editorinput", {
      bubbles: true
    }));
  }
  function normalizeEmptyHeading() {
    const node = editor.state.doc.firstChild;
    if (editor.state.doc.childCount === 1 && node.type.name === "heading" && node.content.size === 0) {
      editor.commands.setParagraph();
    }
  }
  editor.on("update", onEditorUpdate);
  loadDraft();
  observeBlocks();
}
