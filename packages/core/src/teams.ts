// Team split (PLAN §2.8): validation → seeded Fisher–Yates → groups → greedy snake assignment
// → deterministic constraint repair → optional repeat-pair minimisation (new round).
//
// Why the greedy snake keeps sizes within one: every assignment goes to a team with the fewest
// members of the current group, and among those the smallest team. Within a group, counts rise
// in rounds (every team gets one before any gets two), so group counts differ by ≤ 1. Across
// groups, each pick favours the currently smallest teams among the tied ones, and since a group
// fills each "round" to all N teams before starting the next, a round of N assignments adds
// exactly one member to every team; a partial round adds one member each to the smallest teams
// (ties broken by snake order), which can never push a team two ahead of another.
// The property tests (teams.test.ts) check both bounds over thousands of random cases.
import { wheelHash as hashWheel } from './canonical.js';
import { normaliseSeed } from './commit.js';
import { WhirlError } from './errors.js';
import { DrawStream } from './stream.js';
import type { HashedEntry, TeamsBalance, TeamsResult, Warning } from './types.js';

export const TEAM_ITERATIONS = 5000;
export const REPAIR_PASSES = 20;
const NUMERIC_TAG = /^-?\d+(\.\d+)?$/;

export interface SplitTeamsInput {
  entries: readonly HashedEntry[];
  seed: string;
  publicInput?: string | null;
  spinIndex: number;
  teamCount?: number | null;
  teamSize?: number | null;
  balance?: boolean;
  keepApart?: readonly (readonly number[])[];
  keepTogether?: readonly (readonly number[])[];
  previousRounds?: readonly (readonly (readonly number[])[])[];
}

export interface TeamsPlan {
  eligible: number[];
  teamCount: number;
  balance: boolean;
  keepApart: number[][];
  keepTogether: number[][];
  blocks: number[][];
  previousRounds: number[][][];
}

const primaryTag = (e: HashedEntry | undefined): string | null => e?.tags?.[0] ?? null;

function labelOf(entries: readonly HashedEntry[], i: number): string {
  return entries[i]?.label ?? `#${i}`;
}

function listLabels(entries: readonly HashedEntry[], xs: readonly number[]): string {
  const ls = xs.map((x) => labelOf(entries, x));
  if (ls.length <= 1) return ls.join('');
  return `${ls.slice(0, -1).join(', ')} and ${ls[ls.length - 1]}`;
}

function normaliseSets(sets: readonly (readonly number[])[] | undefined, name: string, eligibleSet: Set<number>, entries: readonly HashedEntry[]): number[][] {
  if (sets === undefined) return [];
  if (!Array.isArray(sets)) throw new WhirlError('CONSTRAINT_INVALID', `${name} must be a list of lists of entry indices.`);
  return sets.map((set, si) => {
    if (!Array.isArray(set)) throw new WhirlError('CONSTRAINT_INVALID', `${name} rule ${si + 1} must be a list of entry indices.`);
    for (const x of set) {
      if (!Number.isInteger(x) || !eligibleSet.has(x)) {
        const what = Number.isInteger(x) && x >= 0 && x < entries.length ? `${labelOf(entries, x)} (#${x}) is disabled or not on the wheel` : `#${x} is not an entry`;
        throw new WhirlError('CONSTRAINT_UNKNOWN_ENTRY', `${name} rule ${si + 1}: ${what}.`, { rule: si, index: x });
      }
    }
    const u = [...new Set(set)].sort((a, b) => a - b);
    if (u.length < 2) throw new WhirlError('CONSTRAINT_INVALID', `${name} rule ${si + 1} needs at least two different entries.`, { rule: si });
    return u;
  });
}

/** Step 1: validation before any randomness. Returns the resolved plan. */
export function planTeams(o: SplitTeamsInput): TeamsPlan {
  const entries = o.entries;
  const eligible: number[] = [];
  entries.forEach((e, i) => {
    if (e.enabled) eligible.push(i);
  });
  const M = eligible.length;
  const hasCount = o.teamCount !== undefined && o.teamCount !== null;
  const hasSize = o.teamSize !== undefined && o.teamSize !== null;
  if (hasCount === hasSize) throw new WhirlError('TEAM_COUNT_INVALID', 'Give either a number of teams or a team size (not both).');
  let N: number;
  if (hasSize) {
    const K = o.teamSize as number;
    if (!Number.isInteger(K) || K < 1) throw new WhirlError('TEAM_COUNT_INVALID', 'Team size must be a whole number ≥ 1.', { teamSize: K });
    N = Math.ceil(M / K);
  } else {
    N = o.teamCount as number;
    if (!Number.isInteger(N)) throw new WhirlError('TEAM_COUNT_INVALID', 'Number of teams must be a whole number.', { teamCount: N });
  }
  if (N < 2 || N > M) {
    throw new WhirlError('TEAM_COUNT_INVALID', M < 2 ? `Need at least 2 people to make teams (have ${M}).` : `Can't make ${N} team${N === 1 ? '' : 's'} from ${M} people: choose 2 to ${M} teams.`, { teams: N, members: M });
  }
  const eligibleSet = new Set(eligible);
  const keepApart = normaliseSets(o.keepApart, 'Keep apart', eligibleSet, entries);
  const keepTogether = normaliseSets(o.keepTogether, 'Keep together', eligibleSet, entries);
  const balance = o.balance ?? eligible.some((i) => (entries[i]!.tags?.length ?? 0) > 0);

  // Union-find over keep-together sets.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (c !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const set of keepTogether) {
    for (const x of set) if (!parent.has(x)) parent.set(x, x);
    for (let i = 1; i < set.length; i++) {
      const a = find(set[0]!);
      const b = find(set[i]!);
      if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
    }
  }
  const byRoot = new Map<number, number[]>();
  for (const x of parent.keys()) {
    const r = find(x);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(x);
  }
  const blocks = [...byRoot.values()].map((b) => b.sort((a, c) => a - c)).sort((a, b) => a[0]! - b[0]!);
  const maxSize = Math.ceil(M / N);
  for (const b of blocks) {
    if (b.length > maxSize) {
      throw new WhirlError('TOGETHER_TOO_LARGE', `Can't keep ${listLabels(entries, b)} together: that's ${b.length} people and teams have at most ${maxSize}. Try fewer teams or fewer rules.`, { block: b, maxTeamSize: maxSize });
    }
  }
  const blockOf = new Map<number, number>();
  blocks.forEach((b, bi) => b.forEach((x) => blockOf.set(x, bi)));
  for (const set of keepApart) {
    for (let i = 0; i < set.length; i++) {
      for (let j = i + 1; j < set.length; j++) {
        const a = set[i]!;
        const b = set[j]!;
        if (blockOf.has(a) && blockOf.get(a) === blockOf.get(b)) {
          throw new WhirlError('CONSTRAINT_CONFLICT', `${labelOf(entries, a)} and ${labelOf(entries, b)} must be kept together and apart at the same time. Remove one of the rules.`, { a, b });
        }
      }
    }
  }
  for (const set of keepApart) {
    if (set.length > N) {
      throw new WhirlError('APART_TOO_MANY', `Can't keep ${listLabels(entries, set)} apart with only ${N} teams. Try more teams or fewer rules.`, { set, teams: N });
    }
  }
  const previousRounds = normaliseRounds(o.previousRounds);
  return { eligible, teamCount: N, balance, keepApart, keepTogether, blocks, previousRounds };
}

function normaliseRounds(rounds: SplitTeamsInput['previousRounds']): number[][][] {
  if (rounds === undefined) return [];
  if (!Array.isArray(rounds)) throw new WhirlError('PARAMS_INVALID', 'previousRounds must be a list of rounds (lists of teams of entry indices).');
  return rounds.map((round) => {
    if (!Array.isArray(round)) throw new WhirlError('PARAMS_INVALID', 'Each previous round must be a list of teams.');
    return round.map((team) => {
      if (!Array.isArray(team) || team.some((x) => !Number.isInteger(x) || x < 0)) throw new WhirlError('PARAMS_INVALID', 'Each previous team must be a list of entry indices.');
      return [...new Set(team)].sort((a, b) => a - b);
    });
  });
}

/** Group order (§2.8 step 3). Returns the list of primary-tag keys (null = untagged, always last). */
export function groupOrder(tags: readonly (string | null)[]): (string | null)[] {
  const counts = new Map<string, number>();
  let untagged = false;
  for (const t of tags) {
    if (t === null) untagged = true;
    else counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const keys = [...counts.keys()];
  const cp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  if (keys.length > 0 && keys.every((k) => NUMERIC_TAG.test(k))) keys.sort((a, b) => Number(b) - Number(a) || cp(a, b));
  else keys.sort((a, b) => counts.get(b)! - counts.get(a)! || cp(a, b));
  return untagged ? [...keys, null] : keys;
}

export function splitTeams(o: SplitTeamsInput): TeamsResult {
  const seed = normaliseSeed(o.seed);
  const entries = o.entries;
  const plan = planTeams(o);
  const wh = hashWheel(entries);
  const stream = new DrawStream(seed, wh, o.spinIndex, o.publicInput);
  const { eligible, teamCount: N, balance, keepApart, blocks } = plan;
  const M = eligible.length;
  const warnings: Warning[] = [];

  // Step 2: seeded Fisher–Yates.
  const P = eligible.slice();
  for (let i = M - 1; i >= 1; i--) {
    const j = Number(stream.randBelow(BigInt(i + 1)));
    const t = P[i]!;
    P[i] = P[j]!;
    P[j] = t;
  }
  const rank = new Map<number, number>();
  P.forEach((x, i) => rank.set(x, i));
  const byRank = (a: number, b: number) => rank.get(a)! - rank.get(b)!;
  const ptag = (x: number) => primaryTag(entries[x]);

  // Step 3: groups.
  const groups: number[][] = [];
  if (!balance) groups.push(P.slice());
  else {
    for (const key of groupOrder(P.map(ptag))) groups.push(P.filter((x) => ptag(x) === key));
  }

  // Step 4: greedy tag-balanced snake assignment.
  const team = new Map<number, number>();
  const size = new Array<number>(N).fill(0);
  groups.forEach((g, gi) => {
    const inGroup = new Array<number>(N).fill(0);
    for (const x of g) {
      let best = 0;
      for (let t = 1; t < N; t++) {
        const snake = (u: number) => (gi % 2 === 0 ? u : N - 1 - u);
        if (inGroup[t]! < inGroup[best]! || (inGroup[t] === inGroup[best] && (size[t]! < size[best]! || (size[t] === size[best] && snake(t) < snake(best))))) best = t;
      }
      team.set(x, best);
      inGroup[best]!++;
      size[best]!++;
    }
  });

  // Step 5: deterministic constraint repair.
  const blockOf = new Map<number, number>();
  blocks.forEach((b, bi) => {
    if (b.length >= 2) b.forEach((x) => blockOf.set(x, bi));
  });
  const apartOf = new Map<number, number[][]>();
  for (const A of keepApart) for (const x of A) apartOf.set(x, [...(apartOf.get(x) ?? []), A]);
  const members = (t: number) => P.filter((x) => team.get(x) === t);
  // Keep-apart partners of x that would share team t with x (ignoring `ignore`, who leaves t).
  const apartClash = (x: number, t: number, ignore: number) => (apartOf.get(x) ?? []).some((A) => A.some((z) => z !== x && z !== ignore && team.get(z) === t));
  const swap = (x: number, y: number) => {
    const tx = team.get(x)!;
    team.set(x, team.get(y)!);
    team.set(y, tx);
  };
  const admissible = (x: number, y: number, repairing: number | null) => {
    const bx = blockOf.get(x);
    const by = blockOf.get(y);
    if (bx !== undefined && bx !== repairing) return false;
    if (by !== undefined) return false;
    if (team.get(x) === team.get(y)) return false;
    return !apartClash(x, team.get(y)!, y) && !apartClash(y, team.get(x)!, x);
  };
  const choose = (x: number, candidates: number[], repairing: number | null): number | undefined => {
    const ok = candidates.filter((y) => admissible(x, y, repairing));
    if (balance) {
      const same = ok.find((y) => ptag(y) === ptag(x));
      if (same !== undefined) return same;
    }
    return ok[0];
  };
  const blockViolations = () => blocks.filter((b) => b.length >= 2 && new Set(b.map((x) => team.get(x))).size > 1);
  const apartViolations = () => {
    const v: [number, number][] = [];
    for (const A of keepApart) {
      for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) if (team.get(A[i]!) === team.get(A[j]!)) v.push([A[i]!, A[j]!]);
    }
    return v;
  };
  const orderedBlocks = blocks
    .map((b, bi) => ({ b, bi }))
    .filter(({ b }) => b.length >= 2)
    .sort((p, q) => Math.min(...p.b.map((x) => rank.get(x)!)) - Math.min(...q.b.map((x) => rank.get(x)!)));
  for (let pass = 0; pass < REPAIR_PASSES; pass++) {
    if (blockViolations().length === 0 && apartViolations().length === 0) break;
    let swapped = false;
    for (const { b, bi } of orderedBlocks) {
      const inB = new Set(b);
      // Target: the team holding most members of B among teams with room for B once other
      // blocks' members (which can't be swapped out) are counted; else any team (PLAN §2.8 step 5).
      const countIn = (t: number) => b.filter((x) => team.get(x) === t).length;
      const room = (t: number) => size[t]! - members(t).filter((x) => blockOf.has(x) && !inB.has(x)).length;
      let target = -1;
      for (const roomy of [true, false]) {
        for (let t = 0; t < N; t++) {
          if (roomy && room(t) < b.length) continue;
          if (target === -1 || countIn(t) > countIn(target)) target = t;
        }
        if (target !== -1) break;
      }
      for (const x of [...b].sort(byRank)) {
        if (team.get(x) === target) continue;
        const y = choose(x, members(target).filter((y) => !inB.has(y)), bi);
        if (y !== undefined) {
          swap(x, y);
          swapped = true;
        }
      }
    }
    for (const A of keepApart) {
      const sorted = [...A].sort(byRank);
      for (let i = 0; i < sorted.length; i++) {
        const x = sorted[i]!;
        const earlier = sorted.slice(0, i).filter((z) => team.get(z) === team.get(x));
        if (earlier.length === 0) continue;
        // Move x; if x is locked in a keep-together block, move the earlier clashing member instead.
        for (const mover of [x, ...earlier]) {
          if (blockOf.has(mover)) continue;
          const free = [...Array(N).keys()].filter((t) => !A.some((z) => team.get(z) === t));
          let y: number | undefined;
          if (balance) {
            for (const t of free) {
              y = members(t).find((c) => ptag(c) === ptag(mover) && admissible(mover, c, null));
              if (y !== undefined) break;
            }
          }
          if (y === undefined) {
            for (const t of free) {
              y = members(t).find((c) => admissible(mover, c, null));
              if (y !== undefined) break;
            }
          }
          if (y !== undefined) {
            swap(mover, y);
            swapped = true;
            break;
          }
        }
      }
    }
    if (!swapped) break;
  }
  const leftBlocks = blockViolations();
  const leftApart = apartViolations();
  if (leftBlocks.length || leftApart.length) {
    const violations = [
      ...leftBlocks.map((b) => ({ rule: 'together' as const, entries: b, text: `keep ${listLabels(entries, b)} together` })),
      ...leftApart.map(([a, b]) => ({ rule: 'apart' as const, entries: [a, b], text: `keep ${listLabels(entries, [a, b])} apart` })),
    ];
    throw new WhirlError('CONSTRAINTS_UNSATISFIED', `Couldn't satisfy: ${violations.map((v) => v.text).join('; ')}. Try more teams or fewer rules.`, { violations: violations.map(({ rule, entries: e }) => ({ rule, entries: e })) });
  }

  // Step 6: new round (repeat-pair minimisation).
  const posOf = new Map<number, number>();
  eligible.forEach((x, i) => posOf.set(x, i));
  const hist = new Uint16Array(M * M);
  for (const round of plan.previousRounds) {
    const seen = new Set<string>();
    for (const t of round) {
      const ps = t.filter((x) => posOf.has(x)).map((x) => posOf.get(x)!);
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = Math.min(ps[i]!, ps[j]!);
          const b = Math.max(ps[i]!, ps[j]!);
          const k = `${a},${b}`;
          if (seen.has(k)) continue;
          seen.add(k);
          hist[a * M + b]!++;
          hist[b * M + a]!++;
        }
      }
    }
  }
  const H = (a: number, b: number) => hist[posOf.get(a)! * M + posOf.get(b)!]!;
  const costOf = () => {
    let c = 0;
    for (let t = 0; t < N; t++) {
      const ms = members(t);
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) c += H(ms[i]!, ms[j]!);
    }
    return c;
  };
  let cost = costOf();
  if (plan.previousRounds.length > 0) {
    const teamLists: number[][] = [...Array(N).keys()].map((t) => members(t));
    const bigM = BigInt(M);
    for (let it = 0; it < TEAM_ITERATIONS && cost !== 0; it++) {
      const a = eligible[Number(stream.randBelow(bigM))]!;
      const b = eligible[Number(stream.randBelow(bigM))]!;
      if (a === b) continue;
      const ta = team.get(a)!;
      const tb = team.get(b)!;
      if (ta === tb) continue;
      if (blockOf.has(a) || blockOf.has(b)) continue;
      if (apartClash(a, tb, b) || apartClash(b, ta, a)) continue;
      if (balance && ptag(a) !== ptag(b)) continue;
      let delta = 0;
      for (const m of teamLists[tb]!) if (m !== b) delta += H(a, m) - H(b, m);
      for (const m of teamLists[ta]!) if (m !== a) delta += H(b, m) - H(a, m);
      if (delta <= 0) {
        swap(a, b);
        teamLists[ta]![teamLists[ta]!.indexOf(a)] = b;
        teamLists[tb]![teamLists[tb]!.indexOf(b)] = a;
        cost += delta;
      }
    }
  }

  const teams = [...Array(N).keys()].map((t) => eligible.filter((x) => team.get(x) === t));
  let repeatPairs = 0;
  for (const t of teams) for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (H(t[i]!, t[j]!) > 0) repeatPairs++;
  const bal = balanceReport(entries, teams);
  if (balance && !bal.withinOne) {
    warnings.push({ code: 'BALANCE_RELAXED', message: 'Tag balance was relaxed to satisfy the keep-apart / keep-together rules.' });
  }
  return { teams, sizes: teams.map((t) => t.length), balance: bal, repeatPairs, cost, warnings, order: P, wheelHash: wh, teamCount: N };
}

/** Per-primary-tag counts per team, and whether every tag is within one across teams. */
export function balanceReport(entries: readonly HashedEntry[], teams: readonly (readonly number[])[]): TeamsBalance {
  const tags = groupOrder(teams.flat().map((x) => primaryTag(entries[x]))).filter((t): t is string => t !== null);
  const byTag: Record<string, number[]> = {};
  let withinOne = true;
  for (const tag of tags) {
    const counts = teams.map((t) => t.filter((x) => primaryTag(entries[x]) === tag).length);
    byTag[tag] = counts;
    if (Math.max(...counts) - Math.min(...counts) > 1) withinOne = false;
  }
  return { byTag, withinOne };
}

/** Same-team pairs that also shared a team in a previous round (for UIs). */
export function repeatPairList(teams: readonly (readonly number[])[], previousRounds: readonly (readonly (readonly number[])[])[]): [number, number][] {
  const prev = new Set<string>();
  for (const r of previousRounds) for (const t of r) for (const a of t) for (const b of t) if (a < b) prev.add(`${a},${b}`);
  const out: [number, number][] = [];
  for (const t of teams) for (const a of t) for (const b of t) if (a < b && prev.has(`${a},${b}`)) out.push([a, b]);
  return out;
}
