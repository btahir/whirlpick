// Verifier-owned (pass 2): PLAN §9 — a `1.` link opened without DecompressionStream says to update the browser.
import { afterEach, describe, expect, it } from "vitest";
import { decodeShare, encodeShare, presetById, presetProject, WhirlError } from "@whirlpick/core";
import { linkError } from "../../src/app/controller";

const saved = globalThis.DecompressionStream;
afterEach(() => {
  (globalThis as { DecompressionStream?: unknown }).DecompressionStream = saved;
});

describe("link errors (PLAN §9, verifier)", () => {
  it("a compressed link without DecompressionStream asks for a browser update, not 'damaged'", async () => {
    const code = await encodeShare(presetProject(presetById("yes-no")!));
    expect(code.startsWith("1.")).toBe(true);
    (globalThis as { DecompressionStream?: unknown }).DecompressionStream = undefined;
    const err = await decodeShare(code).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(WhirlError);
    expect(linkError(err)).toMatch(/Update your browser/);
  });
  it("any other failure is a damaged link", () => {
    expect(linkError(new Error("x"))).toBe("This link is damaged. Nothing was loaded.");
    expect(linkError(new WhirlError("LINK_INVALID", "bad"))).toBe("This link is damaged. Nothing was loaded.");
  });
});
