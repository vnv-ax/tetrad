

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

export function estimateTokens(text, chars) {
  const cyr = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const letters = (text.match(/\p{L}/gu) || []).length;
  return Math.round(cyr * 2 >= letters && letters > 0 ? chars / 2.7 : chars / 4);
}

const ABBR_BEFORE = [
  "т.е.", "т.к.", "т.н.", "т.о.", "т.с.", "см.",
  "ул.", "кв.", "стр.", "акад.", "проф.", "доц.", "мл.", "ст.", "г."
];

const ABBR_END = ["т.д.", "т.п.", "др.", "пр.", "руб.", "коп.", "гг.", "вв."];

const SENTINEL_OPEN = "\u0001";
const SENTINEL_CLOSE = "\u0002";

const SENTINEL_SPACE = "\u0003";

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const RE_ABBR_ALL = new RegExp(
  [...ABBR_BEFORE, ...ABBR_END].slice().sort((a, b) => b.length - a.length).map(escapeRe).join("|"),
  "giu"
);
const END_SET = new Set(ABBR_END);

const RE_NEW_SENTENCE = /^[\s]*[\p{Lu}]/u;

const RE_INITIALS = /(?<![\p{L}\p{N}])(\p{Lu})\.\s?(\p{Lu})\.|(?<![\p{L}\p{N}])(\p{Lu})\.(?=\s\p{Lu})/gu;

const RE_DECIMAL = /(\d)\.(?=\d)/g;

function maskAbbreviations(text) {
  const mask = m => SENTINEL_OPEN + m.replace(/\s/g, SENTINEL_SPACE) + SENTINEL_CLOSE;
  return text
    .replace(RE_INITIALS, mask)
    .replace(RE_DECIMAL, "$1" + SENTINEL_OPEN + "." + SENTINEL_CLOSE)
    .replace(RE_ABBR_ALL, (m, offset, s) => {

      if (END_SET.has(m.toLowerCase()) && RE_NEW_SENTENCE.test(s.slice(offset + m.length))) return m;
      return mask(m);
    });
}

function unmaskAbbreviations(text) {
  return text
    .split(SENTINEL_OPEN).join("")
    .split(SENTINEL_CLOSE).join("")
    .split(SENTINEL_SPACE).join(" ");
}

export function splitSentences(text) {
  const masked = maskAbbreviations(text.replace(/\r\n?/g, "\n"));
  const raw = masked.split(/(?<=[.!?…]["»)]?)\s+/);
  const out = [];
  for (const part of raw) {
    const sentence = unmaskAbbreviations(part).trim();
    if (sentence && /[\p{L}\p{N}]/u.test(sentence)) out.push(sentence);
  }
  return out;
}

export function countStats(text) {
  const chars = text.length;
  const charsNS = text.replace(/\s/g, "").length;
  const lines = text ? text.replace(/\r\n?/g, "\n").split("\n").length : 0;
  const words = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  const sentences = splitSentences(text);
  return {
    chars: chars,
    charsNS: charsNS,
    lines: lines,
    words: words.length,
    unique: new Set(words.map(w => w.toLowerCase())).size,
    sentences: sentences.length,
    read: words.length / 200,
    speak: words.length / 130,
    tokens: estimateTokens(text, chars)
  };
}
