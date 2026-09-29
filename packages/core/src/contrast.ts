// WCAG 2.x contrast ratio between two #RRGGBB colours.
import { WhirlError } from './errors.js';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new WhirlError('COLOR_INVALID', `Not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Whichever candidate gives the higher contrast with `fill`. */
export function bestTextColor(fill: string, candidates: readonly string[]): string {
  let best = candidates[0]!;
  let bestRatio = -1;
  for (const c of candidates) {
    const r = contrastRatio(fill, c);
    if (r > bestRatio) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
}
