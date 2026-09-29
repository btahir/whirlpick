// Pure scene building (PLAN §6.5, SPEC §3.4, §6): wheel + settings + theme tokens → everything the
// renderer needs, with no DOM access. Unit-tested in test/unit/scene.test.ts.
import { contrastRatio, DESIGN_POINTER_TURN, slicesFor, type Entry, type Settings, type Slice } from "@whirlpick/core";
import type { PaletteColour, WheelTheme } from "./theme";

export interface SceneSlice {
  /** Snapshot index of the entry. */
  index: number;
  /** Position among eligible slices. */
  pos: number;
  label: string;
  fill: string;
  textFill: string;
  /** Contrast between textFill and fill. */
  contrast: number;
  /** Draw the label with a halo (image slices; custom mid-tone colours below 4.5:1). */
  halo: string | null;
  imageRef?: string;
  start: number;
  end: number;
}

export interface WheelScene {
  slices: SceneSlice[];
  /** Geometry slices from core (for pointer, ticks and landing maths). */
  geometry: Slice[];
  /** Labels drawn at all (≤ 200 entries and not mystery). */
  labels: boolean;
  mystery: boolean;
  empty: boolean;
  fontScale: number;
  centre: { text: string | null; imageRef: string | null };
  pointerTurn: number;
  theme: WheelTheme;
  /** Colour band size (SPEC §3.4 step 3). */
  band: number;
  /** Stable key for caching the static layers. */
  key: string;
}

/** Core frame: the pick is at 0; the renderer adds the 3 o'clock screen offset. */
export const POINTER_TURN = DESIGN_POINTER_TURN;
export const LABEL_LIMIT = 200;
export const MIN_BAND_PX = 4;
/** Face radius as a fraction of R (SPEC §6.1: RIM = 0.052 R). */
export const FACE = 1 - 0.052;

/** The better of ink or cream on `fill`, plus whether it needs a halo (SPEC §3.4 step 4). */
export function labelFor(fill: string, theme: Pick<WheelTheme, "ink" | "cream">): { color: string; contrast: number; halo: string | null } {
  const a = contrastRatio(theme.cream, fill);
  const b = contrastRatio(theme.ink, fill);
  const color = a >= b ? theme.cream : theme.ink;
  const contrast = Math.max(a, b);
  return { color, contrast, halo: contrast < 4.5 ? (color === theme.cream ? theme.ink : theme.cream) : null };
}

export function paletteOf(settingsPalette: string[] | null, theme: WheelTheme): PaletteColour[] {
  if (settingsPalette && settingsPalette.length >= 2) {
    return settingsPalette.map((fill) => ({ fill, label: labelFor(fill, theme).color }));
  }
  return theme.palette;
}

/**
 * Colour band size: 1 unless the smallest slice's arc at the face edge is under 4 CSS px, then
 * consecutive entries share a colour so every visible band is at least 4 px.
 */
export function bandFor(geometry: Slice[], radiusPx: number): number {
  if (geometry.length < 2 || radiusPx <= 0) return 1;
  const face = radiusPx * FACE;
  let min = Infinity;
  for (const g of geometry) min = Math.min(min, (g.end - g.start) * Math.PI * 2 * face);
  return min < MIN_BAND_PX ? Math.ceil(MIN_BAND_PX / Math.max(min, 1e-6)) : 1;
}

/** Palette index per eligible position (SPEC §3.4 steps 1–3, including the wrap fix). */
export function paletteIndices(n: number, band: number, paletteLength: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(i / band) % paletteLength);
  const bands = Math.ceil(n / band);
  if (bands > 2 && bands % paletteLength === 1 && paletteLength > 7) {
    for (let i = (bands - 1) * band; i < n; i++) out[i] = 7;
  } else if (bands > 2 && bands % paletteLength === 1 && paletteLength > 2) {
    // Short palettes (mono-ink): use the colour from the opposite side of the cycle.
    const alt = Math.floor(paletteLength / 2);
    for (let i = (bands - 1) * band; i < n; i++) out[i] = alt;
  }
  return out;
}

export interface BuildSceneInput {
  entries: Entry[];
  settings: Pick<Settings, "palette" | "mysteryMode" | "fontScale" | "centre">;
  theme: WheelTheme;
  excluded?: number[];
  /** R in CSS px (for colour banding). */
  radiusPx: number;
  /** Mystery labels come back after the reveal. */
  revealed?: boolean;
  pointerTurn?: number;
}

export function buildScene(i: BuildSceneInput): WheelScene {
  const geometry = slicesFor(i.entries, i.excluded ?? []);
  const palette = paletteOf(i.settings.palette, i.theme);
  const band = bandFor(geometry, i.radiusPx);
  const idx = paletteIndices(geometry.length, band, palette.length);
  const slices: SceneSlice[] = geometry.map((g, pos) => {
    const e = i.entries[g.index]!;
    let fill: string;
    let textFill: string;
    let contrast: number;
    let halo: string | null = null;
    if (e.color) {
      fill = e.color;
      const l = labelFor(fill, i.theme);
      textFill = l.color;
      contrast = l.contrast;
      halo = l.halo;
    } else {
      const p = palette[idx[pos]!]!;
      fill = p.fill;
      textFill = p.label;
      contrast = contrastRatio(textFill, fill);
    }
    if (e.imageRef) halo = fill;
    const s: SceneSlice = { index: g.index, pos, label: e.label, fill, textFill, contrast, halo, start: g.start, end: g.end };
    if (e.imageRef) s.imageRef = e.imageRef;
    return s;
  });
  const mystery = i.settings.mysteryMode && !i.revealed;
  const pointerTurn = i.pointerTurn ?? POINTER_TURN;
  const key = [
    i.theme.id,
    i.theme.scheme,
    i.theme.flat ? "f" : "",
    i.settings.fontScale,
    mystery ? "m" : "",
    band,
    i.settings.centre.text ?? "",
    i.settings.centre.imageRef ?? "",
    slices.map((s) => `${s.index}:${s.label}:${s.fill}:${s.imageRef ?? ""}:${s.start.toFixed(7)}`).join("|"),
  ].join("#");
  return {
    slices,
    geometry,
    labels: slices.length <= LABEL_LIMIT && !mystery,
    mystery,
    empty: slices.length === 0,
    fontScale: i.settings.fontScale,
    centre: { text: i.settings.centre.text, imageRef: i.settings.centre.imageRef },
    pointerTurn,
    theme: i.theme,
    band,
    key: hashKey(key),
  };
}

/** FNV-1a over the key string; keeps the cache key short. */
export function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}-${s.length}`;
}

/** Slice position under the pointer for rotation r (binary search), or -1 on an empty wheel. */
export function posUnderPointer(scene: Pick<WheelScene, "slices" | "pointerTurn">, r: number): number {
  const s = scene.slices;
  if (!s.length) return -1;
  const x = scene.pointerTurn - r;
  const local = x - Math.floor(x);
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid]!.start <= local) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
