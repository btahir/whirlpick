// F4: text parsers (PLAN §4.2).
import { describe, expect, it } from 'vitest';
import { dedupeEntries, detectFormat, parseEntriesText, shuffleEntries, sortEntries } from '../src/index.js';

const simple = (text: string, fmt?: 'txt' | 'csv' | 'tsv') => {
  const r = parseEntriesText(text, fmt);
  return { rows: r.entries.map(({ id: _id, ...e }) => e), warnings: r.warnings.map((w) => [w.code, w.line]) };
};

describe('parse', () => {
  it('txt: blank lines skipped, lines trimmed, a leading # is part of the label', () => {
    expect(simple('Ada\n\n  Grace  \r\n# Linus\n\n', 'txt').rows).toEqual([
      { label: 'Ada', weight: 1, enabled: true },
      { label: 'Grace', weight: 1, enabled: true },
      { label: '# Linus', weight: 1, enabled: true },
    ]);
  });
  it('CSV with a header (name, weight, tags, colour, enabled)', () => {
    const t = 'Name,Weight,Tags,Colour,Enabled\nAda,2,A|x,#e4572e,yes\nGrace,,B,,no\n';
    expect(simple(t).rows).toEqual([
      { label: 'Ada', weight: 2, enabled: true, tags: ['A', 'x'], color: '#E4572E' },
      { label: 'Grace', weight: 1, enabled: false, tags: ['B'] },
    ]);
  });
  it('CSV without a header: label, weight if numeric, tags', () => {
    expect(simple('Ada,2.5,A\nGrace,.125\nLinus,3,B|C\n').rows).toEqual([
      { label: 'Ada', weight: 2.5, enabled: true, tags: ['A'] },
      { label: 'Grace', weight: 0.125, enabled: true },
      { label: 'Linus', weight: 3, enabled: true, tags: ['B', 'C'] },
    ]);
  });
  it('quoted commas and quotes (RFC 4180); a quoted newline stays in its cell (then fails the label rules)', () => {
    const r = simple('name,weight\n"Lovelace, Ada",2\n"Hopper\nGrace",1\n"Say ""hi""",1\n', 'csv');
    expect(r.rows).toEqual([
      { label: 'Lovelace, Ada', weight: 2, enabled: true },
      { label: 'Say "hi"', weight: 1, enabled: true },
    ]);
    expect(r.warnings).toEqual([['LABEL_INVALID', 3]]);
  });
  it('TSV pasted from a spreadsheet', () => {
    const t = 'Ada\t2\nGrace\t1\nLinus\t0.5\n';
    expect(detectFormat(t)).toBe('tsv');
    expect(simple(t).rows.map((e) => [e.label, e.weight])).toEqual([['Ada', 2], ['Grace', 1], ['Linus', 0.5]]);
  });
  it('semicolon CSV with a decimal comma', () => {
    const t = 'Ada;2,5\nGrace;1\nLinus;0,125\n';
    expect(simple(t).rows.map((e) => [e.label, e.weight])).toEqual([['Ada', 2.5], ['Grace', 1], ['Linus', 0.125]]);
    // A decimal comma is not accepted in comma-separated input.
    expect(simple('name,weight\nAda,"2,5"\n').warnings).toEqual([['WEIGHT_IGNORED', 2]]);
  });
  it('a BOM is stripped', () => {
    expect(simple('﻿Ada\nGrace', 'txt').rows[0]!.label).toBe('Ada');
    expect(simple('﻿name,weight\nAda,2').rows).toEqual([{ label: 'Ada', weight: 2, enabled: true }]);
  });
  it('a bad weight gives weight 1 and WEIGHT_IGNORED with the line', () => {
    const r = simple('name,weight\nAda,0\nGrace,abc\nLinus,1.2345\n');
    expect(r.rows.map((e) => e.weight)).toEqual([1, 1, 1]);
    expect(r.warnings).toEqual([['WEIGHT_IGNORED', 2], ['WEIGHT_IGNORED', 3], ['WEIGHT_IGNORED', 4]]);
  });
  it('1 200 lines → ENTRY_LIMIT: keeps 1000 with a warning, or throws in strict mode', () => {
    const t = Array.from({ length: 1200 }, (_, i) => `Name ${i}`).join('\n');
    const r = parseEntriesText(t, 'txt');
    expect(r.entries).toHaveLength(1000);
    expect(r.warnings.map((w) => w.code)).toEqual(['ENTRY_LIMIT']);
    expect(() => parseEntriesText(t, 'txt', { strict: true })).toThrowError(expect.objectContaining({ code: 'ENTRY_LIMIT' }));
  });
  it('invalid labels are skipped with LABEL_INVALID', () => {
    expect(simple('Ada\nbad\u0007label\nGrace', 'txt')).toEqual({ rows: [{ label: 'Ada', weight: 1, enabled: true }, { label: 'Grace', weight: 1, enabled: true }], warnings: [['LABEL_INVALID', 2]] });
  });
  it('auto-detect: plain names are txt even with an odd comma', () => {
    expect(detectFormat('Ada\nGrace\nLinus, Jr\nMargaret\nPriya\n')).toBe('txt');
    expect(detectFormat('a,1\nb,2\nc,3')).toBe('csv');
  });
  it('editor tools: sort A–Z (base sensitivity, numeric), de-duplicate case-insensitively, uniform shuffle keeps items', () => {
    const e = ['b', 'A', 'a', 'Item 10', 'Item 2', 'é'].map((label) => ({ label }));
    expect(sortEntries(e).map((x) => x.label)).toEqual(['A', 'a', 'b', 'é', 'Item 2', 'Item 10']);
    expect(dedupeEntries([{ label: 'Ada' }, { label: 'ada' }, { label: 'é' }, { label: 'é' }]).map((x) => x.label)).toEqual(['Ada', 'é']);
    const s = shuffleEntries([1, 2, 3, 4, 5]);
    expect([...s].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
