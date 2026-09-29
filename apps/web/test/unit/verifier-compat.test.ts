// Verifier-owned (pass 2): ACCEPTANCE R1/R2 — label truncation works without Intl.Segmenter,
// and the renderer never touches the Canvas APIs PLAN §9 bans.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const Seg = Intl.Segmenter;
afterEach(() => {
  (Intl as { Segmenter?: unknown }).Segmenter = Seg;
  vi.resetModules();
});

describe("compat fallbacks (R1, R2)", () => {
  it("defaultGraphemes falls back to Array.from when Intl.Segmenter is missing", async () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    vi.resetModules();
    const { defaultGraphemes } = await import("../../src/wheel/renderer");
    expect(defaultGraphemes("Zoë🎲ab")).toEqual(Array.from("Zoë🎲ab"));
  });
  it("uses Intl.Segmenter when present (a flag emoji stays one grapheme)", async () => {
    vi.resetModules();
    const { defaultGraphemes } = await import("../../src/wheel/renderer");
    expect(defaultGraphemes("🇬🇧x")).toEqual(["🇬🇧", "x"]);
  });
  it("src/wheel uses no letterSpacing, ctx.filter, reset() or roundRect", () => {
    const dir = resolve(import.meta.dirname, "../../src/wheel");
    for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
      const code = readFileSync(resolve(dir, f), "utf8").replace(/\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/\.letterSpacing|\.filter\s*=|ctx\.reset\(|\.roundRect\(/);
    }
  });
});
