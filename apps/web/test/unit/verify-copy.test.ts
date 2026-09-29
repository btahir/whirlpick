// REVIEW P1-9: every /verify/ failure sentence is plain language and never says "undefined".
import { describe, expect, it } from "vitest";
import { buildReceipt, normaliseEntries, verifyReceipt } from "@whirlpick/core";
import { failureSentence, passedLine, quoteValue, splitHashes } from "../../src/copy/verify";

const entries = normaliseEntries(["Ada", "Grace", "Linus", "Margaret", "Priya"]).entries;
const good = () => buildReceipt({ entries, seed: "0f".repeat(32), mode: "single", title: "Friday raffle", createdAt: "2026-01-01T00:00:00.000Z", app: "whirlpick-test/0" }) as unknown as Record<string, unknown>;
const without = (k: string) => {
  const r = good();
  delete r[k];
  return r;
};

const cases: Array<[string, unknown, Record<string, string>?]> = [
  ["not JSON", "{nope"],
  ["an array", "[]"],
  ["no format", without("format")],
  ["a foreign format", { ...good(), format: "other" }],
  ["no version", without("version")],
  ["version 2", { ...good(), version: 2 }],
  ["no algorithm", without("algorithm")],
  ["null algorithm", { ...good(), algorithm: null }],
  ["an unknown algorithm", { ...good(), algorithm: "coin-v9" }],
  ["an object algorithm", { ...good(), algorithm: { a: 1 } }],
  ["no entries", without("entries")],
  ["no wheelHash", without("wheelHash")],
  ["no commitment", without("commitment")],
  ["no params", without("params")],
  ["no result", without("result")],
  ["a beacon", { ...good(), beacon: { kind: "drand" } }],
  ["a changed list", { ...good(), wheelHash: "ab".repeat(32) }],
  ["a different fingerprint seen", good(), { wheelHash: "cd".repeat(32) }],
  ["a bad seed phrase", { ...good(), seedPhrase: "not the phrase" }],
  ["a wrong commitment", { ...good(), commitment: "ab".repeat(32) }],
  ["a different commitment seen", good(), { commitment: "cd".repeat(32) }],
  ["bad params", { ...good(), params: { count: 2, excluded: [] } }],
  ["a forged result", { ...good(), result: { picks: [{ index: 0, label: "Ada", landingU32: 1 }] } }],
];

describe("verify failure copy (REVIEW P1-9)", () => {
  for (const [name, input, expect_] of cases) {
    it(`${name}: a plain sentence without "undefined"`, () => {
      const report = verifyReceipt(input, expect_ ?? {});
      const failed = report.checks.find((c) => !c.ok);
      expect(failed, name).toBeTruthy();
      let raw: unknown = input;
      if (typeof input === "string") {
        try {
          raw = JSON.parse(input);
        } catch {
          raw = null;
        }
      }
      const s = failureSentence(failed, raw);
      expect(s).not.toMatch(/undefined/);
      expect(s.length).toBeGreaterThan(10);
    });
  }

  it("names the missing and unknown algorithm as the review asks", () => {
    const miss = verifyReceipt(without("algorithm"));
    expect(failureSentence(miss.checks.find((c) => !c.ok), without("algorithm"))).toBe("This receipt doesn't name an algorithm. Whirlpick checks whirlpick-draw-v1.");
    const odd = { ...good(), algorithm: "coin-v9" };
    expect(failureSentence(verifyReceipt(odd).checks.find((c) => !c.ok), odd)).toBe('This receipt uses "coin-v9", which Whirlpick doesn\'t know.');
  });

  it("counts passed checks in plain words", () => {
    const r = verifyReceipt(good());
    expect(r.status).toBe("valid");
    expect(passedLine(r.checks)).toMatch(/^\d+ checks passed$/);
    expect(passedLine([{ id: "json", ok: true, detail: "" }])).toBe("1 check passed");
  });

  it("splits hashes out of a detail and drops the brackets around them", () => {
    const h = "6aab".repeat(16);
    expect(splitHashes(`Fingerprint matches (${h})`)).toEqual([
      { kind: "text", text: "Fingerprint matches " },
      { kind: "hash", hex: h },
    ]);
    expect(splitHashes("no hash here")).toEqual([{ kind: "text", text: "no hash here" }]);
  });

  it("quotes values without ever printing undefined", () => {
    expect(quoteValue(undefined)).not.toMatch(/undefined/);
    expect(quoteValue("x".repeat(80)).length).toBeLessThanOrEqual(42);
  });
});
