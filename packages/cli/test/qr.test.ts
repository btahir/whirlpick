// F6 (QR half): the QR SVG for a 1 800-character share URL decodes back to the same URL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import decodeQR from 'qr/decode.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run, workdir } from './helpers.js';

let dir: string;
let cleanup: () => void;
beforeAll(() => ({ dir, cleanup } = workdir()));
afterAll(() => cleanup());

/** Rasterise qr's SVG (1×1 module squares placed with M/m moves) to an RGBA image. */
function rasterise(svg: string, scale = 6) {
  const [, w] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;
  const size = Number(w);
  const px = size * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  const d = /<path d="([^"]+)"/.exec(svg)![1]!;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  for (const [, cmd, args] of d.matchAll(/([MmHhVvZz])([^MmHhVvZz]*)/g)) {
    const n = args!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'M' || cmd === 'm') {
      x = cmd === 'M' ? n[0]! : x + n[0]!;
      y = cmd === 'M' ? n[1]! : y + n[1]!;
      sx = x;
      sy = y;
      for (let yy = y * scale; yy < (y + 1) * scale; yy++) for (let xx = x * scale; xx < (x + 1) * scale; xx++) data.fill(0, (yy * px + xx) * 4, (yy * px + xx) * 4 + 3);
    } else if (cmd === 'Z' || cmd === 'z') {
      x = sx;
      y = sy;
    }
  }
  return { width: px, height: px, data };
}

describe('qr', () => {
  it('an 1 800-character URL: QR offered, SVG decodes to the URL; 1 801+ → no QR', async () => {
    const labels: string[] = [];
    let url = '';
    let doc: { url: string; length: number; qrAvailable: boolean } = { url: '', length: 0, qrAvailable: false };
    // Grow the wheel until the link is as close to 1 800 characters as possible without passing it.
    for (let i = 0; i < 400; i++) {
      labels.push(`Guest ${String(i).padStart(3, '0')} ${'abcdefghij'[i % 10]}${'klmnopqrst'[(i * 7) % 10]}`);
      const r = await run(['link', '--entries', labels.join(','), '--qr-svg', `q${i}.svg`, '--json'], { cwd: dir });
      const d = JSON.parse(r.stdout);
      if (d.length > 1800) {
        expect(d.qrAvailable).toBe(false);
        expect(d.warnings.some((w: string) => w.startsWith('QR_UNAVAILABLE'))).toBe(true);
        break;
      }
      doc = d;
      url = d.url;
    }
    expect(doc.length).toBeGreaterThan(1650);
    expect(doc.length).toBeLessThanOrEqual(1800);
    expect(doc.qrAvailable).toBe(true);
    const i = labels.length - 2;
    const svg = readFileSync(join(dir, `q${i}.svg`), 'utf8');
    expect(decodeQR(rasterise(svg))).toBe(url);
  });
});
