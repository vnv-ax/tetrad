import { analyze } from "./readability.core.js";

self.onmessage = async event => {
  const {id: id, type: type, text: text} = event.data;
  if (type !== "run") return;
  try {
    const a = analyze(text);
    self.postMessage({
      id: id,
      ok: true,
      result: a
    });
  } catch (err) {
    self.postMessage({
      id: id,
      ok: false,
      message: err && err.message || String(err)
    });
  }
};
