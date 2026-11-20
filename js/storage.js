

import { IdbKV } from "./idb.js";
import { toast, warnOnce } from "./common.js";

let quotaWarned = 0;

function quotaMessage(context) {
  const now = Date.now();
  if (now - quotaWarned < 5e3) return;
  quotaWarned = now;
  toast("Хранилище переполнено — последние изменения " + context + " могут не сохраниться", 5e3);
}

function isQuotaError(err) {
  return err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || /quota/i.test(String(err.message || "")));
}

export async function kvGetMigrated(key) {
  try {
    const v = await IdbKV.get(key);
    if (v !== undefined && v !== null) return v;
  } catch (err) {

    warnOnce("idb-read:" + key, "IndexedDB не читается (" + key + "):", err);
  }
  try {
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      kvSet(key, legacy, "").catch(() => {});
      return legacy;
    }
  } catch {}
  return null;
}

export async function kvSet(key, value, context) {
  try {
    await IdbKV.put(key, value);
    return true;
  } catch (err) {
    if (isQuotaError(err)) quotaMessage(context || "не сохранились"); else throw err;
    return false;
  }
}

export async function kvDel(key) {
  try {
    await IdbKV.del(key);
  } catch (err) {
    warnOnce("idb-del:" + key, "IndexedDB не удалил (" + key + "):", err);
  }
}

export function kvGetString(key) {
  return kvGetMigrated(key).then(v => typeof v === "string" ? v : null);
}

let persistRequested = false;

export async function ensurePersistentStorage() {
  try {
    if (!navigator.storage) return false;
    if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
    if (!navigator.storage.persist) return false;
    if (!persistRequested) {

      persistRequested = true;
      await navigator.storage.persist();
    }
    return !!(navigator.storage.persisted && await navigator.storage.persisted());
  } catch (err) {
    warnOnce("storage-persist", "Не удалось запросить постоянное хранилище:", err);
    return false;
  }
}

export async function storagePersisted() {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return null;
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
