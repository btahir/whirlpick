// verifyReceipt (PLAN §3.2): named checks in a fixed order; stops at the first failure.
import { wheelHash as hashWheel } from './canonical.js';
import { commitmentFor, seedFromPhrase } from './commit.js';
import { isWhirlError, WhirlError } from './errors.js';
import { normalisePublicInput } from './labels.js';
import { computeDraw, receiptShapeProblem } from './receipt.js';
import type { HashedEntry, Mode, Pick, ReceiptParams, VerifyCheck, VerifyReport } from './types.js';

export interface VerifyExpect {
  commitment?: string;
  wheelHash?: string;
}

/** Plain-language line for each check id (used by /verify and the CLI's human output). */
export const CHECK_TEXT: Record<string, { ok: string; fail: string }> = {
  json: { ok: 'The receipt is readable JSON.', fail: "This isn't a readable receipt (not a JSON object)." },
  version: { ok: 'Receipt format version 1.', fail: 'Unsupported receipt format or version.' },
  algorithm: { ok: 'Algorithm whirlpick-draw-v1.', fail: 'Unknown draw algorithm.' },
  schema: { ok: 'Every field is well formed.', fail: 'A field is missing or malformed.' },
  beacon: { ok: 'No external beacon (v1).', fail: 'This receipt uses a beacon, which v1 does not support.' },
  wheelHash: { ok: "The list wasn't changed: fingerprint matches.", fail: "The list doesn't match its fingerprint: an entry was changed, added, removed or reordered." },
  expectedWheelHash: { ok: 'The fingerprint matches the one you saw.', fail: "The fingerprint doesn't match the one you saw before the draw." },
  seedRevealed: { ok: 'The seed has been revealed.', fail: 'The seed has not been revealed yet.' },
  seedPhrase: { ok: 'The seed phrase produces this seed.', fail: "The seed phrase doesn't produce this seed." },
  commitment: { ok: 'The seed matches the commitment shown before the spin.', fail: "The seed doesn't match the commitment." },
  expectedCommitment: { ok: 'The commitment matches the one you saw.', fail: "The commitment doesn't match the one you saw before the draw." },
  params: { ok: 'The draw settings are valid for this list.', fail: 'The draw settings are not valid for this list.' },
  result: { ok: 'Re-running the draw gives the same result.', fail: 'Re-running the draw gives a different result.' },
  labels: { ok: 'Winner names match the list.', fail: "A winner's name doesn't match the list." },
  committedWheelHash: { ok: 'The list is the one shown with the commitment.', fail: 'The list changed after the commitment was shown.' },
};

/** A receipt value for a check detail; a missing field reads "missing", never "undefined". */
const show = (v: unknown): string => (v === undefined ? 'missing' : JSON.stringify(v) ?? String(v));

export function verifyReceipt(input: unknown, expect: VerifyExpect = {}): VerifyReport {
  const checks: VerifyCheck[] = [];
  const warnings: string[] = [];
  const recomputed: VerifyReport['recomputed'] = {};
  const pass = (id: string, detail?: string) => checks.push({ id, ok: true, detail: detail ?? CHECK_TEXT[id]!.ok });
  const fail = (id: string, code: string, detail?: string): VerifyReport => {
    checks.push({ id, ok: false, code, detail: detail ?? CHECK_TEXT[id]!.fail });
    return { ok: false, status: 'invalid', checks, warnings, recomputed };
  };

  // 1. JSON object
  let r: unknown = input;
  if (typeof input === 'string') {
    try {
      r = JSON.parse(input);
    } catch {
      return fail('json', 'BAD_JSON');
    }
  }
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return fail('json', 'BAD_JSON');
  pass('json');
  const o = r as Record<string, unknown>;
  // 2. format + version
  if (o.format !== 'whirlpick-receipt' || o.version !== 1) return fail('version', 'UNSUPPORTED_VERSION', `Unsupported receipt: format ${show(o.format)}, version ${show(o.version)} (expected "whirlpick-receipt", 1).`);
  pass('version');
  // 3. algorithm
  if (o.algorithm !== 'whirlpick-draw-v1') return fail('algorithm', 'UNKNOWN_ALGORITHM', o.algorithm === undefined ? `The receipt doesn't name an algorithm (expected "whirlpick-draw-v1").` : `Unknown algorithm ${show(o.algorithm)} (expected "whirlpick-draw-v1").`);
  pass('algorithm');
  // 4. schema (beacon checked separately in 5)
  const problem = receiptShapeProblem(o);
  if (problem) return fail('schema', 'SCHEMA_INVALID', `${problem.message} (at ${problem.path || '/'})`);
  pass('schema');
  // 5. beacon
  if (o.beacon !== null) return fail('beacon', 'BEACON_UNSUPPORTED');
  pass('beacon');
  const entries = o.entries as HashedEntry[];
  // 6. wheel hash
  const wh = hashWheel(entries);
  recomputed.wheelHash = wh;
  if (wh !== o.wheelHash) return fail('wheelHash', 'WHEEL_HASH_MISMATCH', `${CHECK_TEXT.wheelHash!.fail} Recomputed ${wh}, receipt says ${String(o.wheelHash)}.`);
  pass('wheelHash', `${CHECK_TEXT.wheelHash!.ok} (${wh})`);
  // 7. expected wheel hash
  if (expect.wheelHash !== undefined) {
    if (expect.wheelHash.trim().toLowerCase() !== wh) return fail('expectedWheelHash', 'EXPECTED_WHEEL_MISMATCH', `${CHECK_TEXT.expectedWheelHash!.fail} You saw ${expect.wheelHash}, the receipt's list is ${wh}.`);
    pass('expectedWheelHash');
  }
  // 8. seed revealed
  if (o.seed === null) {
    checks.push({ id: 'seedRevealed', ok: false, code: 'UNREVEALED', detail: `${CHECK_TEXT.seedRevealed!.fail} Commitment: ${String(o.commitment)}.` });
    recomputed.commitment = o.commitment as string;
    return { ok: false, status: 'unrevealed', checks, warnings, recomputed };
  }
  pass('seedRevealed');
  const seed = o.seed as string;
  // 9. seed phrase
  if (typeof o.seedPhrase === 'string') {
    if (seedFromPhrase(o.seedPhrase) !== seed) return fail('seedPhrase', 'SEED_PHRASE_MISMATCH');
    pass('seedPhrase');
  }
  // 10. commitment
  const c = commitmentFor(seed);
  recomputed.commitment = c;
  if (c !== o.commitment) return fail('commitment', 'COMMITMENT_MISMATCH', `${CHECK_TEXT.commitment!.fail} H(seed) is ${c}, receipt says ${String(o.commitment)}.`);
  pass('commitment', `${CHECK_TEXT.commitment!.ok} (${c})`);
  // 11. expected commitment
  if (expect.commitment !== undefined) {
    if (expect.commitment.trim().toLowerCase() !== c) return fail('expectedCommitment', 'EXPECTED_COMMITMENT_MISMATCH', `${CHECK_TEXT.expectedCommitment!.fail} You saw ${expect.commitment}, the receipt's is ${c}.`);
    pass('expectedCommitment');
  }
  // 12. params
  const mode = o.mode as Mode;
  const params = o.params as ReceiptParams;
  const spinIndex = o.spinIndex as number;
  let publicInput: string | null;
  let draw: ReturnType<typeof computeDraw>;
  try {
    publicInput = normalisePublicInput(o.publicInput);
    if (publicInput !== (o.publicInput ?? null)) throw new WhirlError('PARAMS_INVALID', 'publicInput is not normalised (NFC, trimmed, non-empty).');
    const why = paramsProblem(mode, params, entries);
    if (why) return fail('params', 'PARAMS_INVALID', `${CHECK_TEXT.params!.fail} ${why}`);
    draw = computeDraw(entries, seed, publicInput, spinIndex, mode, params);
  } catch (e) {
    if (isWhirlError(e)) return fail('params', 'PARAMS_INVALID', `${CHECK_TEXT.params!.fail} ${(e as Error).message}`);
    throw e;
  }
  pass('params');
  // 13. result
  const claimed = o.result as { picks?: Pick[]; teams?: number[][]; repeatPairs?: number };
  if (mode === 'teams') {
    recomputed.teams = draw.result.teams!;
    recomputed.repeatPairs = draw.result.repeatPairs!;
    const same = JSON.stringify(claimed.teams) === JSON.stringify(draw.result.teams) && claimed.repeatPairs === draw.result.repeatPairs;
    if (!same) return fail('result', 'RESULT_MISMATCH', `${CHECK_TEXT.result!.fail} Expected teams ${JSON.stringify(draw.result.teams)} (repeat pairs ${draw.result.repeatPairs}), receipt claims ${show(claimed.teams)} (repeat pairs ${show(claimed.repeatPairs)}).`);
    pass('result');
  } else {
    const exp = draw.result.picks!;
    recomputed.picks = exp;
    const got = claimed.picks ?? [];
    const same = got.length === exp.length && got.every((p, i) => p.index === exp[i]!.index && p.landingU32 === exp[i]!.landingU32);
    if (!same) {
      const fmt = (ps: Pick[]) => ps.map((p) => `#${p.index} ${p.label} @${p.landingU32}`).join(', ');
      return fail('result', 'RESULT_MISMATCH', `${CHECK_TEXT.result!.fail} Expected ${fmt(exp)}; receipt claims ${fmt(got)}.`);
    }
    pass('result');
    // 14. labels
    for (const p of got) {
      if (entries[p.index]!.label !== p.label) return fail('labels', 'LABEL_MISMATCH', `${CHECK_TEXT.labels!.fail} Pick #${p.index} says "${p.label}", the list says "${entries[p.index]!.label}".`);
    }
    pass('labels');
  }
  // 15. committed wheel hash (warning only)
  if (o.committedWheelHash !== undefined && o.committedWheelHash !== null && o.committedWheelHash !== wh) {
    warnings.push('WHEEL_CHANGED_AFTER_COMMIT');
    checks.push({ id: 'committedWheelHash', ok: true, code: 'WHEEL_CHANGED_AFTER_COMMIT', detail: `${CHECK_TEXT.committedWheelHash!.fail} Shown ${String(o.committedWheelHash)}, drawn ${wh}.` });
  } else if (o.committedWheelHash) pass('committedWheelHash');
  return { ok: true, status: 'valid', checks, warnings, recomputed };
}

function paramsProblem(mode: Mode, p: ReceiptParams, entries: readonly HashedEntry[]): string | null {
  const teamKeys = ['teamCount', 'teamSize', 'balance', 'keepApart', 'keepTogether', 'previousRounds', 'iterations'] as const;
  if (mode === 'teams') {
    if (p.count !== undefined || p.excluded !== undefined) return 'A teams draw has no count or excluded params.';
    for (const k of teamKeys) if (p[k] === undefined) return `A teams draw needs params.${k}.`;
    if (p.iterations !== 5000) return 'iterations must be 5000 in whirlpick-draw-v1.';
    return null;
  }
  for (const k of teamKeys) if (p[k] !== undefined) return `A ${mode} draw has no ${k} param.`;
  if (p.count === undefined || p.excluded === undefined) return 'A pick draw needs params.count and params.excluded.';
  if (mode !== 'multi' && p.count !== 1) return `A ${mode} draw has count 1.`;
  const ex = p.excluded;
  for (let i = 0; i < ex.length; i++) {
    const x = ex[i]!;
    if (i > 0 && x <= ex[i - 1]!) return 'excluded must be sorted and without duplicates.';
    if (x >= entries.length) return `Excluded index ${x} is not an entry.`;
    if (!entries[x]!.enabled) return `Excluded index ${x} is a disabled entry.`;
  }
  return null;
}
