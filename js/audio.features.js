

export const SR = 16e3;
export const N_FFT = 320;
export const WIN = 320;
export const HOP = 160;
export const N_MELS = 64;
export const N_FREQS = 161;

function bf16Round(f32) {
  const u = new Uint32Array(f32.buffer);
  for (let i = 0; i < u.length; i++) {
    u[i] = u[i] + 32767 + (u[i] >>> 16 & 1) & 4294901760;
  }
  return f32;
}

export const windowF = (() => {
  const w = new Float32Array(WIN);
  for (let n = 0; n < WIN; n++) w[n] = .5 - .5 * Math.cos(2 * Math.PI * n / WIN);
  return bf16Round(w);
})();

export const fbank = (() => {
  const hzToMel = f => 2595 * Math.log10(1 + f / 700);
  const melToHz = m => 700 * (Math.pow(10, m / 2595) - 1);
  const fMax = SR / 2;
  const mMin = hzToMel(0), mMax = hzToMel(fMax);
  const pts = new Float64Array(N_MELS + 2);
  for (let i = 0; i <= N_MELS + 1; i++) pts[i] = melToHz(mMin + (mMax - mMin) * i / (N_MELS + 1));
  const fb = new Float32Array(N_FREQS * N_MELS);
  for (let k = 0; k < N_FREQS; k++) {
    const freq = fMax * k / (N_FREQS - 1);
    for (let j = 0; j < N_MELS; j++) {
      const up = (freq - pts[j]) / (pts[j + 1] - pts[j]);
      const down = (pts[j + 2] - freq) / (pts[j + 2] - pts[j + 1]);
      fb[k * N_MELS + j] = Math.max(0, Math.min(up, down));
    }
  }
  return bf16Round(fb);
})();

const TWX = (() => {
  const t = [];
  for (let k1 = 0; k1 < 3; k1++) {
    const row = [];
    for (let k2 = 0; k2 < 64; k2++) {
      const col = [];
      for (let n1 = 0; n1 < 5; n1++) {
        const ph = -2 * Math.PI * n1 * (k2 / 320 + k1 / 5);
        col.push([ Math.cos(ph), Math.sin(ph) ]);
      }
      row.push(col);
    }
    t.push(row);
  }
  return t;
})();

const REV64 = (() => {
  const rev = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    let r = 0, v = i;
    for (let b = 0; b < 6; b++) {
      r = r * 2 + (v & 1);
      v >>= 1;
    }
    rev[i] = r;
  }
  return rev;
})();

const TW64 = (() => {
  const t = [];
  for (let s = 0; s < 6; s++) {
    const len = 1 << s;
    const row = [];
    for (let k = 0; k < len; k++) {
      const ph = -2 * Math.PI * k / (len * 2);
      row.push([ Math.cos(ph), Math.sin(ph) ]);
    }
    t.push(row);
  }
  return t;
})();

function fft64(re, im) {
  const n = 64;
  for (let i = 0; i < n; i++) {
    const j = REV64[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let s = 0; s < 6; s++) {
    const len = 1 << s;
    const half = len;
    for (let base = 0; base < n; base += len * 2) {
      for (let k = 0; k < half; k++) {
        const tw = TW64[s][k];
        const i0 = base + k, i1 = base + k + len;
        const xr = re[i1] * tw[0] - im[i1] * tw[1];
        const xi = re[i1] * tw[1] + im[i1] * tw[0];
        re[i1] = re[i0] - xr;
        im[i1] = im[i0] - xi;
        re[i0] += xr;
        im[i0] += xi;
      }
    }
  }
}

export function framePower(frame, powerOut) {
  const re = new Float64Array(64), im = new Float64Array(64);
  const aRe = new Float64Array(5 * 64), aIm = new Float64Array(5 * 64);

  for (let n1 = 0; n1 < 5; n1++) {
    for (let n2 = 0; n2 < 64; n2++) {
      re[n2] = frame[5 * n2 + n1];
      im[n2] = 0;
    }
    fft64(re, im);
    for (let k2 = 0; k2 < 64; k2++) {
      aRe[n1 * 64 + k2] = re[k2];
      aIm[n1 * 64 + k2] = im[k2];
    }
  }

  for (let k2 = 0; k2 < 64; k2++) {
    for (let k1 = 0; k1 < 3; k1++) {
      const k = 64 * k1 + k2;
      if (k >= N_FREQS) continue;
      let reS = 0, imS = 0;
      for (let n1 = 0; n1 < 5; n1++) {
        const tw = TWX[k1][k2][n1];
        const ar = aRe[n1 * 64 + k2], ai = aIm[n1 * 64 + k2];
        reS += ar * tw[0] - ai * tw[1];
        imS += ar * tw[1] + ai * tw[0];
      }
      powerOut[k] = reS * reS + imS * imS;
    }
  }
}

function naivePower(frame, powerOut) {

  for (let k = 0; k < N_FREQS; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < WIN; n++) {
      const ph = 2 * Math.PI * k * n / N_FFT;
      re += frame[n] * Math.cos(ph);
      im -= frame[n] * Math.sin(ph);
    }
    powerOut[k] = re * re + im * im;
  }
  return powerOut;
}

export { naivePower };

export function logMelSpectrogram(audio) {
  const T = Math.floor((audio.length - WIN) / HOP) + 1;
  if (T < 1) return null;
  const feat = new Float32Array(N_MELS * T);
  const frame = new Float32Array(WIN);
  const power = new Float32Array(N_FREQS);
  const scratch = new Float32Array(N_FREQS);
  for (let t = 0; t < T; t++) {
    const off = t * HOP;
    for (let n = 0; n < WIN; n++) frame[n] = audio[off + n] * windowF[n];
    framePower(frame, power);
    scratch.set(power);
    bf16Round(scratch);
    for (let j = 0; j < N_MELS; j++) {
      let mel = 0;
      for (let k = 0; k < N_FREQS; k++) mel += scratch[k] * fbank[k * N_MELS + j];
      const v = Math.log(Math.min(Math.max(mel, 1e-9), 1e9));
      feat[j * T + t] = v;
    }
  }
  return {
    feat: feat,
    T: T
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return -90;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

export function vadRanges(audio, opts = {}) {
  const {
    frameMs = 30,
    targetChunkSec = 45,
    maxChunkSec = 60,
    silenceMs = 350,
    overlapSec = 2.5,
    sr = SR
  } = opts;
  const n = audio.length;
  const frameLen = Math.round(sr * frameMs / 1e3);
  const total = Math.floor(n / frameLen);
  if (total === 0) return n ? [ {
    start: 0,
    end: n,
    overlap: 0
  } ] : [];
  const db = new Float32Array(total);
  for (let f = 0; f < total; f++) {
    let sum = 0;
    const off = f * frameLen;
    for (let i = 0; i < frameLen; i++) sum += audio[off + i] * audio[off + i];
    const rms = Math.sqrt(sum / frameLen);
    db[f] = 20 * Math.log10(rms + 1e-10);
  }
  const sorted = Array.from(db).sort((a, b) => a - b);
  const floorDb = percentile(sorted, .2);
  const speechDb = percentile(sorted, .9);

  let thr = floorDb + Math.max(4, Math.min((speechDb - floorDb) * .5, 20));
  thr = Math.min(thr, speechDb - 3);
  const silenceFrames = Math.max(1, Math.round(silenceMs / frameMs));

  const islands = [];
  let start = -1, quiet = 0;
  for (let f = 0; f < total; f++) {
    if (db[f] >= thr) {
      if (start < 0) start = f;
      quiet = 0;
    } else if (start >= 0) {
      quiet++;
      if (quiet >= silenceFrames) {
        islands.push([ start, f - quiet ]);
        start = -1;
        quiet = 0;
      }
    }
  }
  if (start >= 0) islands.push([ start, total - 1 ]);

  const minIsland = Math.max(1, Math.round(120 / frameMs));
  const speech = islands.filter(([a, b]) => b - a + 1 >= minIsland);
  if (!speech.length) return n ? [ {
    start: 0,
    end: n,
    overlap: 0
  } ] : [];

  const targetFrames = Math.round(targetChunkSec * 1e3 / frameMs);
  const maxFrames = Math.round(maxChunkSec * 1e3 / frameMs);
  const chunks = [];
  let cur = null;
  for (const [a, b] of speech) {
    if (!cur) {
      cur = [ a, b ];
      continue;
    }
    if (b - cur[0] + 1 <= targetFrames) cur[1] = b; else {
      chunks.push(cur);
      cur = [ a, b ];
    }
  }
  if (cur) chunks.push(cur);

  const out = [];
  const overlapFrames = Math.round(overlapSec * 1e3 / frameMs);
  for (const [a, b] of chunks) {
    if (b - a + 1 <= maxFrames) {
      out.push({
        start: a * frameLen,
        end: Math.min((b + 1) * frameLen, n),
        overlap: 0
      });
      continue;
    }
    let s = a;
    while (s <= b) {
      const e = Math.min(s + maxFrames - 1, b);
      out.push({
        start: s * frameLen,
        end: Math.min((e + 1) * frameLen, n),
        overlap: out.length ? overlapSec * sr : 0
      });
      if (e >= b) break;
      s = e + 1 - overlapFrames;
    }
  }
  return out;
}

export function mergeOverlappedTexts(prev, next) {
  const a = String(prev || "").trim().split(/\s+/).filter(Boolean);
  const b = String(next || "").trim().split(/\s+/).filter(Boolean);
  if (!a.length) return b.join(" ");
  if (!b.length) return a.join(" ");
  const maxK = Math.min(a.length, b.length, 12);
  for (let k = maxK; k > 0; k--) {
    const tail = a.slice(a.length - k).join(" ").toLocaleLowerCase("ru");
    const head = b.slice(0, k).join(" ").toLocaleLowerCase("ru");
    if (tail === head) return a.concat(b.slice(k)).join(" ");
  }
  return a.concat(b).join(" ");
}
