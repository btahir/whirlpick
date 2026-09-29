// SHA-256 (sync, @noble/hashes) and the domain-separation tag of PLAN §2: tag(s) = utf8(s) ‖ 0x00.
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8 } from './bytes.js';

export function H(...parts: Uint8Array[]): Uint8Array {
  return sha256(parts.length === 1 ? parts[0]! : concatBytes(...parts));
}

export function tag(s: string): Uint8Array {
  return concatBytes(utf8(s), Uint8Array.of(0));
}
