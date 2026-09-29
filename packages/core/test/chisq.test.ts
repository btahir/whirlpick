// The p-value code against textbook chi-square critical values (to 4 significant figures).
import { describe, expect, it } from 'vitest';
import { chiSquarePValue, gammaQ } from '../../../scripts/stats/chisq.js';

const sig4 = (x: number) => Number(x.toPrecision(4));

describe('chisq', () => {
  it.each([
    [3.841, 1, 0.05],
    [6.635, 1, 0.01],
    [11.07, 5, 0.05],
    [18.307, 10, 0.05],
    [124.342, 100, 0.05],
    [2.706, 1, 0.1],
    [23.209, 10, 0.01],
  ])('χ²=%f, df=%i → p ≈ %f', (x, df, p) => {
    expect(sig4(chiSquarePValue(x, df))).toBeCloseTo(p, 3);
    expect(Math.abs(chiSquarePValue(x, df) - p) / p).toBeLessThan(5e-4);
  });
  it('Q(a, 0) = 1 and Q(1, x) = e^−x', () => {
    expect(gammaQ(3, 0)).toBe(1);
    for (const x of [0.1, 1, 5, 20]) expect(gammaQ(1, x)).toBeCloseTo(Math.exp(-x), 12);
  });
});
