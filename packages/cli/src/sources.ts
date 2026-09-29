// Entry sources shared by the CLI and MCP: inline entries, text/CSV/TSV/.whirl.json content, presets.
import {
  createProject,
  createWheel,
  detectFormat,
  H,
  normaliseEntries,
  parseEntriesText,
  parseProject,
  presetById,
  presetProject,
  toHex,
  utf8,
  WhirlError,
  type Entry,
  type EntryIn,
  type Wheel,
  type WhirlProject,
} from '@whirlpick/core';

export interface Resolved {
  entries: Entry[];
  /** The project the entries came from (file source), or a fresh one-wheel project. */
  project: WhirlProject;
  wheel: Wheel;
  warnings: string[];
}

export type TextFormatHint = 'txt' | 'csv' | 'tsv' | 'json';

/** Deterministic entry ids (so CLI/MCP output is reproducible): e_ + first 8 hex of H(salt:index:label). */
export function withStableIds(input: EntryIn[], salt = 'whirlpick-cli'): EntryIn[] {
  return input.map((e, i) => {
    const o = typeof e === 'string' ? { label: e } : { ...e };
    if (!o.id) o.id = `e_${toHex(H(utf8(`${salt}:${i}:${o.label}`))).slice(0, 8)}`;
    return o;
  });
}

function stableWheelId(entries: readonly { label: string }[]): string {
  return `w_${toHex(H(utf8(`whirlpick-cli-wheel:${entries.map((e) => e.label).join('\n')}`))).slice(0, 8)}`;
}

const fmtWarn = (w: { code: string; message: string }) => `${w.code}: ${w.message}`;

export function fromEntries(input: EntryIn[], opts: { title?: string | null; now: string; generator: string }): Resolved {
  if (!Array.isArray(input) || input.length === 0) throw new WhirlError('ENTRIES_INVALID', 'Give at least one entry.');
  const { entries } = normaliseEntries(withStableIds(input));
  return wrap(entries, [], opts);
}

function wrap(entries: Entry[], warnings: string[], opts: { title?: string | null; now: string; generator: string }): Resolved {
  const title = opts.title ?? '';
  const wheel = createWheel(entries, { id: stableWheelId(entries), name: title || 'Wheel', settings: { title } });
  const project = createProject([wheel], { now: opts.now, generator: opts.generator });
  return { entries, project, wheel, warnings };
}

export function fromPreset(id: string, params: Record<string, string>, opts: { title?: string | null; now: string; generator: string }): Resolved {
  const p = presetById(id, params);
  if (!p) throw new WhirlError('PRESET_UNKNOWN', `Unknown preset "${id}". Run \`whirlpick presets\` to list them.`, { preset: id });
  const project = presetProject(p, { now: opts.now, generator: opts.generator });
  const wheel = project.wheels[0]!;
  if (opts.title) wheel.settings.title = opts.title;
  return { entries: wheel.entries, project, wheel, warnings: [] };
}

/** Parse file or stdin content. JSON: a whirl-v1 project or a list of entries. */
export function fromText(text: string, hint: TextFormatHint | undefined, opts: { wheel?: string; title?: string | null; now: string; generator: string; name?: string }): Resolved {
  const t = text.replace(/^﻿/, '');
  const fmt: TextFormatHint = hint ?? (t.trimStart().startsWith('{') || t.trimStart().startsWith('[') ? 'json' : detectFormat(t));
  if (fmt === 'json') {
    let json: unknown;
    try {
      json = JSON.parse(t);
    } catch (e) {
      throw new WhirlError('PARSE_ERROR', `${opts.name ?? 'Input'} is not valid JSON: ${(e as Error).message}`);
    }
    if (Array.isArray(json)) return fromEntries(json as EntryIn[], opts);
    const { project, warnings } = parseProject(json, { now: opts.now });
    let wheel: Wheel | undefined;
    if (opts.wheel) {
      wheel = project.wheels.find((w) => w.id === opts.wheel) ?? project.wheels.find((w) => w.name === opts.wheel);
      if (!wheel) throw new WhirlError('WHEEL_NOT_FOUND', `No wheel with id or name "${opts.wheel}" in ${opts.name ?? 'the project'} (wheels: ${project.wheels.map((w) => `${w.id} "${w.name}"`).join(', ')}).`);
    } else wheel = project.wheels.find((w) => w.id === project.activeWheelId) ?? project.wheels[0]!;
    if (opts.title) wheel.settings.title = opts.title;
    return { entries: wheel.entries, project: { ...project, activeWheelId: wheel.id }, wheel, warnings: warnings.map(fmtWarn) };
  }
  const { entries, warnings } = parseEntriesText(t, fmt, { strict: true });
  if (entries.length === 0) throw new WhirlError('ENTRIES_INVALID', `${opts.name ?? 'Input'} has no entries.`);
  const withIds = normaliseEntries(withStableIds(entries.map(({ id: _id, ...e }) => e))).entries;
  return wrap(withIds, warnings.map(fmtWarn), opts);
}

/** Resolve a label list ("Ada,Grace" or ["Ada", "#3"]) to snapshot indices (§5.2 --apart/--together). */
export function resolveMembers(items: readonly string[], entries: readonly Entry[], what: string): number[] {
  return items.map((raw) => {
    const s = raw.normalize('NFC').trim();
    const m = /^#(\d+)$/.exec(s);
    if (m) {
      const i = Number(m[1]);
      if (i >= entries.length) throw new WhirlError('CONSTRAINT_UNKNOWN_ENTRY', `${what}: #${i} is not an entry (the wheel has ${entries.length}).`, { index: i });
      return i;
    }
    const hits = entries.map((e, i) => (e.label === s ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 0) throw new WhirlError('CONSTRAINT_UNKNOWN_ENTRY', `${what}: no entry is labelled "${s}".`, { label: s });
    if (hits.length > 1) throw new WhirlError('LABEL_AMBIGUOUS', `${what}: "${s}" matches ${hits.length} entries (${hits.map((i) => `#${i}`).join(', ')}); use #index instead.`, { label: s, indices: hits });
    return hits[0]!;
  });
}
