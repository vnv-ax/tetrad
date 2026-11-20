import * as ort from "../lib/onnx/ort.webgpu.min.mjs";

import { PaddleOcrService, isWebGpuAvailable } from "../lib/ocr/bundle.js";

ort.env.wasm.wasmPaths = new URL("../lib/onnx/", import.meta.url).href;

ort.env.wasm.numThreads = 1;

let service = null;

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

async function handleInit(msg) {
  if (service) {
    const s = service;
    service = null;
    try {
      await s.destroy();
    } catch {}
  }
  let degraded = false;
  const next = new PaddleOcrService({
    model: {
      detection: msg.detection,
      recognition: msg.recognition,
      charactersDictionary: msg.dictionary
    },
    session: {
      onSessionFallback: () => {
        degraded = true;
      }
    },
    recognition: {
      mainThreadYieldMs: 0,
      charactersDictionary: []
    }
  });
  const t0 = performance.now();
  await next.initialize();
  service = next;
  let gpu = false;
  try {
    gpu = await isWebGpuAvailable();
  } catch {
    gpu = false;
  }
  const backend = !degraded && gpu ? "webgpu" : "wasm";
  post({
    type: "ready",
    id: msg.id,
    modelId: msg.modelId,
    backend: backend,
    elapsedMs: performance.now() - t0
  });
}

async function handleRecognize(msg) {
  if (!service) throw new Error("движок не инициализирован");
  const t0 = performance.now();
  const result = await service.recognize(msg.image);
  post({
    type: "result",
    id: msg.id,
    text: result.text,
    confidence: result.confidence,
    lines: (result.lines || []).map(group => group.map(r => ({
      text: r.text,
      box: r.box,
      confidence: r.confidence
    }))),
    elapsedMs: performance.now() - t0
  });
}

self.onmessage = async event => {
  const msg = event.data;
  try {
    if (msg.type === "init") await handleInit(msg); else if (msg.type === "recognize") await handleRecognize(msg);
  } catch (err) {
    post({
      type: "error",
      id: msg.id,
      message: err instanceof Error ? err.message : String(err)
    });
  }
};