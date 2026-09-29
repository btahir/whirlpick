// The whirlpick-draw-v1 byte stream and unbiased integer sampling (PLAN §2.4).
import { concatBytes, fromHex, isHex64, u32be } from './bytes.js';
import { WhirlError } from './errors.js';
import { H, tag } from './hash.js';
import { streamKey } from './commit.js';

const TWO64 = 1n << 64n;
const DRAW_TAG = tag('whirlpick-draw-v1');

/** Anything that hands out bytes strictly in order. */
export interface ByteSource {
  read(n: number): Uint8Array;
}

/** A fixed byte array as a source (tests). Throws when exhausted. */
export function bytesSource(bytes: ArrayLike<number>): ByteSource & { readonly consumed: number } {
  const b = Uint8Array.from(bytes);
  let o = 0;
  return {
    get consumed() {
      return o;
    },
    read(n: number) {
      if (o + n > b.length) throw new WhirlError('SOURCE_EXHAUSTED', 'Test byte source exhausted.');
      const out = b.slice(o, o + n);
      o += n;
      return out;
    },
  };
}

function readUint(source: ByteSource, width: number): bigint {
  const b = source.read(width);
  let x = 0n;
  for (let i = 0; i < width; i++) x = (x << 8n) | BigInt(b[i]!);
  return x;
}

/**
 * Uniform integer in [0, n) from `width`-byte big-endian chunks, by rejection:
 * n = 1 consumes nothing; otherwise limit = R − (R mod n) with R = 2^(8·width); reject x ≥ limit.
 */
export function randBelowWidth(source: ByteSource, n: bigint, width: number): bigint {
  const range = 1n << BigInt(8 * width);
  if (typeof n !== 'bigint' || n < 1n || n > range) throw new WhirlError('RANGE', `randBelow: n must be 1…2^${8 * width}.`);
  if (n === 1n) return 0n;
  const limit = range - (range % n);
  for (;;) {
    const x = readUint(source, width);
    if (x < limit) return x % n;
  }
}

/** SHA-256 counter-mode stream: block(c) = H(tag ‖ key ‖ wheelHashRaw ‖ u32be(spinIndex) ‖ u32be(c)). */
export class DrawStream implements ByteSource {
  private source!: (n: number) => Uint8Array;
  private consumed = 0;

  constructor(seedHex: string, wheelHashHex: string, spinIndex: number, publicInput?: string | null) {
    if (!isHex64(wheelHashHex)) throw new WhirlError('WHEEL_HASH_INVALID', 'wheelHash must be 64 lowercase hex chars.');
    if (!Number.isInteger(spinIndex) || spinIndex < 0 || spinIndex > 0xffffffff) throw new WhirlError('SPIN_INDEX_INVALID', 'spinIndex must be an integer from 0 to 4294967295.');
    const prefix = concatBytes(DRAW_TAG, streamKey(seedHex, publicInput), fromHex(wheelHashHex), u32be(spinIndex));
    let counter = 0;
    let buf: Uint8Array = new Uint8Array(0);
    let off = 0;
    this.source = (n: number) => {
      const out = new Uint8Array(n);
      let o = 0;
      while (o < n) {
        if (off >= buf.length) {
          if (counter > 0xffffffff) throw new WhirlError('STREAM_EXHAUSTED', 'Draw stream counter overflow.');
          buf = H(prefix, u32be(counter));
          counter++;
          off = 0;
        }
        const take = Math.min(n - o, buf.length - off);
        out.set(buf.subarray(off, off + take), o);
        o += take;
        off += take;
      }
      return out;
    };
  }

  /** A stream over injected bytes (tests of the production 8-byte path). */
  static fromSource(source: ByteSource): DrawStream {
    const s = Object.create(DrawStream.prototype) as DrawStream;
    s.consumed = 0;
    s.source = (n) => source.read(n);
    return s;
  }

  get bytesConsumed(): number {
    return this.consumed;
  }

  read(n: number): Uint8Array {
    const b = this.source(n);
    this.consumed += n;
    return b;
  }

  u32(): number {
    return Number(readUint(this, 4));
  }

  u64(): bigint {
    return readUint(this, 8);
  }

  randBelow(n: bigint): bigint {
    if (n > TWO64) throw new WhirlError('RANGE', 'randBelow: n must be ≤ 2^64.');
    return randBelowWidth(this, n, 8);
  }
}
