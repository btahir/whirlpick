// A9: multi without replacement.
import { describe, expect, it } from 'vitest';
import { drawPicks, type HashedEntry, WhirlError } from '../src/index.js';
import { fixtureSeed, mulberry32 } from './helpers.js';

function fixture(i: number) {
  const r = mulberry32(i + 7);
  const n = 1 + Math.floor(r() * 30);
  const entries: HashedEntry[] = Array.from({ length: n }, (_, k) => ({ label: `M${k}`, weight: [1, 2.5, 0.125, 10, 0.001][Math.floor(r() * 5)]!, enabled: r() > 0.2 }));
  if (!entries.some((e) => e.enabled)) entries[0]!.enabled = true;
  const enabled = entries.map((e, k) => (e.enabled ? k : -1)).filter((k) => k >= 0);
  const excluded = enabled.filter(() => r() < 0.2).slice(0, Math.max(0, enabled.length - 1));
  const eligible = enabled.filter((k) => !excluded.includes(k));
  return { entries, excluded, eligible, r };
}

describe('multi', () => {
  it('2 000 random fixtures: no repeats, all eligible; "all" is a permutation', () => {
    for (let i = 0; i < 2000; i++) {
      const { entries, excluded, eligible, r } = fixture(i);
      const count = i % 3 === 0 ? 'all' : 1 + Math.floor(r() * eligible.length);
      const { picks } = drawPicks({ entries, seed: fixtureSeed(i), spinIndex: i % 5, count, excluded });
      const idx = picks.map((p) => p.index);
      expect(new Set(idx).size).toBe(idx.length);
      for (const k of idx) expect(eligible).toContain(k);
      for (const p of picks) expect(p.label).toBe(entries[p.index]!.label);
      if (count === 'all') expect([...idx].sort((a, b) => a - b)).toEqual(eligible);
      else expect(idx).toHaveLength(count);
    }
  });
  it('count > eligible → COUNT_TOO_LARGE; count 0 → COUNT_INVALID', () => {
    const entries = [{ label: 'A', weight: 1, enabled: true }, { label: 'B', weight: 1, enabled: false }];
    expect(() => drawPicks({ entries, seed: fixtureSeed(1), spinIndex: 0, count: 2 })).toThrowError(expect.objectContaining({ code: 'COUNT_TOO_LARGE' }) as WhirlError);
    expect(() => drawPicks({ entries, seed: fixtureSeed(1), spinIndex: 0, count: 0 })).toThrowError(expect.objectContaining({ code: 'COUNT_INVALID' }) as WhirlError);
  });
});
