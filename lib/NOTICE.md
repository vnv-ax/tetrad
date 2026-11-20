# Сторонние компоненты в папке lib/

Все библиотеки размещены локально (без CDN) и подключаются лениво —
только при использовании соответствующей функции.

| Компонент | Файл | Версия | Лицензия | Использование |
|---|---|---|---|---|
| TipTap (сборка) | `tiptap/tiptap.bundle.js` | 2.x | MIT | Редактор на ProseMirror |
| jsdiff (diff) | `diff/diff.umd.js` | 9.0.0 | MIT | Сравнение текстов |
| Rough Notation | `rough-notation/rough-notation.iife.js` | 0.5.1 | MIT | Рукописные обводки текста (глобал `RoughNotation`) |
| docx | `docx/docx.umd.js` | 9.15.3 | MIT | Экспорт DOCX |
| jsPDF | `jspdf/jspdf.umd.min.js` | 4.2.1 | MIT | Экспорт PDF |
| ONNX Runtime Web | `onnx/ort.webgpu.min.mjs`, `onnx/ort-wasm-simd-threaded.jsep.{mjs,wasm}`, `onnx/ort-wasm-simd-threaded.asyncify.{mjs,wasm}` | 1.23.2 | MIT | Движок моделей OCR и диктовки (папка lib/onnx/); asyncify-вариант нужен для wasm-бэкенда, когда WebGPU недоступен |
| pdf.js | `pdfjs/pdf.min.js`, `pdfjs/pdf.worker.min.js` | — | Apache-2.0 | Рендер PDF в Приёмной |
| PaddleOCR-модели | скачиваются с Hugging Face (`snowfluke/ppu-paddle-ocr-models`, ревизия прибита в `js/ocr.js`) | — | Apache-2.0 | Распознавание текста |
| GigaAM-модель | скачивается с Hugging Face (`istupakov/gigaam-v3-onnx`, ревизия прибита в `js/dictate.js`) | — | Apache-2.0 | Диктовка |
| PT Sans | `fonts/PTSans-Regular.ttf`, `PTSans-Bold.ttf` | — | OFL | Шрифт, встраиваемый в PDF |

Шрифты оформления (Yeseva One, Literata, Golos Text) лежат в `fonts/`
и подключаются через `css/fonts.css`; все они распространяются по лицензии
SIL Open Font License через Google Fonts.

Служебные значки интерфейса (двери комнат, закладки-инструменты,
шапка, плинтус) нарисованы специально для «Тетради» — простые контурные
SVG, встроены прямо в `index.html`; сторонних наборов не используется.

Свои реализации вместо npm-пакетов:

- **Читаемость** (`js/readability.core.js`) — слоги кириллицы считаются
  по гласным, лёгкость русского текста — по формуле Оборневой;
  для латиницы — классические Флеш, Флеш–Кинкейд, туман Ганнинга, SMOG.
  Vendored-библиотека readlevel удалена: она не считала слоги кириллицы
  и давала бессмысленные числа на русском.
- **Суммаризация** («Краткий пересказ», `js/summarize.core.js`) —
  экстрактивный метод, автоопределение кириллицы, без зависимостей.
- **Аудио-обработка диктовки** (`js/audio.features.js`) — точное ДПФ-320
  по Кули–Тьюки (5 × 64), энерговая VAD и склейка перекрывающихся чанков.

html2canvas из `lib/` удалён — остался только в истории (переход между
комнатами переписан на CSS-кроссфейд, `js/room-transition.js`).
