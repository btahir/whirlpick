// Receipts (PLAN §3.1): build one from a draw, recompute a draw from a receipt, check its shape.
import { wheelHash as hashWheel } from './canonical.js';
import { commitmentFor, normaliseSeed, seedFromPhrase } from './commit.js';
import { drawPicks, eligibleEntries, normaliseExcluded } from './draw.js';
import { WhirlError } from './errors.js';
import { codePointLength, isValidWeight, milliWeight, normaliseLabel, normalisePublicInput, normaliseTags, textProblem } from './labels.js';
import { APP_VERSION, SCHEMA_URLS } from './site.js';
import { splitTeams, TEAM_ITERATIONS } from './teams.js';
import type { HashedEntry, Mode, Pick, Receipt, ReceiptEntry, ReceiptParams, ReceiptResult, ValidationIssue } from './types.js';

export interface BuildReceiptInput {
  entries: readonly HashedEntry[];
  /** 64 hex. Required unless `seedPhrase` is given. */
  seed?: string | null;
  seedPhrase?: string | null;
  publicInput?: string | null;
  spinIndex?: number;
  mode: Mode;
  count?: number | 'all';
  excluded?: readonly number[];
  teamCount?: number | null;
  teamSize?: number | null;
  balance?: boolean;
  keepApart?: readonly (readonly number[])[];
  keepTogether?: readonly (readonly number[])[];
  previousRounds?: readonly (readonly (readonly number[])[])[];
  title?: string | null;
  committedWheelHash?: string | null;
  committedAt?: string | null;
  /** ISO time. Default: now. */
  createdAt?: string;
  /** e.g. "whirlpick-web/0.1.0". */
  app?: string;
  /** false → the receipt keeps `seed: null` (and no phrase) until revealed. Default true. */
  reveal?: boolean;
}

/** Receipt snapshot of the entries: label, weight, enabled, tags (omitted when empty). */
export function receiptEntries(entries: readonly HashedEntry[]): ReceiptEntry[] {
  return entries.map((e, i) => {
    const label = normaliseLabel(e.label, `Entry ${i + 1} label`);
    milliWeight(e.weight);
    const tags = normaliseTags(e.tags, `Entry ${i + 1}`);
    const r: ReceiptEntry = { label, weight: e.weight, enabled: e.enabled };
    if (tags.length) r.tags = tags;
    return r;
  });
}

function resolveSeed(seed: string | null | undefined, seedPhrase: string | null | undefined): { seed: string; seedPhrase: string | null } {
  if (seedPhrase !== undefined && seedPhrase !== null) {
    const fromPhrase = seedFromPhrase(seedPhrase);
    if (seed !== undefined && seed !== null && normaliseSeed(seed) !== fromPhrase) throw new WhirlError('SEED_PHRASE_MISMATCH', 'The seed does not match the seed phrase.');
    return { seed: fromPhrase, seedPhrase };
  }
  if (seed === undefined || seed === null) throw new WhirlError('SEED_INVALID', 'A seed (64 hex) or a seed phrase is required.');
  return { seed: normaliseSeed(seed), seedPhrase: null };
}

const sortSet = (s: readonly number[]) => [...new Set(s)].sort((a, b) => a - b);

/** Recompute params and result for a snapshot (shared by buildReceipt and verifyReceipt). */
export function computeDraw(
  entries: readonly HashedEntry[],
  seed: string,
  publicInput: string | null,
  spinIndex: number,
  mode: Mode,
  p: ReceiptParams,
): { params: ReceiptParams; result: ReceiptResult } {
  if (mode === 'teams') {
    const r = splitTeams({
      entries,
      seed,
      publicInput,
      spinIndex,
      teamCount: p.teamCount ?? null,
      teamSize: p.teamSize ?? null,
      ...(p.balance === undefined ? {} : { balance: p.balance }),
      keepApart: p.keepApart ?? [],
      keepTogether: p.keepTogether ?? [],
      previousRounds: p.previousRounds ?? [],
    });
    const hasTags = entries.some((e) => e.enabled && (e.tags?.length ?? 0) > 0);
    const params: ReceiptParams = {
      teamCount: p.teamCount ?? null,
      teamSize: p.teamSize ?? null,
      balance: p.balance ?? hasTags,
      keepApart: (p.keepApart ?? []).map(sortSet),
      keepTogether: (p.keepTogether ?? []).map(sortSet),
      previousRounds: (p.previousRounds ?? []).map((round) => round.map(sortSet)),
      iterations: TEAM_ITERATIONS,
    };
    return { params, result: { teams: r.teams, repeatPairs: r.repeatPairs } };
  }
  let count: number | 'all';
  if (mode === 'multi') count = p.count ?? 1;
  else {
    count = p.count ?? 1;
    if (count !== 1) throw new WhirlError('PARAMS_INVALID', `Mode ${mode} draws exactly one winner (count 1).`);
  }
  const excluded = normaliseExcluded(p.excluded, entries);
  const { picks } = drawPicks({ entries, seed, publicInput, spinIndex, count, excluded });
  return { params: { count, excluded }, result: { picks } };
}

/** Run a draw and write its receipt (§3.1). Throws WhirlError for invalid inputs or infeasible draws. */
export function buildReceipt(o: BuildReceiptInput): Receipt {
  if (!Array.isArray(o.entries) || o.entries.length === 0) throw new WhirlError('NO_ELIGIBLE_ENTRIES', 'The wheel has no entries.');
  const entries = receiptEntries(o.entries);
  const { seed, seedPhrase } = resolveSeed(o.seed, o.seedPhrase);
  const publicInput = normalisePublicInput(o.publicInput);
  const spinIndex = o.spinIndex ?? 0;
  if (!Number.isInteger(spinIndex) || spinIndex < 0 || spinIndex > 0xffffffff) throw new WhirlError('SPIN_INDEX_INVALID', 'spinIndex must be an integer from 0 to 4294967295.');
  if (!['single', 'multi', 'elimination', 'teams'].includes(o.mode)) throw new WhirlError('MODE_INVALID', `Unknown mode "${String(o.mode)}".`);
  const input: ReceiptParams = { excluded: o.excluded ? [...o.excluded] : [] };
  if (o.count !== undefined) input.count = o.count;
  if (o.mode === 'teams') {
    input.teamCount = o.teamCount ?? null;
    input.teamSize = o.teamSize ?? null;
    if (o.balance !== undefined) input.balance = o.balance;
    input.keepApart = (o.keepApart ?? []).map((s) => [...s]);
    input.keepTogether = (o.keepTogether ?? []).map((s) => [...s]);
    input.previousRounds = (o.previousRounds ?? []).map((r) => r.map((t) => [...t]));
  }
  const { params, result } = computeDraw(entries, seed, publicInput, spinIndex, o.mode, input);
  const wh = hashWheel(entries);
  const reveal = o.reveal ?? true;
  const title = o.title === undefined || o.title === null || o.title.trim() === '' ? null : o.title.normalize('NFC').trim().slice(0, 200);
  if (o.committedWheelHash !== undefined && o.committedWheelHash !== null && !/^[0-9a-f]{64}$/.test(o.committedWheelHash)) throw new WhirlError('WHEEL_HASH_INVALID', 'committedWheelHash must be 64 lowercase hex chars.');
  return {
    $schema: SCHEMA_URLS.receipt,
    format: 'whirlpick-receipt',
    version: 1,
    algorithm: 'whirlpick-draw-v1',
    title,
    entries,
    wheelHash: wh,
    committedWheelHash: o.committedWheelHash ?? null,
    seed: reveal ? seed : null,
    seedPhrase: reveal ? seedPhrase : null,
    commitment: commitmentFor(seed),
    publicInput,
    spinIndex,
    mode: o.mode,
    params,
    result,
    beacon: null,
    createdAt: o.createdAt ?? new Date().toISOString(),
    committedAt: o.committedAt ?? null,
    app: o.app ?? `whirlpick-core/${APP_VERSION}`,
  };
}

/** Fill in the seed of an unrevealed receipt (fair draw "Reveal seed"). Throws if it doesn't match. */
export function revealReceipt(r: Receipt, seedHex: string, seedPhrase: string | null = null): Receipt {
  const seed = normaliseSeed(seedHex);
  if (commitmentFor(seed) !== r.commitment) throw new WhirlError('COMMITMENT_MISMATCH', 'This seed does not match the receipt commitment.');
  if (seedPhrase !== null && seedFromPhrase(seedPhrase) !== seed) throw new WhirlError('SEED_PHRASE_MISMATCH', 'The seed phrase does not match the seed.');
  return { ...r, seed, seedPhrase };
}

/** Winners of a receipt as {index, label} (pick modes). */
export function receiptWinners(r: Receipt): { index: number; label: string }[] {
  return (r.result.picks ?? []).map((p: Pick) => ({ index: p.index, label: p.label }));
}

// ---- hand-written shape check (mirrors RECEIPT_SCHEMA_V1; verify step 4) ----

const RECEIPT_KEYS = new Set(['$schema', 'format', 'version', 'algorithm', 'title', 'entries', 'wheelHash', 'committedWheelHash', 'seed', 'seedPhrase', 'commitment', 'publicInput', 'spinIndex', 'mode', 'params', 'result', 'beacon', 'createdAt', 'committedAt', 'app']);
const REQUIRED = ['format', 'version', 'algorithm', 'entries', 'wheelHash', 'seed', 'commitment', 'spinIndex', 'mode', 'params', 'result', 'beacon'];
const PARAM_KEYS = new Set(['count', 'excluded', 'teamCount', 'teamSize', 'balance', 'keepApart', 'keepTogether', 'previousRounds', 'iterations']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const hex64 = (x: unknown) => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const intList = (x: unknown) => Array.isArray(x) && x.every((v) => isInt(v));

/**
 * First problem with a receipt's shape, as {path, code, message}, or null.
 * `beacon` is not checked here (verify reports it separately as BEACON_UNSUPPORTED).
 */
export function receiptShapeProblem(r: unknown, base = ''): ValidationIssue | null {
  const bad = (path: string, message: string): ValidationIssue => ({ path: base + path, code: 'SCHEMA_INVALID', message });
  if (!isObj(r)) return bad('', 'A receipt must be a JSON object.');
  for (const k of Object.keys(r)) if (!RECEIPT_KEYS.has(k)) return bad(`/${k}`, `Unknown key "${k}".`);
  for (const k of REQUIRED) if (!(k in r)) return bad(`/${k}`, `Missing "${k}".`);
  if (r.$schema !== undefined && typeof r.$schema !== 'string') return bad('/$schema', '$schema must be a string.');
  if (r.format !== 'whirlpick-receipt') return bad('/format', 'format must be "whirlpick-receipt".');
  if (r.version !== 1) return bad('/version', 'version must be 1.');
  if (r.algorithm !== 'whirlpick-draw-v1') return bad('/algorithm', 'algorithm must be "whirlpick-draw-v1".');
  if (r.title !== undefined && r.title !== null && (typeof r.title !== 'string' || codePointLength(r.title) > 200)) return bad('/title', 'title must be a string of at most 200 characters, or null.');
  if (!Array.isArray(r.entries) || r.entries.length < 1 || r.entries.length > 1000) return bad('/entries', 'entries must be a list of 1 to 1000 entries.');
  for (let i = 0; i < r.entries.length; i++) {
    const e: unknown = r.entries[i];
    const p = `/entries/${i}`;
    if (!isObj(e)) return bad(p, 'Each entry must be an object.');
    for (const k of Object.keys(e)) if (!['label', 'weight', 'enabled', 'tags'].includes(k)) return bad(`${p}/${k}`, `Unknown entry key "${k}".`);
    if (typeof e.label !== 'string' || textProblem(e.label, 200) || codePointLength(e.label) > 200) return { path: base + `${p}/label`, code: 'SCHEMA_INVALID', message: `Entry ${i + 1} label is invalid.` };
    if (!isValidWeight(e.weight)) return bad(`${p}/weight`, `Entry ${i + 1} weight is invalid.`);
    if (typeof e.enabled !== 'boolean') return bad(`${p}/enabled`, `Entry ${i + 1} enabled must be true or false.`);
    if (e.tags !== undefined) {
      if (!Array.isArray(e.tags) || e.tags.length > 8) return bad(`${p}/tags`, 'tags must be a list of at most 8 strings.');
      for (let j = 0; j < e.tags.length; j++) {
        const t: unknown = e.tags[j];
        if (typeof t !== 'string' || textProblem(t, 32) || codePointLength(t) > 32) return bad(`${p}/tags/${j}`, 'Invalid tag.');
      }
    }
  }
  if (!hex64(r.wheelHash)) return bad('/wheelHash', 'wheelHash must be 64 lowercase hex chars.');
  if (r.committedWheelHash !== undefined && r.committedWheelHash !== null && !hex64(r.committedWheelHash)) return bad('/committedWheelHash', 'committedWheelHash must be 64 lowercase hex chars or null.');
  if (r.seed !== null && !hex64(r.seed)) return bad('/seed', 'seed must be 64 lowercase hex chars or null.');
  if (r.seedPhrase !== undefined && r.seedPhrase !== null && (typeof r.seedPhrase !== 'string' || r.seedPhrase.length === 0)) return bad('/seedPhrase', 'seedPhrase must be a non-empty string or null.');
  if (!hex64(r.commitment)) return bad('/commitment', 'commitment must be 64 lowercase hex chars.');
  if (r.publicInput !== undefined && r.publicInput !== null && (typeof r.publicInput !== 'string' || codePointLength(r.publicInput) > 64)) return bad('/publicInput', 'publicInput must be a string of at most 64 characters, or null.');
  if (!isInt(r.spinIndex, 0, 0xffffffff)) return bad('/spinIndex', 'spinIndex must be an integer from 0 to 4294967295.');
  if (!['single', 'multi', 'elimination', 'teams'].includes(r.mode as string)) return bad('/mode', 'mode must be single, multi, elimination or teams.');
  if (!isObj(r.params)) return bad('/params', 'params must be an object.');
  const pr = r.params;
  for (const k of Object.keys(pr)) if (!PARAM_KEYS.has(k)) return bad(`/params/${k}`, `Unknown param "${k}".`);
  if (pr.count !== undefined && !(isInt(pr.count, 1) || pr.count === 'all')) return bad('/params/count', 'count must be an integer ≥ 1 or "all".');
  if (pr.excluded !== undefined && !intList(pr.excluded)) return bad('/params/excluded', 'excluded must be a list of indices.');
  if (pr.teamCount !== undefined && pr.teamCount !== null && !isInt(pr.teamCount, 2)) return bad('/params/teamCount', 'teamCount must be an integer ≥ 2 or null.');
  if (pr.teamSize !== undefined && pr.teamSize !== null && !isInt(pr.teamSize, 1)) return bad('/params/teamSize', 'teamSize must be an integer ≥ 1 or null.');
  if (pr.balance !== undefined && typeof pr.balance !== 'boolean') return bad('/params/balance', 'balance must be true or false.');
  for (const k of ['keepApart', 'keepTogether'] as const) {
    const v = pr[k];
    if (v !== undefined && !(Array.isArray(v) && v.every(intList))) return bad(`/params/${k}`, `${k} must be a list of lists of indices.`);
  }
  if (pr.previousRounds !== undefined && !(Array.isArray(pr.previousRounds) && pr.previousRounds.every((round) => Array.isArray(round) && round.every(intList)))) return bad('/params/previousRounds', 'previousRounds must be a list of rounds.');
  if (pr.iterations !== undefined && !isInt(pr.iterations)) return bad('/params/iterations', 'iterations must be an integer ≥ 0.');
  if (!isObj(r.result)) return bad('/result', 'result must be an object.');
  const res = r.result;
  for (const k of Object.keys(res)) if (!['picks', 'teams', 'repeatPairs'].includes(k)) return bad(`/result/${k}`, `Unknown result key "${k}".`);
  if (res.picks !== undefined) {
    if (!Array.isArray(res.picks)) return bad('/result/picks', 'picks must be a list.');
    for (let i = 0; i < res.picks.length; i++) {
      const p: unknown = res.picks[i];
      if (!isObj(p) || Object.keys(p).some((k) => !['index', 'label', 'landingU32'].includes(k)) || !isInt(p.index) || typeof p.label !== 'string' || !isInt(p.landingU32, 0, 0xffffffff)) return bad(`/result/picks/${i}`, 'Each pick is {index, label, landingU32}.');
    }
  }
  if (res.teams !== undefined && !(Array.isArray(res.teams) && res.teams.every(intList))) return bad('/result/teams', 'teams must be a list of lists of indices.');
  if (res.repeatPairs !== undefined && !isInt(res.repeatPairs)) return bad('/result/repeatPairs', 'repeatPairs must be an integer ≥ 0.');
  if (r.mode === 'teams') {
    if (res.teams === undefined) return bad('/result/teams', 'A teams receipt needs result.teams.');
    if (res.repeatPairs === undefined) return bad('/result/repeatPairs', 'A teams receipt needs result.repeatPairs.');
  } else if (res.picks === undefined) return bad('/result/picks', 'A pick receipt needs result.picks.');
  for (const k of ['createdAt', 'committedAt'] as const) {
    const v = r[k];
    if (v !== undefined && v !== null && !(typeof v === 'string' && ISO_RE.test(v))) return bad(`/${k}`, `${k} must be an ISO date-time or null.`);
  }
  if (r.app !== undefined && (typeof r.app !== 'string' || r.app.length > 64)) return bad('/app', 'app must be a short string.');
  return null;
}

export { eligibleEntries };
