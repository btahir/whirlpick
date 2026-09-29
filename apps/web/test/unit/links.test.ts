import { describe, expect, it } from "vitest";
import { namesFragment, parseHash, parseLocation, parseQuery } from "../../src/share/links";

describe("fragment links", () => {
  it("reads #w, #spin, #r and #names", () => {
    expect(parseHash("#w=1.abc").intent).toEqual({ kind: "w", code: "1.abc" });
    expect(parseHash("#spin=1.xyz&autoplay=1").intent).toEqual({ kind: "spin", code: "1.xyz" });
    expect(parseHash("#r=1j.e30").intent).toEqual({ kind: "r", code: "1j.e30" });
    expect(parseHash("#names=Ada%0AGrace%0A%0A").intent).toEqual({ kind: "names", labels: ["Ada", "Grace"] });
  });
  it("round-trips a names fragment, including + and emoji", () => {
    const labels = ["Ada + Grace", "Linus", "Zoë 🎲"];
    expect(parseHash(namesFragment(labels)).intent).toEqual({ kind: "names", labels });
  });
  it("reads the embed origin from the fragment", () => {
    expect(parseHash("#w=1.a&origin=https%3A%2F%2Fexample.com").origin).toBe("https://example.com");
  });
  it("ignores empty or unknown fragments", () => {
    expect(parseHash("").intent).toBeNull();
    expect(parseHash("#foo=bar").intent).toBeNull();
  });
});

describe("query options (PLAN §4.4)", () => {
  it("maps options onto a settings patch", () => {
    const q = parseQuery("?preset=numbers&min=5&max=15&duration=1&theme=harbour&fair=1&mystery=1");
    expect(q.preset).toBe("numbers");
    expect(q.presetParams).toEqual({ min: "5", max: "15" });
    expect(q.patch).toMatchObject({ spinDuration: 1, theme: "harbour", fairDraw: true, mysteryMode: true });
  });
  it("clamps durations and implies modes", () => {
    expect(parseQuery("?duration=99").patch.spinDuration).toBe(30);
    expect(parseQuery("?count=3").patch).toMatchObject({ mode: "multi", multi: { count: 3 } });
    expect(parseQuery("?count=all&reveal=instant").patch.multi).toEqual({ count: "all", reveal: "instant" });
    expect(parseQuery("?teams=4").patch).toMatchObject({ mode: "teams", teams: { by: "count", count: 4 } });
    expect(parseQuery("?size=3").patch).toMatchObject({ mode: "teams", teams: { by: "size", size: 3 } });
  });
  it("reads backgrounds, stream, embed, presenter", () => {
    expect(parseQuery("?bg=transparent").patch.background).toBe("transparent");
    expect(parseQuery("?bg=00b140").patch.background).toBe("#00B140");
    expect(parseQuery("?bg=nothex").patch.background).toBeUndefined();
    const q = parseQuery("?stream=1&embed=1&presenter=1");
    expect([q.stream, q.embed, q.presenter]).toEqual([true, true, true]);
  });
  it("rejects junk preset ids and themes", () => {
    expect(parseQuery("?preset=../../etc").preset).toBeUndefined();
    expect(parseQuery("?theme=<script>").patch.theme).toBeUndefined();
  });
  it("accepts autoplay in the fragment or the query", () => {
    expect(parseLocation({ hash: "#spin=1.a&autoplay=1", search: "" }).query.autoplay).toBe(true);
    expect(parseLocation({ hash: "#spin=1.a", search: "?autoplay=1" }).query.autoplay).toBe(true);
  });
});
