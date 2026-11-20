

const DB_NAME = "cabinet-cache";
const STORE = "kv";

const CHUNK_LIMIT_DEFAULT = 100 * 1024 * 1024;
const CHUNK_SUFFIX = "#c";

function chunkLimit() {
  const override = Number(globalThis.__IDB_CHUNK_LIMIT__);
  return Number.isFinite(override) && override > 0 ? override : CHUNK_LIMIT_DEFAULT;
}

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error("IndexedDB: не удалось открыть"));
      };
    });
  }
  return dbPromise;
}

const chunkKey = (key, i) => key + CHUNK_SUFFIX + i;

const isBinary = v => v instanceof ArrayBuffer || ArrayBuffer.isView(v);

function toBytes(v) {
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

const isChunkMeta = v => v && typeof v === "object" && !(v instanceof ArrayBuffer) && !ArrayBuffer.isView(v) && v.v === 2 && Number.isInteger(v.chunks) && v.chunks > 0;

function rawGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const rq = tx.objectStore(STORE).get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

async function get(key) {
  const db = await openDb();
  const value = await rawGet(db, key);
  if (!isChunkMeta(value)) return value;
  const parts = [];
  let total = 0;
  for (let i = 0; i < value.chunks; i++) {
    const part = await rawGet(db, chunkKey(key, i));
    if (!isBinary(part)) throw new Error("IndexedDB: фрагмент " + i + " записи не найден — кэш повреждён");
    const bytes = toBytes(part);
    parts.push(bytes);
    total += bytes.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const bytes of parts) {
    out.set(bytes, off);
    off += bytes.length;
  }
  return out.buffer;
}

async function put(key, value) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    if (isBinary(value) && value.byteLength > chunkLimit()) {
      const bytes = toBytes(value);
      const n = Math.ceil(bytes.length / chunkLimit());
      for (let i = 0; i < n; i++) store.put(bytes.slice(i * chunkLimit(), (i + 1) * chunkLimit()), chunkKey(key, i));
      store.put({
        v: 2,
        chunks: n,
        size: bytes.length
      }, key);
    } else {
      store.put(value, key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB: транзакция прервана"));
  });
}

async function del(key) {
  const db = await openDb();

  let chunks = 0;
  try {
    const meta = await rawGet(db, key);
    if (isChunkMeta(meta)) chunks = meta.chunks;
  } catch {}
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete(key);
    for (let i = 0; i < chunks; i++) store.delete(chunkKey(key, i));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB: транзакция прервана"));
  });
}

async function keys() {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const rq = tx.objectStore(STORE).getAllKeys();
    rq.onsuccess = () => resolve(rq.result || []);
    rq.onerror = () => reject(rq.error);
  });
}

export const IdbKV = {
  get: get,
  put: put,
  del: del,
  keys: keys
};
