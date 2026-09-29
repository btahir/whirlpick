// Verifier-owned adversarial checks (pass 1, 2026-09-29). Independent of the builder's tests:
// the V0–V2 constants below were re-derived by the verifier with Python hashlib straight from
// PLAN §2 (not from the code or scripts/ref), then pinned here.
import { describe, expect, it } from 'vitest';
import {
  buildReceipt,
  commitmentFor,
  detectFormat,
  parseEntriesText,
  seedFromPhrase,
  splitTeams,
  streamKey,
  toHex,
  verifyReceipt,
  wheelBytes,
  wheelHash,
  type HashedEntry,
  type Receipt,
} from '../../src/index.js';
import { validateReceiptSchema } from '../schema-helpers.js';

const SEED = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const V0 = ['Ada', 'Grace', 'Linus', 'Margaret'].map((label) => ({ label, weight: 1, enabled: true }));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const firstFail = (r: unknown) => {
  const rep = verifyReceipt(r);
  return rep.status === 'valid' ? 'valid' : (rep.checks.find((c) => !c.ok)?.code ?? rep.status);
};

describe('verifier: independent vectors (Python hashlib from PLAN §2)', () => {
  it('V0 primitives', () => {
    expect(toHex(wheelBytes(V0))).toBe(
      '776869726c7069636b2d776865656c2d7631000000000400000003416461000003e80100000000000000054772616365000003e80100000000000000054c696e7573000003e80100000000000000084d61726761726574000003e80100000000',
    );
    expect(wheelHash(V0)).toBe('69c4db3393cc11b5f2f1a72c67c6f155db3b1846f6bd93da6e926518796187d8');
    expect(commitmentFor(SEED)).toBe('88ff9961dafa1ae61bf52ae6723b58f3a8103ff9606a91dc279345f440afd3be');
    expect(seedFromPhrase('whirlpick test vector 3')).toBe('b94337bf0d42ea4696a61dee04283ffe351723096210386da3bd9bcd691b9f95');
  });
  it('V1 and V2 picks', () => {
    const v1 = buildReceipt({ entries: V0, seed: SEED, mode: 'single' });
    expect(v1.result.picks).toEqual([{ index: 2, label: 'Linus', landingU32: 2718968775 }]);
    const e2: HashedEntry[] = [
      { label: 'Red', weight: 1, enabled: true },
      { label: 'Green', weight: 2.5, enabled: true },
      { label: 'Blue', weight: 0.125, enabled: true },
      { label: 'Gold', weight: 5, enabled: false },
    ];
    expect(toHex(streamKey('ff'.repeat(32), 'blue sky'))).toBe('ca0d7b4647c1e9df7a0103dd26a0fb7514f3dd04e0dbfda37024e20456073ec9');
    const v2 = buildReceipt({ entries: e2, seed: 'ff'.repeat(32), publicInput: 'blue sky', spinIndex: 3, mode: 'multi', count: 2 });
    expect(v2.wheelHash).toBe('647111710bfd5bcd4ccfbb8d3342734053bc674c9d90aa52fd9cc88667ffea19');
    expect(v2.result.picks).toEqual([
      { index: 1, label: 'Green', landingU32: 2477427142 },
      { index: 0, label: 'Red', landingU32: 1178721862 },
    ]);
  });
  it('V3 shuffle order P (Python) is consistent with the teams result', () => {
    const entries: HashedEntry[] = Array.from({ length: 10 }, (_, i) => ({ label: `P${String(i + 1).padStart(2, '0')}`, weight: 1, enabled: true, ...(i < 4 ? { tags: ['A'] } : i < 7 ? { tags: ['B'] } : {}) }));
    const r = splitTeams({ entries, seed: seedFromPhrase('whirlpick test vector 3'), publicInput: 'blue', spinIndex: 0, teamCount: 3, balance: true, keepApart: [[0, 1]], keepTogether: [[4, 5]], previousRounds: [[[0, 2, 4, 5], [1, 3, 6], [7, 8, 9]]] });
    expect(r.teams).toEqual([[1, 4, 5, 9], [2, 6, 8], [0, 3, 7]]);
  });
});

describe('verifier: receipts carry no unverified result claims', () => {
  const single = buildReceipt({ entries: V0, seed: SEED, mode: 'single' });
  const teamsEntries = Array.from({ length: 10 }, (_, i) => ({ label: `P${i}`, weight: 1, enabled: true }));
  const teams = buildReceipt({ entries: teamsEntries, seed: SEED, mode: 'teams', teamCount: 3 });
  it('a pick receipt with an extra result.teams is SCHEMA_INVALID (verify and JSON Schema)', () => {
    const r = clone(single) as Receipt;
    r.result.teams = [[0, 1], [2, 3]];
    r.result.repeatPairs = 0;
    expect(firstFail(r)).toBe('SCHEMA_INVALID');
    expect(validateReceiptSchema(r)).toBe(false);
  });
  it('a teams receipt with an extra result.picks is SCHEMA_INVALID (verify and JSON Schema)', () => {
    const r = clone(teams) as Receipt;
    r.result.picks = [{ index: 0, label: 'P0', landingU32: 0 }];
    expect(firstFail(r)).toBe('SCHEMA_INVALID');
    expect(validateReceiptSchema(r)).toBe(false);
  });
  it('genuine receipts still validate', () => {
    expect(firstFail(single)).toBe('valid');
    expect(firstFail(teams)).toBe('valid');
    expect(validateReceiptSchema(single)).toBe(true);
    expect(validateReceiptSchema(teams)).toBe(true);
  });
});

describe('verifier: tamper sweep over informational and draw fields', () => {
  const r0 = buildReceipt({ entries: V0, seed: SEED, mode: 'multi', count: 2, publicInput: 'blue', spinIndex: 1 });
  const cases: [string, (r: Record<string, any>) => void, string][] = [
    ['title', (r) => (r.title = 'Other'), 'valid'],
    ['app', (r) => (r.app = 'x/1'), 'valid'],
    ['createdAt garbage', (r) => (r.createdAt = 'yesterday'), 'SCHEMA_INVALID'],
    ['seed uppercase', (r) => (r.seed = r.seed.toUpperCase()), 'SCHEMA_INVALID'],
    ['publicInput not trimmed', (r) => (r.publicInput = ' blue'), 'PARAMS_INVALID'],
    ['publicInput empty', (r) => (r.publicInput = ''), 'PARAMS_INVALID'],
    ['weight as string', (r) => (r.entries[0].weight = '1'), 'SCHEMA_INVALID'],
    ['weight 0.0015', (r) => (r.entries[0].weight = 0.0015), 'SCHEMA_INVALID'],
    ['landingU32 as string', (r) => (r.result.picks[0].landingU32 = String(r.result.picks[0].landingU32)), 'SCHEMA_INVALID'],
    ['extra pick', (r) => r.result.picks.push({ index: 3, label: 'Margaret', landingU32: 1 }), 'RESULT_MISMATCH'],
    ['picks reversed', (r) => r.result.picks.reverse(), 'RESULT_MISMATCH'],
    ['count all', (r) => (r.params.count = 'all'), 'RESULT_MISMATCH'],
    ['spinIndex 2^32', (r) => (r.spinIndex = 2 ** 32), 'SCHEMA_INVALID'],
    ['beacon missing', (r) => delete r.beacon, 'SCHEMA_INVALID'],
    ['__proto__ key', (r) => Object.defineProperty(r, '__proto__', { value: {}, enumerable: true }), 'SCHEMA_INVALID'],
  ];
  for (const [name, fn, code] of cases) {
    it(`${name} → ${code}`, () => {
      const r = clone(r0) as unknown as Record<string, any>;
      fn(r);
      expect(firstFail(JSON.parse(JSON.stringify(r)))).toBe(code);
    });
  }
});

describe('verifier: text parsing quirks', () => {
  it('"Last, First" name lists (no header, non-numeric second column) are detected as plain text', () => {
    const text = 'Lovelace, Ada\nHopper, Grace\nTorvalds, Linus\n';
    expect(detectFormat(text)).toBe('txt');
    expect(parseEntriesText(text).entries.map((e) => e.label)).toEqual(['Lovelace, Ada', 'Hopper, Grace', 'Torvalds, Linus']);
  });
  it('header-less CSV with weights, or with empty weight and tags, is still CSV', () => {
    expect(detectFormat('Ada,2\nGrace,1\n')).toBe('csv');
    expect(detectFormat('Ada,,A\nGrace,,B\n')).toBe('csv');
    expect(detectFormat('Ada,x\nGrace,2\n')).toBe('csv');
  });
  it('BOM + CRLF + quoted commas and doubled quotes', () => {
    const r = parseEntriesText('﻿name,weight\r\n"Smith, John",2\r\n"O""Brien",1\r\n', 'csv');
    expect(r.entries.map((e) => [e.label, e.weight])).toEqual([
      ['Smith, John', 2],
      ['O"Brien', 1],
    ]);
  });
  it('NFD and NFC labels hash the same', () => {
    const a = [{ label: 'Renée', weight: 1, enabled: true }];
    const b = [{ label: 'Renée', weight: 1, enabled: true }];
    expect(wheelHash(a)).toBe(wheelHash(b));
  });
});
