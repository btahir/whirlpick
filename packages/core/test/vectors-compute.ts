// Computes the PLAN §2.12 test vectors from the implementation. `pnpm gen:vectors` writes them to
// vectors.json once; vectors.test.ts then treats that file as frozen goldens, and
// scripts/ref/draw_v1.py reproduces V0–V2 independently.
import {
  buildReceipt,
  DrawStream,
  finalRotation,
  landingTurn,
  seedFromPhrase,
  slicesFor,
  splitTeams,
  streamKey,
  toHex,
  wheelBytes,
  wheelHash,
  commitmentFor,
  drawPicks,
  eligibleEntries,
  bytesSource,
  randBelowWidth,
} from '../src/index.js';
import { H, tag } from '../src/hash.js';
import { concatBytes, fromHex, u32be } from '../src/bytes.js';

export const INPUTS = {
  V0: {
    seed: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    entries: ['Ada', 'Grace', 'Linus', 'Margaret'].map((label) => ({ label, weight: 1, enabled: true })),
    phrase: 'whirlpick test vector 3',
    rejection: { width: 1, n: 3, bytes: [0xff, 0xfe, 0x05] },
  },
  V1: { publicInput: null, spinIndex: 0, mode: 'single' as const, createdAt: '2026-01-01T00:00:00.000Z', r0: 0, extra: 5, pointerTurn: 0 },
  V2: {
    entries: [
      { label: 'Red', weight: 1, enabled: true },
      { label: 'Green', weight: 2.5, enabled: true },
      { label: 'Blue', weight: 0.125, enabled: true },
      { label: 'Gold', weight: 5, enabled: false },
    ],
    seed: 'ff'.repeat(32),
    publicInput: 'blue sky',
    spinIndex: 3,
    mode: 'multi' as const,
    count: 2,
  },
  V3: {
    entries: Array.from({ length: 10 }, (_, i) => ({ label: `P${String(i + 1).padStart(2, '0')}`, weight: 1, enabled: true, ...(i < 4 ? { tags: ['A'] } : i < 7 ? { tags: ['B'] } : {}) })),
    seedPhrase: 'whirlpick test vector 3',
    publicInput: 'blue',
    spinIndex: 0,
    teamCount: 3,
    balance: true,
    keepApart: [[0, 1]],
    keepTogether: [[4, 5]],
    previousRounds: [[[0, 2, 4, 5], [1, 3, 6], [7, 8, 9]]],
  },
};

export function computeVectors() {
  const { V0, V1, V2, V3 } = INPUTS;
  const wh0 = wheelHash(V0.entries);
  const block0 = toHex(H(concatBytes(tag('whirlpick-draw-v1'), fromHex(V0.seed), fromHex(wh0), u32be(0), u32be(0))));
  const s0 = new DrawStream(V0.seed, wh0, 0, null);
  const randBelow10 = Array.from({ length: 5 }, () => Number(s0.randBelow(10n)));
  const src = bytesSource(V0.rejection.bytes);
  const rej = Number(randBelowWidth(src, BigInt(V0.rejection.n), V0.rejection.width));

  // V1
  const s1 = new DrawStream(V0.seed, wh0, V1.spinIndex, V1.publicInput);
  const r = Number(s1.randBelow(4000n));
  const landingU32 = s1.u32();
  const picks1 = drawPicks({ entries: V0.entries, seed: V0.seed, publicInput: V1.publicInput, spinIndex: V1.spinIndex, count: 1 }).picks;
  const slices1 = slicesFor(V0.entries);
  const pos1 = slices1.findIndex((s) => s.index === picks1[0]!.index);
  const lt = landingTurn(slices1, pos1, picks1[0]!.landingU32);
  const fr = finalRotation(V1.r0, lt, V1.extra, V1.pointerTurn);
  const receipt1 = buildReceipt({ entries: V0.entries, seed: V0.seed, mode: V1.mode, spinIndex: V1.spinIndex, publicInput: V1.publicInput, createdAt: V1.createdAt, app: 'whirlpick-core/0.1.0' });

  // V2
  const wh2 = wheelHash(V2.entries);
  const key2 = toHex(streamKey(V2.seed, V2.publicInput));
  const T2 = eligibleEntries(V2.entries).reduce((a, e) => a + e.milliWeight, 0);
  const picks2 = drawPicks({ entries: V2.entries, seed: V2.seed, publicInput: V2.publicInput, spinIndex: V2.spinIndex, count: V2.count }).picks;

  // V3
  const seed3 = seedFromPhrase(V3.seedPhrase);
  const t3 = splitTeams({ entries: V3.entries, seed: seed3, publicInput: V3.publicInput, spinIndex: V3.spinIndex, teamCount: V3.teamCount, balance: V3.balance, keepApart: V3.keepApart, keepTogether: V3.keepTogether, previousRounds: V3.previousRounds });

  return {
    V0: {
      wheelBytesHex: toHex(wheelBytes(V0.entries)),
      wheelHash: wh0,
      commitment: commitmentFor(V0.seed),
      block0,
      randBelow10,
      seedFromPhrase: seedFromPhrase(V0.phrase),
      rejection: { result: rej, consumed: src.consumed },
    },
    V1: {
      T: 4000,
      r,
      winnerIndex: picks1[0]!.index,
      winnerLabel: picks1[0]!.label,
      landingU32,
      landingTurn: lt.toPrecision(17),
      finalRotation: fr.toPrecision(17),
      receipt: receipt1,
    },
    V2: { wheelHash: wh2, key: key2, T: T2, picks: picks2 },
    V3: { seed: seed3, P: t3.order, teams: t3.teams, repeatPairs: t3.repeatPairs, cost: t3.cost, balance: t3.balance, warnings: t3.warnings.map((w) => w.code) },
  };
}
