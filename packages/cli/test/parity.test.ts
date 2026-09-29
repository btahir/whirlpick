// A8 (CLI half): for 50 random fixtures, the CLI's receipt equals core's byte for byte (minus createdAt and app).
import { buildReceipt, normaliseEntries, type EntryIn } from '@whirlpick/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run, workdir } from './helpers.js';

let dir: string;
let cleanup: () => void;
beforeAll(() => ({ dir, cleanup } = workdir()));
afterAll(() => cleanup());

function rnd(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (r: () => number) => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
const strip = (x: Record<string, unknown>) => {
  const { createdAt: _c, app: _a, ...rest } = x;
  return JSON.stringify(rest);
};

describe('parity', () => {
  it('50 random fixtures: CLI receipts equal core receipts (single, multi, elimination, teams)', async () => {
    for (let i = 0; i < 50; i++) {
      const r = rnd(i + 1);
      const n = 3 + Math.floor(r() * 20);
      const entries: EntryIn[] = Array.from({ length: n }, (_, k) => ({ label: `Person ${k + 1}`, weight: [1, 2, 0.5, 1.25][Math.floor(r() * 4)]!, ...(r() < 0.4 ? { tags: [`${1 + Math.floor(r() * 3)}`] } : {}) }));
      const seed = hex(r);
      const pi = r() < 0.3 ? 'room word' : undefined;
      const si = Math.floor(r() * 5);
      const kind = ['single', 'multi', 'elimination', 'teams'][i % 4]!;
      const base = ['-', '--format', 'json', '--seed', seed, '--spin-index', String(si), ...(pi ? ['--public-input', pi] : []), '--json'];
      const norm = normaliseEntries(entries).entries;
      let cliReceipt: Record<string, unknown>;
      let core: Record<string, unknown>;
      if (kind === 'teams') {
        const teams = 2 + Math.floor(r() * Math.max(1, n / 2 - 1));
        cliReceipt = JSON.parse((await run(['teams', ...base, '--teams', String(teams)], { cwd: dir, stdin: JSON.stringify(entries) })).stdout).receipt;
        core = buildReceipt({ entries: norm, seed, spinIndex: si, publicInput: pi ?? null, mode: 'teams', teamCount: teams }) as unknown as Record<string, unknown>;
      } else {
        const count = kind === 'multi' ? 1 + Math.floor(r() * n) : 1;
        const extra = kind === 'multi' ? ['--mode', 'multi', '--count', String(count)] : kind === 'elimination' ? ['--mode', 'elimination', '--exclude', '0'] : [];
        const out = JSON.parse((await run(['spin', ...base, ...extra], { cwd: dir, stdin: JSON.stringify(entries) })).stdout);
        cliReceipt = out.receipts[0];
        core = buildReceipt({ entries: norm, seed, spinIndex: si, publicInput: pi ?? null, mode: kind as 'single' | 'multi' | 'elimination', count, ...(kind === 'elimination' ? { excluded: [0] } : {}) }) as unknown as Record<string, unknown>;
      }
      expect(strip(cliReceipt), `fixture ${i} (${kind})`).toBe(strip(core));
    }
  });
});
