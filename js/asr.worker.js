import * as ort from "../lib/onnx/ort.webgpu.min.mjs";

import {
  logMelSpectrogram,
  vadRanges,
  mergeOverlappedTexts,
  SR
} from "./audio.features.js";

ort.env.wasm.wasmPaths = new URL("../lib/onnx/", import.meta.url).href;

ort.env.wasm.numThreads = 1;

const LETTERS = [ "а", "б", "в", "г", "д", "е", "ж", "з", "и", "й", "к", "л", "м", "н", "о", "п", "р", "с", "т", "у", "ф", "х", "ц", "ч", "ш", "щ", "ъ", "ы", "ь", "э", "ю", "я" ];

const BLANK = 33;

let session = null, backend = "?";

function ctcDecode(logProbs, T, numClasses) {
  let prev = BLANK, out = "";
  const data = logProbs.data;
  for (let t = 0; t < T; t++) {
    let best = 0, bestV = data[t * numClasses];
    for (let c = 1; c < numClasses; c++) {
      const v = data[t * numClasses + c];
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    if (best !== prev && best !== BLANK) out += best === 0 ? " " : LETTERS[best - 1];
    prev = best;
  }
  return out.replace(/\s+/g, " ").trim();
}

async function transcribeChunk(audio, id, chunk, total) {
  const lm = logMelSpectrogram(audio);
  if (!lm) return "";
  const lens = new BigInt64Array([ BigInt(lm.T) ]);
  const features = new ort.Tensor("float32", lm.feat, [ 1, 64, lm.T ]);
  const feeds = {
    features: features,
    feature_lengths: new ort.Tensor("int64", lens, [ 1 ])
  };
  const {log_probs: log_probs} = await session.run(feeds);
  const Tp = Math.floor((lm.T - 1) / 4) + 1;
  const text = ctcDecode(log_probs, Math.min(Tp, log_probs.dims[1]), log_probs.dims[2] || 34);
  if (total > 1) post({
    type: "progress",
    id: id,
    chunk: chunk,
    total: total
  });
  return text;
}

async function transcribe(audio, id) {
  const t0 = performance.now();
  if (!session) throw new Error("модель не загружена");
  const ranges = vadRanges(audio, {
    sr: SR
  });
  if (!ranges.length) ranges.push({
    start: 0,
    end: audio.length,
    overlap: 0
  });
  let text = "";
  for (let i = 0; i < ranges.length; i++) {
    const {start: start, end: end} = ranges[i];
    const part = await transcribeChunk(audio.subarray(start, end), id, i + 1, ranges.length);
    if (!part) continue;
    if (ranges[i].overlap && text) {

      text = mergeOverlappedTexts(text, part);
    } else {
      text = text ? text + " " + part : part;
    }
  }
  text = text.replace(/\s+/g, " ").trim();
  post({
    type: "result",
    id: id,
    text: text,
    backend: backend,
    elapsedMs: performance.now() - t0
  });
}

async function init(modelBuf, id) {
  const t0 = performance.now();
  let force = "";
  try {
    force = new URLSearchParams(self.location.search).get("ep") || "";
  } catch {}
  const eps = [ "wasm" ];
  let gpuHint = false;
  try {
    gpuHint = typeof navigator !== "undefined" && !!navigator.gpu && force !== "wasm";
  } catch {}
  if (gpuHint) eps.unshift("webgpu");
  try {
    session = await ort.InferenceSession.create(modelBuf, {
      executionProviders: eps,
      graphOptimizationLevel: "all"
    });
    backend = eps[0];
  } catch (e) {
    session = await ort.InferenceSession.create(modelBuf, {
      executionProviders: [ "wasm" ],
      graphOptimizationLevel: "all"
    });
    backend = "wasm";
  }
  post({
    type: "ready",
    id: id,
    backend: backend,
    elapsedMs: performance.now() - t0,
    inputs: session.inputNames,
    outputs: session.outputNames
  });
}

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

self.onmessage = async event => {
  const msg = event.data;
  try {
    if (msg.type === "init") await init(msg.model, msg.id); else if (msg.type === "transcribe") await transcribe(msg.audio, msg.id);
  } catch (err) {
    post({
      type: "error",
      id: msg.id,
      message: err instanceof Error ? err.message : String(err)
    });
  }
};
