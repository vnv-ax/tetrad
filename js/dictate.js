

import { toast, updateFading, warnOnce } from "./common.js";
import { sendToOffice } from "./editor.js";
import { IdbKV } from "./idb.js";
import { ensurePersistentStorage, kvGetMigrated, kvSet } from "./storage.js";

const $ = id => document.getElementById(id);

const ASR_REV = "322c3b29492673eb7d0b434bfa9dfb8653e34d02";
const GIGA_URL = `https://huggingface.co/istupakov/gigaam-v3-onnx/resolve/${ASR_REV}/v3_ctc.int8.onnx`;
const GIGA_SHA256 = "ceb61454e2e1a2dec5872cbac1de0fe0a4271d1148f6b26b5bda53ff30a12acd";
  const GIGA_SIZE = 224721181;
  const MB = 1024 * 1024;
  const btnRecord = $("btnRecord"), recLabel = $("recLabel"), recTimer = $("recTimer"), recHint = $("recHint");
  const vuBar = $("vuBar"), dictText = $("dictText"), dictStatus = $("dictStatus");
  const modelStatus = $("modelStatus"), modelProgress = $("modelProgress"), modelBar = $("modelBar"), modelText = $("modelText");
  const btnLoad = $("btnLoadModel"), btnDelete = $("btnDeleteModel");
  let modelReady = false, modelLoading = false;
  let worker = null, reqId = 0;
  const pending = new Map;
  let recording = false, stream = null, audioCtx = null, captureNode = null, srcNode = null;
  let chunks = [], actualRate = 16e3;
  let timerInt = null, recSeconds = 0;
  function workerCall(msg, transfer) {
    return new Promise((resolve, reject) => {
      msg.id = ++reqId;
      const timer = setTimeout(() => {
        if (pending.has(msg.id)) {
          pending.delete(msg.id);
          reject(new Error("Превышено время ожидания"));
        }
      }, 10 * 60 * 1e3);
      pending.set(msg.id, {
        resolve: resolve,
        reject: reject,
        timer: timer
      });
      ensureWorker().postMessage(msg, transfer || []);
    });
  }
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker("js/asr.worker.js", {
      type: "module"
    });
    worker.onmessage = e => {
      const msg = e.data;
      if (msg.type === "progress") {
        setDictStatus(`Распознаю… часть ${msg.chunk} из ${msg.total}`);
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.type === "error") p.reject(new Error(msg.message)); else p.resolve(msg);
    };
    const dropAll = why => {
      const err = new Error(why);
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      pending.clear();
      worker = null;
    };
    worker.onerror = e => dropAll(`Ошибка воркера: ${e.message || "неизвестная"}`);
    worker.onmessageerror = () => dropAll("Воркер вернул нераспознанное сообщение");
    return worker;
  }
  function setModelStatus(text) {
    modelStatus.textContent = text;
  }
  function setDictStatus(text) {
    dictStatus.textContent = text;
  }
  function setProgress(frac, label) {
    modelProgress.hidden = frac === null;
    if (frac !== null) {
      modelBar.style.width = `${Math.round(frac * 100)}%`;
      modelText.textContent = label || "";
    }
  }
  async function checkCachedModel() {
    try {
      const buf = await IdbKV.get(GIGA_URL);
      if (buf) {
        setModelStatus(`Модель в кэше (${(buf.byteLength / MB).toFixed(0)} МБ)`);
        btnDelete.hidden = false;
        return buf;
      }
    } catch (err) {
      warnOnce("asr-cache-read", "Не удалось прочитать кэш модели:", err);
    }
    setModelStatus("Модель GigaAM не загружена (~225 МБ, один раз)");
    btnDelete.hidden = true;
    return null;
  }
  async function loadModel(quiet) {
    if (modelReady || modelLoading) return;
    modelLoading = true;
    btnLoad.disabled = true;
    try {
      let buf = await checkCachedModel();
      if (!buf) {
        setDictStatus("Загружаю модель GigaAM…");

        const persisted = await ensurePersistentStorage();
        if (!persisted) {
          warnOnce("asr-persist", "Хранилище не помечено постоянным — браузер может вычистить кэш модели");
        }
        buf = await fetchWithProgress(GIGA_URL, GIGA_SHA256, GIGA_SIZE, (frac, rec, total) => {
          setProgress(frac, `GigaAM: ${(rec / MB).toFixed(0)} / ${(total / MB).toFixed(0)} МБ`);
        });
        try {
          await IdbKV.put(GIGA_URL, buf.slice(0));
        } catch (err) {

          warnOnce("asr-cache-put", "Кэш модели не сохранился:", err);
        }
      }
      setProgress(1, "Инициализация сессии…");
      const resp = await workerCall({
        type: "init",
        model: buf
      }, [ buf ]);
      modelReady = true;
      setProgress(null);
      setModelStatus(`Модель готова · бэкенд: ${resp.backend}`);
      btnDelete.hidden = false;
      setDictStatus(`Движок: GigaAM (${resp.backend}) — нажмите «Диктовать»`);
      if (!quiet) toast("Модель GigaAM готова ✓");
      if (!Array.isArray(resp.inputs) || !resp.inputs.includes("features")) {
        console.warn("Неожиданные входы модели:", resp.inputs);
      }
    } catch (err) {
      setProgress(null);
      setModelStatus(`Не удалось загрузить модель: ${err.message}`);
      setDictStatus("Движок: GigaAM (не загружена)");
      if (!quiet) throw err;
    } finally {
      modelLoading = false;
      btnLoad.disabled = false;
      updateRecordAvailability();
    }
  }

  export async function asrModelCached() {
    try {
      return !!(await IdbKV.get(GIGA_URL));
    } catch {
      return false;
    }
  }
  export function asrPreload() {
    return loadModel(true);
  }
  async function deleteModel() {

    await IdbKV.del(GIGA_URL);
    if (worker) {
      worker.terminate();
      worker = null;
    }
    modelReady = false;
    setModelStatus("Модель удалена из кэша");
    btnDelete.hidden = true;
    updateRecordAvailability();
    toast("Кэш модели очищен");
  }
  async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [ ...new Uint8Array(digest) ].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function fetchWithProgress(url, expectedSha, approxTotal, onProgress) {

    const STALL_MS = 60 * 1e3;
    const controller = new AbortController();
    const stallTimer = setInterval(() => controller.abort(new DOMException("Скачивание прервано: сеть не отвечает", "TimeoutError")), STALL_MS);
    try {
      let resp;
      try {
        resp = await fetch(url, {
          mode: "cors",
          signal: controller.signal
        });
      } catch (err) {
        if (err && err.name === "TimeoutError") throw new Error("Скачивание прервано: сеть не отвечает");
        throw new Error(`Не удалось загрузить модель: проверьте сеть (${err.message || err})`);
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const total = Number(resp.headers.get("content-length") || approxTotal);
      let buf;
      if (!resp.body) {

        buf = await resp.arrayBuffer();
        onProgress(1, buf.byteLength, buf.byteLength);
      } else {
        const reader = resp.body.getReader();
        const parts = [];
        let received = 0;
        for (;;) {
          const {done: done, value: value} = await reader.read();
          if (done) break;
          if (value) {
            parts.push(value);
            received += value.byteLength;
            onProgress(total ? received / total : 0, received, total || approxTotal);
          }
        }
        buf = await new Blob(parts).arrayBuffer();
      }

      const hex = await sha256Hex(buf);
      if (expectedSha && hex !== expectedSha) {
        throw new Error("Модель не прошла проверку целостности — скачивание прервано");
      }
      return buf;
    } finally {
      clearInterval(stallTimer);
    }
  }
  btnLoad.addEventListener("click", () => loadModel());
  btnDelete.addEventListener("click", async () => {
    try {
      await deleteModel();
    } catch (err) {
      warnOnce("asr-cache-del", "Кэш модели не удалён:", err);
      toast("Не удалось удалить кэш модели");
    }
  });
  function updateRecordAvailability() {
    if (!modelReady) {
      btnRecord.disabled = true;
      recHint.textContent = "Загрузите модель — и диктуйте даже без интернета.";
    } else {
      btnRecord.disabled = false;
      if (!recording) recHint.textContent = "Нажмите кнопку и говорите. Запись обработается сразу после остановки.";
    }
  }
  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch {
      return toast("Нет доступа к микрофону — разрешите запись в браузере");
    }
    chunks = [];
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16e3
    });
    actualRate = audioCtx.sampleRate;
    srcNode = audioCtx.createMediaStreamSource(stream);
    const silent = audioCtx.createGain();
    silent.gain.value = 0;
    srcNode.connect(silent);
    let useWorklet = true;
    try {
      await audioCtx.audioWorklet.addModule("js/rec.worklet.js");
      captureNode = new AudioWorkletNode(audioCtx, "rec-capture");
      captureNode.port.onmessage = e => {
        chunks.push(e.data);
        updateVu(e.data);
      };
      srcNode.connect(captureNode);
    } catch {
      useWorklet = false;
      captureNode = audioCtx.createScriptProcessor(4096, 1, 1);
      captureNode.onaudioprocess = e => {
        const d = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(d);
        updateVu(d);
      };
      srcNode.connect(captureNode);
      captureNode.connect(silent);
    }
    silent.connect(audioCtx.destination);
    recording = true;
    recSeconds = 0;
    btnRecord.classList.add("recording");
    recLabel.textContent = "Остановить";
    recTimer.textContent = "00:00";
    timerInt = setInterval(() => {
      recSeconds++;
      const m = String(Math.floor(recSeconds / 60)).padStart(2, "0");
      const s = String(recSeconds % 60).padStart(2, "0");
      recTimer.textContent = `${m}:${s}`;
    }, 1e3);
    setDictStatus(useWorklet ? "Записываю… (AudioWorklet)" : "Записываю… (ScriptProcessor)");
  }
  function updateVu(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    vuBar.style.width = `${Math.min(100, rms * 320)}%`;
  }
  function linearResample(data, from, to) {
    if (from === to) return data;
    const ratio = from / to;
    const outLen = Math.round(data.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, data.length - 1);
      const frac = pos - i0;
      out[i] = data[i0] * (1 - frac) + data[i1] * frac;
    }
    return out;
  }
  async function stopRecording() {
    recording = false;
    clearInterval(timerInt);
    btnRecord.classList.remove("recording");
    recLabel.textContent = "Диктовать";
    vuBar.style.width = "0%";
    try {
      captureNode && captureNode.disconnect();
      srcNode && srcNode.disconnect();
    } catch {}
    stream && stream.getTracks().forEach(t => t.stop());
    const rate = actualRate;
    const raw = chunks;
    chunks = [];
    try {
      audioCtx && audioCtx.close();
    } catch {}
    audioCtx = null;
    if (!raw.length) return setDictStatus("Запись пуста");
    const totalLen = raw.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(totalLen);
    let off = 0;
    for (const c of raw) {
      merged.set(c, off);
      off += c.length;
    }
    const audio = linearResample(merged, rate, 16e3);
    const secs = audio.length / 16e3;
    if (secs < .4) return setDictStatus("Слишком короткая запись");
    setDictStatus(`Распознаю ${Math.round(secs)} с записи…`);
    btnRecord.disabled = true;
    try {
      const resp = await workerCall({
        type: "transcribe",
        audio: audio
      }, [ audio.buffer ]);
      applyTranscript(resp.text);
      setDictStatus(`Готово за ${(resp.elapsedMs / 1e3).toFixed(1)} с · GigaAM`);
      toast("Распознавание завершено ✓");
    } catch (err) {
      setDictStatus(`Ошибка распознавания: ${err.message}`);
      toast("Не удалось распознать запись");
    } finally {
      btnRecord.disabled = !modelReady;
    }
  }
  function applySentenceStyle(text) {
    let t = text.replace(/\s+/g, " ").trim();
    if (!$("chkSentences").checked) return t;
    t = t.replace(/(^|[.!?…]\s+)([\p{Ll}ё])/gu, (_m, p, c) => p + c.toUpperCase());
    t = t.replace(/\s+([,.;:!?])/g, "$1");
    if (t && !/[.!?…]$/.test(t)) t += ".";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function applyTranscript(raw) {
    const text = applySentenceStyle(raw);
    if (!text) {
      toast("Речь не распознана");
      return;
    }
    if ($("chkAppend").checked && dictText.value.trim()) {
      dictText.value = dictText.value.trimEnd() + "\n" + text;
    } else {
      dictText.value = text;
    }
    updateFading(dictText);
    saveDraft();
  }
  btnRecord.addEventListener("click", () => {
    if (recording) stopRecording(); else startRecording();
  });
  $("btnDictCopy").addEventListener("click", async () => {
    if (!dictText.value) return toast("Пока нечего копировать");
    try {
      await navigator.clipboard.writeText(dictText.value);
      toast("Скопировано ✓");
    } catch (err) {
      warnOnce("clipboard", "Буфер обмена недоступен:", err);
      toast("Не удалось скопировать — браузер запретил доступ к буферу");
    }
  });
  $("btnDictToOffice").addEventListener("click", () => {
    if (!dictText.value) return toast("Пока нечего передавать");
    sendToOffice(dictText.value, "Заметка передана в тетрадь");
  });
  $("btnDictClear").addEventListener("click", () => {
    dictText.value = "";
    updateFading(dictText);
    saveDraft();
  });
  $("chkAppend").addEventListener("change", saveDraft);
  $("chkSentences").addEventListener("change", saveDraft);
  function saveDraft() {
    kvSet("cabinet-dict", JSON.stringify({
      text: dictText.value,
      append: $("chkAppend").checked,
      sent: $("chkSentences").checked
    }), "диктовка").catch(() => {});
  }
  (async function restoreDraft() {
    try {
      const d = JSON.parse((await kvGetMigrated("cabinet-dict")) || "null");
      if (d) {
        dictText.value = d.text || "";
        $("chkAppend").checked = !!d.append;
        $("chkSentences").checked = d.sent !== false;
        updateFading(dictText);
      }
    } catch (err) {
      warnOnce("dict-restore", "Заметка диктовки не восстановилась:", err);
    }
  })();
  checkCachedModel();
  updateRecordAvailability();