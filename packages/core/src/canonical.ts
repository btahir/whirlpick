// Canonical wheel serialisation and wheelHash (PLAN §2.2).
import { concatBytes, fromHex, toHex, u32be, u8, utf8 } from './bytes.js';
import { H, tag } from './hash.js';
import { milliWeight } from './labels.js';
import type { HashedEntry } from './types.js';

export function wheelBytes(entries: readonly HashedEntry[]): Uint8Array {
  const parts: Uint8Array[] = [tag('whirlpick-wheel-v1'), u32be(entries.length)];
  for (const e of entries) {
    const l = utf8(e.label.normalize('NFC'));
    parts.push(u32be(l.length), l, u32be(milliWeight(e.weight)), u8(e.enabled ? 1 : 0));
    const tags = e.tags ?? [];
    parts.push(u32be(tags.length));
    for (const t of tags) {
      const tb = utf8(t.normalize('NFC'));
      parts.push(u32be(tb.length), tb);
    }
  }
  return concatBytes(...parts);
}

export function wheelHashRaw(entries: readonly HashedEntry[]): Uint8Array {
  return H(wheelBytes(entries));
}

export function wheelHash(entries: readonly HashedEntry[]): string {
  return toHex(wheelHashRaw(entries));
}

export function wheelHashToRaw(hex: string): Uint8Array {
  return fromHex(hex);
}
