// D1–D7: team splits (PLAN §2.8).
import { describe, expect, it } from 'vitest';
import { buildReceipt, groupOrder, splitTeams, verifyReceipt, type HashedEntry, type WhirlError } from '../src/index.js';
import { FIXED_NOW, fixtureSeed, mulberry32, uniform } from './helpers.js';

const errCode = (f: () => unknown): { code: string; message: string } => {
  try {
    f();
  } catch (e) {
    return { code: (e as WhirlError).code, message: (e as Error).message };
  }
  return { code: 'NO_ERROR', message: '' };
};
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

function tagged(r: () => number, M: number): HashedEntry[] {
  const nTags = 1 + Math.floor(r() * 6);
  return Array.from({ length: M }, (_, i) => {
    const t = Math.floor(r() * (nTags + 1));
    return { label: `P${i}`, weight: 1, enabled: true, ...(t < nTags ? { tags: [`g${t}`] } : {}) };
  });
}

describe('teams', () => {
  it('D1: 5 000 random cases: sizes within 1; with a team size K, max ≤ K', () => {
    const r = mulberry32(11);
    for (let i = 0; i < 5000; i++) {
      const M = 2 + Math.floor(r() * 199);
      const entries = uniform(M);
      const bySize = r() < 0.4;
      const opts = bySize ? { teamSize: 1 + Math.floor(r() * (M - 1)) } : { teamCount: 2 + Math.floor(r() * (M - 1)) };
      const res = splitTeams({ entries, seed: fixtureSeed(i), spinIndex: 0, ...opts });
      expect(spread(res.sizes)).toBeLessThanOrEqual(1);
      expect(res.sizes.reduce((a, b) => a + b, 0)).toBe(M);
      if (bySize) expect(Math.max(...res.sizes)).toBeLessThanOrEqual(opts.teamSize!);
      expect(res.teams.flat().sort((a, b) => a - b)).toEqual([...Array(M).keys()]);
    }
  });
  it('D1: N < 2 or N > M → TEAM_COUNT_INVALID', () => {
    const e = uniform(5);
    for (const o of [{ teamCount: 1 }, { teamCount: 6 }, { teamSize: 5 }, { teamSize: 0 }, {}, { teamCount: 2, teamSize: 2 }]) {
      expect(errCode(() => splitTeams({ entries: e, seed: fixtureSeed(0), spinIndex: 0, ...o })).code).toBe('TEAM_COUNT_INVALID');
    }
  });
  it('D2: 5 000 tagged cases with balance: every primary tag within 1 per team, withinOne', () => {
    const r = mulberry32(22);
    for (let i = 0; i < 5000; i++) {
      const M = 2 + Math.floor(r() * 120);
      const entries = tagged(r, M);
      const N = 2 + Math.floor(r() * Math.min(M - 1, 12));
      const res = splitTeams({ entries, seed: fixtureSeed(i), spinIndex: 0, teamCount: N, balance: true });
      expect(spread(res.sizes)).toBeLessThanOrEqual(1);
      for (const counts of Object.values(res.balance.byTag)) expect(spread(counts)).toBeLessThanOrEqual(1);
      expect(res.balance.withinOne).toBe(true);
      expect(res.warnings).toEqual([]);
    }
  });
  it('D3: group order: numeric best-first; otherwise size desc then code point; untagged last', () => {
    expect(groupOrder(['1', '3', null, '2', '5', '3', '4'])).toEqual(['5', '4', '3', '2', '1', null]);
    expect(groupOrder(['b', 'a', 'b', null, 'c', 'a', 'Z'])).toEqual(['a', 'b', 'Z', 'c', null]);
    expect(groupOrder(['2', 'x', '2', null, null])).toEqual(['2', 'x', null]);
    expect(groupOrder(['-1', '0.5', '10'])).toEqual(['10', '0.5', '-1']);
  });
  it('D4: 2 000 random feasible cases with keep-together / keep-apart: every rule holds, sizes within 1', () => {
    const r = mulberry32(33);
    let done = 0;
    for (let i = 0; done < 2000; i++) {
      const M = 6 + Math.floor(r() * 60);
      const N = 2 + Math.floor(r() * Math.min(8, M / 3 - 1));
      // Planted solution: a random balanced partition; blocks come from inside one planted team
      // and apart sets take members of distinct planted teams, so every case is feasible.
      const perm = [...Array(M).keys()].sort(() => r() - 0.5);
      const planted: number[][] = Array.from({ length: N }, () => []);
      perm.forEach((x, k) => planted[k % N]!.push(x));
      const blocks: number[][] = [];
      const usedTeams = new Set<number>();
      const nBlocks = Math.floor(r() * 4);
      for (let b = 0; b < nBlocks; b++) {
        const t = Math.floor(r() * N);
        if (usedTeams.has(t)) continue;
        usedTeams.add(t);
        const sz = 2 + Math.floor(r() * Math.min(2, planted[t]!.length - 1));
        blocks.push(planted[t]!.slice(0, sz));
      }
      const apart: number[][] = [];
      const nApart = Math.floor(r() * 4);
      for (let a = 0; a < nApart; a++) {
        const sz = 2 + Math.floor(r() * (Math.min(N, 4) - 1));
        const teamsPicked = [...Array(N).keys()].sort(() => r() - 0.5).slice(0, sz);
        apart.push(teamsPicked.map((t) => planted[t]![Math.floor(r() * planted[t]!.length)]!));
      }
      const entries = r() < 0.5 ? uniform(M) : tagged(r, M);
      let res;
      try {
        res = splitTeams({ entries, seed: fixtureSeed(i), spinIndex: 0, teamCount: N, keepTogether: blocks, keepApart: apart });
      } catch (err) {
        console.log('D4 CASE', JSON.stringify({ i, M, N, blocks, apart, tags: entries.map((x) => x.tags?.[0] ?? null) }));
        throw err;
      }
      const teamOf = (x: number) => res.teams.findIndex((t) => t.includes(x));
      for (const b of blocks) expect(new Set(b.map(teamOf)).size).toBe(1);
      for (const a of apart) expect(new Set(a.map(teamOf)).size).toBe(a.length);
      expect(spread(res.sizes)).toBeLessThanOrEqual(1);
      done++;
    }
  });
  it('D5: infeasible and conflicting inputs give the named code and name the entries', () => {
    const e = uniform(6).map((x, i) => ({ ...x, label: ['Ada', 'Grace', 'Linus', 'Margaret', 'Priya', 'Tomas'][i]! }));
    const run = (o: object) => errCode(() => splitTeams({ entries: e, seed: fixtureSeed(0), spinIndex: 0, teamCount: 3, ...o }));
    let x = run({ keepTogether: [[0, 1, 2]] });
    expect(x.code).toBe('TOGETHER_TOO_LARGE');
    expect(x.message).toContain('Ada, Grace and Linus');
    x = errCode(() => splitTeams({ entries: e, seed: fixtureSeed(0), spinIndex: 0, teamCount: 2, keepApart: [[0, 1, 2]] }));
    expect(x.code).toBe('APART_TOO_MANY');
    expect(x.message).toContain('Ada, Grace and Linus');
    x = run({ keepTogether: [[0, 1]], keepApart: [[0, 1]] });
    expect(x.code).toBe('CONSTRAINT_CONFLICT');
    expect(x.message).toMatch(/Ada and Grace/);
    x = errCode(() => splitTeams({ entries: e, seed: fixtureSeed(0), spinIndex: 0, teamCount: 2, keepTogether: [[0, 1], [1, 2]], keepApart: [[0, 2]] }));
    expect(x.code).toBe('CONSTRAINT_CONFLICT');
    expect(x.message).toMatch(/Ada and Linus/);
    const withOff = [...e, { label: 'Off', weight: 1, enabled: false }];
    x = errCode(() => splitTeams({ entries: withOff, seed: fixtureSeed(0), spinIndex: 0, teamCount: 3, keepApart: [[0, 6]] }));
    expect(x.code).toBe('CONSTRAINT_UNKNOWN_ENTRY');
    expect(x.message).toContain('Off');
    x = run({ keepApart: [[0, 99]] });
    expect(x.code).toBe('CONSTRAINT_UNKNOWN_ENTRY');
    x = run({ keepApart: [[0, 0]] });
    expect(x.code).toBe('CONSTRAINT_INVALID');
    // 4 people, 2 teams of 2, Ada apart from everyone: only validation-feasible, not solvable.
    x = errCode(() => splitTeams({ entries: e.slice(0, 4), seed: fixtureSeed(0), spinIndex: 0, teamCount: 2, keepApart: [[0, 1], [0, 2], [0, 3]] }));
    expect(x.code).toBe('CONSTRAINTS_UNSATISFIED');
    expect(x.message).toMatch(/^Couldn't satisfy: keep Ada and \w+ apart\. Try more teams or fewer rules\.$/);
  });
  it('D6: new rounds minimise repeats (24 members, 6 teams, 5 rounds)', () => {
    const e = uniform(24);
    const rounds: number[][][] = [];
    const repeats: number[] = [];
    for (let k = 0; k < 5; k++) {
      const res = splitTeams({ entries: e, seed: fixtureSeed(1000 + k), spinIndex: 0, teamCount: 6, previousRounds: rounds });
      if (k > 0) repeats.push(res.repeatPairs);
      rounds.push(res.teams);
    }
    expect(repeats[0]).toBe(0);
    // Baseline: repeat pairs of 5 unoptimised random rounds (rounds 2–5 against earlier rounds), averaged over 200 splits.
    let base = 0;
    for (let s = 0; s < 40; s++) {
      const rr: number[][][] = [];
      for (let k = 0; k < 5; k++) {
        const t = splitTeams({ entries: e, seed: fixtureSeed(5000 + s * 5 + k), spinIndex: 0, teamCount: 6 }).teams;
        if (k > 0) {
          const prev = new Set<string>();
          for (const round of rr) for (const team of round) for (const a of team) for (const b of team) if (a < b) prev.add(`${a},${b}`);
          for (const team of t) for (const a of team) for (const b of team) if (a < b && prev.has(`${a},${b}`)) base++;
        }
        rr.push(t);
      }
    }
    base /= 40;
    const total = repeats.reduce((a, b) => a + b, 0);
    console.log(`D6 repeat pairs rounds 2–5: ${JSON.stringify(repeats)} total ${total}; random baseline ${base.toFixed(2)}`);
    expect(total).toBeLessThanOrEqual(0.25 * base);
    const again = () => splitTeams({ entries: e, seed: fixtureSeed(1004), spinIndex: 0, teamCount: 6, previousRounds: rounds.slice(0, 4) }).teams;
    const first = JSON.stringify(again());
    for (let i = 0; i < 10; i++) expect(JSON.stringify(again())).toBe(first);
  });
  it('D7: teams receipts verify (V3-style + 100 random); swapping two members → RESULT_MISMATCH', () => {
    const r = mulberry32(44);
    for (let i = 0; i < 100; i++) {
      const M = 4 + Math.floor(r() * 30);
      const entries = r() < 0.5 ? uniform(M) : tagged(r, M);
      const receipt = buildReceipt({ entries, seed: fixtureSeed(i), mode: 'teams', teamCount: 2 + Math.floor(r() * (M / 2 - 1)), spinIndex: i % 3, createdAt: FIXED_NOW, ...(i % 4 === 0 ? { previousRounds: [[[0, 1], [2, 3]]] } : {}) });
      expect(verifyReceipt(receipt).status).toBe('valid');
      const t = structuredClone(receipt);
      const a = t.result.teams![0]![0]!;
      const b = t.result.teams![1]![0]!;
      t.result.teams![0]![0] = b;
      t.result.teams![1]![0] = a;
      const v = verifyReceipt(t);
      expect(v.status).toBe('invalid');
      expect(v.checks.at(-1)!.code).toBe('RESULT_MISMATCH');
    }
  });
});
