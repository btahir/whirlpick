// Verifier-owned (pass 1, 2026-09-29): team repair vs an exact feasibility search.
// Within ACCEPTANCE D4's bounds (≤ 3 apart sets, ≤ 3 together blocks) the builder's test passes, and a
// verifier sweep of 3 000 small random cases (M 6–16, N 2–4, ≤ 6 apart sets, ≤ 2 together pairs) found
// every feasible case solved. With heavier rule sets (M 16–40, N 2–8, up to 12 apart sets) about 1 %
// of feasible cases (11 of 1 211) still end in CONSTRAINTS_UNSATISFIED: the budgeted DFS fallback
// (200 000 nodes, units in rank order) gives up. Known limitation, recorded with `it.fails` so the
// suite stays green; when the repair is improved this test starts failing: flip it to `it`.
import { describe, expect, it } from 'vitest';
import { splitTeams, type HashedEntry } from '../../src/index.js';

const M = 37;
const N = 6;
const apart = [[35, 0], [33, 16, 4, 23, 25, 29], [29, 20, 8, 19], [33, 17, 11, 34], [24, 31, 11], [23, 0, 13, 28], [24, 29, 7, 26, 16, 11], [7, 5, 1, 21], [19, 18, 8, 30]];
const together = [[32, 16], [23, 17], [27, 18], [7, 25]];
const tags = ['A', 'B', 'C', 'B', 'C', 'C', 'B', 'B', null, 'A', 'C', 'C', null, null, null, null, 'A', null, null, 'A', null, null, null, 'B', 'B', 'A', null, 'A', null, 'B', null, 'A', null, null, null, 'B', null];
const entries: HashedEntry[] = tags.map((t, i) => ({ label: `P${i}`, weight: 1, enabled: true, ...(t ? { tags: [t] } : {}) }));

/** Exact search over the constrained units with balanced capacities (sizes within 1). */
function witness(): number[] | null {
  const par = [...Array(M).keys()];
  const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x]!)));
  for (const [a, b] of together) par[find(b!)] = find(a!);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < M; i++) groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
  const constrained = new Set([...apart.flat(), ...together.flat()]);
  const units = [...groups.values()].filter((u) => u.some((x) => constrained.has(x))).sort((a, b) => b.length - a.length);
  const cap = Array.from({ length: N }, (_, t) => Math.floor(M / N) + (t < M % N ? 1 : 0));
  const where: number[] = Array.from({ length: M }, () => -1);
  const clash = (u: number[], t: number) => u.some((x) => apart.some((A) => A.includes(x) && A.some((z) => z !== x && (where[z] === t || u.includes(z)))));
  const go = (k: number): boolean => {
    if (k === units.length) return true;
    const u = units[k]!;
    for (let t = 0; t < N; t++) {
      if (cap[t]! < u.length || clash(u, t)) continue;
      cap[t]! -= u.length;
      for (const x of u) where[x] = t;
      if (go(k + 1)) return true;
      for (const x of u) where[x] = -1;
      cap[t]! += u.length;
    }
    return false;
  };
  return go(0) ? where : null;
}

describe('verifier: teams feasibility beyond D4 bounds', () => {
  it('the fixture is feasible (exact search finds an assignment honouring every rule)', () => {
    expect(witness()).not.toBeNull();
  });
  it.fails('KNOWN LIMITATION: splitTeams solves this feasible 37-member / 6-team / 9-apart / 4-together case', () => {
    const r = splitTeams({ entries, seed: 'cd'.repeat(32), spinIndex: 397, teamCount: N, keepApart: apart, keepTogether: together, previousRounds: [] });
    expect(r.teams).toHaveLength(N);
  });
});
