// F5–F6: share codec and link sizes (PLAN §4.3).
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { base64urlDecode, base64urlEncode, buildReceipt, createProject, createWheel, decodeReceiptCode, decodeShare, encodeJsonCode, encodeReceiptCode, encodeShare, extractCode, linkInfo, namesUrl, normaliseEntries, parseNamesFragment, receiptFromText, shareUrl, SITE_URL, utf8, verifyReceipt, type WhirlProject } from '../src/index.js';
import { deflateRaw } from '../src/share.js';
import { FIXED_NOW, fixtureSeed, mulberry32 } from './helpers.js';
import { projectArb } from './project-arb.js';

/** What a share link should carry: the active wheel only, without images, image refs or history. */
function expectedShare(p: WhirlProject): WhirlProject {
  const w = structuredClone(p.wheels.find((x) => x.id === p.activeWheelId)!);
  for (const e of w.entries) delete e.imageRef;
  w.settings.centre.imageRef = null;
  const { $schema: _s, ...rest } = p;
  return { ...rest, wheels: [w], images: {}, history: [] };
}

const realCS = globalThis.CompressionStream;
afterEach(() => {
  globalThis.CompressionStream = realCS;
});

describe('share', () => {
  it('F5: 300 fast-check wheels round-trip through "1." links', async () => {
    await fc.assert(
      fc.asyncProperty(projectArb, async (p) => {
        const code = await encodeShare(p);
        expect(code.startsWith('1.')).toBe(true);
        expect(await decodeShare(code)).toEqual(expectedShare(p));
      }),
      { numRuns: 300, seed: 5 },
    );
  });
  it('F5: the same holds for the uncompressed "1j." fallback (CompressionStream stubbed out)', async () => {
    // @ts-expect-error: simulate an engine without CompressionStream
    globalThis.CompressionStream = undefined;
    await fc.assert(
      fc.asyncProperty(projectArb, async (p) => {
        const code = await encodeShare(p);
        expect(code.startsWith('1j.')).toBe(true);
        expect(await decodeShare(code)).toEqual(expectedShare(p));
      }),
      { numRuns: 100, seed: 6 },
    );
  });
  it('F5: receipts round-trip through encodeReceiptCode, share URLs and receiptFromText', async () => {
    for (let i = 0; i < 20; i++) {
      const r = buildReceipt({ entries: normaliseEntries(['Ada', 'Grace', 'Linus', 'Margaret']).entries, seed: fixtureSeed(i), mode: i % 2 ? 'multi' : 'single', count: i % 2 ? 2 : 1, createdAt: FIXED_NOW });
      const code = await encodeReceiptCode(r);
      expect(await decodeReceiptCode(code)).toEqual(r);
      const url = shareUrl('r', code);
      expect(url).toBe(`${SITE_URL}/verify/#r=${code}`);
      expect(extractCode(url)).toEqual({ kind: 'r', code });
      expect(await receiptFromText(url)).toEqual(r);
      expect(await receiptFromText(shareUrl('spin', code))).toEqual(r);
      expect(verifyReceipt(await receiptFromText(code)).status).toBe('valid');
    }
    expect(await receiptFromText('{"not":"a receipt"}')).toBe('{"not":"a receipt"}');
  });
  it('F5: a 3 MB decompressed payload is rejected before parsing', async () => {
    const big = utf8(JSON.stringify({ format: 'whirlpick-project', pad: ' '.repeat(3 * 1024 * 1024) }));
    const code = `1.${base64urlEncode(await deflateRaw(big))}`;
    expect(code.length).toBeLessThan(10_000);
    await expect(decodeShare(code)).rejects.toMatchObject({ code: 'LINK_PAYLOAD_TOO_LARGE' });
    await expect(decodeShare(`1j.${base64urlEncode(big)}`)).rejects.toMatchObject({ code: 'LINK_PAYLOAD_TOO_LARGE' });
  });
  it('F5: damaged links fail with LINK_INVALID; invalid projects with SCHEMA_INVALID', async () => {
    await expect(decodeShare('2.abc')).rejects.toMatchObject({ code: 'LINK_INVALID' });
    await expect(decodeShare('1.!!!')).rejects.toMatchObject({ code: 'LINK_INVALID' });
    await expect(decodeShare('1.AAAA')).rejects.toMatchObject({ code: 'LINK_INVALID' });
    await expect(decodeShare(`1j.${base64urlEncode(utf8('not json'))}`)).rejects.toMatchObject({ code: 'LINK_INVALID' });
    await expect(decodeShare(await encodeJsonCode({ format: 'nope' }))).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
  });
  it('F5: a link over 64 KiB → LINK_TOO_LONG', async () => {
    const r = mulberry32(3);
    const labels = Array.from({ length: 1000 }, () => Array.from({ length: 120 }, () => String.fromCharCode(33 + Math.floor(r() * 90))).join(''));
    const p = createProject([createWheel(normaliseEntries(labels).entries)]);
    await expect(encodeShare(p)).rejects.toMatchObject({ code: 'LINK_TOO_LONG' });
  });
  it('F6: a 1000-entry wheel with 10-character labels encodes to ≤ 16 KiB; QR only when the URL is ≤ 1 800 chars', async () => {
    // Ticket-style labels ("Guest 0001"). Random 8-char entry ids are kept in links (PLAN §4.3) and
    // are most of the payload; fully random labels come to about 16.2 KiB (logged below).
    const labels = Array.from({ length: 1000 }, (_, i) => `Guest ${String(i + 1).padStart(4, '0')}`);
    expect(labels.every((l) => l.length === 10)).toBe(true);
    const p = createProject([createWheel(normaliseEntries(labels).entries)], { now: FIXED_NOW });
    const code = await encodeShare(p);
    const url = shareUrl('w', code);
    const r = mulberry32(8);
    const syll = ['ka', 'ri', 'mo', 'la', 'ne', 'to', 'sa', 'vi', 'du', 'pe', 'lo', 'mi'];
    const randomLabels = Array.from({ length: 1000 }, () => Array.from({ length: 5 }, () => syll[Math.floor(r() * syll.length)]).join(''));
    const randomCode = await encodeShare(createProject([createWheel(normaliseEntries(randomLabels).entries)], { now: FIXED_NOW }));
    console.log(`F6 1000 × 10-char labels: ${code.length} chars (${(code.length / 1024).toFixed(1)} KiB); random syllable labels ${(randomCode.length / 1024).toFixed(1)} KiB`);
    expect(code.length).toBeLessThanOrEqual(16 * 1024);
    expect(linkInfo(url).qrAvailable).toBe(false);
    expect(linkInfo(url).warnings.map((w) => w.code)).toEqual(url.length > 8192 ? ['LINK_LONG'] : []);
    const small = shareUrl('w', await encodeShare(createProject([createWheel(normaliseEntries(['Ada', 'Grace']).entries)])));
    expect(small.length).toBeLessThanOrEqual(1800);
    expect(linkInfo(small).qrAvailable).toBe(true);
    expect(linkInfo('x'.repeat(1800)).qrAvailable).toBe(true);
    expect(linkInfo('x'.repeat(1801)).qrAvailable).toBe(false);
  });
  it('names links and base64url', () => {
    const u = namesUrl(['Ada', 'Grace Hopper', 'Ünal & co']);
    expect(u).toBe(`${SITE_URL}/#names=Ada%0AGrace%20Hopper%0A%C3%9Cnal%20%26%20co`);
    expect(parseNamesFragment(u.split('#names=')[1]!)).toEqual(['Ada', 'Grace Hopper', 'Ünal & co']);
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (b) => {
        expect(base64urlDecode(base64urlEncode(b))).toEqual(b);
      }),
    );
  });
});
