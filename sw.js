const CACHE = "tetrad";

const PREFIX = "tetrad-";

const CORE = [
  "./",
  "CNAME",
  "css/fonts.css",
  "css/gost.css",
  "css/style.css",
  "favicon.svg",
  "fonts/Oswald-500-cyrillic-ext.woff2",
  "fonts/Oswald-500-cyrillic.woff2",
  "fonts/Oswald-500-latin.woff2",
  "fonts/GolosText-var-normal-cyrillic-ext.woff2",
  "fonts/GolosText-var-normal-cyrillic.woff2",
  "fonts/GolosText-var-normal-latin-ext.woff2",
  "fonts/GolosText-var-normal-latin.woff2",
  "fonts/Literata-var-italic-cyrillic-ext.woff2",
  "fonts/Literata-var-italic-cyrillic.woff2",
  "fonts/Literata-var-italic-latin-ext.woff2",
  "fonts/Literata-var-italic-latin.woff2",
  "fonts/Literata-var-normal-cyrillic-ext.woff2",
  "fonts/Literata-var-normal-cyrillic.woff2",
  "fonts/Literata-var-normal-latin-ext.woff2",
  "fonts/Literata-var-normal-latin.woff2",
  "fonts/PTAstraSerif-Regular.woff2",
  "fonts/PTAstraSerif-Bold.woff2",
  "fonts/PTAstraSerif-Italic.woff2",
  "fonts/PTAstraSerif-BoldItalic.woff2",
  "fonts/YesevaOne-normal-400-cyrillic-ext.woff2",
  "fonts/YesevaOne-normal-400-cyrillic.woff2",
  "fonts/YesevaOne-normal-400-latin-ext.woff2",
  "fonts/YesevaOne-normal-400-latin.woff2",
  "icons/apple-icon-180.png",
  "icons/apple-splash-1080-2340.jpg",
  "icons/apple-splash-1125-2436.jpg",
  "icons/apple-splash-1136-640.jpg",
  "icons/apple-splash-1170-2532.jpg",
  "icons/apple-splash-1179-2556.jpg",
  "icons/apple-splash-1206-2622.jpg",
  "icons/apple-splash-1242-2208.jpg",
  "icons/apple-splash-1242-2688.jpg",
  "icons/apple-splash-1260-2736.jpg",
  "icons/apple-splash-1284-2778.jpg",
  "icons/apple-splash-1290-2796.jpg",
  "icons/apple-splash-1320-2868.jpg",
  "icons/apple-splash-1334-750.jpg",
  "icons/apple-splash-1488-2266.jpg",
  "icons/apple-splash-1536-2048.jpg",
  "icons/apple-splash-1620-2160.jpg",
  "icons/apple-splash-1640-2360.jpg",
  "icons/apple-splash-1668-2224.jpg",
  "icons/apple-splash-1668-2388.jpg",
  "icons/apple-splash-1668-2420.jpg",
  "icons/apple-splash-1792-828.jpg",
  "icons/apple-splash-2048-1536.jpg",
  "icons/apple-splash-2048-2732.jpg",
  "icons/apple-splash-2064-2752.jpg",
  "icons/apple-splash-2160-1620.jpg",
  "icons/apple-splash-2208-1242.jpg",
  "icons/apple-splash-2224-1668.jpg",
  "icons/apple-splash-2266-1488.jpg",
  "icons/apple-splash-2340-1080.jpg",
  "icons/apple-splash-2360-1640.jpg",
  "icons/apple-splash-2388-1668.jpg",
  "icons/apple-splash-2420-1668.jpg",
  "icons/apple-splash-2436-1125.jpg",
  "icons/apple-splash-2532-1170.jpg",
  "icons/apple-splash-2556-1179.jpg",
  "icons/apple-splash-2622-1206.jpg",
  "icons/apple-splash-2688-1242.jpg",
  "icons/apple-splash-2732-2048.jpg",
  "icons/apple-splash-2736-1260.jpg",
  "icons/apple-splash-2752-2064.jpg",
  "icons/apple-splash-2778-1284.jpg",
  "icons/apple-splash-2796-1290.jpg",
  "icons/apple-splash-2868-1320.jpg",
  "icons/apple-splash-640-1136.jpg",
  "icons/apple-splash-750-1334.jpg",
  "icons/apple-splash-828-1792.jpg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "icons/manifest-icon-192.maskable.png",
  "icons/manifest-icon-512.maskable.png",
  "index.html",
  "js/asr.worker.js",
  "js/audio.features.js",
  "js/bookmarks.js",
  "js/common.js",
  "js/dictate.js",
  "js/editor.js",
  "js/export.helpers.js",
  "js/feature.diff.js",
  "js/feature.export.js",
  "js/feature.readability.js",
  "js/features.js",
  "js/gost.docx.js",
  "js/gost.js",
  "js/gost.layout.js",
  "js/gost.model.js",
  "js/gost.preview.js",
  "js/gost.studio.js",
  "js/handmarks.js",
  "js/idb.js",
  "js/ocr.js",
  "js/ocr.worker.js",
  "js/presets.js",
  "js/readability.core.js",
  "js/readability.worker.js",
  "js/rec.worklet.js",
  "js/room-transition.js",
  "js/storage.js",
  "js/summarize.core.js",
  "js/text.core.js",
  "js/theme-boot.js",
  "js/tips.js",
  "lib/diff/diff.umd.js",
  "lib/docx/docx.umd.js",
  "lib/fonts/PTSans-Bold.ttf",
  "lib/fonts/PTSans-Regular.ttf",
  "lib/jspdf/jspdf.umd.min.js",
  "lib/ocr/bundle.js",
  "lib/onnx/ort-wasm-simd-threaded.asyncify.mjs",
  "lib/onnx/ort-wasm-simd-threaded.asyncify.wasm",
  "lib/onnx/ort-wasm-simd-threaded.jsep.mjs",
  "lib/onnx/ort-wasm-simd-threaded.jsep.wasm",
  "lib/onnx/ort.webgpu.min.mjs",
  "lib/pdfjs/pdf.min.js",
  "lib/pdfjs/pdf.worker.min.js",
  "lib/rough-notation/rough-notation.iife.js",
  "lib/tiptap/tiptap.bundle.js",
  "manifest.json"
];

self.addEventListener("install", event => {

  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE.map(u => new Request(u, { cache: "reload" }))).catch(err => {
        console.warn("[sw] addAll не прошёл, кэширую поштучно:", err);
        return Promise.allSettled(CORE.map(url => cache.add(url))).then(results => {
          const failed = CORE.filter((url, i) => results[i].status === "rejected");
          if (failed.length) {
            console.warn("[sw] не пре-кэшировано (" + failed.length + "):", failed);
          }
        });
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function cacheAndRefresh(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then(c => c.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && (url.pathname.includes("/font-") || url.pathname.endsWith(".woff2"))) {

    event.respondWith(caches.match(request).then(hit => hit || fetch(request, { cache: "reload" }).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(request, copy));
      return resp;
    })));
    return;
  }
  if (request.mode === "navigate") {

    event.respondWith(fetch(request, { cache: "reload" }).then(resp => cacheAndRefresh(request, resp)).catch(() => caches.match(request).then(hit => hit || caches.match("index.html"))));
    return;
  }
  if (!sameOrigin) return;

  event.respondWith(fetch(request, { cache: "reload" }).then(resp => cacheAndRefresh(request, resp)).catch(() => caches.match(request)));
});
