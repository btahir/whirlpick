// A5: input normalisation (PLAN §2.1).
import { describe, expect, it } from 'vitest';
import { milliWeight, normaliseEntries, normaliseLabel, wheelHash, WhirlError } from '../src/index.js';

const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return (e as WhirlError).code;
  }
  return 'NO_ERROR';
};

describe('normalise', () => {
  it('NFC: precomposed and decomposed é give the same hash', () => {
    const a = normaliseEntries(['é']).entries;
    const b = normaliseEntries(['é']).entries;
    expect(wheelHash(a)).toBe(wheelHash(b));
    expect(wheelHash([{ label: 'é', weight: 1, enabled: true }])).toBe(wheelHash([{ label: 'é', weight: 1, enabled: true }]));
  });
  it('rejects lone surrogates, control characters, 0 and 201 code points', () => {
    expect(code(() => normaliseLabel('a\uD800b'))).toBe('LABEL_INVALID');
    expect(code(() => normaliseLabel('\uDC00'))).toBe('LABEL_INVALID');
    expect(code(() => normaliseLabel('tab\there'))).toBe('LABEL_INVALID');
    expect(code(() => normaliseLabel('bell\u0007'))).toBe('LABEL_INVALID');
    expect(code(() => normaliseLabel('c1\u0085'))).toBe('LABEL_INVALID');
    expect(code(() => normaliseLabel(''))).toBe('LABEL_INVALID');
    expect(code(() => normaliseLabel('   '))).toBe('LABEL_INVALID');
    expect(code(() => normaliseLabel('x'.repeat(201)))).toBe('LABEL_INVALID');
    expect(normaliseLabel('x'.repeat(200))).toHaveLength(200);
    expect(normaliseLabel('😀'.repeat(200))).toBe('😀'.repeat(200));
    expect(code(() => normaliseLabel('😀'.repeat(201)))).toBe('LABEL_INVALID');
    expect(normaliseLabel('  Ada  Lovelace ')).toBe('Ada  Lovelace');
  });
  it('weights: WEIGHT_INVALID for 0, 0.0005, 1.0001, 1e6+1; accepted 0.001, 2.5, 1e6', () => {
    for (const w of [0, 0.0005, 1.0001, 1e6 + 1, -1, NaN, Infinity]) expect(code(() => milliWeight(w))).toBe('WEIGHT_INVALID');
    expect(milliWeight(0.001)).toBe(1);
    expect(milliWeight(2.5)).toBe(2500);
    expect(milliWeight(1e6)).toBe(1_000_000_000);
    expect(milliWeight(0.125)).toBe(125);
    expect(code(() => normaliseEntries([{ label: 'A', weight: 0 }]))).toBe('WEIGHT_INVALID');
  });
  it('1001 entries → ENTRY_LIMIT; 1000 are fine', () => {
    expect(code(() => normaliseEntries(Array.from({ length: 1001 }, (_, i) => `E${i}`)))).toBe('ENTRY_LIMIT');
    expect(normaliseEntries(Array.from({ length: 1000 }, (_, i) => `E${i}`)).entries).toHaveLength(1000);
  });
  it('tags: NFC + trim, duplicates removed (first kept), ≤ 8, 1–32 code points', () => {
    const { entries } = normaliseEntries([{ label: 'A', tags: [' x ', 'x', 'y'] }]);
    expect(entries[0]!.tags).toEqual(['x', 'y']);
    expect(code(() => normaliseEntries([{ label: 'A', tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }]))).toBe('TAG_INVALID');
    expect(code(() => normaliseEntries([{ label: 'A', tags: ['t'.repeat(33)] }]))).toBe('TAG_INVALID');
  });
  it('duplicates labels are allowed and ids are generated and unique', () => {
    const { entries } = normaliseEntries(['Ada', 'Ada']);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).not.toBe(entries[1]!.id);
    expect(entries[0]!.id).toMatch(/^e_[a-z0-9]{8}$/);
  });
});
