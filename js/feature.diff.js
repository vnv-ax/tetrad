export function createDiff() {
  let Diff = null;
  function normalize(text, {ignoreCase: ignoreCase, ignoreSpace: ignoreSpace}, mode) {
    let t = text.replace(/\r\n?/g, "\n");
    if (ignoreSpace) {
      if (mode === "lines") {
        t = t.split("\n").map(l => l.replace(/\s+/g, " ").trim()).join("\n");
      } else {
        t = t.replace(/\s+/g, " ").trim();
      }
    }
    if (ignoreCase) t = t.toLocaleLowerCase("ru");
    return t;
  }
  return {
    async init() {
      if (Diff) return Diff;
      await (import("../lib/diff/diff.umd.js"));
      Diff = self.Diff;
      if (!Diff) throw new Error("Библиотека сравнения не загрузилась");
      return Diff;
    },
    async run({a: a, b: b, mode: mode = "words", ignoreCase: ignoreCase = false, ignoreSpace: ignoreSpace = false}) {
      const lib = await this.init();
      const fn = mode === "chars" ? lib.diffChars : mode === "lines" ? lib.diffLines : lib.diffWords;
      const parts = fn(normalize(a, {
        ignoreCase: ignoreCase,
        ignoreSpace: ignoreSpace
      }, mode), normalize(b, {
        ignoreCase: ignoreCase,
        ignoreSpace: ignoreSpace
      }, mode));
      let added = 0, removed = 0;
      for (const p of parts) {
        if (p.added) added += p.count ?? p.value.length;
        if (p.removed) removed += p.count ?? p.value.length;
      }
      return {
        parts: parts,
        added: added,
        removed: removed
      };
    },
    destroy() {
      Diff = null;
    }
  };
}