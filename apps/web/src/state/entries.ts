// Pure helpers for the entries editor. The textarea holds one label per line; entries keep their
// ids and properties (weight, colour, image, tags, enabled) across edits (PLAN §6.3).
import type { Entry } from "@whirlpick/core";

export const MAX_ENTRIES = 1000;
export const MAX_LABEL = 200;

/** One textarea line per entry: the label, then its tags as " #tag" (SPEC §10 editor syntax). */
export function entryLine(e: Pick<Entry, "label" | "tags">): string {
  return e.tags && e.tags.length ? `${e.label} ${e.tags.map((t) => `#${t}`).join(" ")}` : e.label;
}

export function entriesToText(entries: Entry[]): string {
  return entries.map(entryLine).join("\n");
}

export interface LineItem {
  label: string;
  tags: string[];
}

const TAG_TAIL = /(?:^|\s)#([^\s#]{1,32})\s*$/u;

/** Parse one line: trailing " #tag" tokens become tags (a line that is only "#1" stays a label). */
export function parseLine(raw: string): LineItem | null {
  let s = cleanLabel(raw);
  if (!s) return null;
  const tags: string[] = [];
  for (;;) {
    const m = TAG_TAIL.exec(s);
    if (!m) break;
    const rest = s.slice(0, m.index).trimEnd();
    if (!rest) break;
    tags.unshift(m[1]!.normalize("NFC"));
    s = rest;
  }
  const uniq = [...new Set(tags)].slice(0, 8);
  return { label: s, tags: uniq };
}

/** Lines of the textarea as items: trimmed, blank lines dropped. */
export function textToItems(text: string): LineItem[] {
  const out: LineItem[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const it = parseLine(raw);
    if (it) out.push(it);
  }
  return out;
}

/** Labels only (tags stripped). */
export function textToLabels(text: string): string[] {
  return textToItems(text).map((i) => i.label);
}

/** NFC, trim, strip control characters and lone surrogates, cap at 200 code points. */
export function cleanLabel(raw: string): string {
  let s = raw.normalize("NFC");
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");
  s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  s = s.trim();
  const cps = Array.from(s);
  if (cps.length > MAX_LABEL) s = cps.slice(0, MAX_LABEL).join("").trim();
  return s;
}

const sameTags = (a: string[] | undefined, b: string[]) => (a?.length ?? 0) === b.length && b.every((t, i) => a![i] === t);

/**
 * Map textarea items onto previous entries.
 * 1. Exact line matches keep their entry (first unused match, in order), so inserting or
 *    deleting a line elsewhere never loses a weight, colour or image.
 * 2. Remaining new lines reuse the unmatched previous entry at the same position (a rename while
 *    typing keeps its properties).
 * 3. Anything left becomes a new entry with default properties.
 */
export function mergeItems(items: LineItem[], prev: Entry[], makeId: () => string): Entry[] {
  const used = new Array<boolean>(prev.length).fill(false);
  const queues = new Map<string, number[]>();
  prev.forEach((e, i) => {
    const k = entryLine(e);
    const q = queues.get(k);
    if (q) q.push(i);
    else queues.set(k, [i]);
  });
  const matched = items.map((it) => {
    const q = queues.get(entryLine(it));
    while (q && q.length) {
      const i = q.shift()!;
      if (!used[i]) {
        used[i] = true;
        return i;
      }
    }
    return -1;
  });
  return items.map((it, j) => {
    let i = matched[j]!;
    if (i === -1 && j < prev.length && !used[j]) {
      used[j] = true;
      i = j;
    }
    if (i >= 0) {
      const e = prev[i]!;
      if (e.label === it.label && sameTags(e.tags, it.tags)) return e;
      const next: Entry = { ...e, label: it.label };
      if (it.tags.length) next.tags = it.tags;
      else delete next.tags;
      return next;
    }
    const n: Entry = { id: makeId(), label: it.label, weight: 1, enabled: true };
    if (it.tags.length) n.tags = it.tags;
    return n;
  });
}

/** Labels-only variant (kept for callers that don't use tags). */
export function mergeLabels(labels: string[], prev: Entry[], makeId: () => string): Entry[] {
  return mergeItems(
    labels.map((label) => ({ label, tags: [] })),
    prev.map((e) => ({ ...e, tags: undefined }) as Entry),
    makeId,
  );
}

export function sortEntries(entries: Entry[]): Entry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.label.localeCompare(b.e.label, undefined, { sensitivity: "base" }) || a.i - b.i)
    .map((x) => x.e);
}

export function dedupeEntries(entries: Entry[]): Entry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const k = e.label.normalize("NFC").toLocaleLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Fisher–Yates with an injected uniform integer source (crypto in the app, seeded in tests). */
export function shuffleEntries(entries: Entry[], randomInt: (n: number) => number): Entry[] {
  const a = entries.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function chanceText(entries: Entry[], excluded: number[] = []): Map<string, string> {
  const ex = new Set(excluded);
  const eligible = entries.filter((e, i) => e.enabled && !ex.has(i));
  const total = eligible.reduce((s, e) => s + Math.round(e.weight * 1000), 0);
  const out = new Map<string, string>();
  const allSame = eligible.every((e) => e.weight === eligible[0]?.weight);
  for (const e of eligible) {
    const mw = Math.round(e.weight * 1000);
    out.set(e.id, allSame ? `1 in ${eligible.length}` : `${formatPercent(mw / total)}`);
  }
  return out;
}

export function formatPercent(p: number): string {
  const v = p * 100;
  if (v >= 10) return `${Math.round(v)}%`;
  if (v >= 1) return `${v.toFixed(1).replace(/\.0$/, "")}%`;
  if (v >= 0.01) return `${v.toFixed(2)}%`;
  return "<0.01%";
}

/** Format a weight for display: "×2", "×2.5". */
export function weightBadge(w: number): string {
  return `×${Number.isInteger(w) ? w : Number(w.toFixed(3))}`;
}
