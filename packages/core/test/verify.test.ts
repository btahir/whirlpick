// E1–E5: genuine receipts pass; each tamper fails with its exact code; unrevealed; expected values; schema.
import { describe, expect, it } from 'vitest';
import { buildReceipt, commitmentFor, seedFromPhrase, verifyReceipt, wheelHash, type HashedEntry, type Mode, type Receipt } from '../src/index.js';
import { FIXED_NOW, fixtureSeed, mulberry32, uniform } from './helpers.js';
import { validateReceiptSchema } from './schema-helpers.js';

function randomReceipt(i: number): Receipt {
  const r = mulberry32(i + 500);
  const M = 3 + Math.floor(r() * 25);
  const entries: HashedEntry[] = Array.from({ length: M }, (_, k) => ({
    label: `Name ${k}`,
    weight: [1, 2, 0.5, 3.125][Math.floor(r() * 4)]!,
    enabled: k < 3 || r() > 0.15,
    ...(r() < 0.3 ? { tags: [`t${Math.floor(r() * 3)}`] } : {}),
  }));
  const modes: Mode[] = ['single', 'multi', 'elimination', 'teams'];
  const mode = modes[i % 4]!;
  const eligible = entries.map((e, k) => (e.enabled ? k : -1)).filter((k) => k >= 0);
  const phrase = i % 5 === 1 ? `phrase ${i}` : null;
  const common = {
    entries,
    ...(phrase ? { seedPhrase: phrase } : { seed: fixtureSeed(i) }),
    publicInput: i % 3 === 0 ? `word ${i}` : null,
    spinIndex: i % 7,
    createdAt: FIXED_NOW,
    title: i % 2 ? 'Friday raffle' : null,
    committedWheelHash: i % 6 === 0 ? wheelHash(entries) : null,
    app: 'whirlpick-test/0.1.0',
  };
  if (mode === 'teams') return buildReceipt({ ...common, mode, teamCount: 2 + Math.floor(r() * Math.max(1, eligible.length / 2 - 1)) });
  if (mode === 'multi') return buildReceipt({ ...common, mode, count: i % 8 === 1 ? 'all' : 1 + Math.floor(r() * eligible.length) });
  if (mode === 'elimination') {
    const excluded = eligible.slice(0, Math.floor(r() * (eligible.length - 1)));
    return buildReceipt({ ...common, mode, excluded });
  }
  return buildReceipt({ ...common, mode });
}

const receipts = Array.from({ length: 500 }, (_, i) => randomReceipt(i));
const pickReceipts = receipts.filter((x) => x.mode !== 'teams');
const lastCode = (x: unknown, expect?: { commitment?: string; wheelHash?: string }) => verifyReceipt(x, expect).checks.at(-1)!.code;

describe('verify', () => {
  it('E1: 500 random receipts across all four modes (phrase seeds, public input, spinIndex > 0) are valid', () => {
    for (const r of receipts) {
      const v = verifyReceipt(r);
      expect(v.status, JSON.stringify(v.checks.at(-1))).toBe('valid');
      expect(v.ok).toBe(true);
    }
    expect(new Set(receipts.map((r) => r.mode)).size).toBe(4);
    expect(receipts.some((r) => r.seedPhrase)).toBe(true);
    expect(receipts.some((r) => r.publicInput)).toBe(true);
  });
  it('E1: also valid as JSON text', () => {
    expect(verifyReceipt(JSON.stringify(receipts[3])).status).toBe('valid');
  });

  const mutations: [string, (r: Receipt) => unknown, string | string[], (r: Receipt) => boolean] [] = [
    ['change a label', (r) => ({ ...r, entries: r.entries.map((e, i) => (i === 0 ? { ...e, label: e.label + '!' } : e)) }), 'WHEEL_HASH_MISMATCH', () => true],
    ['change a weight', (r) => ({ ...r, entries: r.entries.map((e, i) => (i === 0 ? { ...e, weight: e.weight + 1 } : e)) }), 'WHEEL_HASH_MISMATCH', () => true],
    ['toggle enabled', (r) => ({ ...r, entries: r.entries.map((e, i) => (i === r.entries.length - 1 ? { ...e, enabled: !e.enabled } : e)) }), 'WHEEL_HASH_MISMATCH', () => true],
    ['reorder entries', (r) => ({ ...r, entries: [r.entries[1]!, r.entries[0]!, ...r.entries.slice(2)] }), 'WHEEL_HASH_MISMATCH', () => true],
    ['recompute the hash after editing entries', (r) => { const entries = r.entries.map((e, i) => (i === 0 ? { ...e, label: e.label + '!' } : e)); return { ...r, entries, wheelHash: wheelHash(entries), result: r.mode === 'teams' ? r.result : { picks: r.result.picks!.map((p) => (p.index === 0 ? { ...p, label: p.label + '!' } : p)) } }; }, 'RESULT_MISMATCH', () => true],
    ['change the seed', (r) => ({ ...r, seed: 'ab'.repeat(32), seedPhrase: null }), 'COMMITMENT_MISMATCH', () => true],
    ['change the commitment', (r) => ({ ...r, commitment: commitmentFor('cd'.repeat(32)) }), 'COMMITMENT_MISMATCH', () => true],
    ['change a pick index', (r) => ({ ...r, result: { picks: r.result.picks!.map((p, i) => (i === 0 ? { ...p, index: (p.index + 1) % r.entries.length, label: r.entries[(p.index + 1) % r.entries.length]!.label } : p)) } }), 'RESULT_MISMATCH', (r) => r.mode !== 'teams'],
    ['change landingU32', (r) => ({ ...r, result: { picks: r.result.picks!.map((p, i) => (i === 0 ? { ...p, landingU32: (p.landingU32 + 1) % 2 ** 32 } : p)) } }), 'RESULT_MISMATCH', (r) => r.mode !== 'teams'],
    ['change a pick label only', (r) => ({ ...r, result: { picks: r.result.picks!.map((p, i) => (i === 0 ? { ...p, label: p.label + '?' } : p)) } }), 'LABEL_MISMATCH', (r) => r.mode !== 'teams'],
    ['change spinIndex', (r) => ({ ...r, spinIndex: r.spinIndex + 1 }), 'RESULT_MISMATCH', (r) => r.mode !== 'teams' || r.entries.length > 12],
    ['change publicInput', (r) => ({ ...r, publicInput: (r.publicInput ?? '') + 'x' }), 'RESULT_MISMATCH', () => true],
    // Excluding a non-winner can legitimately give the same draw, so the tamper excludes the winner itself.
    ['change excluded', (r) => ({ ...r, params: { ...r.params, excluded: [...new Set([...r.params.excluded!, r.result.picks![0]!.index])].sort((a, b) => a - b) } }), ['RESULT_MISMATCH', 'PARAMS_INVALID'], (r) => r.mode === 'elimination'],
    ['exclude a disabled entry', (r) => ({ ...r, params: { ...r.params, excluded: [...new Set([...r.params.excluded!, r.entries.findIndex((e) => !e.enabled)])].sort((a, b) => a - b) } }), 'PARAMS_INVALID', (r) => r.mode === 'elimination' && r.entries.some((e) => !e.enabled)],
    ['wrong seedPhrase', (r) => ({ ...r, seedPhrase: 'not the phrase' }), 'SEED_PHRASE_MISMATCH', () => true],
    ['version: 2', (r) => ({ ...r, version: 2 }), 'UNSUPPORTED_VERSION', () => true],
    ['unknown algorithm', (r) => ({ ...r, algorithm: 'whirlpick-draw-v9' }), 'UNKNOWN_ALGORITHM', () => true],
    ['extra top-level key', (r) => ({ ...r, winner: 'me' }), 'SCHEMA_INVALID', () => true],
    ['beacon not null', (r) => ({ ...r, beacon: { round: 1 } }), 'BEACON_UNSUPPORTED', () => true],
    ['invalid JSON', (r) => JSON.stringify(r).slice(0, -3), 'BAD_JSON', () => true],
  ];
  for (const [name, mutate, codes, applies] of mutations) {
    it(`E2: ${name} → ${String(codes)} (20 receipts)`, () => {
      const pool = receipts.filter(applies).slice(0, 20);
      expect(pool).toHaveLength(20);
      for (const r of pool) {
        const got = lastCode(mutate(structuredClone(r)));
        if (Array.isArray(codes)) expect(codes).toContain(got);
        else expect(got).toBe(codes);
      }
    });
  }
  it('E2: teams — moving a member between teams → RESULT_MISMATCH', () => {
    for (const r of receipts.filter((x) => x.mode === 'teams').slice(0, 20)) {
      const t = structuredClone(r);
      const m = t.result.teams![0]!.pop()!;
      t.result.teams![1]!.push(m);
      expect(lastCode(t)).toBe('RESULT_MISMATCH');
    }
  });
  it('E3: seed null → unrevealed, ok false, commitment reported', () => {
    const r = buildReceipt({ entries: uniform(5), seed: fixtureSeed(1), mode: 'single', reveal: false, createdAt: FIXED_NOW });
    expect(r.seed).toBeNull();
    const v = verifyReceipt(r);
    expect(v.status).toBe('unrevealed');
    expect(v.ok).toBe(false);
    expect(v.recomputed.commitment).toBe(commitmentFor(fixtureSeed(1)));
    expect(v.checks.at(-1)!.detail).toContain(r.commitment);
  });
  it('E4: expected commitment / wheel hash mismatches; changed list after commit is valid with a warning', () => {
    const r = pickReceipts[0]!;
    expect(lastCode(r, { commitment: 'ee'.repeat(32) })).toBe('EXPECTED_COMMITMENT_MISMATCH');
    expect(lastCode(r, { wheelHash: 'ee'.repeat(32) })).toBe('EXPECTED_WHEEL_MISMATCH');
    expect(verifyReceipt(r, { commitment: r.commitment.toUpperCase(), wheelHash: r.wheelHash }).status).toBe('valid');
    const changed = buildReceipt({ entries: uniform(4), seed: fixtureSeed(2), mode: 'single', committedWheelHash: wheelHash(uniform(5)), createdAt: FIXED_NOW });
    const v = verifyReceipt(changed);
    expect(v.status).toBe('valid');
    expect(v.warnings).toEqual(['WHEEL_CHANGED_AFTER_COMMIT']);
  });
  it('E5: every receipt validates against RECEIPT_SCHEMA_V1 with ajv', () => {
    for (const r of receipts) expect(validateReceiptSchema(r), JSON.stringify(validateReceiptSchema.errors)).toBe(true);
    const unrevealed = buildReceipt({ entries: uniform(3), seed: fixtureSeed(3), mode: 'multi', count: 2, reveal: false, createdAt: FIXED_NOW });
    expect(validateReceiptSchema(unrevealed)).toBe(true);
    expect(validateReceiptSchema({ ...receipts[0], extra: 1 })).toBe(false);
    expect(validateReceiptSchema({ ...receipts[0], beacon: {} })).toBe(false);
  });
  it('seed phrase receipts record the phrase and the derived seed', () => {
    const r = receipts.find((x) => x.seedPhrase)!;
    expect(r.seed).toBe(seedFromPhrase(r.seedPhrase!));
  });
});
