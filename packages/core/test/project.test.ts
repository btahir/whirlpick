// F1–F3: .whirl.json round-trip, bad fixtures, validator ⇔ JSON Schema agreement.
import { readdirSync, readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SEMANTIC_CODES, validateProject } from '../src/index.js';
import { projectArb } from './project-arb.js';
import { validateWhirlSchema } from './schema-helpers.js';

const fx = (sub: string) => new URL(`./fixtures/${sub}/`, import.meta.url);
const read = (sub: string, f: string) => JSON.parse(readFileSync(new URL(f, fx(sub)), 'utf8'));
const goodFiles = readdirSync(fx('good')).filter((f) => f.endsWith('.json'));
const badFiles = readdirSync(fx('bad')).filter((f) => f.endsWith('.whirl.json'));
const expected: Record<string, { path: string; code: string }> = read('bad', 'expected.json');

/** Verdict that JSON Schema can express: semantic-only failures count as schema-valid. */
function handVerdict(v: unknown): boolean {
  const r = validateProject(v);
  return r.ok || r.errors.every((e) => (SEMANTIC_CODES as readonly string[]).includes(e.code));
}

describe('project', () => {
  it('F1: 200 fast-check projects round-trip through JSON and deep-equal', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const r = validateProject(JSON.parse(JSON.stringify(p)));
        expect(r.errors).toEqual([]);
        expect(r.project).toEqual(p);
      }),
      { numRuns: 200, seed: 42 },
    );
  });
  it('F1: the minimal agent file validates; ids and defaults are filled in', () => {
    const r = validateProject({ format: 'whirlpick-project', version: 1, wheels: [{ entries: [{ label: 'Ada' }, { label: 'Grace' }] }] }, { now: '2026-01-01T00:00:00.000Z' });
    expect(r.ok).toBe(true);
    const p = r.project!;
    expect(p.wheels[0]!.id).toMatch(/^w_[a-z0-9]{8}$/);
    expect(p.activeWheelId).toBe(p.wheels[0]!.id);
    expect(p.wheels[0]!.entries.map((e) => [e.label, e.weight, e.enabled])).toEqual([['Ada', 1, true], ['Grace', 1, true]]);
    expect(p.wheels[0]!.entries[0]!.id).toMatch(/^e_[a-z0-9]{8}$/);
    expect(p.wheels[0]!.settings).toEqual(DEFAULT_SETTINGS);
    expect(p.wheels[0]!.name).toBe('Wheel 1');
    expect(p.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(p.images).toEqual({});
    expect(p.history).toEqual([]);
  });
  it('F2: ≥ 25 bad fixtures are rejected with the expected pointer and code; every good one is accepted', () => {
    expect(badFiles.length).toBeGreaterThanOrEqual(25);
    for (const f of badFiles) {
      const r = validateProject(read('bad', f));
      expect(r.ok, f).toBe(false);
      expect(r.errors, f).toContainEqual(expect.objectContaining(expected[f]));
    }
    for (const f of goodFiles) {
      const r = validateProject(read('good', f));
      expect(r.errors, f).toEqual([]);
    }
  });
  it('F2: warnings for dropped unknown settings, trimmed labels', () => {
    const r = validateProject(read('good', 'unknown-setting.whirl.json'));
    expect(r.warnings.map((w) => w.code)).toContain('SETTING_UNKNOWN');
    expect(validateProject({ format: 'whirlpick-project', version: 1, wheels: [{ entries: [{ label: '  Ada ' }] }] }).project!.wheels[0]!.entries[0]!.label).toBe('Ada');
  });
  it('F3: ajv (WHIRL_SCHEMA_V1) and the validator agree on every fixture (semantic-only codes aside)', () => {
    for (const [sub, files] of [['good', goodFiles], ['bad', badFiles]] as const) {
      for (const f of files) {
        const v = read(sub, f);
        expect(validateWhirlSchema(v), `${sub}/${f} ${JSON.stringify(validateWhirlSchema.errors?.slice(0, 2))}`).toBe(handVerdict(v));
      }
    }
    // The dangling image ref is the one documented semantic rule.
    expect(validateWhirlSchema(read('bad', 'dangling-image-ref.whirl.json'))).toBe(true);
  });
  it('F3: 500 fast-check mutations give the same verdict from ajv and the validator', () => {
    const base = read('good', 'full.whirl.json');
    const paths: [string[], unknown[]][] = [
      [['wheels', '0', 'entries', '0', 'weight'], [0, 0.0005, 1.5, 1.2345, -1, 2e6, '2', 1e6, 0.001, null]],
      [['wheels', '0', 'entries', '0', 'label'], ['', ' ', 'a\u0000b', 'x'.repeat(201), 'ok', 'x'.repeat(200), 5, 'é́', '\uD800']],
      [['wheels', '0', 'entries', '0', 'color'], ['#fff', '#FFFFFF', 'red', '#00b140', 1]],
      [['wheels', '0', 'entries', '0', 'enabled'], [true, false, 'yes', 0]],
      [['wheels', '0', 'entries', '0', 'tags'], [[], ['a'], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], [''], ['t'.repeat(33)], 'A']],
      [['wheels', '0', 'entries', '0', 'extra'], [1, 'x']],
      [['wheels', '0', 'id'], ['w_ok', 'bad id', '', 'x'.repeat(33)]],
      [['wheels', '0', 'name'], ['Name', '', 'n'.repeat(81), 'n'.repeat(80)]],
      [['version'], [1, 2, '1']],
      [['format'], ['whirlpick-project', 'other']],
      [['layout'], [null, {}, 1]],
      [['owner'], ['x']],
      [['activeWheelId'], ['w_k3j9x2ab', 'no such', 'w_other000']],
      [['wheels', '0', 'settings', 'spinDuration'], [0.5, 1, 30.5, 7.25, 7.5, 30]],
      [['wheels', '0', 'settings', 'mode'], ['normal', 'roulette']],
      [['wheels', '0', 'settings', 'theme'], ['Bad Theme', 'harbour']],
      [['wheels', '0', 'settings', 'fontScale'], [0.7, 0.75, 1.6, 1.5]],
      [['wheels', '0', 'settings', 'background'], ['transparent', '#00B140', 'blue', null]],
      [['wheels', '0', 'settings', 'multi', 'count'], [0, 1, 'all', 1001, 1000]],
      [['wheels', '0', 'settings', 'teams', 'count'], [1, 2, 1000]],
      [['wheels', '0', 'settings', 'volume'], [-0.1, 0, 1, 1.1]],
      [['wheels', '0', 'settings', 'palette'], [null, ['#000000'], ['#000000', '#FFFFFF'], 'x']],
      [['wheels', '0', 'settings', 'title'], ['', 't'.repeat(81), 'ok\u0001']],
      [['images', 'img_4f1c0a9b2d3e4f50', 'width'], [0, 1, 256, 257]],
      [['createdAt'], ['2026-01-01T00:00:00Z', 'nope']],
    ];
    fc.assert(
      fc.property(fc.integer({ min: 0, max: paths.length - 1 }), fc.nat(), (pi, vi) => {
        const [path, values] = paths[pi]!;
        const v = structuredClone(base);
        let o = v;
        for (const k of path.slice(0, -1)) o = o[k];
        o[path[path.length - 1]!] = values[vi % values.length];
        expect(validateWhirlSchema(v), `${path.join('/')} = ${JSON.stringify(values[vi % values.length])}`).toBe(handVerdict(v));
      }),
      { numRuns: 500, seed: 9 },
    );
  });
});
