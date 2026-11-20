

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const SENT_RE = /[^.!?…]+[.!?…]+["»)]?|[^.!?…]+$/g;
const CYR_VOWELS = /[аеёиоуыэюя]/gi;
const LATIN_VOWEL_GROUPS = /[aeiouy]+/g;

export function splitWords(text) {
  return text.match(WORD_RE) || [];
}

export function countSentences(text) {
  const m = text.match(SENT_RE);
  return m ? m.length : 0;
}

export function countLetters(text) {
  return (text.match(/\p{L}/gu) || []).length;
}

export function syllablesLatin(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.match(LATIN_VOWEL_GROUPS);
  let n = groups ? groups.length : 0;
  if (w.endsWith("e") && !w.endsWith("le")) n -= 1;
  return Math.max(1, n);
}

export function syllablesCyrillic(word) {
  const m = word.match(CYR_VOWELS);
  return m ? m.length : 0;
}

function syllableCounter(script) {
  return script === "cyrillic" ? syllablesCyrillic : syllablesLatin;
}

export function detectScript(text) {
  const cyr = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const all = countLetters(text);
  if (!all) return "none";
  return cyr * 2 >= all ? "cyrillic" : "latin";
}

const clamp0 = n => (Number.isFinite(n) ? Math.max(0, n) : 0);
const round1 = n => Math.round(n * 10) / 10;

export function analyze(text) {
  const words = splitWords(text);
  const sentences = countSentences(text);
  const letters = countLetters(text);
  const readingTimeSeconds = Math.round((words.length / 200) * 60);
  const empty = {
    script: detectScript(text),
    words: words.length,
    sentences: sentences,
    letters: letters,
    syllables: 0,
    complexWords: 0,
    fleschReadingEase: null,
    obornevaEase: null,
    fleschKincaidGrade: null,
    gunningFog: null,
    smogIndex: null,
    automatedReadabilityIndex: null,
    colemanLiauIndex: null,
    averageGrade: null,
    readingTimeSeconds: readingTimeSeconds
  };
  if (!words.length || !sentences) return empty;
  const script = detectScript(text);
  const countSyll = syllableCounter(script);
  let syllables = 0;
  let complex = 0;
  for (const w of words) {
    const s = countSyll(w);
    syllables += s;
    if (s >= 3) complex += 1;
  }
  const asl = words.length / sentences;
  const asw = syllables / words.length;
  const result = {
    script: script,
    words: words.length,
    sentences: sentences,
    letters: letters,
    syllables: syllables,
    complexWords: complex,
    fleschReadingEase: null,
    obornevaEase: null,
    fleschKincaidGrade: null,
    gunningFog: null,
    smogIndex: null,
    automatedReadabilityIndex: clamp0(4.71 * (letters / words.length) + 0.5 * asl - 21.43),
    colemanLiauIndex: clamp0(0.0588 * (letters / words.length * 100) - 0.296 * (sentences / words.length * 100) - 15.8),
    readingTimeSeconds: readingTimeSeconds
  };
  const grades = [ result.automatedReadabilityIndex, result.colemanLiauIndex ];
  if (script === "cyrillic") {
    result.obornevaEase = 206.835 - 1.3 * asl - 60.1 * asw;
  } else {
    result.fleschReadingEase = 206.835 - 1.015 * asl - 84.6 * asw;
    result.fleschKincaidGrade = clamp0(0.39 * asl + 11.8 * asw - 15.59);
    result.gunningFog = clamp0(0.4 * (asl + 100 * complex / words.length));
    result.smogIndex = clamp0(1.0430 * Math.sqrt(30 * complex / sentences) + 3.1291);
    grades.push(result.fleschKincaidGrade, result.gunningFog, result.smogIndex);
  }
  result.averageGrade = grades.reduce((s, v) => s + v, 0) / grades.length;
  for (const k of [ "automatedReadabilityIndex", "colemanLiauIndex", "fleschKincaidGrade", "gunningFog", "smogIndex", "averageGrade" ]) {
    if (result[k] !== null) result[k] = round1(result[k]);
  }
  for (const k of [ "fleschReadingEase", "obornevaEase" ]) {
    if (result[k] !== null) result[k] = round1(result[k]);
  }
  return result;
}
