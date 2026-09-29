// A2: PLAN §2.12 vectors are frozen goldens (vectors.json); A3's Python reference reads the same file.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bytesSource, randBelowWidth, verifyReceipt } from '../src/index.js';
import { computeVectors, INPUTS } from './vectors-compute.js';

const file = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));

describe('vectors', () => {
  it('vectors.json has no <FILL> placeholders and its inputs match the PLAN', () => {
    expect(JSON.stringify(file)).not.toContain('FILL');
    expect(file.inputs).toEqual(JSON.parse(JSON.stringify(INPUTS)));
  });
  it('the implementation reproduces every frozen expected value (V0–V3)', () => {
    expect(JSON.parse(JSON.stringify(computeVectors()))).toEqual(file.expected);
  });
  it('V0 hand-computed rejection: 1-byte chunks, n = 3, FF FE 05 → 2 after 2 bytes', () => {
    const src = bytesSource([0xff, 0xfe, 0x05]);
    expect(randBelowWidth(src, 3n, 1)).toBe(2n);
    expect(src.consumed).toBe(2);
  });
  it('V1 receipt verifies and has T = 4000; V2 T = 3625', () => {
    expect(file.expected.V1.T).toBe(4000);
    expect(file.expected.V2.T).toBe(3625);
    expect(verifyReceipt(file.expected.V1.receipt).status).toBe('valid');
  });
  it('V3 teams: keep-apart 0/1 and keep-together 4/5 hold', () => {
    const teams: number[][] = file.expected.V3.teams;
    const teamOf = (x: number) => teams.findIndex((t) => t.includes(x));
    expect(teamOf(0)).not.toBe(teamOf(1));
    expect(teamOf(4)).toBe(teamOf(5));
    expect(teams.map((t) => t.length).sort()).toEqual([3, 3, 4]);
  });
});
