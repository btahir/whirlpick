// Spin geometry in turns (PLAN §2.10). 1 turn = 360°, clockwise, wheel-local from its zero mark.
import { eligibleEntries } from './draw.js';
import type { HashedEntry, Slice } from './types.js';

export function mod1(x: number): number {
  return x - Math.floor(x);
}

/** Eligible slices with their snapshot index, eligible position and [start, end) in turns. */
export function slicesFor(entries: readonly HashedEntry[], excluded: readonly number[] = []): Slice[] {
  const el = eligibleEntries(entries, excluded);
  let total = 0;
  for (const e of el) total += e.milliWeight;
  const out: Slice[] = [];
  let cum = 0;
  el.forEach((e, pos) => {
    const start = cum / total;
    cum += e.milliWeight;
    out.push({ index: e.index, pos, label: e.label, milliWeight: e.milliWeight, start, end: cum / total });
  });
  return out;
}

/** Landing fraction f ∈ [0.05, 0.95): uniform over the central 90 % of the slice. */
export function landingFraction(landingU32: number): number {
  return 0.05 + 0.9 * (landingU32 / 4294967296);
}

/** landingTurn = (cumBefore + f · w) / T. */
export function landingTurn(slices: readonly Slice[], pos: number, landingU32: number): number {
  let total = 0;
  let before = 0;
  for (const s of slices) {
    if (s.pos < pos) before += s.milliWeight;
    total += s.milliWeight;
  }
  const w = slices[pos]!.milliWeight;
  return (before + landingFraction(landingU32) * w) / total;
}

/**
 * Deterministic extra full turns. Design SPEC §7.1 overrides PLAN §2.10 here (logged in
 * notes/fix-coordination.md): reduced ? 1 : clamp(round(1.2 + 0.8 · D), 2, 24).
 * 1 s → 2, 6 s → 6, 10 s → 9, 30 s → 24.
 */
export function extraTurns(durationSec: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return Math.min(24, Math.max(2, Math.round(1.2 + 0.8 * durationSec)));
}

/** R1 = R0 + extra + mod1(pointerTurn − landing − R0). */
export function finalRotation(r0: number, landing: number, extra: number, pointerTurn = 0): number {
  return r0 + extra + mod1(pointerTurn - landing - r0);
}

/** Local angle under the pointer for rotation R. */
export function angleUnderPointer(r: number, pointerTurn = 0): number {
  return mod1(pointerTurn - r);
}

/** Eligible position of the slice under the pointer (binary search on start). */
export function sliceUnderPointer(r: number, slices: readonly Slice[], pointerTurn = 0): number {
  const theta = angleUnderPointer(r, pointerTurn);
  let lo = 0;
  let hi = slices.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (slices[mid]!.start <= theta) lo = mid;
    else hi = mid - 1;
  }
  return slices[lo]?.pos ?? -1;
}
