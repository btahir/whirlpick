// Deep links (PLAN §4.3, §4.4). Fragments carry data (#w=, #names=, #spin=, #r=) and are never
// sent to a server; query parameters carry only options, never personal data.
import type { SettingsPatch } from "../state/types";

export type HashIntent =
  | { kind: "w"; code: string }
  | { kind: "names"; labels: string[] }
  | { kind: "spin"; code: string }
  | { kind: "r"; code: string }
  | null;

export interface QueryOptions {
  preset?: string;
  presetParams?: Record<string, string>;
  patch: SettingsPatch;
  stream: boolean;
  embed: boolean;
  presenter: boolean;
  autoplay: boolean;
  origin: string | null;
  /** Test/automation: fixed seed is never a query option; custom seeds go through the UI. */
}

export interface LinkIntent {
  hash: HashIntent;
  query: QueryOptions;
}

/** Split "a=1&b=2" without URLSearchParams' "+" → space rule (base64url codes contain no "+"). */
export function parsePairs(s: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of s.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = i < 0 ? part : part.slice(0, i);
    const v = i < 0 ? "" : part.slice(i + 1);
    if (!out.has(k)) out.set(k, v);
  }
  return out;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

const MODES = new Set(["normal", "elimination", "multi", "teams"]);
const HEX6 = /^[0-9a-fA-F]{6}$/;

function num(v: string | null | undefined, min: number, max: number): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

export function parseHash(hash: string): { intent: HashIntent; origin: string | null } {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const p = parsePairs(h);
  const origin = p.has("origin") ? safeDecode(p.get("origin")!) : null;
  let intent: HashIntent = null;
  if (p.get("w")) intent = { kind: "w", code: p.get("w")! };
  else if (p.get("spin")) intent = { kind: "spin", code: p.get("spin")! };
  else if (p.get("r")) intent = { kind: "r", code: p.get("r")! };
  else if (p.has("names")) {
    const labels = safeDecode(p.get("names")!)
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    intent = { kind: "names", labels };
  }
  return { intent, origin };
}

export function parseQuery(search: string): QueryOptions {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const patch: SettingsPatch = {};
  const mode = q.get("mode");
  if (mode && MODES.has(mode)) patch.mode = mode as SettingsPatch["mode"];
  const count = q.get("count");
  if (count === "all") patch.multi = { count: "all" };
  else {
    const c = num(count, 1, 1000);
    if (c !== undefined) patch.multi = { count: Math.round(c) };
  }
  if (patch.multi && !patch.mode) patch.mode = "multi";
  const reveal = q.get("reveal");
  if (reveal === "instant" || reveal === "sequential") patch.multi = { ...patch.multi, reveal };
  const teams = num(q.get("teams"), 2, 1000);
  const size = num(q.get("size"), 1, 1000);
  if (teams !== undefined) {
    patch.teams = { by: "count", count: Math.round(teams) };
    patch.mode = "teams";
  } else if (size !== undefined) {
    patch.teams = { by: "size", size: Math.round(size) };
    patch.mode = "teams";
  }
  const duration = num(q.get("duration"), 1, 30);
  if (duration !== undefined) patch.spinDuration = Math.round(duration * 2) / 2;
  const theme = q.get("theme");
  if (theme && /^[a-z0-9-]{1,32}$/.test(theme)) patch.theme = theme;
  if (q.get("fair") === "1") patch.fairDraw = true;
  if (q.get("mystery") === "1") patch.mysteryMode = true;
  const bg = q.get("bg");
  if (bg === "transparent") patch.background = "transparent";
  else if (bg && HEX6.test(bg.replace(/^#/, ""))) patch.background = `#${bg.replace(/^#/, "").toUpperCase()}`;
  const stream = q.get("stream") === "1";
  const embed = q.get("embed") === "1";
  const presetParams: Record<string, string> = {};
  for (const k of ["min", "max"]) {
    const v = q.get(k);
    if (v != null && /^-?\d{1,7}$/.test(v)) presetParams[k] = v;
  }
  const preset = q.get("preset") ?? undefined;
  const origin = q.get("origin");
  return {
    preset: preset && /^[a-z0-9-]{1,40}$/.test(preset) ? preset : undefined,
    presetParams: Object.keys(presetParams).length ? presetParams : undefined,
    patch,
    stream,
    embed,
    presenter: q.get("presenter") === "1",
    autoplay: q.get("autoplay") === "1",
    origin: origin ? origin : null,
  };
}

export function parseLocation(loc: { hash: string; search: string }): LinkIntent {
  const { intent, origin } = parseHash(loc.hash);
  const query = parseQuery(loc.search);
  if (origin && !query.origin) query.origin = origin;
  // "#…&autoplay=1" is accepted as well as "?autoplay=1".
  if (!query.autoplay && /(^|[#&])autoplay=1(&|$)/.test(loc.hash)) query.autoplay = true;
  return { hash: intent, query };
}

/** A plain names link (#names=…) for hand-typing by people or agents. */
export function namesFragment(labels: string[]): string {
  return `#names=${encodeURIComponent(labels.join("\n"))}`;
}

export const LINK_WARN_BYTES = 8 * 1024;
export const LINK_MAX_BYTES = 64 * 1024;
export const QR_MAX_URL = 1800;
