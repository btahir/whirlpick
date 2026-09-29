// A10: elimination sessions (spin s uses spinIndex s and excludes earlier winners).
import { describe, expect, it } from 'vitest';
import { buildReceipt, drawPicks, verifyReceipt, wheelHash } from '../src/index.js';
import { FIXED_NOW, fixtureSeed, uniform } from './helpers.js';

describe('elimination', () => {
  it('spins 0…k−1 under one seed give k distinct winners; excluded = earlier winners; hash stays the base hash', () => {
    for (let f = 0; f < 20; f++) {
      const entries = uniform(3 + f);
      const seed = fixtureSeed(f);
      const base = wheelHash(entries);
      const winners: number[] = [];
      for (let s = 0; s < entries.length; s++) {
        const excluded = [...winners].sort((a, b) => a - b);
        const r = buildReceipt({ entries, seed, mode: 'elimination', spinIndex: s, excluded, createdAt: FIXED_NOW });
        expect(r.params.excluded).toEqual(excluded);
        expect(r.wheelHash).toBe(base);
        expect(verifyReceipt(r).status).toBe('valid');
        winners.push(r.result.picks![0]!.index);
      }
      expect(new Set(winners).size).toBe(entries.length);
      expect(() => drawPicks({ entries, seed, spinIndex: entries.length, count: 1, excluded: winners })).toThrowError(expect.objectContaining({ code: 'NO_ELIGIBLE_ENTRIES' }));
    }
  });
  it('excluding a disabled or unknown index is PARAMS_INVALID', () => {
    const entries = [...uniform(3), { label: 'Off', weight: 1, enabled: false }];
    expect(() => drawPicks({ entries, seed: fixtureSeed(0), spinIndex: 0, count: 1, excluded: [3] })).toThrowError(expect.objectContaining({ code: 'PARAMS_INVALID' }));
    expect(() => drawPicks({ entries, seed: fixtureSeed(0), spinIndex: 0, count: 1, excluded: [9] })).toThrowError(expect.objectContaining({ code: 'PARAMS_INVALID' }));
  });
});
