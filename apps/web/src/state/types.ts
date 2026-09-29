import type {
  DrawSession,
  Entry,
  HistoryRecord,
  ImageAsset,
  Pick,
  Receipt,
  Settings,
  TeamsResult,
  VerifyReport,
  Wheel,
} from "@whirlpick/core";
import type { StorageKind } from "../storage/storage";

export type DialogKind =
  | "winner"
  | "share"
  | "receipt"
  | "wheels"
  | "shortcuts"
  | "customise"
  | "fair"
  | "teamsFull"
  | "details"
  | "numbers"
  | "import";

export interface DialogState {
  kind: DialogKind;
  /** e.g. the history id for "receipt". */
  arg?: string;
}

export interface Toast {
  id: string;
  message: string;
  action?: { label: string; type: "undoDelete" | "undo" | "reload" | "dismiss" };
  /** ms since epoch after which it disappears; null = sticky. */
  until: number | null;
}

/** Per-wheel draw state that lives across spins (PLAN §2.7, §2.9). */
export interface WheelSession {
  /** Elimination: snapshot indices removed so far. */
  excluded: number[];
  /** Fair draw: the committed (not yet used or not yet revealed) session. */
  fair: DrawSession | null;
  /** History ids whose receipts are waiting for "Reveal seed" (commitEverySpin off). */
  unrevealed: string[];
  /** Previous team rounds (snapshot indices), for "New round". */
  teamRounds: number[][][];
}

export interface SpinPlan {
  /** Stable id for this spin (also the history id). */
  id: string;
  receipt: Receipt;
  picks: Pick[];
  /** Pick shown on the wheel for each animated segment (sequential multi = several). */
  segments: { pick: Pick; excluded: number[] }[];
  replay: boolean;
  startedAt: number;
}

export interface TeamsView {
  historyId: string;
  result: TeamsResult;
  receipt: Receipt;
  names: string[];
  error: string | null;
}

export interface LastResult {
  historyId: string;
  receipt: Receipt;
  picks: Pick[];
  replay: boolean;
  verify?: VerifyReport | null;
}

export type ThemePref = "system" | "light" | "dark";

export interface Prefs {
  muted: boolean;
  reducedMotion: "system" | "on" | "off";
  scheme: ThemePref;
  lastWheelId: string | null;
}

export interface WheelMeta {
  createdAt: string;
  updatedAt: string;
  /** False for a wheel opened from a link/preset that hasn't been saved to "My wheels". */
  saved: boolean;
  /** Where an unsaved wheel came from: links need an explicit save, presets save on first edit. */
  source?: "link" | "preset";
}

export interface Snapshot {
  wheels: Wheel[];
  meta: Record<string, WheelMeta>;
  activeId: string;
  sessions: Record<string, WheelSession>;
  label: string;
}

export type Surface = "app" | "embed" | "stream";

export interface AppState {
  ready: boolean;
  surface: Surface;
  wheels: Wheel[];
  meta: Record<string, WheelMeta>;
  activeId: string;
  images: Record<string, ImageAsset>;
  history: Record<string, HistoryRecord[]>;
  sessions: Record<string, WheelSession>;
  spin: { phase: "idle" } | { phase: "spinning"; plan: SpinPlan; segment: number } | { phase: "paused"; plan: SpinPlan; segment: number };
  last: LastResult | null;
  teams: TeamsView | null;
  ui: {
    dialog: DialogState | null;
    editorHidden: boolean;
    presenter: boolean;
    panel: "entries" | "results" | "teams";
    sheetOpen: boolean;
    toasts: Toast[];
    announce: string;
    /** Increments on each announcement so identical texts are re-announced. */
    announceSeq: number;
    streamCaption: string | null;
  };
  undo: { past: Snapshot[]; future: Snapshot[]; coalesce: string | null; coalesceAt: number };
  prefs: Prefs;
  storage: StorageKind;
  /** Wheels deleted in the last few seconds, restorable via the toast. */
  trash: { wheel: Wheel; meta: WheelMeta; history: HistoryRecord[]; index: number } | null;
  /** Spins completed in this browser session (support ask after the third). */
  sessionSpins: number;
  supportShownThisSession: boolean;
  /** Replay banner: set when the wheel came from a #spin= link. */
  replay: { receipt: Receipt; status: VerifyReport | null } | null;
}

export type SettingsPatch = Partial<Omit<Settings, "multi" | "teams" | "centre">> & {
  multi?: Partial<Settings["multi"]>;
  teams?: Partial<Settings["teams"]>;
  centre?: Partial<Settings["centre"]>;
};

export type Action =
  | {
      type: "boot";
      wheels: Wheel[];
      meta: Record<string, WheelMeta>;
      activeId: string;
      images: Record<string, ImageAsset>;
      history: Record<string, HistoryRecord[]>;
      sessions: Record<string, WheelSession>;
      prefs: Prefs;
      storage: StorageKind;
      sessionSpins: number;
      supportShownThisSession: boolean;
      replay?: AppState["replay"];
    }
  | { type: "entries/set"; entries: Entry[]; undo?: string; coalesce?: string; now: number }
  | { type: "entries/patch"; id: string; patch: Partial<Entry>; undo?: string; now: number }
  | { type: "settings/patch"; patch: SettingsPatch; undo?: string; now: number }
  | { type: "wheel/rename"; name: string; now: number }
  | { type: "wheels/add"; wheel: Wheel; meta: WheelMeta; activate: boolean }
  | { type: "wheels/open"; id: string }
  | { type: "wheels/delete"; id: string; fallback: Wheel | null; now: number }
  | { type: "wheels/restore" }
  | { type: "wheels/dropTrash" }
  | { type: "wheels/markSaved"; id: string; now: number }
  | { type: "images/put"; id: string; image: ImageAsset }
  | { type: "spin/start"; plan: SpinPlan }
  | { type: "spin/segment"; segment: number }
  | { type: "spin/pause"; segment: number }
  | { type: "spin/resume"; segment: number }
  | { type: "spin/end"; record: HistoryRecord; announce: string; streamCaption: string | null; now: number }
  | { type: "spin/abort" }
  | { type: "elim/exclude"; wheelId: string; index: number }
  | { type: "elim/reset"; wheelId: string }
  | { type: "entry/disable"; index: number; now: number }
  | { type: "fair/set"; wheelId: string; fair: DrawSession | null }
  | { type: "fair/publicInput"; wheelId: string; value: string | null }
  | { type: "fair/unrevealed"; wheelId: string; ids: string[] }
  | { type: "history/replace"; wheelId: string; records: HistoryRecord[] }
  | { type: "history/clear"; wheelId: string }
  | { type: "teams/set"; view: TeamsView | null; announce?: string }
  | { type: "teams/rename"; index: number; name: string }
  | { type: "teams/round"; wheelId: string; round: number[][] }
  | { type: "teams/resetRounds"; wheelId: string }
  | { type: "ui/dialog"; dialog: DialogState | null }
  | { type: "ui/editorHidden"; value: boolean }
  | { type: "ui/presenter"; value: boolean }
  | { type: "ui/panel"; panel: AppState["ui"]["panel"] }
  | { type: "ui/sheet"; open: boolean }
  | { type: "ui/announce"; text: string }
  | { type: "ui/streamCaption"; text: string | null }
  | { type: "toast/show"; toast: Toast }
  | { type: "toast/dismiss"; id: string }
  | { type: "prefs/set"; patch: Partial<Prefs> }
  | { type: "storage/kind"; kind: StorageKind }
  | { type: "surface/set"; surface: Surface }
  | { type: "replay/status"; status: VerifyReport | null }
  | { type: "replay/clear" }
  | { type: "support/shown" }
  | { type: "undo" }
  | { type: "redo" };
