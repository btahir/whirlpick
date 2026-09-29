import { describe, expect, it } from "vitest";
import { buildReceipt, type Entry, type HistoryRecord } from "@whirlpick/core";
import { initialState, presetWheel } from "../../src/state/defaults";
import { activeWheel, reducer, sessionOf } from "../../src/state/reducer";
import type { AppState, SpinPlan } from "../../src/state/types";

const wheel = () => presetWheel("names-sample")!;
const base = (): AppState => ({ ...initialState(wheel()), ready: true });
const ent = (label: string, id = `e_${label.toLowerCase().padEnd(8, "0").slice(0, 8)}`): Entry => ({ id, label, weight: 1, enabled: true });

describe("reducer: entries and undo", () => {
  it("sets entries and undoes them", () => {
    let s = base();
    const before = activeWheel(s).entries;
    s = reducer(s, { type: "entries/set", entries: [ent("Ada"), ent("Grace")], undo: "Edit", now: 1000 });
    expect(activeWheel(s).entries.map((e) => e.label)).toEqual(["Ada", "Grace"]);
    s = reducer(s, { type: "undo" });
    expect(activeWheel(s).entries).toBe(before);
    s = reducer(s, { type: "redo" });
    expect(activeWheel(s).entries.map((e) => e.label)).toEqual(["Ada", "Grace"]);
  });

  it("coalesces typing into one undo step within a second", () => {
    let s = base();
    s = reducer(s, { type: "entries/set", entries: [ent("A")], coalesce: "typing", now: 1000 });
    s = reducer(s, { type: "entries/set", entries: [ent("Ad")], coalesce: "typing", now: 1400 });
    s = reducer(s, { type: "entries/set", entries: [ent("Ada")], coalesce: "typing", now: 1800 });
    expect(s.undo.past).toHaveLength(1);
    s = reducer(s, { type: "entries/set", entries: [ent("Ada"), ent("B")], coalesce: "typing", now: 4000 });
    expect(s.undo.past).toHaveLength(2);
  });

  it("caps undo history at 50 steps", () => {
    let s = base();
    for (let i = 0; i < 70; i++) s = reducer(s, { type: "entries/set", entries: [ent(`N${i}`)], undo: "x", now: i * 5000 });
    expect(s.undo.past.length).toBe(50);
  });

  it("patches an entry and keeps optional fields clean", () => {
    let s = base();
    const id = activeWheel(s).entries[0]!.id;
    s = reducer(s, { type: "entries/patch", id, patch: { weight: 2.5, color: "#C2361F" }, now: 1 });
    expect(activeWheel(s).entries[0]).toMatchObject({ weight: 2.5, color: "#C2361F" });
    s = reducer(s, { type: "entries/patch", id, patch: { color: undefined }, now: 2 });
    expect("color" in activeWheel(s).entries[0]!).toBe(false);
  });

  it("ignores edits while spinning", () => {
    let s = base();
    const plan = { id: "h_x", receipt: {} as never, picks: [], segments: [], replay: false, startedAt: 0 } as SpinPlan;
    s = reducer(s, { type: "spin/start", plan });
    const after = reducer(s, { type: "entries/set", entries: [], now: 1 });
    expect(after).toBe(s);
  });
});

describe("reducer: elimination and removal", () => {
  it("excludes winners, remaps on edits, and puts everyone back", () => {
    let s = base();
    const w = activeWheel(s);
    s = reducer(s, { type: "elim/exclude", wheelId: w.id, index: 3 });
    s = reducer(s, { type: "elim/exclude", wheelId: w.id, index: 1 });
    expect(sessionOf(s).excluded).toEqual([1, 3]);
    // Insert an entry at the top: exclusions follow the entries by id.
    s = reducer(s, { type: "entries/set", entries: [ent("New"), ...activeWheel(s).entries], now: 1 });
    expect(sessionOf(s).excluded).toEqual([2, 4]);
    s = reducer(s, { type: "elim/reset", wheelId: w.id });
    expect(sessionOf(s).excluded).toEqual([]);
    s = reducer(s, { type: "undo" });
    expect(sessionOf(s).excluded).toEqual([2, 4]);
  });

  it("disables an entry (Remove) with undo", () => {
    let s = base();
    s = reducer(s, { type: "entry/disable", index: 0, now: 1 });
    expect(activeWheel(s).entries[0]!.enabled).toBe(false);
    s = reducer(s, { type: "undo" });
    expect(activeWheel(s).entries[0]!.enabled).toBe(true);
  });
});

describe("reducer: wheels", () => {
  it("adds, opens, deletes and restores wheels", () => {
    let s = base();
    const first = s.activeId;
    const other = { ...wheel(), id: "w_other001", name: "Other" };
    s = reducer(s, { type: "wheels/add", wheel: other, meta: { createdAt: "x", updatedAt: "x", saved: true }, activate: true });
    expect(s.activeId).toBe("w_other001");
    s = reducer(s, { type: "wheels/open", id: first });
    expect(s.activeId).toBe(first);
    s = reducer(s, { type: "wheels/delete", id: "w_other001", fallback: null, now: 5 });
    expect(s.wheels.map((w) => w.id)).toEqual([first]);
    expect(s.trash?.wheel.id).toBe("w_other001");
    s = reducer(s, { type: "wheels/restore" });
    expect(s.wheels.map((w) => w.id).sort()).toEqual([first, "w_other001"].sort());
    expect(s.trash).toBeNull();
  });

  it("deleting the last wheel leaves a fresh one", () => {
    let s = base();
    const fresh = { id: "w_fresh001", name: "New wheel", entries: [], settings: activeWheel(s).settings };
    s = reducer(s, { type: "wheels/delete", id: s.activeId, fallback: fresh, now: 5 });
    expect(s.wheels).toHaveLength(1);
    expect(s.activeId).toBe("w_fresh001");
  });
});

describe("reducer: spin lifecycle", () => {
  it("records history newest first and opens the winner plate", () => {
    let s = base();
    const w = activeWheel(s);
    const receipt = buildReceipt({ entries: w.entries, seed: "00".repeat(32), mode: "single", createdAt: "2026-01-01T00:00:00.000Z", app: "test" });
    const picks = receipt.result.picks!;
    const plan: SpinPlan = { id: "h_aaaaaaaa", receipt, picks, segments: [{ pick: picks[0]!, excluded: [] }], replay: false, startedAt: 0 };
    s = reducer(s, { type: "spin/start", plan });
    expect(s.spin.phase).toBe("spinning");
    expect(s.ui.announce).toBe("Spinning…");
    const record: HistoryRecord = { id: plan.id, wheelId: w.id, createdAt: receipt.createdAt, receipt, teamNames: null };
    s = reducer(s, { type: "spin/end", record, announce: `Winner: ${picks[0]!.label}`, streamCaption: null, now: 1 });
    expect(s.spin.phase).toBe("idle");
    expect(s.history[w.id]![0]!.id).toBe(plan.id);
    expect(s.ui.dialog?.kind).toBe("winner");
    expect(s.sessionSpins).toBe(1);
    expect(s.last?.picks[0]!.label).toBe(picks[0]!.label);
  });

  it("pauses between sequential picks and resumes", () => {
    let s = base();
    const w = activeWheel(s);
    const receipt = buildReceipt({ entries: w.entries, seed: "11".repeat(32), mode: "multi", count: 3, createdAt: "2026-01-01T00:00:00.000Z", app: "test" });
    const picks = receipt.result.picks!;
    const plan: SpinPlan = { id: "h_bbbbbbbb", receipt, picks, segments: picks.map((p) => ({ pick: p, excluded: [] })), replay: false, startedAt: 0 };
    s = reducer(s, { type: "spin/start", plan });
    s = reducer(s, { type: "spin/pause", segment: 0 });
    expect(s.spin.phase).toBe("paused");
    expect(s.last?.picks).toHaveLength(1);
    s = reducer(s, { type: "spin/resume", segment: 1 });
    expect(s.spin).toMatchObject({ phase: "spinning", segment: 1 });
    expect(s.ui.dialog).toBeNull();
  });

  it("replays never add history or count toward the support ask", () => {
    let s = base();
    const w = activeWheel(s);
    const receipt = buildReceipt({ entries: w.entries, seed: "22".repeat(32), mode: "single", createdAt: "2026-01-01T00:00:00.000Z", app: "test" });
    const picks = receipt.result.picks!;
    const plan: SpinPlan = { id: "h_cccccccc", receipt, picks, segments: [{ pick: picks[0]!, excluded: [] }], replay: true, startedAt: 0 };
    s = reducer(s, { type: "spin/start", plan });
    s = reducer(s, { type: "spin/end", record: { id: plan.id, wheelId: w.id, createdAt: "x", receipt, teamNames: null }, announce: "x", streamCaption: null, now: 1 });
    expect(s.history[w.id] ?? []).toHaveLength(0);
    expect(s.sessionSpins).toBe(0);
  });
});
