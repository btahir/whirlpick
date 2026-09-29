// Heavy keep-apart / keep-together rule sets: the exact fallback never reports a feasible case as
// infeasible. Cases are built around a planted solution, so each one is known to be feasible.
import { describe, expect, it } from 'vitest';
import { splitTeams, type HashedEntry } from '../src/index.js';
import { fixtureSeed, mulberry32 } from './helpers.js';

function planted(i: number, maxM: number, maxApart: number) {
  const r = mulberry32(9000 + i);
  const M = 16 + Math.floor(r() * (maxM - 15));
  const N = 2 + Math.floor(r() * Math.min(9, M / 4));
  const perm = [...Array(M).keys()].sort(() => r() - 0.5);
  const plantedTeams: number[][] = Array.from({ length: N }, () => []);
  perm.forEach((x, k) => plantedTeams[k % N]!.push(x));
  const together: number[][] = [];
  for (let b = 0; b < Math.floor(r() * 6); b++) {
    const t = plantedTeams[Math.floor(r() * N)]!;
    const a = t[Math.floor(r() * t.length)]!;
    const c = t[Math.floor(r() * t.length)]!;
    if (a !== c) together.push([a, c]);
  }
  const apart: number[][] = [];
  const nApart = Math.floor(r() * (maxApart + 1));
  for (let a = 0; a < nApart; a++) {
    const sz = 2 + Math.floor(r() * (Math.min(N, 6) - 1));
    const ts = [...Array(N).keys()].sort(() => r() - 0.5).slice(0, sz);
    apart.push(ts.map((t) => plantedTeams[t]![Math.floor(r() * plantedTeams[t]!.length)]!));
  }
  const entries: HashedEntry[] = Array.from({ length: M }, (_, k) => ({ label: `P${k}`, weight: 1, enabled: true, ...(r() < 0.5 ? { tags: [`g${Math.floor(r() * 3)}`] } : {}) }));
  return { M, N, entries, together, apart };
}

describe('teams heavy rules', () => {
  it('1 500 planted feasible cases (M 16–200, N 2–10, up to 20 apart sets, 5 together pairs) all solve, within 200 ms each', () => {
    let slowest = 0;
    for (let i = 0; i < 1500; i++) {
      const { N, entries, together, apart } = planted(i, i < 1200 ? 60 : 200, 20);
      const t0 = performance.now();
      const res = splitTeams({ entries, seed: fixtureSeed(i), spinIndex: i % 7, teamCount: N, keepApart: apart, keepTogether: together });
      slowest = Math.max(slowest, performance.now() - t0);
      const teamOf = (x: number) => res.teams.findIndex((t) => t.includes(x));
      for (const b of together) expect(teamOf(b[0]!)).toBe(teamOf(b[1]!));
      for (const a of apart) expect(new Set(a.map(teamOf)).size).toBe(a.length);
      expect(Math.max(...res.sizes) - Math.min(...res.sizes)).toBeLessThanOrEqual(1);
    }
    console.log(`teams heavy: slowest split ${slowest.toFixed(1)} ms`);
    expect(slowest).toBeLessThan(200);
  });
  it('deterministic: the same heavy case gives the same teams every time', () => {
    const { N, entries, together, apart } = planted(77, 200, 20);
    const once = () => JSON.stringify(splitTeams({ entries, seed: fixtureSeed(77), spinIndex: 0, teamCount: N, keepApart: apart, keepTogether: together }).teams);
    const a = once();
    for (let k = 0; k < 5; k++) expect(once()).toBe(a);
  });
  it('a dense even cycle of keep-apart pairs on 2 teams (200 members) solves', () => {
    const M = 200;
    const entries: HashedEntry[] = Array.from({ length: M }, (_, k) => ({ label: `C${k}`, weight: 1, enabled: true }));
    const apart = Array.from({ length: M }, (_, k) => [k, (k + 1) % M]);
    const res = splitTeams({ entries, seed: fixtureSeed(1), spinIndex: 0, teamCount: 2, keepApart: apart });
    const teamOf = (x: number) => res.teams.findIndex((t) => t.includes(x));
    for (const [a, b] of apart) expect(teamOf(a!)).not.toBe(teamOf(b!));
  });
  it('a truly infeasible case is CONSTRAINTS_UNSATISFIED (odd cycle on 2 teams), not a search limit', () => {
    const entries: HashedEntry[] = Array.from({ length: 6 }, (_, k) => ({ label: `C${k}`, weight: 1, enabled: true }));
    const apart = [[0, 1], [1, 2], [2, 0]];
    expect(() => splitTeams({ entries, seed: fixtureSeed(2), spinIndex: 0, teamCount: 2, keepApart: apart })).toThrowError(expect.objectContaining({ code: 'CONSTRAINTS_UNSATISFIED' }));
  });
});
