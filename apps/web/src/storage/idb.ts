// A small promise wrapper over IndexedDB (PLAN §6.4). Database "whirlpick", version 1.
// Stores: wheels (keyPath id, index updatedAt), images (id), history (id, indexes wheelId and
// createdAt), meta (key).

export const DB_NAME = "whirlpick";
export const DB_VERSION = 1;
export type StoreName = "wheels" | "images" | "history" | "meta";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export function openDb(factory: IDBFactory = indexedDB, timeoutMs = 4000): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("IndexedDB open timed out"));
      }
    }, timeoutMs);
    let open: IDBOpenDBRequest;
    try {
      open = factory.open(DB_NAME, DB_VERSION);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
      return;
    }
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("wheels")) {
        db.createObjectStore("wheels", { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "id" });
      if (!db.objectStoreNames.contains("history")) {
        const h = db.createObjectStore("history", { keyPath: "id" });
        h.createIndex("wheelId", "wheelId");
        h.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    open.onsuccess = () => {
      clearTimeout(timer);
      if (settled) {
        open.result.close();
        return;
      }
      settled = true;
      resolve(open.result);
    };
    open.onerror = () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(open.error ?? new Error("IndexedDB open failed"));
    };
    open.onblocked = () => {
      /* another tab holds an old version; wait for the timeout */
    };
  });
}

export class Idb {
  constructor(readonly db: IDBDatabase) {}

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const tx = this.db.transaction(store, "readonly");
    return (await req(tx.objectStore(store).get(key))) as T | undefined;
  }

  async all<T>(store: StoreName): Promise<T[]> {
    const tx = this.db.transaction(store, "readonly");
    return (await req(tx.objectStore(store).getAll())) as T[];
  }

  async byIndex<T>(store: StoreName, index: string, key: string): Promise<T[]> {
    const tx = this.db.transaction(store, "readonly");
    return (await req(tx.objectStore(store).index(index).getAll(key))) as T[];
  }

  async put(store: StoreName, value: unknown): Promise<void> {
    const tx = this.db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    await done(tx);
  }

  async putMany(store: StoreName, values: unknown[]): Promise<void> {
    if (!values.length) return;
    const tx = this.db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    for (const v of values) s.put(v);
    await done(tx);
  }

  async delete(store: StoreName, key: string): Promise<void> {
    const tx = this.db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    await done(tx);
  }

  async deleteMany(store: StoreName, keys: string[]): Promise<void> {
    if (!keys.length) return;
    const tx = this.db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    for (const k of keys) s.delete(k);
    await done(tx);
  }

  close(): void {
    this.db.close();
  }
}
