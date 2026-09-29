// REVIEW R2-3: no verify check detail ever reads "undefined", whatever fields a receipt lacks.
import { describe, expect, it } from 'vitest';
import { verifyReceipt } from '../src/index.js';

const partials: Array<[string, unknown]> = [
  ['{}', {}],
  ['format only', { format: 'whirlpick-receipt' }],
  ['version only', { version: 1 }],
  ['format and version only', { format: 'whirlpick-receipt', version: 1 }],
  ['null algorithm', { format: 'whirlpick-receipt', version: 1, algorithm: null }],
  ['algorithm, no fields', { format: 'whirlpick-receipt', version: 1, algorithm: 'whirlpick-draw-v1' }],
];

describe('verify details never say "undefined" (R2-3)', () => {
  for (const [name, r] of partials) {
    it(name, () => {
      const rep = verifyReceipt(r);
      expect(rep.ok).toBe(false);
      for (const c of rep.checks) expect(c.detail, `${name}: ${c.id}`).not.toMatch(/undefined/);
    });
  }
  it('names a missing algorithm plainly, and quotes an unknown one', () => {
    const miss = verifyReceipt({ format: 'whirlpick-receipt', version: 1 }).checks.at(-1)!;
    expect(miss.code).toBe('UNKNOWN_ALGORITHM');
    expect(miss.detail).toBe('The receipt doesn\'t name an algorithm (expected "whirlpick-draw-v1").');
    const odd = verifyReceipt({ format: 'whirlpick-receipt', version: 1, algorithm: 'coin-v9' }).checks.at(-1)!;
    expect(odd.detail).toBe('Unknown algorithm "coin-v9" (expected "whirlpick-draw-v1").');
  });
  it('says "missing" for an absent format or version', () => {
    expect(verifyReceipt({ version: 1 }).checks.at(-1)!.detail).toBe('Unsupported receipt: format missing, version 1 (expected "whirlpick-receipt", 1).');
  });
});
