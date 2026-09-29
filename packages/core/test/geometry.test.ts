// C1–C3: landing geometry. The landing is always inside the winner's slice, ≥ 5 % from both edges.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { drawPicks, extraTurns, finalRotation, landingTurn, mod1, sliceUnderPointer, slicesFor, type HashedEntry } from '../src/index.js';
import { computeVectors, INPUTS } from './vectors-compute.js';

function check(entries: HashedEntry[], pos: number, landingU32: number, r0: number, pointerTurn: number, duration: number) {
  const slices = slicesFor(entries);
  const lt = landingTurn(slices, pos, landingU32);
  const s = slices[pos]!;
  const size = s.end - s.start;
  const edge = Math.min(lt - s.start, s.end - lt);
  // 1e-15 turns absorbs float rounding of (before + f·w)/T on sub-nano-turn slices.
  expect(edge).toBeGreaterThanOrEqual(0.05 * size - 1e-15);
  if (size * 360 >= 5) expect(edge * 360).toBeGreaterThanOrEqual(0.25);
  const extra = extraTurns(duration, false);
  const r1 = finalRotation(r0, lt, extra, pointerTurn);
  expect(sliceUnderPointer(r1, slices, pointerTurn)).toBe(pos);
  expect(r1 - r0).toBeGreaterThanOrEqual(extra);
  expect(r1 - r0).toBeLessThan(extra + 1);
}

describe('geometry', () => {
  it('every V-fixture lands inside its winner slice', () => {
    const v = computeVectors();
    for (const pt of [0, 0.25, 0.5, 0.75]) {
      const s1 = slicesFor(INPUTS.V0.entries);
      check(INPUTS.V0.entries, s1.findIndex((s) => s.index === v.V1.winnerIndex), v.V1.landingU32, 0, pt, 6);
      const eligible2 = INPUTS.V2.entries.filter((e) => e.enabled);
      const s2 = slicesFor(INPUTS.V2.entries);
      check(INPUTS.V2.entries, s2.findIndex((s) => s.index === v.V2.picks[0]!.index), v.V2.picks[0]!.landingU32, 0.3, pt, 10);
      expect(eligible2).toHaveLength(3);
    }
    expect(Number(v.V1.finalRotation)).toBeCloseTo(5 + mod1(-Number(v.V1.landingTurn)), 12);
  });

  it('C1/C2: 100 000 fast-check cases (weights 0.001–1e6, 1–1000 entries, random R0, pointer 0/¼/½/¾, 1–30 s)', () => {
    const weight = fc.oneof(fc.integer({ min: 1, max: 1_000_000_000 }).map((m) => m / 1000), fc.constantFrom(0.001, 1, 1_000_000));
    fc.assert(
      fc.property(
        fc.array(weight, { minLength: 1, maxLength: 1000 }),
        fc.nat(),
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.double({ min: 0, max: 8, noNaN: true }),
        fc.constantFrom(0, 0.25, 0.5, 0.75),
        fc.integer({ min: 2, max: 60 }).map((h) => h / 2),
        (ws, posSeed, landingU32, r0, pt, duration) => {
          const entries = ws.map((w, i) => ({ label: `E${i}`, weight: w, enabled: true }));
          check(entries, posSeed % entries.length, landingU32, r0, pt, duration);
        },
      ),
      { numRuns: 100_000, seed: 20260929 },
    );
  });

  it('landing extremes: landingU32 0 and 2^32−1 stay 5 % inside', () => {
    const entries = [{ label: 'a', weight: 1, enabled: true }, { label: 'b', weight: 3, enabled: true }];
    for (const u of [0, 0xffffffff]) for (const pos of [0, 1]) check(entries, pos, u, 0, 0, 6);
  });

  it('large accumulated rotations still land correctly on ordinary slices (≥ 0.1° wide)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 1000 }), fc.integer({ min: 0, max: 0xffffffff }), fc.double({ min: 0, max: 1e5, noNaN: true }), (n, u, r0) => {
        const entries = Array.from({ length: n }, (_, i) => ({ label: `E${i}`, weight: 1, enabled: true }));
        check(entries, u % n, u, r0, 0, 6);
      }),
      { numRuns: 20_000, seed: 7 },
    );
  });

  it('C3: extra turns (SPEC §7.1): 1 s → 2, 6 s → 6, 10 s → 9, 30 s → 24, reduced → 1; monotonic', () => {
    expect([1, 6, 10, 30].map((d) => extraTurns(d, false))).toEqual([2, 6, 9, 24]);
    expect(extraTurns(6, true)).toBe(1);
    let prev = 0;
    for (let d = 1; d <= 30; d += 0.5) {
      const e = extraTurns(d, false);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
  });

  it('slices exclude disabled/excluded entries and keep snapshot indices', () => {
    const entries = [
      { label: 'a', weight: 1, enabled: true },
      { label: 'b', weight: 1, enabled: false },
      { label: 'c', weight: 2, enabled: true },
      { label: 'd', weight: 1, enabled: true },
    ];
    const s = slicesFor(entries, [3]);
    expect(s.map((x) => [x.index, x.pos, x.start, x.end])).toEqual([[0, 0, 0, 1 / 3], [2, 1, 1 / 3, 1]]);
    const { picks } = drawPicks({ entries, seed: 'ab'.repeat(32), spinIndex: 0, count: 1, excluded: [3] });
    expect([0, 2]).toContain(picks[0]!.index);
  });
});
