// Draw sessions (PLAN §2.9): a committed seed plus the running spin index and eliminated entries.
import { wheelHash } from './canonical.js';
import { commitmentFor, generateSeed, normaliseSeed } from './commit.js';
import { normalisePublicInput } from './labels.js';
import type { DrawSession, HashedEntry } from './types.js';

/** Start a session: fresh (or given) seed, its commitment and the list fingerprint at commit time. */
export function createSession(o: { entries: readonly HashedEntry[]; seed?: string; publicInput?: string | null; now?: string; random?: (b: Uint8Array) => void }): DrawSession {
  const seed = o.seed ? normaliseSeed(o.seed) : generateSeed(o.random);
  return {
    seed,
    commitment: commitmentFor(seed),
    committedWheelHash: wheelHash(o.entries),
    committedAt: o.now ?? new Date().toISOString(),
    publicInput: normalisePublicInput(o.publicInput),
    nextSpinIndex: 0,
    excluded: [],
  };
}

/** The session after a spin: next index, and (elimination) the winners added to `excluded`. */
export function advanceSession(s: DrawSession, winners: readonly number[] = []): DrawSession {
  return { ...s, nextSpinIndex: s.nextSpinIndex + 1, excluded: [...new Set([...s.excluded, ...winners])].sort((a, b) => a - b) };
}
