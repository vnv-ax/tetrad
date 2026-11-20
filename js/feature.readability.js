function gradeLabel(v) {
  if (v < 7) return "начальная школа";
  if (v < 10) return "средняя школа";
  if (v < 13) return "старшие классы";
  if (v <= 16) return "вуз";
  return "научная литература";
}

function easeLabel(v) {
  if (v >= 90) return "очень лёгкий";
  if (v >= 80) return "лёгкий";
  if (v >= 70) return "довольно лёгкий";
  if (v >= 60) return "стандартный";
  if (v >= 50) return "несколько сложный";
  if (v >= 30) return "сложный";
  return "очень сложный";
}

export function createReadability() {
  let worker = null;
  let seq = 0;
  const pending = new Map;
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL("./readability.worker.js", import.meta.url), {
      type: "module"
    });
    worker.onmessage = e => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.message));
    };
    worker.onerror = e => {
      const err = new Error(e.message || "Ошибка воркера читаемости");
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    };
    return worker;
  }
  return {
    async init() {
      ensureWorker();
    },
    run(text) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, {
          resolve: r => resolve({
            ...r,
            easeLabel: easeLabel(r.fleschReadingEase),
            gradeHint: gradeLabel(r.averageGrade)
          }),
          reject: reject
        });
        ensureWorker().postMessage({
          id: id,
          type: "run",
          text: text
        });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error("Превышено время ожидания"));
          }
        }, 6e4);
      });
    },
    destroy() {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      pending.clear();
    }
  };
}