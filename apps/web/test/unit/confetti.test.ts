import { describe, expect, it } from "vitest";
import { LIFETIME, makeParticles, MAX_PARTICLES, particleAt } from "../../src/confetti/confetti";

describe("confetti (SPEC §7.5, ACCEPTANCE K4)", () => {
  const o = { x: 800, y: 400, colors: ["#C2361F", "#17735D"], winnerColor: "#2A55A8", seed: 42, count: 999 };
  it("never makes more than 180 particles (K4 as amended: ≤ 180, nothing drawn after 2.8 s)", () => {
    expect(MAX_PARTICLES).toBeLessThanOrEqual(180);
    expect(LIFETIME).toBeLessThanOrEqual(2.8);
    expect(makeParticles(o)).toHaveLength(MAX_PARTICLES);
    expect(makeParticles({ ...o, count: 70 })).toHaveLength(70);
  });
  it("is a pure function of (t, seed)", () => {
    const a = makeParticles(o).map((p) => particleAt(p, 0.8, o.x, o.y));
    const b = makeParticles(o).map((p) => particleAt(p, 0.8, o.x, o.y));
    expect(a).toEqual(b);
    const c = makeParticles({ ...o, seed: 43 }).map((p) => particleAt(p, 0.8, o.x, o.y));
    expect(c).not.toEqual(a);
  });
  it("draws nothing after its lifetime and fades at the end", () => {
    const ps = makeParticles(o);
    expect(ps.every((p) => particleAt(p, LIFETIME + 0.01, o.x, o.y) === null)).toBe(true);
    expect(ps.every((p) => particleAt(p, 2.8, o.x, o.y) === null)).toBe(true);
    expect(ps.every((p) => particleAt(p, 0.1, o.x, o.y)!.alpha === 1)).toBe(true);
    expect(ps.every((p) => particleAt(p, LIFETIME - 0.1, o.x, o.y)!.alpha < 0.5)).toBe(true);
  });
  it("launches upward from the pick and falls under gravity", () => {
    const ps = makeParticles(o);
    const up = ps.filter((p) => particleAt(p, 0.15, o.x, o.y)!.y < o.y).length;
    expect(up / ps.length).toBeGreaterThan(0.9);
    const late = ps.map((p) => particleAt(p, 2.2, o.x, o.y)!.y - particleAt(p, 1.8, o.x, o.y)!.y);
    expect(late.every((dy) => dy > 0)).toBe(true);
  });
  it("uses the winner colour for roughly 30 % of the paper", () => {
    const ps = makeParticles(o);
    const share = ps.filter((p) => p.color === o.winnerColor).length / ps.length;
    expect(share).toBeGreaterThan(0.18);
    expect(share).toBeLessThan(0.45);
  });
});
