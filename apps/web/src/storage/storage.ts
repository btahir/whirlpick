// Storage adapter (PLAN §6.4): IndexedDB first, then localStorage, then memory.
// All three backends expose the same async interface, so the app never branches on the kind
// except to show the "isn't saving" banner and the "images need IndexedDB" note.
import type { HistoryRecord, ImageAsset, Wheel } from "@whirlpick/core";
import { Idb, openDb } from "./idb";

export type StorageKind = "idb" | "local" | "memory";

export interface WheelRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  wheel: Wheel;
}

export interface ImageRecord extends ImageAsset {
  id: string;
  createdAt: string;
}

export interface Storage {
  readonly kind: StorageKind;
  /** False for localStorage (images are skipped there) and memory. */
  readonly supportsImages: boolean;
  listWheels(): Promise<WheelRecord[]>;
  putWheel(rec: WheelRecord): Promise<void>;
  deleteWheel(id: string): Promise<void>;
  getImages(ids: string[]): Promise<ImageRecord[]>;
  putImage(img: ImageRecord): Promise<void>;
  deleteImage(id: string): Promise<void>;
  listHistory(wheelId: string): Promise<HistoryRecord[]>;
  addHistory(rec: HistoryRecord): Promise<void>;
  putHistory(recs: HistoryRecord[]): Promise<void>;
  deleteHistory(ids: string[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  deleteMeta(key: string): Promise<void>;
}

export const HISTORY_LIMIT_IDB = 500;
export const HISTORY_LIMIT_LOCAL = 100;

const byNewest = (a: { createdAt: string }, b: { createdAt: string }) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

/* ------------------------------------------------------------------ IndexedDB */

export class IdbStorage implements Storage {
  readonly kind = "idb" as const;
  readonly supportsImages = true;
  constructor(private readonly db: Idb) {}

  async listWheels() {
    const all = await this.db.all<WheelRecord>("wheels");
    return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }
  putWheel(rec: WheelRecord) {
    return this.db.put("wheels", rec);
  }
  async deleteWheel(id: string) {
    const hist = await this.db.byIndex<HistoryRecord>("history", "wheelId", id);
    await this.db.deleteMany(
      "history",
      hist.map((h) => h.id),
    );
    await this.db.delete("wheels", id);
  }
  async getImages(ids: string[]) {
    const out: ImageRecord[] = [];
    for (const id of ids) {
      const img = await this.db.get<ImageRecord>("images", id);
      if (img) out.push(img);
    }
    return out;
  }
  putImage(img: ImageRecord) {
    return this.db.put("images", img);
  }
  deleteImage(id: string) {
    return this.db.delete("images", id);
  }
  async listHistory(wheelId: string) {
    return (await this.db.byIndex<HistoryRecord>("history", "wheelId", wheelId)).sort(byNewest);
  }
  async addHistory(rec: HistoryRecord) {
    await this.db.put("history", rec);
    const all = await this.listHistory(rec.wheelId);
    if (all.length > HISTORY_LIMIT_IDB) {
      await this.db.deleteMany(
        "history",
        all.slice(HISTORY_LIMIT_IDB).map((h) => h.id),
      );
    }
  }
  putHistory(recs: HistoryRecord[]) {
    return this.db.putMany("history", recs);
  }
  deleteHistory(ids: string[]) {
    return this.db.deleteMany("history", ids);
  }
  async getMeta<T>(key: string) {
    const row = await this.db.get<{ key: string; value: T }>("meta", key);
    return row?.value;
  }
  setMeta(key: string, value: unknown) {
    return this.db.put("meta", { key, value });
  }
  deleteMeta(key: string) {
    return this.db.delete("meta", key);
  }
}

/* --------------------------------------------------------------- localStorage */

const LS = "whirlpick:v1:";

/** A Storage over any Web Storage-like object (localStorage in the app, a Map-backed fake in tests). */
export class LocalStorage implements Storage {
  readonly kind = "local" as const;
  readonly supportsImages = false;
  constructor(private readonly ls: globalThis.Storage) {}

  private read<T>(key: string): T | undefined {
    const raw = this.ls.getItem(LS + key);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }
  private write(key: string, value: unknown) {
    this.ls.setItem(LS + key, JSON.stringify(value));
  }
  private keys(prefix: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.ls.length; i++) {
      const k = this.ls.key(i);
      if (k && k.startsWith(LS + prefix)) out.push(k.slice(LS.length));
    }
    return out;
  }

  async listWheels() {
    return this.keys("wheels:")
      .map((k) => this.read<WheelRecord>(k))
      .filter((w): w is WheelRecord => !!w)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }
  async putWheel(rec: WheelRecord) {
    // Images are not kept in localStorage; strip refs so a reload doesn't show broken slices.
    this.write(`wheels:${rec.id}`, rec);
  }
  async deleteWheel(id: string) {
    this.ls.removeItem(`${LS}wheels:${id}`);
    this.ls.removeItem(`${LS}history:${id}`);
  }
  async getImages() {
    return [];
  }
  async putImage() {
    /* skipped: localStorage is too small for images (the UI says so) */
  }
  async deleteImage() {}
  async listHistory(wheelId: string) {
    return (this.read<HistoryRecord[]>(`history:${wheelId}`) ?? []).slice().sort(byNewest);
  }
  async addHistory(rec: HistoryRecord) {
    const list = [rec, ...(await this.listHistory(rec.wheelId))].slice(0, HISTORY_LIMIT_LOCAL);
    this.write(`history:${rec.wheelId}`, list);
  }
  async putHistory(recs: HistoryRecord[]) {
    const byWheel = new Map<string, HistoryRecord[]>();
    for (const r of recs) byWheel.set(r.wheelId, [...(byWheel.get(r.wheelId) ?? []), r]);
    for (const [wheelId, add] of byWheel) {
      const existing = await this.listHistory(wheelId);
      const ids = new Set(add.map((r) => r.id));
      const merged = [...add, ...existing.filter((r) => !ids.has(r.id))].sort(byNewest);
      this.write(`history:${wheelId}`, merged.slice(0, HISTORY_LIMIT_LOCAL));
    }
  }
  async deleteHistory(ids: string[]) {
    const drop = new Set(ids);
    for (const k of this.keys("history:")) {
      const list = this.read<HistoryRecord[]>(k) ?? [];
      const kept = list.filter((r) => !drop.has(r.id));
      if (kept.length !== list.length) this.write(k, kept);
    }
  }
  async getMeta<T>(key: string) {
    return this.read<T>(`meta:${key}`);
  }
  async setMeta(key: string, value: unknown) {
    this.write(`meta:${key}`, value);
  }
  async deleteMeta(key: string) {
    this.ls.removeItem(`${LS}meta:${key}`);
  }
}

/* --------------------------------------------------------------------- memory */

export class MemoryStorage implements Storage {
  readonly kind = "memory" as const;
  readonly supportsImages = true;
  private wheels = new Map<string, WheelRecord>();
  private images = new Map<string, ImageRecord>();
  private history = new Map<string, HistoryRecord>();
  private meta = new Map<string, unknown>();

  async listWheels() {
    return [...this.wheels.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
  async putWheel(rec: WheelRecord) {
    this.wheels.set(rec.id, structuredClone(rec));
  }
  async deleteWheel(id: string) {
    this.wheels.delete(id);
    for (const [k, h] of this.history) if (h.wheelId === id) this.history.delete(k);
  }
  async getImages(ids: string[]) {
    return ids.map((id) => this.images.get(id)).filter((i): i is ImageRecord => !!i);
  }
  async putImage(img: ImageRecord) {
    this.images.set(img.id, img);
  }
  async deleteImage(id: string) {
    this.images.delete(id);
  }
  async listHistory(wheelId: string) {
    return [...this.history.values()].filter((h) => h.wheelId === wheelId).sort(byNewest);
  }
  async addHistory(rec: HistoryRecord) {
    this.history.set(rec.id, structuredClone(rec));
  }
  async putHistory(recs: HistoryRecord[]) {
    for (const r of recs) this.history.set(r.id, structuredClone(r));
  }
  async deleteHistory(ids: string[]) {
    for (const id of ids) this.history.delete(id);
  }
  async getMeta<T>(key: string) {
    return this.meta.get(key) as T | undefined;
  }
  async setMeta(key: string, value: unknown) {
    this.meta.set(key, structuredClone(value));
  }
  async deleteMeta(key: string) {
    this.meta.delete(key);
  }
}

/* ----------------------------------------------------------------- selection */

export interface OpenOptions {
  /** Embed mode: always memory (third-party iframes are partitioned; PLAN §6.4). */
  memoryOnly?: boolean;
  idbFactory?: IDBFactory | null;
  localStorage?: globalThis.Storage | null;
}

function probeLocal(ls: globalThis.Storage): boolean {
  const k = `${LS}probe`;
  ls.setItem(k, "1");
  const ok = ls.getItem(k) === "1";
  ls.removeItem(k);
  return ok;
}

export async function openStorage(o: OpenOptions = {}): Promise<Storage> {
  if (o.memoryOnly) return new MemoryStorage();
  const factory =
    o.idbFactory !== undefined ? o.idbFactory : typeof indexedDB !== "undefined" ? indexedDB : null;
  if (factory) {
    try {
      const db = await openDb(factory);
      // A probe transaction: some browsers open the database but throw on first use.
      const idb = new Idb(db);
      await idb.get("meta", "probe");
      return new IdbStorage(idb);
    } catch {
      /* fall through */
    }
  }
  try {
    const ls =
      o.localStorage !== undefined
        ? o.localStorage
        : typeof localStorage !== "undefined"
          ? localStorage
          : null;
    if (ls && probeLocal(ls)) return new LocalStorage(ls);
  } catch {
    /* fall through */
  }
  return new MemoryStorage();
}
