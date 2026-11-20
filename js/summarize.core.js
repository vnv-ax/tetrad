export const RU_STOPWORDS = new Set([ "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то", "все", "она", "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "по", "только", "ее", "мне", "было", "вот", "от", "меня", "еще", "нет", "о", "из", "ему", "теперь", "когда", "даже", "ну", "вдруг", "ли", "если", "уже", "или", "ни", "быть", "был", "него", "до", "вас", "нибудь", "опять", "уж", "вам", "ведь", "там", "потом", "себя", "ничего", "ей", "они", "тут", "где", "есть", "надо", "ней", "для", "мы", "тебя", "их", "чем", "была", "сам", "чтоб", "без", "будто", "чего", "раз", "тоже", "себе", "под", "будет", "ж", "кто", "этот", "того", "потому", "этого", "какой", "совсем", "ним", "здесь", "этом", "один", "почти", "мой", "тем", "чтобы", "нее", "были", "куда", "зачем", "всех", "никогда", "можно", "при", "наконец", "два", "об", "другой", "хоть", "после", "над", "больше", "тот", "через", "эти", "нас", "про", "них", "какая", "много", "разве", "три", "эту", "моя", "впрочем", "хорошо", "свою", "этой", "перед", "иногда", "лучше", "чуть", "том", "нельзя", "такой", "им", "более", "всегда", "конечно", "всю", "между", "этих", "которые", "который", "которая", "очень", "наш", "нашей", "мимо", "среди", "около", "тем", "затем", "здесь", "своей", "свои", "своих", "наш", "наша", "наши", "таких", "такая", "такое", "эта", "эти", "тот", "та", "те", "этому", "этою", "именно", "в общем", "то есть", "например", "однако", "потому", "поэтому", "зато", "впрочем" ]);

const ABBREV = [ "т.д.", "т.п.", "др.", "пр.", "г.", "ул.", "пгт.", "им.", "ст.", "наб.", "т.е.", "т.к.", "т.н.", "стр.", "рис.", "см.", "с.", "мин.", "ч.", "мес.", "руб.", "коп.", "гг.", "вв.", "млрд.", "млн.", "тыс.", "кв.", "etc." ];

export function splitSentences(text) {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];

  for (const a of ABBREV) {
    t = t.split(a).join(a.replace(/\./g, "\u0001"));
  }
  const parts = t.split(/(?<=[.!?…\u0001])["»)\]]?\s+(?=[«"А-ЯЁA-Z0-9])/u);
  return parts
    .map(s => s.replace(/\u0001/g, ".").trim())
    .filter(s => s.length > 0 && /[\p{L}\p{N}]/u.test(s));
}

function paragraphs(text) {
  return text.replace(/\r\n?/g, "\n").split(/\n+/).map(p => p.trim()).filter(Boolean);
}

function tokenize(s) {
  return s.toLocaleLowerCase("ru").match(/[а-яёa-z]{3,}/gu) || [];
}

function wordFrequencies(text) {
  const freq = new Map;
  for (const w of tokenize(text)) {
    if (RU_STOPWORDS.has(w)) continue;
    const stem = w.length > 5 ? w.slice(0, w.length - 2) : w;
    freq.set(stem, (freq.get(stem) || 0) + 1);
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return freq;
}

function sentenceScore(sentence, freq, positionWeight) {
  const words = tokenize(sentence).filter(w => !RU_STOPWORDS.has(w));
  if (!words.length) return 0;
  let sum = 0;
  for (const w of words) {
    const stem = w.length > 5 ? w.slice(0, w.length - 2) : w;
    sum += freq.get(w) || freq.get(stem) || 0;
  }
  return sum / Math.sqrt(words.length) * positionWeight;
}

export function summarize(text, opts = {}) {
  const paragraphs_ = paragraphs(text);
  const sentences = [];
  for (const p of paragraphs_) {
    const ss = splitSentences(p);
    ss.forEach((s, i) => sentences.push({
      text: s,
      paragraphFirst: i === 0
    }));
  }
  if (!sentences.length) return {
    sentences: [],
    keywords: [],
    total: 0,
    taken: 0
  };
  const freq = wordFrequencies(text);
  const rawFreq = new Map;
  for (const w of tokenize(text)) {
    if (RU_STOPWORDS.has(w) || w.length < 3) continue;
    rawFreq.set(w, (rawFreq.get(w) || 0) + 1);
  }
  const keywords = [ ...rawFreq.entries() ].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, count]) => ({
    word: word,
    count: count
  }));
  const scored = sentences.map((s, idx) => {
    let w = 1;
    if (s.paragraphFirst) w *= 1.3;
    if (idx < sentences.length / 5) w *= 1.15;
    const raw = sentenceScore(s.text, freq, w);
    return {
      ...s,
      score: raw,
      idx: idx
    };
  });
  const total = sentences.length;
  let take;
  if (opts.count && opts.count > 0) take = Math.min(opts.count, total); else {
    const percent = Math.min(60, Math.max(10, opts.percent ?? 30));
    take = Math.max(1, Math.round(total * percent / 100));
  }
  const chosen = scored.slice().sort((a, b) => b.score - a.score).slice(0, take).sort((a, b) => a.idx - b.idx);
  return {
    sentences: chosen.map(c => c.text),
    keywords: keywords,
    total: total,
    taken: chosen.length
  };
}