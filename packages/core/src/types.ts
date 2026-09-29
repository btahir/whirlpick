// Shared types for @whirlpick/core (PLAN §3.1, §4.1, §12). This file is the A ↔ B contract:
// changing a shape here needs a line in notes/fix-coordination.md first.

/** An entry as agents, parsers and the embed API supply it. A bare string is a label with defaults. */
export type EntryIn = string | { label: string; weight?: number; enabled?: boolean; tags?: string[]; color?: string; imageRef?: string; id?: string };

/** A normalised wheel entry (§2.1). `weight` is a JSON number with ≤ 3 decimals, 0.001–1e6. */
export interface Entry {
  id: string;
  label: string;
  weight: number;
  enabled: boolean;
  color?: string;
  imageRef?: string;
  tags?: string[];
}

/** The fields that the wheel hash covers (§2.2). */
export type HashedEntry = { label: string; weight: number; enabled: boolean; tags?: string[] | undefined };

export type WheelMode = 'normal' | 'elimination' | 'multi' | 'teams';

export interface TeamSettings {
  by: 'count' | 'size';
  count: number;
  size: number;
  balance: boolean;
  /** Entry ids. */
  keepApart: string[][];
  /** Entry ids. */
  keepTogether: string[][];
}

export interface Settings {
  /** Shown above the wheel; ≤ 80 chars. Empty string = no title. */
  title: string;
  mode: WheelMode;
  /** Seconds, 1–30, step 0.5. */
  spinDuration: number;
  multi: { count: number | 'all'; reveal: 'sequential' | 'instant' };
  teams: TeamSettings;
  sound: boolean;
  /** 0–1. */
  volume: number;
  theme: string;
  /** null = theme palette, else 2–24 #RRGGBB colours. */
  palette: string[] | null;
  confetti: boolean;
  mysteryMode: boolean;
  centre: { text: string | null; imageRef: string | null };
  /** 0.75–1.5. */
  fontScale: number;
  /** null = theme, "transparent", or "#RRGGBB". */
  background: string | null;
  fairDraw: boolean;
  commitEverySpin: boolean;
  showChances: boolean;
}

export interface Wheel {
  id: string;
  name: string;
  entries: Entry[];
  settings: Settings;
}

export interface ImageAsset {
  dataUrl: string;
  width: number;
  height: number;
}

export interface HistoryRecord {
  id: string;
  wheelId: string;
  createdAt: string;
  receipt: Receipt;
  teamNames: string[] | null;
}

/** A validated `whirl-v1` project (§4.1). After `validateProject`, every field is present. */
export interface WhirlProject {
  $schema?: string;
  format: 'whirlpick-project';
  version: 1;
  generator: string;
  createdAt: string;
  updatedAt: string;
  activeWheelId: string;
  layout: null;
  wheels: Wheel[];
  images: Record<string, ImageAsset>;
  history: HistoryRecord[];
}

export type Mode = 'single' | 'multi' | 'elimination' | 'teams';

export interface Pick {
  index: number;
  label: string;
  landingU32: number;
}

export interface ReceiptEntry {
  label: string;
  weight: number;
  enabled: boolean;
  /** Omitted when empty. */
  tags?: string[];
}

/** Receipt params. Pick modes carry `count` + `excluded`; teams carry the team fields. */
export interface ReceiptParams {
  count?: number | 'all';
  excluded?: number[];
  teamCount?: number | null;
  teamSize?: number | null;
  balance?: boolean;
  keepApart?: number[][];
  keepTogether?: number[][];
  previousRounds?: number[][][];
  iterations?: number;
}

export interface ReceiptResult {
  picks?: Pick[];
  teams?: number[][];
  repeatPairs?: number;
}

/** `receipt-v1` (§3.1). */
export interface Receipt {
  $schema?: string;
  format: 'whirlpick-receipt';
  version: 1;
  algorithm: 'whirlpick-draw-v1';
  title: string | null;
  entries: ReceiptEntry[];
  wheelHash: string;
  committedWheelHash: string | null;
  seed: string | null;
  seedPhrase: string | null;
  commitment: string;
  publicInput: string | null;
  spinIndex: number;
  mode: Mode;
  params: ReceiptParams;
  result: ReceiptResult;
  beacon: null;
  createdAt: string;
  committedAt: string | null;
  app: string;
}

export interface DrawSession {
  seed: string;
  commitment: string;
  committedWheelHash: string | null;
  committedAt: string | null;
  publicInput: string | null;
  nextSpinIndex: number;
  excluded: number[];
}

export interface Warning {
  code: string;
  message: string;
  line?: number;
  path?: string;
  details?: unknown;
}

/** An eligible slice on the wheel (§2.10). `index` = snapshot index, `pos` = position among eligible. */
export interface Slice {
  index: number;
  pos: number;
  label: string;
  /** Milli-weight. */
  milliWeight: number;
  /** Turns, [start, end). */
  start: number;
  end: number;
}

export interface TeamsBalance {
  byTag: Record<string, number[]>;
  withinOne: boolean;
}

export interface TeamsResult {
  /** Team t = its members' snapshot indices, ascending. */
  teams: number[][];
  sizes: number[];
  balance: TeamsBalance;
  /** Number of distinct same-team pairs that also shared a team in a previous round. */
  repeatPairs: number;
  /** Σ over same-team pairs of how many previous rounds they shared. */
  cost: number;
  warnings: Warning[];
  /** The seeded Fisher–Yates order P (snapshot indices). */
  order: number[];
  wheelHash: string;
  teamCount: number;
}

export interface VerifyCheck {
  id: string;
  ok: boolean;
  code?: string;
  detail: string;
}

export interface VerifyReport {
  ok: boolean;
  status: 'valid' | 'invalid' | 'unrevealed';
  checks: VerifyCheck[];
  warnings: string[];
  recomputed: {
    wheelHash?: string;
    commitment?: string;
    picks?: Pick[];
    teams?: number[][];
    repeatPairs?: number;
  };
}

export interface ValidationIssue {
  /** JSON pointer, e.g. "/wheels/0/entries/3/weight". */
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  project?: WhirlProject;
}

export interface Preset {
  id: string;
  title: string;
  /** Landing page slug without slashes, when the preset backs one. */
  slug?: string;
  entries: EntryIn[];
  settings: Partial<Omit<Settings, 'multi' | 'teams'>> & { multi?: Partial<Settings['multi']>; teams?: Partial<TeamSettings> };
  /** Truth-or-dare: prompts shown after the spin, keyed by the winning label. */
  prompts?: Record<string, string[]>;
}
