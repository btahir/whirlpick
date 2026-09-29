// B1–B6: fairness statistics over deterministic fixture seeds (seed_i = H(tag ‖ u32be(i))).
// Every p-value must exceed 0.001. Results are printed so the verifier can record them.
import { describe, expect, it } from 'vitest';
import { chiSquareTest } from '../../../scripts/stats/chisq.js';
import { DrawStream, eligibleEntries, landingFraction, milliWeight, pickOne, splitTeams, wheelHash, type HashedEntry } from '../src/index.js';
import { fixtureSeed, uniform, weighted } from './helpers.js';

const N = 100_000;
const report: Record<string, number> = {};

function spinCounts(entries: HashedEntry[], n: number, onLanding?: (f: number) => void): number[] {
  const wh = wheelHash(entries);
  const el = eligibleEntries(entries);
  const counts = Array.from({ length: el.length }, () => 0);
  for (let i = 0; i < n; i++) {
    const { pos, landingU32 } = pickOne(new DrawStream(fixtureSeed(i), wh, 0), el);
    counts[pos]!++;
    onLanding?.(landingFraction(landingU32));
  }
  return counts;
}

function probs(entries: HashedEntry[]): number[] {
  const m = entries.map((e) => milliWeight(e.weight));
  const t = m.reduce((a, b) => a + b, 0);
  return m.map((x) => x / t);
}

describe('fairness', () => {
  it.each([2, 10, 100])('B1 uniform %i entries, 100 000 spins: p > 0.001', (n) => {
    const e = uniform(n);
    const { p } = chiSquareTest(spinCounts(e, N), probs(e));
    report[`B1 uniform ${n}`] = p;
    expect(p).toBeGreaterThan(0.001);
  });
  it.each([
    ['[0.125, 1, 2.5, 10]', [0.125, 1, 2.5, 10]],
    ['[1, 1, 1, 7]', [1, 1, 1, 7]],
    ['1…20', Array.from({ length: 20 }, (_, i) => i + 1)],
  ])('B2 weighted %s, 100 000 spins: p > 0.001', (name, ws) => {
    const e = weighted(ws);
    const { p } = chiSquareTest(spinCounts(e, N), probs(e));
    report[`B2 weighted ${name}`] = p;
    expect(p).toBeGreaterThan(0.001);
  });
  it('B3 without replacement: 5 uniform, count 2 over 20 ordered pairs; weights [1,2,3,4] vs exact sequential probabilities', () => {
    for (const ws of [[1, 1, 1, 1, 1], [1, 2, 3, 4]]) {
      const e = weighted(ws);
      const wh = wheelHash(e);
      const k = ws.length;
      const counts = Array.from({ length: k * k }, () => 0);
      for (let i = 0; i < N; i++) {
        const s = new DrawStream(fixtureSeed(i), wh, 0);
        const working = eligibleEntries(e);
        const a = working[pickOne(s, working).pos]!.index;
        working.splice(working.findIndex((x) => x.index === a), 1);
        const b = working[pickOne(s, working).pos]!.index;
        counts[a * k + b]!++;
      }
      const tot = ws.reduce((x, y) => x + y, 0);
      const obs: number[] = [];
      const exp: number[] = [];
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (a !== b) {
        obs.push(counts[a * k + b]!);
        exp.push((ws[a]! / tot) * (ws[b]! / (tot - ws[a]!)));
      }
      const { p } = chiSquareTest(obs, exp);
      report[`B3 pairs ${JSON.stringify(ws)}`] = p;
      expect(p).toBeGreaterThan(0.001);
    }
  });
  it('B4 landing offset f: 20 equal bins over [0.05, 0.95], p > 0.001; min ≥ 0.05, max ≤ 0.95', () => {
    const bins = Array.from({ length: 20 }, () => 0);
    let min = 1;
    let max = 0;
    spinCounts(uniform(10), N, (f) => {
      min = Math.min(min, f);
      max = Math.max(max, f);
      bins[Math.min(19, Math.floor(((f - 0.05) / 0.9) * 20))]!++;
    });
    const { p } = chiSquareTest(bins, Array.from({ length: 20 }, () => 1 / 20));
    report['B4 landing bins'] = p;
    expect(p).toBeGreaterThan(0.001);
    expect(min).toBeGreaterThanOrEqual(0.05);
    expect(max).toBeLessThanOrEqual(0.95);
  });
  it('B5 teams: 20 000 splits of 12 into 3; per-member team index p > 0.001; fixed pair together ≈ 3/11 ± 1.5 pp', () => {
    const e = uniform(12);
    const counts = Array.from({ length: 12 }, () => [0, 0, 0]);
    let together = 0;
    const S = 20_000;
    for (let i = 0; i < S; i++) {
      const r = splitTeams({ entries: e, seed: fixtureSeed(i), spinIndex: 0, teamCount: 3 });
      r.teams.forEach((t, ti) => t.forEach((x) => counts[x]![ti]!++));
      if (r.teams.some((t) => t.includes(0) && t.includes(1))) together++;
    }
    let minP = 1;
    for (const c of counts) minP = Math.min(minP, chiSquareTest(c, [1 / 3, 1 / 3, 1 / 3]).p);
    report['B5 teams min member p'] = minP;
    report['B5 pair together rate'] = together / S;
    expect(minP).toBeGreaterThan(0.001);
    expect(Math.abs(together / S - 3 / 11)).toBeLessThan(0.015);
  });
  it('B6 shuffle: 120 000 Fisher–Yates shuffles of 5 over 120 permutations, p > 0.001', () => {
    const e = uniform(5);
    const counts = new Map<string, number>();
    for (let i = 0; i < 120_000; i++) {
      const k = splitTeams({ entries: e, seed: fixtureSeed(i), spinIndex: 0, teamCount: 2, balance: false }).order.join('');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(120);
    const { p } = chiSquareTest([...counts.values()], Array.from({ length: 120 }, () => 1 / 120));
    report['B6 shuffle'] = p;
    expect(p).toBeGreaterThan(0.001);
    console.log('fairness p-values', JSON.stringify(report, null, 1));
  });
});
