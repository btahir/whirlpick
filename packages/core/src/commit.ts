// Seeds, phrase seeds, commitments and the public-input stream key (PLAN §2.3).
import { concatBytes, fromHex, isHex64, toHex, utf8 } from './bytes.js';
import { WhirlError } from './errors.js';
import { H, tag } from './hash.js';
import { defaultRandom } from './ids.js';
import { normalisePublicInput } from './labels.js';

export function generateSeed(random: (b: Uint8Array) => void = defaultRandom): string {
  const b = new Uint8Array(32);
  random(b);
  return toHex(b);
}

/** Accepts exactly 64 hex chars (any case); returns lowercase. */
export function normaliseSeed(s: unknown): string {
  if (typeof s !== 'string' || !/^[0-9a-fA-F]{64}$/.test(s.trim())) throw new WhirlError('SEED_INVALID', 'A seed is exactly 64 hex characters (0-9, a-f).');
  return s.trim().toLowerCase();
}

export function seedFromPhrase(phrase: string): string {
  if (typeof phrase !== 'string' || phrase.length === 0) throw new WhirlError('SEED_INVALID', 'Seed phrase must be a non-empty string.');
  return toHex(H(tag('whirlpick-seed-v1'), utf8(phrase.normalize('NFC'))));
}

export function commitmentFor(seedHex: string): string {
  const s = normaliseSeed(seedHex);
  return toHex(H(tag('whirlpick-commit-v1'), fromHex(s)));
}

/** key = seed, or H(tag("whirlpick-mix-v1") ‖ seed ‖ utf8(publicInput)) when a public input is given. */
export function streamKey(seedHex: string, publicInput?: string | null): Uint8Array {
  const seed = fromHex(normaliseSeed(seedHex));
  const pi = normalisePublicInput(publicInput);
  return pi === null ? seed : H(concatBytes(tag('whirlpick-mix-v1'), seed, utf8(pi)));
}

export { isHex64 };
