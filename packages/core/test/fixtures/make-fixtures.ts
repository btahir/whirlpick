// Writes test/fixtures/{good,bad}/*.whirl.json and bad/expected.json. Re-run after changing a case:
//   pnpm exec tsx packages/core/test/fixtures/make-fixtures.ts
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { buildReceipt } from '../../src/index.js';

const dir = new URL('./', import.meta.url).pathname;
const minimal = { format: 'whirlpick-project', version: 1, wheels: [{ entries: [{ label: 'Ada' }, { label: 'Grace' }] }] };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const receipt = buildReceipt({ entries: [{ label: 'Ada', weight: 1, enabled: true }, { label: 'Grace', weight: 1, enabled: true }], seed: 'ab'.repeat(32), mode: 'single', createdAt: '2026-01-01T00:00:00.000Z', app: 'whirlpick-web/0.1.0' });
const full = {
  $schema: 'https://whirlpick.vercel.app/schema/whirl-v1.json',
  format: 'whirlpick-project',
  version: 1,
  generator: 'whirlpick-web/0.1.0',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  activeWheelId: 'w_k3j9x2ab',
  layout: null,
  wheels: [
    {
      id: 'w_k3j9x2ab',
      name: 'Class 4B',
      entries: [
        { id: 'e_0a1b2c3d', label: 'Ada', weight: 1, enabled: true, color: '#E4572E', imageRef: 'img_4f1c0a9b2d3e4f50', tags: ['A'] },
        { id: 'e_1a1b2c3d', label: 'Grace', weight: 2.5, enabled: true },
        { id: 'e_2a1b2c3d', label: 'Linus', weight: 0.125, enabled: false, tags: ['B', 'x'] },
      ],
      settings: {
        title: "Who's next?", mode: 'teams', spinDuration: 6.5, multi: { count: 3, reveal: 'sequential' },
        teams: { by: 'count', count: 2, size: 4, balance: true, keepApart: [['e_0a1b2c3d', 'e_1a1b2c3d']], keepTogether: [] },
        sound: true, volume: 0.8, theme: 'enamel-day', palette: ['#E4572E', '#29335C'], confetti: true, mysteryMode: false,
        centre: { text: 'Go', imageRef: 'img_4f1c0a9b2d3e4f50' }, fontScale: 1.25, background: 'transparent', fairDraw: true, commitEverySpin: false, showChances: true,
      },
    },
  ],
  images: { img_4f1c0a9b2d3e4f50: { dataUrl: png, width: 1, height: 1 } },
  history: [{ id: 'h_00000001', wheelId: 'w_k3j9x2ab', createdAt: '2026-01-01T00:00:00.000Z', receipt, teamNames: null }],
};
const clone = <T>(x: T): T => structuredClone(x);
const withWheel = (patch: (w: Record<string, unknown>) => void) => {
  const p = clone(full) as Record<string, unknown> & { wheels: Record<string, unknown>[] };
  patch(p.wheels[0]!);
  return p;
};
const withEntry = (patch: (e: Record<string, unknown>) => void) => withWheel((w) => patch((w.entries as Record<string, unknown>[])[0]!));
const withSettings = (patch: (s: Record<string, unknown>) => void) => withWheel((w) => patch(w.settings as Record<string, unknown>));

const good: Record<string, unknown> = {
  'minimal.whirl.json': minimal,
  'full.whirl.json': full,
  'empty-wheel.whirl.json': { format: 'whirlpick-project', version: 1, wheels: [{ entries: [] }] },
  'weights-and-tags.whirl.json': { format: 'whirlpick-project', version: 1, wheels: [{ name: 'Teams', entries: [{ label: 'Ada', weight: 0.001, tags: ['1'] }, { label: 'Grace', weight: 1000000, tags: ['2', '3'] }, { label: 'Élodie 😀', enabled: false }] }] },
  'unknown-setting.whirl.json': { format: 'whirlpick-project', version: 1, wheels: [{ entries: [{ label: 'Ada' }], settings: { futureFlag: true, mode: 'multi', multi: { count: 'all' } } }] },
  'two-wheels.whirl.json': { format: 'whirlpick-project', version: 1, activeWheelId: 'w_second00', wheels: [{ id: 'w_first000', entries: [{ label: 'A' }] }, { id: 'w_second00', name: 'Second', entries: [{ label: 'B' }, { label: 'C', color: '#00b140' }] }] },
  'max-label.whirl.json': { format: 'whirlpick-project', version: 1, wheels: [{ entries: [{ label: 'x'.repeat(200) }] }] },
  '1000-entries.whirl.json': { format: 'whirlpick-project', version: 1, wheels: [{ entries: Array.from({ length: 1000 }, (_, i) => ({ label: `Entry ${i + 1}` })) }] },
};

const bad: Record<string, [unknown, string, string]> = {
  'wrong-format.whirl.json': [{ ...minimal, format: 'wheelofnames' }, '/format', 'FORMAT_INVALID'],
  'version-2.whirl.json': [{ ...minimal, version: 2 }, '/version', 'UNSUPPORTED_VERSION'],
  'missing-label.whirl.json': [{ ...minimal, wheels: [{ entries: [{ label: 'Ada' }, { weight: 2 }] }] }, '/wheels/0/entries/1/label', 'REQUIRED'],
  'weight-zero.whirl.json': [withEntry((e) => (e.weight = 0)), '/wheels/0/entries/0/weight', 'WEIGHT_INVALID'],
  'weight-4-decimals.whirl.json': [withEntry((e) => (e.weight = 1.2345)), '/wheels/0/entries/0/weight', 'WEIGHT_INVALID'],
  'weight-string.whirl.json': [withEntry((e) => (e.weight = '2')), '/wheels/0/entries/0/weight', 'WEIGHT_INVALID'],
  'weight-too-big.whirl.json': [withEntry((e) => (e.weight = 1000001)), '/wheels/0/entries/0/weight', 'WEIGHT_INVALID'],
  'label-too-long.whirl.json': [withEntry((e) => (e.label = 'y'.repeat(201))), '/wheels/0/entries/0/label', 'LABEL_INVALID'],
  'label-control-char.whirl.json': [withEntry((e) => (e.label = 'Ada\u0007')), '/wheels/0/entries/0/label', 'LABEL_INVALID'],
  'label-blank.whirl.json': [withEntry((e) => (e.label = '   ')), '/wheels/0/entries/0/label', 'LABEL_INVALID'],
  '1001-entries.whirl.json': [{ ...minimal, wheels: [{ entries: Array.from({ length: 1001 }, (_, i) => ({ label: `E${i}` })) }] }, '/wheels/0/entries', 'ENTRY_LIMIT'],
  'bad-colour.whirl.json': [withEntry((e) => (e.color = 'red')), '/wheels/0/entries/0/color', 'COLOR_INVALID'],
  'unknown-top-level-key.whirl.json': [{ ...minimal, owner: 'me' }, '/owner', 'UNKNOWN_KEY'],
  'unknown-entry-key.whirl.json': [withEntry((e) => (e.score = 3)), '/wheels/0/entries/0/score', 'UNKNOWN_KEY'],
  'dangling-image-ref.whirl.json': [withEntry((e) => (e.imageRef = 'img_ffffffffffffffff')), '/wheels/0/entries/0/imageRef', 'IMAGE_REF_MISSING'],
  'image-over-200kb.whirl.json': [{ ...clone(full), images: { img_4f1c0a9b2d3e4f50: { dataUrl: 'data:image/png;base64,' + 'A'.repeat(205000), width: 1, height: 1 } } }, '/images/img_4f1c0a9b2d3e4f50/dataUrl', 'IMAGE_TOO_LARGE'],
  'image-too-wide.whirl.json': [{ ...clone(full), images: { img_4f1c0a9b2d3e4f50: { dataUrl: png, width: 512, height: 1 } } }, '/images/img_4f1c0a9b2d3e4f50/width', 'IMAGE_INVALID'],
  'image-not-data-url.whirl.json': [{ ...clone(full), images: { img_4f1c0a9b2d3e4f50: { dataUrl: 'https://example.com/a.png', width: 1, height: 1 } } }, '/images/img_4f1c0a9b2d3e4f50/dataUrl', 'IMAGE_INVALID'],
  'layout-not-null.whirl.json': [{ ...minimal, layout: { grid: 2 } }, '/layout', 'LAYOUT_RESERVED'],
  'no-wheels.whirl.json': [{ format: 'whirlpick-project', version: 1, wheels: [] }, '/wheels', 'WHEELS_EMPTY'],
  'wheels-missing.whirl.json': [{ format: 'whirlpick-project', version: 1 }, '/wheels', 'REQUIRED'],
  'entries-missing.whirl.json': [{ ...minimal, wheels: [{ name: 'x' }] }, '/wheels/0/entries', 'REQUIRED'],
  'bad-wheel-id.whirl.json': [withWheel((w) => (w.id = 'has spaces')), '/wheels/0/id', 'ID_INVALID'],
  'bad-mode.whirl.json': [withSettings((s) => (s.mode = 'roulette')), '/wheels/0/settings/mode', 'SETTING_INVALID'],
  'bad-duration.whirl.json': [withSettings((s) => (s.spinDuration = 45)), '/wheels/0/settings/spinDuration', 'SETTING_INVALID'],
  'bad-palette.whirl.json': [withSettings((s) => (s.palette = ['#fff'])), '/wheels/0/settings/palette', 'SETTING_INVALID'],
  'too-many-tags.whirl.json': [withEntry((e) => (e.tags = ['1', '2', '3', '4', '5', '6', '7', '8', '9'])), '/wheels/0/entries/0/tags', 'TAG_INVALID'],
  'bad-date.whirl.json': [{ ...minimal, createdAt: 'yesterday' }, '/createdAt', 'DATE_INVALID'],
  'history-bad-receipt.whirl.json': [{ ...clone(full), history: [{ ...full.history[0], receipt: { ...receipt, wheelHash: 'nothex' } }] }, '/history/0/receipt/wheelHash', 'HISTORY_INVALID'],
  'history-beacon.whirl.json': [{ ...clone(full), history: [{ ...full.history[0], receipt: { ...receipt, beacon: { round: 1 } } }] }, '/history/0/receipt/beacon', 'HISTORY_INVALID'],
  'not-an-object.whirl.json': [[minimal], '', 'TYPE_INVALID'],
};

for (const sub of ['good', 'bad']) {
  rmSync(dir + sub, { recursive: true, force: true });
  mkdirSync(dir + sub, { recursive: true });
}
for (const [f, v] of Object.entries(good)) writeFileSync(`${dir}good/${f}`, JSON.stringify(v, null, 2) + '\n');
const expected: Record<string, { path: string; code: string }> = {};
for (const [f, [v, path, code]] of Object.entries(bad)) {
  writeFileSync(`${dir}bad/${f}`, JSON.stringify(v, null, 2) + '\n');
  expected[f] = { path, code };
}
writeFileSync(`${dir}bad/expected.json`, JSON.stringify(expected, null, 2) + '\n');
console.log(`wrote ${Object.keys(good).length} good and ${Object.keys(bad).length} bad fixtures`);
