// A6: no modulo bias; rejection path.
import { describe, expect, it } from 'vitest';
import { bytesSource, DrawStream, randBelowWidth } from '../src/index.js';

describe('randbelow', () => {
  it('1-byte chunks, every n in 2…255 over all 256 byte values: floor(256/n) accepted per residue; rejected values consume the next chunk', () => {
    for (let n = 2; n <= 255; n++) {
      const counts = Array.from({ length: n }, () => 0);
      const limit = 256 - (256 % n);
      for (let v = 0; v < 256; v++) {
        // v first; if rejected, the next chunk (0) is used.
        const src = bytesSource([v, 0]);
        const r = Number(randBelowWidth(src, BigInt(n), 1));
        if (v < limit) {
          expect(src.consumed).toBe(1);
          expect(r).toBe(v % n);
          counts[r]!++;
        } else {
          expect(src.consumed).toBe(2);
          expect(r).toBe(0);
        }
      }
      for (const c of counts) expect(c).toBe(Math.floor(256 / n));
    }
  });
  it('8-byte production path: n = 3·2^62, FF×8 ‖ 00×7 01 → 1 after 16 bytes', () => {
    const s = DrawStream.fromSource(bytesSource([...Array.from({ length: 8 }, () => 0xff), ...Array.from({ length: 7 }, () => 0), 1]));
    expect(s.randBelow(3n * 2n ** 62n)).toBe(1n);
    expect(s.bytesConsumed).toBe(16);
  });
  it('n = 1 consumes nothing; n = 2^64 never rejects', () => {
    const s = DrawStream.fromSource(bytesSource([]));
    expect(s.randBelow(1n)).toBe(0n);
    expect(s.bytesConsumed).toBe(0);
    const t = DrawStream.fromSource(bytesSource(Array.from({ length: 8 }, () => 0xff)));
    expect(t.randBelow(2n ** 64n)).toBe(2n ** 64n - 1n);
    expect(t.bytesConsumed).toBe(8);
  });
  it('rejects n out of range', () => {
    const s = DrawStream.fromSource(bytesSource([]));
    expect(() => s.randBelow(0n)).toThrow();
    expect(() => s.randBelow(2n ** 64n + 1n)).toThrow();
  });
});
