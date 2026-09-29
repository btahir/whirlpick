// Wheel theme tokens (SPEC §3). A theme = a slice palette (from brand/palettes.json) plus the
// hardware colours of the current scheme (rim, spokes, hub, brass, the pick).
import palettesJson from "./palettes.json";

export interface PaletteColour {
  name?: string;
  fill: string;
  label: string;
}

export interface WheelTheme {
  id: string;
  scheme: "light" | "dark";
  palette: PaletteColour[];
  /** Label colours for custom fills: whichever contrasts more. */
  ink: string;
  cream: string;
  rim: string;
  sep: string;
  hub: string;
  brass: string;
  brassHi: string;
  brassLo: string;
  accent: string;
  /** Empty-wheel face and ghost spokes. */
  sunk: string;
  rule: string;
  /** Page ground (readout text). */
  ground: string;
  /** Veil over losing slices. */
  veil: string;
  veilOpacity: number;
  vignette: number;
  shadowOpacity: number;
  /** Stream mode: no shadow, no vignette. */
  flat: boolean;
  labelFamily: string;
}

export const LABEL_FAMILY = `"Bricolage Grotesque Variable", ui-sans-serif, system-ui, "Noto Sans", sans-serif`;
export const MONO_FAMILY = `"Martian Mono Variable", ui-monospace, "SF Mono", Menlo, monospace`;

type PaletteFile = { palettes: Record<string, PaletteColour[]> };
export const PALETTES = (palettesJson as PaletteFile).palettes;

export interface ThemeInfo {
  id: string;
  name: string;
  /** Palette id per scheme. */
  day: string;
  night: string;
  note: string;
}

export const THEMES: ThemeInfo[] = [
  { id: "enamel", name: "Enamel", day: "enamel-day", night: "enamel-night", note: "Default. Follows light and dark." },
  { id: "sherbet", name: "Sherbet", day: "sherbet", night: "sherbet", note: "Soft pastels with ink labels." },
  { id: "harbour", name: "Harbour", day: "harbour", night: "harbour", note: "Blues, teals and sand." },
  { id: "broadcast", name: "Broadcast", day: "broadcast", night: "broadcast", note: "No greens: safe on a green screen." },
  { id: "mono-ink", name: "Ink", day: "mono-ink", night: "mono-ink", note: "Ink, paper and tomato." },
];

export const DEFAULT_THEME_ID = "enamel";

export function themeInfo(id: string): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

const DAY = {
  ink: "#1F1915",
  cream: "#FFF8EC",
  rim: "#1F1915",
  sep: "#FBF7F0",
  hub: "#FBF7F0",
  brass: "#B8913F",
  brassHi: "#EED79A",
  brassLo: "#6E5220",
  accent: "#C2361F",
  sunk: "#EDE3D3",
  rule: "#DCCFBC",
  ground: "#F4ECDF",
  veilOpacity: 0.5,
  vignette: 0.14,
  shadowOpacity: 0.16,
};

const NIGHT = {
  ink: "#140F0C",
  cream: "#FFF3E2",
  rim: "#0A0706",
  sep: "#1F1814",
  hub: "#F4EADB",
  brass: "#C9A24A",
  brassHi: "#F3DDA0",
  brassLo: "#6E5220",
  accent: "#E4553A",
  sunk: "#110D0A",
  rule: "#352A23",
  ground: "#16110E",
  veilOpacity: 0.62,
  vignette: 0.28,
  shadowOpacity: 0.45,
};

export function wheelTheme(id: string, scheme: "light" | "dark", opts: { flat?: boolean; forcePalette?: string } = {}): WheelTheme {
  const info = themeInfo(id);
  const hw = scheme === "dark" ? NIGHT : DAY;
  const paletteId = opts.forcePalette ?? (scheme === "dark" ? info.night : info.day);
  const palette = PALETTES[paletteId] ?? PALETTES["enamel-day"]!;
  return {
    id: info.id,
    scheme,
    palette,
    ...hw,
    veil: "#0B0807",
    flat: !!opts.flat,
    labelFamily: LABEL_FAMILY,
  };
}

/** Palette fills for confetti and editor chips. */
export function paletteFills(t: WheelTheme): string[] {
  return t.palette.map((p) => p.fill);
}
