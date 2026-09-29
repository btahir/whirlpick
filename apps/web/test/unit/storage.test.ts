import { describe, expect, it } from "vitest";
import type { HistoryRecord, Receipt, Wheel } from "@whirlpick/core";
import { presetWheel } from "../../src/state/defaults";
import { HISTORY_LIMIT_LOCAL, LocalStorage, MemoryStorage, openStorage, type Storage, type WheelRecord } from "../../src/storage/storage";

class FakeLocal implements globalThis.Storage {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}
class Throwing extends FakeLocal {
  override setItem(): void {
    throw new Error("QuotaExceededError");
  }
}
const throwingIdb = { open: () => { throw new Error("blocked"); } } as unknown as IDBFactory;

const rec = (w: Wheel, updatedAt = "2026-01-01T00:00:00.000Z"): WheelRecord => ({ id: w.id, name: w.name, createdAt: updatedAt, updatedAt, wheel: w });
const hist = (id: string, wheelId: string, createdAt: string): HistoryRecord => ({ id, wheelId, createdAt, receipt: { commitment: id } as unknown as Receipt, teamNames: null });

async function exercise(s: Storage) {
  const a = { ...presetWheel("names-sample")!, id: "w_aaaaaaaa", name: "A" };
  const b = { ...presetWheel("yes-no")!, id: "w_bbbbbbbb", name: "B" };
  await s.putWheel(rec(a, "2026-01-01T00:00:00.000Z"));
  await s.putWheel(rec(b, "2026-01-02T00:00:00.000Z"));
  expect((await s.listWheels()).map((w) => w.id)).toEqual(["w_bbbbbbbb", "w_aaaaaaaa"]);
  await s.addHistory(hist("h_1", a.id, "2026-01-01T00:00:01.000Z"));
  await s.addHistory(hist("h_2", a.id, "2026-01-01T00:00:02.000Z"));
  expect((await s.listHistory(a.id)).map((h) => h.id)).toEqual(["h_2", "h_1"]);
  await s.setMeta("prefs", { muted: true });
  expect(await s.getMeta("prefs")).toEqual({ muted: true });
  await s.deleteWheel(a.id);
  expect((await s.listWheels()).map((w) => w.id)).toEqual(["w_bbbbbbbb"]);
  expect(await s.listHistory(a.id)).toEqual([]);
}

describe("storage backends", () => {
  it("memory backend round-trips wheels, history and meta", async () => {
    await exercise(new MemoryStorage());
  });
  it("localStorage backend round-trips wheels, history and meta", async () => {
    await exercise(new LocalStorage(new FakeLocal()));
  });
  it("localStorage keeps the last 100 history records per wheel and skips images", async () => {
    const s = new LocalStorage(new FakeLocal());
    for (let i = 0; i < 130; i++) await s.addHistory(hist(`h_${i}`, "w_x", `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0")}Z`));
    expect((await s.listHistory("w_x")).length).toBe(HISTORY_LIMIT_LOCAL);
    await s.putImage({ id: "img_1", dataUrl: "data:", width: 1, height: 1, createdAt: "x" });
    expect(await s.getImages(["img_1"])).toEqual([]);
    expect(s.supportsImages).toBe(false);
  });
});

describe("openStorage fallbacks (PLAN §6.4)", () => {
  it("falls back to localStorage when IndexedDB throws", async () => {
    const s = await openStorage({ idbFactory: throwingIdb, localStorage: new FakeLocal() });
    expect(s.kind).toBe("local");
  });
  it("falls back to memory when both are blocked", async () => {
    const s = await openStorage({ idbFactory: throwingIdb, localStorage: new Throwing() });
    expect(s.kind).toBe("memory");
  });
  it("uses memory in embed mode", async () => {
    const s = await openStorage({ memoryOnly: true, localStorage: new FakeLocal() });
    expect(s.kind).toBe("memory");
  });
  it("uses memory when no storage exists at all", async () => {
    const s = await openStorage({ idbFactory: null, localStorage: null });
    expect(s.kind).toBe("memory");
  });
});
