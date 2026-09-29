// Input normalisation for labels, tags and weights (PLAN §2.1).
import { WhirlError } from './errors.js';
import type { Entry, EntryIn, Warning } from './types.js';
import { newId } from './ids.js';

export const MAX_LABEL = 200;
export const MAX_TAG = 32;
export const MAX_TAGS = 8;
export const MAX_ENTRIES = 1000;
export const MAX_WHEELS = 100;
export const MIN_WEIGHT = 0.001;
export const MAX_WEIGHT = 1_000_000;
export const MAX_PUBLIC_INPUT = 64;

// C0/C1 controls and lone surrogates (they would collapse to U+FFFD in UTF-8).
// oxlint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Why a string fails the §2.1 character rules, or null. Checks the raw string (before NFC/trim). */
export function textProblem(s: string, max: number): string | null {
  if (LONE_SURROGATE.test(s)) return 'contains a lone surrogate';
  if (CONTROL.test(s)) return 'contains a control character';
  const t = s.normalize('NFC').trim();
  const n = codePointLength(t);
  if (n < 1) return 'is empty';
  if (n > max) return `is longer than ${max} characters`;
  return null;
}

export function normaliseLabel(s: unknown, where = 'Label'): string {
  if (typeof s !== 'string') throw new WhirlError('LABEL_INVALID', `${where} must be a string.`);
  const p = textProblem(s, MAX_LABEL);
  if (p) throw new WhirlError('LABEL_INVALID', `${where} ${p}.`, { label: s });
  return s.normalize('NFC').trim();
}

export function normaliseTags(tags: unknown, where = 'Tags'): string[] {
  if (tags === undefined || tags === null) return [];
  if (!Array.isArray(tags)) throw new WhirlError('TAG_INVALID', `${where} must be a list of strings.`);
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== 'string') throw new WhirlError('TAG_INVALID', `${where}: every tag must be a string.`);
    const p = textProblem(t, MAX_TAG);
    if (p) throw new WhirlError('TAG_INVALID', `${where}: tag "${t}" ${p}.`, { tag: t });
    const n = t.normalize('NFC').trim();
    if (!out.includes(n)) out.push(n);
  }
  if (out.length > MAX_TAGS) throw new WhirlError('TAG_INVALID', `${where}: at most ${MAX_TAGS} tags per entry.`);
  return out;
}

/** Integer milli-weight of a weight, or throws WEIGHT_INVALID (§2.1). */
export function milliWeight(w: number): number {
  if (typeof w !== 'number' || !Number.isFinite(w) || w < MIN_WEIGHT || w > MAX_WEIGHT) {
    throw new WhirlError('WEIGHT_INVALID', `Weight must be a number from ${MIN_WEIGHT} to ${MAX_WEIGHT.toLocaleString('en-US')}.`, { weight: w });
  }
  const m = Math.round(w * 1000);
  if (!(Math.abs(w * 1000 - m) < 1e-6) || m < 1 || m > 1_000_000_000) {
    throw new WhirlError('WEIGHT_INVALID', 'Weight can have at most 3 decimal places.', { weight: w });
  }
  return m;
}

export function isValidWeight(w: unknown): w is number {
  try {
    milliWeight(w as number);
    return true;
  } catch {
    return false;
  }
}

/** Public input ("room word"): NFC, trimmed, ≤ 64 code points; empty → null (§2.3). */
export function normalisePublicInput(s: unknown): string | null {
  if (s === undefined || s === null) return null;
  if (typeof s !== 'string') throw new WhirlError('PUBLIC_INPUT_INVALID', 'Public input must be a string.');
  if (LONE_SURROGATE.test(s) || CONTROL.test(s)) throw new WhirlError('PUBLIC_INPUT_INVALID', 'Public input contains a control character or lone surrogate.');
  const t = s.normalize('NFC').trim();
  if (t === '') return null;
  if (codePointLength(t) > MAX_PUBLIC_INPUT) throw new WhirlError('PUBLIC_INPUT_INVALID', `Public input is longer than ${MAX_PUBLIC_INPUT} characters.`);
  return t;
}

export const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
export const IMAGE_REF_RE = /^img_[0-9a-f]{16}$/;
export const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export interface NormaliseOptions {
  /** Random source for generated ids (default crypto.getRandomValues). */
  random?: (b: Uint8Array) => void;
}

/** Normalise entries from any source (§2.1). Throws WhirlError on the first invalid entry. */
export function normaliseEntries(input: EntryIn[], opts: NormaliseOptions = {}): { entries: Entry[]; warnings: Warning[] } {
  if (!Array.isArray(input)) throw new WhirlError('ENTRIES_INVALID', 'Entries must be a list.');
  if (input.length > MAX_ENTRIES) throw new WhirlError('ENTRY_LIMIT', `A wheel can have at most ${MAX_ENTRIES} entries (got ${input.length}).`, { count: input.length, max: MAX_ENTRIES });
  const warnings: Warning[] = [];
  const entries: Entry[] = [];
  const seen = new Set<string>();
  input.forEach((raw, i) => {
    const where = `Entry ${i + 1}`;
    const obj = typeof raw === 'string' ? { label: raw } : raw;
    if (!obj || typeof obj !== 'object') throw new WhirlError('ENTRIES_INVALID', `${where} must be a string or an object with a label.`, { index: i });
    const label = normaliseLabel(obj.label, `${where} label`);
    let weight = 1;
    if (obj.weight !== undefined) {
      try {
        milliWeight(obj.weight);
      } catch (e) {
        throw new WhirlError('WEIGHT_INVALID', `${where} (${label}): ${(e as Error).message}`, { index: i, weight: obj.weight });
      }
      weight = obj.weight;
    }
    if (obj.enabled !== undefined && typeof obj.enabled !== 'boolean') throw new WhirlError('ENTRIES_INVALID', `${where}: enabled must be true or false.`, { index: i });
    const tags = normaliseTags(obj.tags, `${where}`);
    let id = typeof obj.id === 'string' && ID_RE.test(obj.id) && !seen.has(obj.id) ? obj.id : newId('e', opts.random);
    while (seen.has(id)) id = newId('e', opts.random);
    seen.add(id);
    const e: Entry = { id, label, weight, enabled: obj.enabled ?? true };
    if (obj.color !== undefined) {
      if (typeof obj.color !== 'string' || !COLOR_RE.test(obj.color)) throw new WhirlError('COLOR_INVALID', `${where}: colour must be #RRGGBB.`, { index: i });
      e.color = obj.color;
    }
    if (obj.imageRef !== undefined) {
      if (typeof obj.imageRef !== 'string' || !IMAGE_REF_RE.test(obj.imageRef)) throw new WhirlError('IMAGE_REF_INVALID', `${where}: bad image reference.`, { index: i });
      e.imageRef = obj.imageRef;
    }
    if (tags.length) e.tags = tags;
    entries.push(e);
  });
  return { entries, warnings };
}
