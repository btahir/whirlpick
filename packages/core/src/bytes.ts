// Byte helpers: UTF-8, hex, big-endian integers, base64url (RFC 4648 §5, no padding).
// Own base64url so core never needs atob/btoa/Buffer (PLAN §1.1).
import { WhirlError } from './errors.js';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

export function utf8(s: string): Uint8Array {
  return enc.encode(s);
}

export function fromUtf8(b: Uint8Array): string {
  return dec.decode(b);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function u8(x: number): Uint8Array {
  return Uint8Array.of(x & 0xff);
}

export function u32be(x: number): Uint8Array {
  if (!Number.isInteger(x) || x < 0 || x > 0xffffffff) throw new WhirlError('RANGE', `u32 out of range: ${x}`);
  return Uint8Array.of((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
}

const HEX = '0123456789abcdef';

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) {
    const v = b[i]!;
    s += HEX[v >> 4]! + HEX[v & 15]!;
  }
  return s;
}

export function fromHex(h: string): Uint8Array {
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new WhirlError('HEX_INVALID', 'Not a hex string.');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function isHex64(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INV = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64urlEncode(b: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!;
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = b.length - i;
  if (rest === 1) {
    const n = b[i]! << 16;
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]!;
  }
  return s;
}

export function base64urlDecode(s: string): Uint8Array {
  if (s.length % 4 === 1) throw new WhirlError('BASE64_INVALID', 'Not valid base64url.');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64_INV[c]! : -1;
    if (v < 0) throw new WhirlError('BASE64_INVALID', 'Not valid base64url.');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}
