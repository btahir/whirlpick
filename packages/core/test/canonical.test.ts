// A4: wheelHash covers order, label, weight, enabled, tags, tag order; ignores ids, colours, images, title, settings, theme.
import { describe, expect, it } from 'vitest';
import { wheelHash, type Entry } from '../src/index.js';
import { mulberry32 } from './helpers.js';

function base(rnd: () => number): Entry[] {
  const n = 3 + Math.floor(rnd() * 8);
  return Array.from({ length: n }, (_, i) => ({ id: `e_${i}aaaaaaa`, label: `Name ${i} ${Math.floor(rnd() * 1000)}`, weight: 1 + Math.floor(rnd() * 5), enabled: true, tags: ['A', 'B'].slice(0, Math.floor(rnd() * 3)) }));
}

const at = (e: Entry[], k: number, f: (x: Entry) => Entry) => e.map((x, i) => (i === k ? f(x) : x));

const counted: [string, (e: Entry[], rnd: () => number) => Entry[]][] = [
  ['entry order', (e) => [e[1]!, e[0]!, ...e.slice(2)]],
  ['label', (e, r) => at(e, Math.floor(r() * e.length), (x) => ({ ...x, label: x.label + 'x' }))],
  ['weight', (e, r) => at(e, Math.floor(r() * e.length), (x) => ({ ...x, weight: x.weight + 0.001 }))],
  ['enabled', (e, r) => at(e, Math.floor(r() * e.length), (x) => ({ ...x, enabled: !x.enabled }))],
  ['a tag', (e, r) => at(e, Math.floor(r() * e.length), (x) => ({ ...x, tags: [...(x.tags ?? []), 'Z'] }))],
  ['tag order', (e, r) => at(e, Math.floor(r() * e.length), (x) => ({ ...x, tags: [...(x.tags ?? [])].reverse() }))],
];
const ignored: [string, (e: Entry[]) => unknown[]][] = [
  ['colour', (e) => e.map((x) => ({ ...x, color: '#123456' }))],
  ['image', (e) => e.map((x) => ({ ...x, imageRef: 'img_0123456789abcdef' }))],
  ['id', (e) => e.map((x, i) => ({ ...x, id: `e_zz${i}` }))],
  ['title', (e) => e.map((x) => ({ ...x, title: 'Friday raffle' }))],
  ['settings', (e) => e.map((x) => ({ ...x, settings: { mode: 'teams' } }))],
  ['theme', (e) => e.map((x) => ({ ...x, theme: 'harbour' }))],
];

describe('canonical', () => {
  for (const [name, mutate] of counted) {
    it(`hash changes when ${name} changes (≥ 10 mutations)`, () => {
      for (let s = 0; s < 12; s++) {
        const rnd = mulberry32(s + 1);
        let e = base(rnd);
        if (name === 'tag order') e = e.map((x, i) => ({ ...x, tags: [`P${i}`, `Q${i}`] }));
        expect(wheelHash(mutate(e, rnd))).not.toBe(wheelHash(e));
      }
    });
  }
  for (const [name, mutate] of ignored) {
    it(`hash is unchanged when ${name} changes (≥ 10 mutations)`, () => {
      for (let s = 0; s < 12; s++) {
        const e = base(mulberry32(s + 100));
        expect(wheelHash(mutate(e) as Entry[])).toBe(wheelHash(e));
      }
    });
  }
  it('tags [] and no tags hash the same', () => {
    expect(wheelHash([{ label: 'A', weight: 1, enabled: true, tags: [] }])).toBe(wheelHash([{ label: 'A', weight: 1, enabled: true }]));
  });
});
