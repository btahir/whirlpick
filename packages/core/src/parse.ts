// Text inputs (PLAN §4.2): plain lists, CSV/TSV/semicolon with RFC 4180 quoting, spreadsheet paste,
// plus the editor's pure list tools (shuffle, sort, de-duplicate).
import { WhirlError } from './errors.js';
import { defaultRandom, newId } from './ids.js';
import { COLOR_RE, isValidWeight, MAX_ENTRIES, normaliseLabel, normaliseTags } from './labels.js';
import type { Entry, Warning } from './types.js';

export type TextFormat = 'txt' | 'csv' | 'tsv';
type Delim = ',' | '\t' | ';';

export interface ParseOptions {
  random?: (b: Uint8Array) => void;
  /** Throw ENTRY_LIMIT instead of keeping the first 1000 entries with a warning (CLI). */
  strict?: boolean;
}

/** Split CSV text into records of cells (RFC 4180). Returns each record's 1-based start line. */
export function parseCsvRecords(text: string, delim: string): { cells: string[]; line: number }[] {
  const out: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;
  let line = 1;
  let recLine = 1;
  const endCell = () => {
    cells.push(cell);
    cell = '';
    atCellStart = true;
  };
  const endRecord = () => {
    endCell();
    out.push({ cells, line: recLine });
    cells = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
    } else if (ch === delim) endCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recLine = line;
    } else {
      cell += ch;
      atCellStart = false;
    }
  }
  if (cell !== '' || cells.length > 0 || !atCellStart) endRecord();
  return out;
}

function unquotedCount(line: string, d: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

/** Pick the delimiter whose count is most consistent over the first 5 non-blank lines (tab wins ties, then comma). */
export function detectDelimiter(text: string): Delim | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 5);
  let best: Delim | null = null;
  let bestScore = 0;
  for (const d of ['\t', ',', ';'] as const) {
    const counts = lines.map((l) => unquotedCount(l, d));
    const freq = new Map<number, number>();
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1);
    const score = Math.max(0, ...freq.values());
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/** CLI/paste auto-detect: CSV/TSV if ≥ 80 % of the first 20 non-blank lines contain the detected delimiter. */
export function detectFormat(text: string): TextFormat {
  const t = text.replace(/^﻿/, '');
  const d = detectDelimiter(t);
  if (!d) return 'txt';
  const lines = t.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
  const withD = lines.filter((l) => unquotedCount(l, d) > 0).length;
  if (lines.length === 0 || withD / lines.length < 0.8) return 'txt';
  if (d === ',' && looksLikeCommaNames(t)) return 'txt';
  return d === '\t' ? 'tsv' : 'csv';
}

/**
 * "Lovelace, Ada" style lists: no header, and every record has exactly two cells whose second cell is
 * non-empty and not a weight. Read as CSV they would silently lose everything after the comma.
 */
function looksLikeCommaNames(text: string): boolean {
  const records = parseCsvRecords(text, ',').filter((r) => r.cells.some((c) => c.trim() !== '')).slice(0, 20);
  if (records.length === 0 || HEADER_FIRST.test(records[0]!.cells[0]!.trim())) return false;
  return records.every((r) => r.cells.length === 2 && r.cells[1]!.trim() !== '' && parseWeight(r.cells[1]!, false) === null);
}

function parseWeight(s: string, allowComma: boolean): number | null {
  let t = s.trim();
  if (allowComma && /^\d*,\d+$/.test(t)) t = t.replace(',', '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const w = Number(t);
  return isValidWeight(w) ? w : null;
}

function parseBool(s: string): boolean | null {
  const t = s.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'on'].includes(t)) return true;
  if (['false', 'no', 'n', '0', 'off'].includes(t)) return false;
  return null;
}

const HEADER_FIRST = /^(name|label|entry|names)$/i;

export function parseEntriesText(text: string, format?: TextFormat, opts: ParseOptions = {}): { entries: Entry[]; warnings: Warning[] } {
  const random = opts.random ?? defaultRandom;
  const src = text.replace(/^﻿/, '');
  const fmt = format ?? detectFormat(src);
  const warnings: Warning[] = [];
  const entries: Entry[] = [];
  let total = 0;
  const push = (e: Omit<Entry, 'id'>) => {
    total++;
    if (entries.length < MAX_ENTRIES) entries.push({ id: newId('e', random), ...e });
  };
  const tryLabel = (raw: string, line: number): string | null => {
    if (raw.trim() === '') return null;
    try {
      return normaliseLabel(raw, `Line ${line} label`);
    } catch (e) {
      warnings.push({ line, code: 'LABEL_INVALID', message: `Line ${line} skipped: ${(e as Error).message}` });
      return null;
    }
  };

  if (fmt === 'txt') {
    src.split(/\r\n|\n|\r/).forEach((l, i) => {
      const label = tryLabel(l, i + 1);
      if (label !== null) push({ label, weight: 1, enabled: true });
    });
  } else {
    const delim: Delim = fmt === 'tsv' ? '\t' : (detectDelimiter(src) ?? ',');
    const allowComma = delim !== ',';
    const records = parseCsvRecords(src, delim).filter((r) => r.cells.some((c) => c.trim() !== ''));
    let cols: { label: number; weight: number; tags: number; color: number; enabled: number } = { label: 0, weight: 1, tags: 2, color: -1, enabled: -1 };
    let header = false;
    if (records[0] && HEADER_FIRST.test(records[0].cells[0]!.trim())) {
      header = true;
      const names = records[0].cells.map((c) => c.trim().toLowerCase());
      const find = (...ks: string[]) => names.findIndex((n) => ks.includes(n));
      cols = { label: Math.max(0, find('name', 'label', 'entry', 'names')), weight: find('weight'), tags: find('tags', 'tag'), color: find('color', 'colour'), enabled: find('enabled') };
    }
    for (const { cells, line } of header ? records.slice(1) : records) {
      const label = tryLabel(cells[cols.label] ?? '', line);
      if (label === null) continue;
      let weight = 1;
      const wCell = cols.weight >= 0 ? (cells[cols.weight] ?? '') : '';
      if (wCell.trim() !== '') {
        const w = parseWeight(wCell, allowComma);
        if (w === null) {
          // Without a header, a non-numeric second column is not a weight column: ignore quietly.
          if (header || /[\d.,]/.test(wCell)) warnings.push({ line, code: 'WEIGHT_IGNORED', message: `Line ${line}: weight "${wCell.trim()}" isn't a valid weight (0.001–1,000,000); used 1.` });
        } else weight = w;
      }
      const e: Omit<Entry, 'id'> = { label, weight, enabled: true };
      const tCell = cols.tags >= 0 ? (cells[cols.tags] ?? '') : '';
      if (tCell.trim() !== '') {
        try {
          const tags = normaliseTags(tCell.split('|').filter((t) => t.trim() !== ''), `Line ${line}`);
          if (tags.length) e.tags = tags;
        } catch (err) {
          warnings.push({ line, code: 'TAGS_IGNORED', message: `Line ${line}: ${(err as Error).message} Tags ignored.` });
        }
      }
      const cCell = cols.color >= 0 ? (cells[cols.color] ?? '').trim() : '';
      if (cCell !== '') {
        const c = cCell.startsWith('#') ? cCell : `#${cCell}`;
        if (COLOR_RE.test(c)) e.color = c.toUpperCase();
        else warnings.push({ line, code: 'COLOR_IGNORED', message: `Line ${line}: colour "${cCell}" isn't #RRGGBB; ignored.` });
      }
      const enCell = cols.enabled >= 0 ? (cells[cols.enabled] ?? '').trim() : '';
      if (enCell !== '') {
        const b = parseBool(enCell);
        if (b === null) warnings.push({ line, code: 'ENABLED_IGNORED', message: `Line ${line}: enabled "${enCell}" isn't true/false; ignored.` });
        else e.enabled = b;
      }
      push(e);
    }
  }
  if (total > MAX_ENTRIES) {
    if (opts.strict) throw new WhirlError('ENTRY_LIMIT', `A wheel can have at most ${MAX_ENTRIES} entries (the text has ${total}).`, { count: total, max: MAX_ENTRIES });
    warnings.push({ code: 'ENTRY_LIMIT', message: `Kept the first ${MAX_ENTRIES} of ${total} entries (the limit is ${MAX_ENTRIES}).`, details: { count: total, max: MAX_ENTRIES } });
  }
  return { entries, warnings };
}

// ---- editor list tools (pure; the UI makes them undoable) ----

/** Uniform shuffle for the editor (uses crypto randomness, not the draw stream). */
export function shuffleEntries<T>(items: readonly T[], random: (b: Uint8Array) => void = defaultRandom): T[] {
  const a = items.slice();
  const buf = new Uint32Array(1);
  const bytes = new Uint8Array(buf.buffer);
  for (let i = a.length - 1; i > 0; i--) {
    const n = i + 1;
    const limit = 0x100000000 - (0x100000000 % n);
    let x: number;
    do {
      random(bytes);
      x = buf[0]!;
    } while (x >= limit);
    const j = x % n;
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

export function sortEntries<T extends { label: string }>(items: readonly T[], direction: 'asc' | 'desc' = 'asc'): T[] {
  const a = items.slice().sort((x, y) => x.label.localeCompare(y.label, undefined, { sensitivity: 'base', numeric: true }));
  return direction === 'desc' ? a.reverse() : a;
}

/** Remove case-insensitive duplicate labels (NFC), keeping the first. */
export function dedupeEntries<T extends { label: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((e) => {
    const k = e.label.normalize('NFC').trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
