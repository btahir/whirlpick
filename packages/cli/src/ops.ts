// Operations shared by the CLI and the MCP server, so both give byte-identical receipts.
import encodeQR from 'qr';
import {
  APP_VERSION,
  buildReceipt,
  commitmentFor,
  encodeReceiptCode,
  encodeShare,
  generateSeed,
  isHex64,
  linkInfo,
  normaliseSeed,
  PRESETS,
  presetById,
  presetProject,
  receiptFromText,
  shareUrl,
  SITE_URL,
  splitTeams,
  validateProject,
  verifyReceipt,
  WhirlError,
  type Entry,
  type Receipt,
  type Settings,
  type VerifyReport,
  type WhirlProject,
} from '@whirlpick/core';
import { UsageError } from './errors.js';
import type { Resolved } from './sources.js';

export type Surface = 'cli' | 'mcp';
export const appId = (s: Surface) => `whirlpick-${s}/${APP_VERSION}`;

/** `WHIRLPICK_FIXED_NOW` pins timestamps (for tests only). */
export function nowIso(env: Record<string, string | undefined>): string {
  const f = env.WHIRLPICK_FIXED_NOW;
  if (f) {
    if (Number.isNaN(Date.parse(f))) throw new UsageError('WHIRLPICK_FIXED_NOW must be an ISO date-time.');
    return new Date(f).toISOString();
  }
  return new Date().toISOString();
}

export interface SeedOpts {
  seed?: string | undefined;
  seedPhrase?: string | undefined;
  /** Parsed `commit --out` file: {seed, commitment, createdAt}. */
  seedFile?: unknown;
  publicInput?: string | null | undefined;
  spinIndex?: number | undefined;
}

interface ResolvedSeed {
  seed?: string;
  seedPhrase?: string;
  committedAt: string | null;
  warnings: string[];
}

export function resolveSeed(o: SeedOpts): ResolvedSeed {
  const given = [o.seed !== undefined, o.seedPhrase !== undefined, o.seedFile !== undefined].filter(Boolean).length;
  if (given > 1) throw new UsageError('Give only one of seed, seed phrase or seed file.');
  if (o.seed !== undefined) return { seed: normaliseSeed(o.seed), committedAt: null, warnings: [] };
  if (o.seedPhrase !== undefined) {
    if (o.seedPhrase === '') throw new WhirlError('SEED_INVALID', 'The seed phrase is empty.');
    return { seedPhrase: o.seedPhrase, committedAt: null, warnings: ['SEED_PHRASE_GUESSABLE: Seed phrases can be guessed; use a random seed (the default) for anything that matters.'] };
  }
  if (o.seedFile !== undefined) {
    const f = o.seedFile as { seed?: unknown; commitment?: unknown; createdAt?: unknown };
    if (typeof f !== 'object' || f === null || !isHex64(f.seed)) throw new WhirlError('SEED_FILE_INVALID', 'The seed file must be the JSON written by `whirlpick commit --out` ({seed, commitment, createdAt}).');
    if (f.commitment !== undefined && f.commitment !== commitmentFor(f.seed)) throw new WhirlError('COMMITMENT_MISMATCH', "The seed file's seed doesn't match its commitment.");
    return { seed: f.seed, committedAt: typeof f.createdAt === 'string' ? f.createdAt : null, warnings: [] };
  }
  return { seed: generateSeed(), committedAt: null, warnings: [] };
}

function checkSpinIndex(n: number | undefined): number {
  const s = n ?? 0;
  if (!Number.isInteger(s) || s < 0 || s > 0xffffffff) throw new WhirlError('SPIN_INDEX_INVALID', 'spinIndex must be a whole number from 0 to 4294967295.');
  return s;
}

// ---------------- spin ----------------

export interface SpinInput extends SeedOpts {
  count?: number | 'all' | undefined;
  mode?: 'single' | 'multi' | 'elimination' | undefined;
  spins?: number | undefined;
  exclude?: number[] | undefined;
  title?: string | null | undefined;
  includeLink?: boolean | undefined;
  base?: string | undefined;
}

export interface SpinOutput {
  ok: true;
  mode: 'single' | 'multi' | 'elimination';
  winners: { index: number; label: string }[];
  receipts: Receipt[];
  link?: string;
  warnings: string[];
}

export async function opSpin(src: Resolved, o: SpinInput, surface: Surface, now: string): Promise<SpinOutput> {
  const count = o.count ?? 1;
  if (!(count === 'all' || (typeof count === 'number' && Number.isInteger(count) && count >= 1))) throw new WhirlError('COUNT_INVALID', 'count must be a whole number ≥ 1 or "all".', { count });
  const mode = o.mode ?? (count === 'all' || count > 1 ? 'multi' : 'single');
  if (!['single', 'multi', 'elimination'].includes(mode)) throw new WhirlError('MODE_INVALID', 'mode must be single, multi or elimination.');
  if (mode !== 'multi' && count !== 1) throw new UsageError(`count ${String(count)} needs mode multi (mode ${mode} picks one winner per spin).`);
  const spins = o.spins ?? 1;
  if (!Number.isInteger(spins) || spins < 1 || spins > 1000) throw new WhirlError('SPINS_INVALID', 'spins must be a whole number from 1 to 1000.');
  if (spins > 1 && mode !== 'elimination') throw new UsageError('spins > 1 needs mode elimination.');
  const seed = resolveSeed(o);
  const start = checkSpinIndex(o.spinIndex);
  const title = o.title ?? (src.wheel.settings.title || null);
  const receipts: Receipt[] = [];
  const excluded = [...(o.exclude ?? [])];
  for (let s = 0; s < spins; s++) {
    const r = buildReceipt({
      entries: src.entries,
      ...(seed.seed ? { seed: seed.seed } : {}),
      ...(seed.seedPhrase ? { seedPhrase: seed.seedPhrase } : {}),
      publicInput: o.publicInput ?? null,
      spinIndex: start + s,
      mode,
      count,
      excluded,
      title,
      committedAt: seed.committedAt,
      createdAt: now,
      app: appId(surface),
    });
    receipts.push(r);
    for (const p of r.result.picks!) excluded.push(p.index);
  }
  const out: SpinOutput = { ok: true, mode, winners: receipts.flatMap((r) => r.result.picks!.map((p) => ({ index: p.index, label: p.label }))), receipts, warnings: [...src.warnings, ...seed.warnings] };
  if (o.includeLink) out.link = shareUrl('spin', await encodeReceiptCode(receipts[receipts.length - 1]!), o.base ?? SITE_URL);
  return out;
}

// ---------------- teams ----------------

export interface TeamsInput extends SeedOpts {
  teams?: number | undefined;
  teamSize?: number | undefined;
  balance?: boolean | undefined;
  keepApart?: number[][] | undefined;
  keepTogether?: number[][] | undefined;
  previousRounds?: number[][][] | undefined;
  title?: string | null | undefined;
}

export interface TeamsOutput {
  ok: true;
  teams: { name: string; members: { index: number; label: string; tags: string[] }[] }[];
  sizes: number[];
  balance: { byTag: Record<string, number[]>; withinOne: boolean };
  repeatPairs: number;
  receipt: Receipt;
  text: string;
  csv: string;
  warnings: string[];
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function opTeams(src: Resolved, o: TeamsInput, surface: Surface, now: string): TeamsOutput {
  if ((o.teams === undefined) === (o.teamSize === undefined)) throw new UsageError('Give exactly one of teams (number of teams) or team size.');
  const seed = resolveSeed(o);
  const spinIndex = checkSpinIndex(o.spinIndex);
  const receipt = buildReceipt({
    entries: src.entries,
    ...(seed.seed ? { seed: seed.seed } : {}),
    ...(seed.seedPhrase ? { seedPhrase: seed.seedPhrase } : {}),
    publicInput: o.publicInput ?? null,
    spinIndex,
    mode: 'teams',
    teamCount: o.teams ?? null,
    teamSize: o.teamSize ?? null,
    ...(o.balance !== undefined ? { balance: o.balance } : {}),
    keepApart: o.keepApart ?? [],
    keepTogether: o.keepTogether ?? [],
    previousRounds: o.previousRounds ?? [],
    title: o.title ?? (src.wheel.settings.title || null),
    committedAt: seed.committedAt,
    createdAt: now,
    app: appId(surface),
  });
  // Re-run for the balance report and warnings (same inputs, same result).
  const detail = splitTeams({
    entries: receipt.entries,
    seed: seed.seed ?? receipt.seed!,
    publicInput: receipt.publicInput,
    spinIndex,
    teamCount: receipt.params.teamCount ?? null,
    teamSize: receipt.params.teamSize ?? null,
    balance: receipt.params.balance!,
    keepApart: receipt.params.keepApart!,
    keepTogether: receipt.params.keepTogether!,
    previousRounds: receipt.params.previousRounds!,
  });
  const teams = receipt.result.teams!.map((t, i) => ({ name: `Team ${i + 1}`, members: t.map((x) => ({ index: x, label: src.entries[x]!.label, tags: src.entries[x]!.tags ?? [] })) }));
  const text = teams.map((t) => `${t.name}: ${t.members.map((m) => m.label).join(', ')}`).join('\n') + '\n';
  const csv = 'team,name,tags\n' + teams.flatMap((t) => t.members.map((m) => [t.name, m.label, m.tags.join('|')].map(csvCell).join(','))).join('\n') + '\n';
  return {
    ok: true,
    teams,
    sizes: detail.sizes,
    balance: detail.balance,
    repeatPairs: detail.repeatPairs,
    receipt,
    text,
    csv,
    warnings: [...src.warnings, ...seed.warnings, ...detail.warnings.map((w) => `${w.code}: ${w.message}`)],
  };
}

/** Earlier team receipts → previousRounds in the current wheel's indices (by index when the list is identical, else by unique label). */
export function roundsFromHistory(history: unknown, entries: readonly Entry[], currentHash: string): number[][][] {
  const list: unknown[] = Array.isArray(history) ? history : isProjectLike(history) ? (history.history ?? []).map((h) => h.receipt) : [history];
  const rounds: number[][][] = [];
  for (const r of list) {
    if (typeof r !== 'object' || r === null) throw new WhirlError('HISTORY_INVALID', 'History must be team receipts (one, a list, or a .whirl.json with history).');
    const rec = r as Receipt;
    if (rec.format !== 'whirlpick-receipt' || rec.mode !== 'teams' || !Array.isArray(rec.result?.teams)) continue;
    if (rec.wheelHash === currentHash) {
      rounds.push(rec.result.teams);
      continue;
    }
    const byLabel = new Map<string, number>();
    const dup = new Set<string>();
    entries.forEach((e, i) => (byLabel.has(e.label) ? dup.add(e.label) : byLabel.set(e.label, i)));
    rounds.push(rec.result.teams.map((t) => t.map((x) => rec.entries[x]?.label).filter((l): l is string => l !== undefined && byLabel.has(l) && !dup.has(l)).map((l) => byLabel.get(l)!)));
  }
  return rounds;
}

function isProjectLike(x: unknown): x is WhirlProject {
  return typeof x === 'object' && x !== null && (x as { format?: unknown }).format === 'whirlpick-project';
}

// ---------------- verify / commit ----------------

export async function opVerify(input: unknown, expect: { commitment?: string | undefined; wheelHash?: string | undefined }): Promise<VerifyReport> {
  let r = input;
  if (typeof input === 'string') r = await receiptFromText(input);
  const e: { commitment?: string; wheelHash?: string } = {};
  if (expect.commitment !== undefined) e.commitment = expect.commitment;
  if (expect.wheelHash !== undefined) e.wheelHash = expect.wheelHash;
  return verifyReceipt(r, e);
}

export const COMMIT_NOTE =
  'Publish the commitment to your audience now and keep the seed secret. After the entries are final, spin with this seed (whirlpick spin --seed-file <file>, or spin_wheel with seed); anyone can then check that the receipt matches this commitment.';

export function opCommit(seed: string | undefined, now: string): { ok: true; seed: string; commitment: string; createdAt: string; note: string } {
  const s = seed === undefined ? generateSeed() : normaliseSeed(seed);
  return { ok: true, seed: s, commitment: commitmentFor(s), createdAt: now, note: COMMIT_NOTE };
}

// ---------------- link ----------------

export interface LinkInput {
  replay?: Receipt | unknown;
  base?: string | undefined;
  title?: string | undefined;
  settings?: Partial<Settings> | undefined;
  qr?: boolean | undefined;
  qrSvg?: boolean | undefined;
}

export interface LinkOutput {
  ok: true;
  url: string;
  length: number;
  qrAvailable: boolean;
  warnings: string[];
  qr?: string;
  qrSvg?: string;
}

export function checkBase(base: string | undefined): string {
  const b = base ?? SITE_URL;
  let u: URL;
  try {
    u = new URL(b);
  } catch {
    throw new WhirlError('BASE_INVALID', `--base must be an http(s) URL (got "${b}").`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new WhirlError('BASE_INVALID', '--base must be an http(s) URL.');
  return b.replace(/\/+$/, '');
}

export async function opLink(src: Resolved | null, o: LinkInput): Promise<LinkOutput> {
  const base = checkBase(o.base);
  let url: string;
  const warnings = [...(src?.warnings ?? [])];
  if (o.replay !== undefined) {
    const v = verifyReceipt(o.replay);
    if (v.status === 'invalid') throw new WhirlError('RECEIPT_INVALID', `The receipt doesn't verify (${v.checks.at(-1)?.code}); refusing to make a replay link.`, { report: v });
    url = shareUrl('spin', await encodeReceiptCode(o.replay as Receipt), base);
  } else {
    if (!src) throw new UsageError('Give entries (file, --entries, --preset or stdin) or --replay <receipt>.');
    const project = structuredClone(src.project);
    const wheel = project.wheels.find((w) => w.id === project.activeWheelId)!;
    if (o.title !== undefined) wheel.settings.title = o.title;
    if (o.settings) Object.assign(wheel.settings, o.settings);
    const vr = validateProject(JSON.parse(JSON.stringify(project)));
    if (!vr.ok) throw new WhirlError('SCHEMA_INVALID', `Settings are invalid: ${vr.errors[0]!.message} (at ${vr.errors[0]!.path})`, { errors: vr.errors });
    if (wheel.entries.some((e) => e.imageRef) || wheel.settings.centre.imageRef) warnings.push("IMAGES_NOT_INCLUDED: Images aren't included in links. Use a .whirl.json file to keep them.");
    url = shareUrl('w', await encodeShare(project), base);
  }
  const info = linkInfo(url);
  const out: LinkOutput = { ok: true, url, length: info.length, qrAvailable: info.qrAvailable, warnings: [...warnings, ...info.warnings.map((w) => `${w.code}: ${w.message}`)] };
  if (o.qr || o.qrSvg) {
    if (!info.qrAvailable) out.warnings.push(`QR_UNAVAILABLE: The link is ${info.length} characters; QR codes are offered up to 1800. Share the link or a file instead.`);
    else {
      if (o.qr) out.qr = encodeQR(url, 'ascii', { ecc: 'low', encoding: 'byte' });
      if (o.qrSvg) out.qrSvg = encodeQR(url, 'svg', { ecc: 'low', encoding: 'byte', border: 4 });
    }
  }
  return out;
}

// ---------------- validate / presets ----------------

export function opValidate(json: unknown) {
  const r = validateProject(json);
  const raw = (json ?? {}) as { wheels?: unknown; images?: unknown; history?: unknown };
  const p = r.project;
  const summary = p
    ? { wheels: p.wheels.length, entries: p.wheels.reduce((a, w) => a + w.entries.length, 0), images: Object.keys(p.images).length, history: p.history.length }
    : {
        wheels: Array.isArray(raw.wheels) ? raw.wheels.length : 0,
        entries: Array.isArray(raw.wheels) ? raw.wheels.reduce((a: number, w: { entries?: unknown }) => a + (Array.isArray(w?.entries) ? w.entries.length : 0), 0) : 0,
        images: raw.images && typeof raw.images === 'object' ? Object.keys(raw.images).length : 0,
        history: Array.isArray(raw.history) ? raw.history.length : 0,
      };
  return { ok: r.ok, valid: r.ok, errors: r.errors, warnings: r.warnings, summary };
}

export function presetList() {
  return PRESETS.map((p) => ({ id: p.id, title: p.title, slug: p.slug ?? null, entries: p.entries.length, mode: p.settings.mode ?? 'normal' }));
}

export function presetAsProject(id: string, params: Record<string, string>, now: string, surface: Surface): WhirlProject {
  const p = presetById(id, params);
  if (!p) throw new WhirlError('PRESET_UNKNOWN', `Unknown preset "${id}". Run \`whirlpick presets\` to list them.`, { preset: id });
  return presetProject(p, { now, generator: appId(surface) });
}
