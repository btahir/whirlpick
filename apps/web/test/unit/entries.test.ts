import { describe, expect, it } from "vitest";
import type { Entry } from "@whirlpick/core";
import { cleanLabel, dedupeEntries, entriesToText, mergeItems, parseLine, shuffleEntries, sortEntries, textToItems } from "../../src/state/entries";

let n = 0;
const id = () => `e_${(n++).toString(36).padStart(8, "0")}`;
const e = (label: string, extra: Partial<Entry> = {}): Entry => ({ id: id(), label, weight: 1, enabled: true, ...extra });

describe("editor text", () => {
  it("parses trailing #tags and keeps a lone #1 as a label", () => {
    expect(parseLine("Ada #3 #red")).toEqual({ label: "Ada", tags: ["3", "red"] });
    expect(parseLine("#1")).toEqual({ label: "#1", tags: [] });
    expect(parseLine("  Grace Hopper  ")).toEqual({ label: "Grace Hopper", tags: [] });
    expect(parseLine("   ")).toBeNull();
    expect(parseLine("C# #lang")).toEqual({ label: "C#", tags: ["lang"] });
  });

  it("round-trips entries through text", () => {
    const list = [e("Ada", { tags: ["A"] }), e("Grace")];
    const items = textToItems(entriesToText(list));
    expect(items).toEqual([
      { label: "Ada", tags: ["A"] },
      { label: "Grace", tags: [] },
    ]);
  });

  it("strips control characters and lone surrogates, caps at 200 code points", () => {
    expect(cleanLabel("A\u0007B")).toBe("A B");
    expect(cleanLabel("x\uD800y")).toBe("xy");
    expect(Array.from(cleanLabel("é".repeat(300))).length).toBe(200);
  });
});

describe("mergeItems keeps entry properties across edits", () => {
  it("keeps weights and colours when a line is inserted above", () => {
    const prev = [e("Ada", { weight: 3 }), e("Grace", { color: "#2A55A8" })];
    const next = mergeItems(textToItems("Linus\nAda\nGrace"), prev, id);
    expect(next.map((x) => x.label)).toEqual(["Linus", "Ada", "Grace"]);
    expect(next[1]).toBe(prev[0]);
    expect(next[2]).toBe(prev[1]);
    expect(next[0]!.weight).toBe(1);
  });

  it("keeps properties while a name is being typed (rename at the same position)", () => {
    const prev = [e("Ad", { weight: 2, color: "#C2361F" })];
    const next = mergeItems(textToItems("Ada"), prev, id);
    expect(next[0]).toMatchObject({ id: prev[0]!.id, label: "Ada", weight: 2, color: "#C2361F" });
  });

  it("matches duplicates in order", () => {
    const prev = [e("Sam", { weight: 1 }), e("Sam", { weight: 5 })];
    const next = mergeItems(textToItems("Sam\nSam"), prev, id);
    expect(next.map((x) => x.weight)).toEqual([1, 5]);
  });
});

describe("tools", () => {
  it("sorts case-insensitively and stably", () => {
    expect(sortEntries([e("bob"), e("Ada"), e("adam")]).map((x) => x.label)).toEqual(["Ada", "adam", "bob"]);
  });
  it("de-duplicates case-insensitively, keeping the first", () => {
    const out = dedupeEntries([e("Ada", { weight: 2 }), e("ada"), e("Grace")]);
    expect(out.map((x) => x.label)).toEqual(["Ada", "Grace"]);
    expect(out[0]!.weight).toBe(2);
  });
  it("shuffles with the injected source and keeps every entry", () => {
    const list = [e("A"), e("B"), e("C"), e("D")];
    const out = shuffleEntries(list, () => 0);
    expect(out.map((x) => x.label).sort()).toEqual(["A", "B", "C", "D"]);
    expect(out.map((x) => x.label)).toEqual(["B", "C", "D", "A"]);
  });
});
