// A7: the stream is contiguous across block boundaries.
import { describe, expect, it } from 'vitest';
import { concatBytes, fromHex, toHex, u32be } from '../src/bytes.js';
import { H, tag } from '../src/hash.js';
import { DrawStream, streamKey, wheelHash } from '../src/index.js';

const seed = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const wh = wheelHash([{ label: 'Ada', weight: 1, enabled: true }]);

describe('stream', () => {
  for (const [spinIndex, pi] of [[0, null], [7, 'blue sky']] as const) {
    it(`3 + 8 + 30 + 4 bytes equal block0 ‖ block1 sliced (spinIndex ${spinIndex}, publicInput ${pi})`, () => {
      const key = streamKey(seed, pi);
      const block = (c: number) => H(concatBytes(tag('whirlpick-draw-v1'), key, fromHex(wh), u32be(spinIndex), u32be(c)));
      const all = concatBytes(block(0), block(1));
      const s = new DrawStream(seed, wh, spinIndex, pi);
      const parts = [3, 8, 30, 4].map((n) => toHex(s.read(n)));
      let o = 0;
      const want = [3, 8, 30, 4].map((n) => toHex(all.slice(o, (o += n))));
      expect(parts).toEqual(want);
      expect(s.bytesConsumed).toBe(45);
    });
  }
  it('u32/u64 read big-endian and count bytes', () => {
    const s = new DrawStream(seed, wh, 0);
    const t = new DrawStream(seed, wh, 0);
    const b = t.read(12);
    expect(s.u32()).toBe(((b[0]! << 24) >>> 0) + (b[1]! << 16) + (b[2]! << 8) + b[3]!);
    expect(s.u64()).toBe(BigInt('0x' + toHex(b.slice(4, 12))));
    expect(s.bytesConsumed).toBe(12);
  });
  it('an empty or whitespace public input is the same as none', () => {
    expect(toHex(streamKey(seed, ''))).toBe(seed);
    expect(toHex(streamKey(seed, '   '))).toBe(seed);
    expect(toHex(streamKey(seed, ' blue '))).toBe(toHex(streamKey(seed, 'blue')));
  });
});
