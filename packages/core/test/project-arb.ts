// fast-check arbitraries for valid, already-normalised whirl-v1 projects.
import fc from 'fast-check';
import { buildReceipt, type Entry, type Settings, type WhirlProject } from '../src/index.js';

const id = (p: string) => fc.stringMatching(new RegExp(`^${p}_[a-z0-9]{8}$`));
export const labelArb = fc.stringMatching(/^[A-Za-z0-9À-ÿ](?:[A-Za-z0-9 À-ÿ'-]{0,18}[A-Za-z0-9])?$/);
const tagArb = fc.stringMatching(/^[A-Za-z0-9]{1,6}$/);
const colorArb = fc.stringMatching(/^#[0-9A-F]{6}$/);
const weightArb = fc.oneof(fc.constant(1), fc.integer({ min: 1, max: 1_000_000_000 }).map((m) => m / 1000));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const IMG = 'img_0123456789abcdef';

const entryArb = (withImage: boolean): fc.Arbitrary<Entry> =>
  fc
    .record(
      {
        id: id('e'),
        label: labelArb,
        weight: weightArb,
        enabled: fc.boolean(),
        color: colorArb,
        imageRef: withImage ? fc.constant(IMG) : fc.constant(undefined),
        tags: fc.uniqueArray(tagArb, { maxLength: 3 }),
      },
      { requiredKeys: ['id', 'label', 'weight', 'enabled'] },
    )
    .map((e) => {
      const o = { ...e } as Entry;
      if (o.imageRef === undefined) delete o.imageRef;
      return o;
    });

const settingsArb: fc.Arbitrary<Settings> = fc.record({
  title: fc.oneof(fc.constant(''), labelArb),
  mode: fc.constantFrom('normal', 'elimination', 'multi', 'teams'),
  spinDuration: fc.integer({ min: 2, max: 60 }).map((h) => h / 2),
  multi: fc.record({ count: fc.oneof(fc.integer({ min: 1, max: 1000 }), fc.constant('all' as const)), reveal: fc.constantFrom('sequential', 'instant') }),
  teams: fc.record({ by: fc.constantFrom('count', 'size'), count: fc.integer({ min: 2, max: 20 }), size: fc.integer({ min: 1, max: 20 }), balance: fc.boolean(), keepApart: fc.constant([]), keepTogether: fc.constant([]) }),
  sound: fc.boolean(),
  volume: fc.double({ min: 0, max: 1, noNaN: true }),
  theme: fc.constantFrom('enamel-day', 'enamel-night', 'sherbet', 'harbour', 'broadcast', 'mono-ink'),
  palette: fc.oneof(fc.constant(null), fc.array(colorArb, { minLength: 2, maxLength: 24 })),
  confetti: fc.boolean(),
  mysteryMode: fc.boolean(),
  centre: fc.record({ text: fc.oneof(fc.constant(null), fc.stringMatching(/^[A-Za-z]{1,10}$/)), imageRef: fc.constant(null) }),
  fontScale: fc.double({ min: 0.75, max: 1.5, noNaN: true }),
  background: fc.oneof(fc.constant(null), fc.constant('transparent'), colorArb),
  fairDraw: fc.boolean(),
  commitEverySpin: fc.boolean(),
  showChances: fc.boolean(),
}) as fc.Arbitrary<Settings>;

const receipt = buildReceipt({ entries: [{ label: 'Ada', weight: 1, enabled: true }, { label: 'Grace', weight: 1, enabled: true }], seed: 'ab'.repeat(32), mode: 'single', createdAt: '2026-01-01T00:00:00.000Z' });

export const projectArb: fc.Arbitrary<WhirlProject> = fc
  .record({
    withImage: fc.boolean(),
    withHistory: fc.boolean(),
    wheelCount: fc.integer({ min: 1, max: 3 }),
    seed: fc.nat(),
  })
  .chain(({ withImage, withHistory, wheelCount }) =>
    fc.record({
      wheels: fc.uniqueArray(
        fc.record({ id: id('w'), name: labelArb, entries: fc.uniqueArray(entryArb(withImage), { maxLength: 30, selector: (e) => e.id }), settings: settingsArb }),
        { minLength: wheelCount, maxLength: wheelCount, selector: (w) => w.id },
      ),
      withImage: fc.constant(withImage),
      withHistory: fc.constant(withHistory),
    }),
  )
  .map(({ wheels, withImage, withHistory }) => ({
    $schema: 'https://whirlpick.vercel.app/schema/whirl-v1.json',
    format: 'whirlpick-project' as const,
    version: 1 as const,
    generator: 'whirlpick-web/0.1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    activeWheelId: wheels[0]!.id,
    layout: null,
    wheels,
    images: (withImage ? { [IMG]: { dataUrl: PNG, width: 1, height: 1 } } : {}) as WhirlProject['images'],
    history: withHistory ? [{ id: 'h_00000001', wheelId: wheels[0]!.id, createdAt: '2026-01-01T00:00:00.000Z', receipt, teamNames: ['Reds', 'Blues'] }] : [],
  }));
