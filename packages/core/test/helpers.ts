import { concatBytes, toHex, u32be } from '../src/bytes.js';
import { H, tag } from '../src/hash.js';
import type { HashedEntry } from '../src/types.js';

/** ACCEPTANCE B: seed_i = H(tag("whirlpick-fairness-fixture") ‖ u32be(i)). */
export function fixtureSeed(i: number): string {
  return toHex(H(concatBytes(tag('whirlpick-fairness-fixture'), u32be(i))));
}

export const uniform = (n: number, prefix = 'E'): HashedEntry[] => Array.from({ length: n }, (_, i) => ({ label: `${prefix}${i + 1}`, weight: 1, enabled: true }));
export const weighted = (ws: readonly number[]): HashedEntry[] => ws.map((w, i) => ({ label: `W${i + 1}`, weight: w, enabled: true }));

/** Small deterministic PRNG for building random fixtures (not the draw algorithm). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIXED_NOW = '2026-01-01T00:00:00.000Z';
