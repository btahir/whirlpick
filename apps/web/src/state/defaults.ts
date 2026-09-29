import { defaultSettings as coreDefaults, presetById, presetProject, type Preset, type Settings, type Wheel } from "@whirlpick/core";
import { DEFAULT_THEME_ID, THEMES } from "../wheel/theme";
import type { AppState, Prefs, WheelSession } from "./types";

/** Core defaults (the same values validateProject fills), with the web's theme id. */
export function defaultSettings(): Settings {
  return { ...coreDefaults(), theme: DEFAULT_THEME_ID };
}

/** Unknown theme ids (e.g. core's "carnival" default) fall back to the design default. */
export function normaliseTheme(s: Settings): Settings {
  return THEMES.some((t) => t.id === s.theme) ? s : { ...s, theme: DEFAULT_THEME_ID };
}

export function emptySession(): WheelSession {
  return { excluded: [], fair: null, unrevealed: [], teamRounds: [] };
}

export function defaultPrefs(): Prefs {
  return { muted: false, reducedMotion: "system", scheme: "system", lastWheelId: null };
}

/** A wheel built from a preset with core's stable ids, so SSR and hydration agree byte for byte. */
export function wheelFromPreset(p: Preset): Wheel {
  const w = presetProject(p, { now: "2026-01-01T00:00:00.000Z" }).wheels[0]!;
  return { ...w, settings: normaliseTheme(w.settings) };
}

export function presetWheel(id: string, params?: Record<string, string>): Wheel | null {
  try {
    const p = presetById(id, params);
    return p ? wheelFromPreset(p) : null;
  } catch {
    return null;
  }
}

export function initialState(wheel: Wheel, surface: AppState["surface"] = "app"): AppState {
  const epoch = "1970-01-01T00:00:00.000Z";
  return {
    ready: false,
    surface,
    wheels: [wheel],
    meta: { [wheel.id]: { createdAt: epoch, updatedAt: epoch, saved: false } },
    activeId: wheel.id,
    images: {},
    history: {},
    sessions: { [wheel.id]: emptySession() },
    spin: { phase: "idle" },
    last: null,
    teams: null,
    ui: {
      dialog: null,
      editorHidden: false,
      presenter: false,
      panel: wheel.settings.mode === "teams" ? "teams" : "entries",
      sheetOpen: false,
      toasts: [],
      announce: "",
      announceSeq: 0,
      streamCaption: null,
    },
    undo: { past: [], future: [], coalesce: null, coalesceAt: 0 },
    prefs: defaultPrefs(),
    storage: "memory",
    trash: null,
    sessionSpins: 0,
    supportShownThisSession: false,
    replay: null,
  };
}
