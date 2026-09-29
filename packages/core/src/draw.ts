// Weighted picks and modes (PLAN §2.5–2.7).
import { wheelHash as hashWheel } from './canonical.js';
import { normaliseSeed } from './commit.js';
import { WhirlError } from './errors.js';
import { milliWeight } from './labels.js';
import { DrawStream } from './stream.js';
import type { HashedEntry, Pick } from './types.js';

export interface EligibleEntry {
  index: number;
  label: string;
  milliWeight: number;
}

/** Sorted, duplicate-free, in range. Throws PARAMS_INVALID otherwise. */
export function normaliseExcluded(excluded: readonly number[] | undefined, entries: readonly HashedEntry[]): number[] {
  if (excluded === undefined) return [];
  if (!Array.isArray(excluded)) throw new WhirlError('PARAMS_INVALID', 'excluded must be a list of entry indices.');
  const out = [...new Set(excluded)].sort((a, b) => a - b);
  for (const i of out) {
    if (!Number.isInteger(i) || i < 0 || i >= entries.length) throw new WhirlError('PARAMS_INVALID', `Excluded index ${i} is not an entry of this wheel.`, { index: i });
    if (!entries[i]!.enabled) throw new WhirlError('PARAMS_INVALID', `Excluded index ${i} (${entries[i]!.label}) is disabled.`, { index: i });
  }
  return out;
}

/** Enabled entries not in `excluded`, in snapshot order (§2.5). */
export function eligibleEntries(entries: readonly HashedEntry[], excluded: readonly number[] = []): EligibleEntry[] {
  const ex = new Set(excluded);
  const out: EligibleEntry[] = [];
  entries.forEach((e, index) => {
    if (e.enabled && !ex.has(index)) out.push({ index, label: e.label, milliWeight: milliWeight(e.weight) });
  });
  return out;
}

/** One exact weighted pick (§2.6): randBelow(T), then u32() for the landing offset. Returns the eligible position. */
export function pickOne(stream: DrawStream, eligible: readonly EligibleEntry[]): { pos: number; landingU32: number; r: bigint; total: bigint } {
  if (eligible.length === 0) throw new WhirlError('NO_ELIGIBLE_ENTRIES', 'There are no entries left to pick from.');
  let total = 0n;
  for (const e of eligible) total += BigInt(e.milliWeight);
  const r = stream.randBelow(total);
  let cum = 0n;
  let pos = eligible.length - 1;
  for (let i = 0; i < eligible.length; i++) {
    cum += BigInt(eligible[i]!.milliWeight);
    if (r < cum) {
      pos = i;
      break;
    }
  }
  const landingU32 = stream.u32();
  return { pos, landingU32, r, total };
}

export interface DrawPicksInput {
  entries: readonly HashedEntry[];
  seed: string;
  publicInput?: string | null;
  spinIndex: number;
  count: number | 'all';
  excluded?: readonly number[];
}

/** single / multi / elimination draws (§2.7): k picks without replacement under one spin index. */
export function drawPicks(o: DrawPicksInput): { picks: Pick[]; wheelHash: string } {
  const seed = normaliseSeed(o.seed);
  const wh = hashWheel(o.entries);
  const excluded = normaliseExcluded(o.excluded, o.entries);
  const working = eligibleEntries(o.entries, excluded);
  if (working.length === 0) throw new WhirlError('NO_ELIGIBLE_ENTRIES', 'There are no entries left to pick from.');
  let k: number;
  if (o.count === 'all') k = working.length;
  else if (Number.isInteger(o.count) && o.count >= 1) k = o.count;
  else throw new WhirlError('COUNT_INVALID', 'count must be a whole number ≥ 1 or "all".', { count: o.count });
  if (k > working.length) throw new WhirlError('COUNT_TOO_LARGE', `Can't pick ${k} from ${working.length} eligible entries.`, { count: k, eligible: working.length });
  const stream = new DrawStream(seed, wh, o.spinIndex, o.publicInput);
  const picks: Pick[] = [];
  for (let j = 0; j < k; j++) {
    const { pos, landingU32 } = pickOne(stream, working);
    const w = working[pos]!;
    picks.push({ index: w.index, label: w.label, landingU32 });
    working.splice(pos, 1);
  }
  return { picks, wheelHash: wh };
}
