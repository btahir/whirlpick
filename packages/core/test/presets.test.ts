// F7: presets, plus contrast and sessions.
import { describe, expect, it } from 'vitest';
import { advanceSession, bestTextColor, commitmentFor, contrastRatio, COUNTRIES, createSession, presetById, presetProject, PRESETS, SYNTHETIC_NAMES, validateProject, wheelHash } from '../src/index.js';

describe('presets', () => {
  it('every preset validates as a one-wheel project with stable ids', () => {
    for (const p of PRESETS) {
      const proj = presetProject(p, { now: '2026-01-01T00:00:00.000Z' });
      const r = validateProject(JSON.parse(JSON.stringify(proj)));
      expect(r.errors, p.id).toEqual([]);
      expect(r.project).toEqual(proj);
      expect(JSON.stringify(presetProject(p, { now: '2026-01-01T00:00:00.000Z' }))).toBe(JSON.stringify(proj));
    }
  });
  it('the PLAN §6.10 ids exist with the right counts and modes', () => {
    const ids = ['blank', 'names-sample', 'yes-no', 'yes-no-maybe', 'coin', 'numbers-1-10', 'numbers-1-100', 'numbers', 'letters', 'food', 'truth-or-dare', 'decision', 'chores', 'countries', 'raffle-sample', 'class-sample', 'teams-sample', 'order-sample'];
    expect(PRESETS.map((p) => p.id)).toEqual(ids);
    const count = (id: string) => presetById(id)!.entries.length;
    expect([count('yes-no'), count('yes-no-maybe'), count('coin'), count('numbers-1-10'), count('numbers-1-100'), count('letters'), count('food'), count('chores'), count('names-sample'), count('class-sample'), count('teams-sample'), count('order-sample'), count('raffle-sample')]).toEqual([2, 3, 2, 10, 100, 26, 20, 10, 12, 24, 16, 8, 30]);
    expect(presetById('raffle-sample')!.settings).toMatchObject({ fairDraw: true, mode: 'multi', multi: { count: 3 } });
    expect(presetById('class-sample')!.settings.mode).toBe('elimination');
    expect(presetById('teams-sample')!.settings).toMatchObject({ mode: 'teams', teams: { count: 4 } });
    expect(presetById('order-sample')!.settings).toMatchObject({ mode: 'multi', multi: { count: 'all' } });
    expect(presetById('nope')).toBeUndefined();
  });
  it('numbers takes min/max (≤ 1000 values)', () => {
    expect(presetById('numbers', { min: '5', max: '15' })!.entries).toHaveLength(11);
    expect(presetById('numbers', { min: '1', max: '1000' })!.entries).toHaveLength(1000);
    expect(() => presetById('numbers', { min: '1', max: '1001' })).toThrowError(expect.objectContaining({ code: 'ENTRY_LIMIT' }));
    expect(() => presetById('numbers', { min: '9', max: '2' })).toThrowError(expect.objectContaining({ code: 'PRESET_PARAMS_INVALID' }));
  });
  it('countries: 195 entries, no duplicates', () => {
    expect(COUNTRIES).toHaveLength(195);
    expect(new Set(COUNTRIES).size).toBe(195);
    expect(presetById('countries')!.entries).toHaveLength(195);
  });
  it('every person name in the presets comes from the synthetic list', () => {
    for (const id of ['names-sample', 'class-sample', 'teams-sample', 'order-sample']) {
      for (const e of presetById(id)!.entries) expect(SYNTHETIC_NAMES as readonly string[]).toContain(typeof e === 'string' ? e : e.label);
    }
  });
  it('contrast ratio (WCAG)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(contrastRatio('#E4572E', '#1F1915')).toBeCloseTo(contrastRatio('#1F1915', '#E4572E'), 12);
    expect(bestTextColor('#1F1915', ['#1F1915', '#FBF7F0'])).toBe('#FBF7F0');
  });
  it('sessions: commitment + list fingerprint at commit time; advance adds winners', () => {
    const entries = [{ label: 'Ada', weight: 1, enabled: true }];
    const s = createSession({ entries, seed: 'AB'.repeat(32), now: '2026-01-01T00:00:00.000Z' });
    expect(s).toEqual({ seed: 'ab'.repeat(32), commitment: commitmentFor('ab'.repeat(32)), committedWheelHash: wheelHash(entries), committedAt: '2026-01-01T00:00:00.000Z', publicInput: null, nextSpinIndex: 0, excluded: [] });
    expect(advanceSession(advanceSession(s, [3]), [1])).toMatchObject({ nextSpinIndex: 2, excluded: [1, 3] });
  });
});
