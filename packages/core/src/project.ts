// `.whirl.json` (whirl-v1, PLAN §4.1): defaults, hand-written validator, and WHIRL_SCHEMA_V1.
// The validator and the JSON Schema accept and reject the same files, except for rules JSON
// Schema can't express (SEMANTIC_CODES), which only the validator enforces.
import { WhirlError } from './errors.js';
import { newId } from './ids.js';
import { codePointLength, COLOR_RE, ID_RE, IMAGE_REF_RE, isValidWeight, MAX_ENTRIES, MAX_WHEELS, textProblem } from './labels.js';
import { DATE_SCHEMA, LABEL_SCHEMA, RECEIPT_SCHEMA_V1, TAG_SCHEMA, WEIGHT_SCHEMA } from './receipt-schema.js';
import { receiptShapeProblem } from './receipt.js';
import { APP_VERSION, SCHEMA_URLS } from './site.js';
import type { Entry, HistoryRecord, ImageAsset, Receipt, Settings, ValidationIssue, ValidationResult, Wheel, WhirlProject } from './types.js';

export const MAX_HISTORY_PER_WHEEL = 500;
export const MAX_IMAGE_DATA_URL = 200 * 1024;
export const MAX_IMAGE_PX = 256;
export const MAX_TITLE = 80;
export const MAX_NAME = 80;
export const MAX_CENTRE_TEXT = 40;
/** Codes only the hand-written validator can check (they need cross-references). */
export const SEMANTIC_CODES = ['IMAGE_REF_MISSING'] as const;

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  title: '',
  mode: 'normal',
  spinDuration: 6,
  multi: { count: 3, reveal: 'sequential' },
  teams: { by: 'count', count: 2, size: 4, balance: true, keepApart: [], keepTogether: [] },
  sound: true,
  volume: 0.8,
  theme: 'carnival',
  palette: null,
  confetti: true,
  mysteryMode: false,
  centre: { text: null, imageRef: null },
  fontScale: 1,
  background: null,
  fairDraw: false,
  commitEverySpin: true,
  showChances: false,
}) as Settings;

/** A fresh deep copy of the default settings, optionally overridden (nested objects merge). */
export function defaultSettings(over: Partial<Omit<Settings, 'multi' | 'teams' | 'centre'>> & { multi?: Partial<Settings['multi']>; teams?: Partial<Settings['teams']>; centre?: Partial<Settings['centre']> } = {}): Settings {
  const d = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
  const { multi, teams, centre, ...rest } = over;
  return { ...d, ...rest, multi: { ...d.multi, ...multi }, teams: { ...d.teams, ...teams }, centre: { ...d.centre, ...centre } } as Settings;
}

export function createWheel(entries: Entry[], opts: { id?: string; name?: string; settings?: Parameters<typeof defaultSettings>[0]; random?: (b: Uint8Array) => void } = {}): Wheel {
  return { id: opts.id ?? newId('w', opts.random), name: opts.name ?? (opts.settings?.title || 'My wheel'), entries, settings: defaultSettings(opts.settings) };
}

export function createProject(wheels: Wheel[], opts: { generator?: string; now?: string; activeWheelId?: string } = {}): WhirlProject {
  if (wheels.length === 0) throw new WhirlError('WHEELS_EMPTY', 'A project needs at least one wheel.');
  const now = opts.now ?? new Date().toISOString();
  return {
    $schema: SCHEMA_URLS.whirl,
    format: 'whirlpick-project',
    version: 1,
    generator: opts.generator ?? `whirlpick-core/${APP_VERSION}`,
    createdAt: now,
    updatedAt: now,
    activeWheelId: opts.activeWheelId ?? wheels[0]!.id,
    layout: null,
    wheels,
    images: {},
    history: [],
  };
}

// ---------------- validator ----------------

const TOP_KEYS = ['$schema', 'format', 'version', 'generator', 'createdAt', 'updatedAt', 'activeWheelId', 'layout', 'wheels', 'images', 'history'];
const WHEEL_KEYS = ['id', 'name', 'entries', 'settings'];
const ENTRY_KEYS = ['id', 'label', 'weight', 'enabled', 'color', 'imageRef', 'tags'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const THEME_RE = /^[a-z0-9-]{1,32}$/;
// oxlint-disable-next-line no-control-regex -- rejecting control characters is the point
const TEXT_CHARS = /^[^\u0000-\u001F\u007F-\u009F\uD800-\uDFFF]*$/u;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const isNum = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const esc = (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1');

export interface ValidateOptions {
  /** ISO time used for missing createdAt/updatedAt. Default: now. */
  now?: string;
  /** Random source for generated ids. */
  random?: (b: Uint8Array) => void;
}

/** Validate and normalise a `.whirl.json` value. Never throws. */
export function validateProject(json: unknown, opts: ValidateOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const warn = (path: string, code: string, message: string) => warnings.push({ path, code, message });

  if (!isObj(json)) {
    err('', 'TYPE_INVALID', 'A project file must be a JSON object.');
    return { ok: false, errors, warnings };
  }
  for (const k of Object.keys(json)) if (!TOP_KEYS.includes(k)) err(`/${esc(k)}`, 'UNKNOWN_KEY', `Unknown key "${k}".`);
  if (json.$schema !== undefined && typeof json.$schema !== 'string') err('/$schema', 'TYPE_INVALID', '$schema must be a string.');
  if (json.format !== 'whirlpick-project') err('/format', 'FORMAT_INVALID', 'format must be "whirlpick-project".');
  if (json.version !== 1) err('/version', 'UNSUPPORTED_VERSION', 'version must be 1.');
  if (json.generator !== undefined && !(typeof json.generator === 'string' && json.generator.length <= 64)) err('/generator', 'TYPE_INVALID', 'generator must be a short string.');
  for (const k of ['createdAt', 'updatedAt'] as const) {
    if (json[k] !== undefined && !(typeof json[k] === 'string' && ISO_RE.test(json[k]))) err(`/${k}`, 'DATE_INVALID', `${k} must be an ISO date-time.`);
  }
  if (json.activeWheelId !== undefined && !(typeof json.activeWheelId === 'string' && ID_RE.test(json.activeWheelId))) err('/activeWheelId', 'ID_INVALID', 'activeWheelId must match ^[A-Za-z0-9_-]{1,32}$.');
  if (json.layout !== undefined && json.layout !== null) err('/layout', 'LAYOUT_RESERVED', 'layout is reserved for a later version and must be null.');

  // images
  const images: Record<string, ImageAsset> = {};
  if (json.images !== undefined) {
    if (!isObj(json.images)) err('/images', 'TYPE_INVALID', 'images must be an object keyed by image id.');
    else {
      for (const [id, v] of Object.entries(json.images)) {
        const p = `/images/${esc(id)}`;
        if (!IMAGE_REF_RE.test(id)) err(p, 'IMAGE_ID_INVALID', 'Image ids look like img_ + 16 hex characters.');
        if (!isObj(v)) {
          err(p, 'IMAGE_INVALID', 'An image is {dataUrl, width, height}.');
          continue;
        }
        let ok = true;
        const bad = (path: string, code: string, message: string) => {
          err(path, code, message);
          ok = false;
        };
        for (const k of Object.keys(v)) if (!['dataUrl', 'width', 'height'].includes(k)) bad(`${p}/${esc(k)}`, 'UNKNOWN_KEY', `Unknown key "${k}".`);
        if (typeof v.dataUrl !== 'string') bad(`${p}/dataUrl`, 'IMAGE_INVALID', 'dataUrl must be a string.');
        else if (v.dataUrl.length > MAX_IMAGE_DATA_URL) bad(`${p}/dataUrl`, 'IMAGE_TOO_LARGE', 'Images must be 200 KB or smaller.');
        else if (!DATA_URL_RE.test(v.dataUrl)) bad(`${p}/dataUrl`, 'IMAGE_INVALID', 'dataUrl must be a base64 PNG, JPEG, WebP or GIF data URL.');
        for (const k of ['width', 'height'] as const) if (!isInt(v[k], 1, MAX_IMAGE_PX)) bad(`${p}/${k}`, 'IMAGE_INVALID', `${k} must be 1–${MAX_IMAGE_PX} px.`);
        if (ok) images[id] = { dataUrl: v.dataUrl as string, width: v.width as number, height: v.height as number };
      }
    }
  }
  const imageIds = isObj(json.images) ? new Set(Object.keys(json.images)) : new Set<string>();

  // wheels
  const wheels: Wheel[] = [];
  if (json.wheels === undefined) err('/wheels', 'REQUIRED', 'wheels is required.');
  else if (!Array.isArray(json.wheels)) err('/wheels', 'TYPE_INVALID', 'wheels must be a list.');
  else if (json.wheels.length === 0) err('/wheels', 'WHEELS_EMPTY', 'A project needs at least one wheel.');
  else if (json.wheels.length > MAX_WHEELS) err('/wheels', 'WHEEL_LIMIT', `At most ${MAX_WHEELS} wheels per project.`);
  else {
    const wheelIds = new Set<string>();
    json.wheels.forEach((w: unknown, wi: number) => {
      const wp = `/wheels/${wi}`;
      if (!isObj(w)) return err(wp, 'TYPE_INVALID', 'Each wheel must be an object.');
      for (const k of Object.keys(w)) if (!WHEEL_KEYS.includes(k)) err(`${wp}/${esc(k)}`, 'UNKNOWN_KEY', `Unknown key "${k}".`);
      let id: string;
      if (w.id === undefined) id = newId('w', opts.random);
      else if (typeof w.id !== 'string' || !ID_RE.test(w.id)) {
        err(`${wp}/id`, 'ID_INVALID', 'Wheel id must match ^[A-Za-z0-9_-]{1,32}$.');
        id = newId('w', opts.random);
      } else id = w.id;
      if (wheelIds.has(id)) {
        warn(`${wp}/id`, 'ID_DUPLICATE', `Duplicate wheel id "${id}"; a new id was generated.`);
        while (wheelIds.has(id)) id = newId('w', opts.random);
      }
      wheelIds.add(id);
      const entries: Entry[] = [];
      if (w.entries === undefined) err(`${wp}/entries`, 'REQUIRED', 'entries is required (it may be empty).');
      else if (!Array.isArray(w.entries)) err(`${wp}/entries`, 'TYPE_INVALID', 'entries must be a list.');
      else if (w.entries.length > MAX_ENTRIES) err(`${wp}/entries`, 'ENTRY_LIMIT', `A wheel can have at most ${MAX_ENTRIES} entries (this one has ${w.entries.length}).`);
      else {
        const entryIds = new Set<string>();
        w.entries.forEach((e: unknown, ei: number) => {
          const ep = `${wp}/entries/${ei}`;
          const where = `Entry ${ei + 1}`;
          if (!isObj(e)) return err(ep, 'TYPE_INVALID', `${where} must be an object with a label.`);
          let ok = true;
          const bad = (path: string, code: string, message: string) => {
            err(path, code, message);
            ok = false;
          };
          for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) bad(`${ep}/${esc(k)}`, 'UNKNOWN_KEY', `${where}: unknown key "${k}".`);
          if (e.label === undefined) bad(`${ep}/label`, 'REQUIRED', `${where} has no label.`);
          else if (typeof e.label !== 'string') bad(`${ep}/label`, 'LABEL_INVALID', `${where} label must be a string.`);
          else {
            const why = textProblem(e.label, 200) ?? (codePointLength(e.label) > 200 ? 'is longer than 200 characters' : null);
            if (why) bad(`${ep}/label`, 'LABEL_INVALID', `${where} label ${why}.`);
          }
          if (e.weight !== undefined && !isValidWeight(e.weight)) bad(`${ep}/weight`, 'WEIGHT_INVALID', `${where}: weight must be 0.001–1,000,000 with at most 3 decimals.`);
          if (e.enabled !== undefined && typeof e.enabled !== 'boolean') bad(`${ep}/enabled`, 'TYPE_INVALID', `${where}: enabled must be true or false.`);
          if (e.color !== undefined && !(typeof e.color === 'string' && COLOR_RE.test(e.color))) bad(`${ep}/color`, 'COLOR_INVALID', `${where}: colour must be #RRGGBB.`);
          if (e.imageRef !== undefined) {
            if (!(typeof e.imageRef === 'string' && IMAGE_REF_RE.test(e.imageRef))) bad(`${ep}/imageRef`, 'IMAGE_REF_INVALID', `${where}: bad image reference.`);
            else if (!imageIds.has(e.imageRef)) bad(`${ep}/imageRef`, 'IMAGE_REF_MISSING', `${where}: image ${e.imageRef} is not in images.`);
          }
          let tags: string[] | undefined;
          if (e.tags !== undefined) {
            if (!Array.isArray(e.tags) || e.tags.length > 8) bad(`${ep}/tags`, 'TAG_INVALID', `${where}: tags must be a list of at most 8 strings.`);
            else {
              tags = [];
              e.tags.forEach((t: unknown, ti: number) => {
                if (typeof t !== 'string' || textProblem(t, 32) || codePointLength(t) > 32) bad(`${ep}/tags/${ti}`, 'TAG_INVALID', `${where}: tag ${ti + 1} is invalid (1–32 characters).`);
                else {
                  const n = t.normalize('NFC').trim();
                  if (!tags!.includes(n)) tags!.push(n);
                }
              });
            }
          }
          let eid: string;
          if (e.id === undefined) eid = newId('e', opts.random);
          else if (typeof e.id !== 'string' || !ID_RE.test(e.id)) {
            bad(`${ep}/id`, 'ID_INVALID', `${where}: id must match ^[A-Za-z0-9_-]{1,32}$.`);
            eid = '';
          } else eid = e.id;
          if (!ok) return;
          if (entryIds.has(eid)) {
            warn(`${ep}/id`, 'ID_DUPLICATE', `${where}: duplicate id "${eid}"; a new id was generated.`);
            while (entryIds.has(eid)) eid = newId('e', opts.random);
          }
          entryIds.add(eid);
          const out: Entry = { id: eid, label: (e.label as string).normalize('NFC').trim(), weight: (e.weight as number | undefined) ?? 1, enabled: (e.enabled as boolean | undefined) ?? true };
          if (e.color !== undefined) out.color = e.color as string;
          if (e.imageRef !== undefined) out.imageRef = e.imageRef as string;
          if (tags !== undefined) out.tags = tags;
          entries.push(out);
        });
      }
      const settings = validateSettings(w.settings, `${wp}/settings`, err, warn, imageIds, new Set(entries.map((e) => e.id)));
      let name: string;
      if (w.name === undefined) name = settings.title || `Wheel ${wi + 1}`;
      else if (typeof w.name !== 'string' || textProblem(w.name, MAX_NAME) || codePointLength(w.name) > MAX_NAME) {
        err(`${wp}/name`, 'NAME_INVALID', `Wheel name must be 1–${MAX_NAME} characters.`);
        name = '';
      } else name = w.name.normalize('NFC').trim();
      wheels.push({ id, name, entries, settings });
    });
  }

  // history
  const history: HistoryRecord[] = [];
  if (json.history !== undefined) {
    if (!Array.isArray(json.history)) err('/history', 'TYPE_INVALID', 'history must be a list.');
    else {
      json.history.forEach((h: unknown, hi: number) => {
        const hp = `/history/${hi}`;
        if (!isObj(h)) return err(hp, 'HISTORY_INVALID', 'Each history record must be an object.');
        let ok = true;
        const bad = (path: string, code: string, message: string) => {
          err(path, code, message);
          ok = false;
        };
        for (const k of Object.keys(h)) if (!['id', 'wheelId', 'createdAt', 'receipt', 'teamNames'].includes(k)) bad(`${hp}/${esc(k)}`, 'UNKNOWN_KEY', `Unknown key "${k}".`);
        for (const k of ['id', 'wheelId'] as const) if (!(typeof h[k] === 'string' && ID_RE.test(h[k]))) bad(`${hp}/${k}`, 'ID_INVALID', `${k} must match ^[A-Za-z0-9_-]{1,32}$.`);
        if (!(typeof h.createdAt === 'string' && ISO_RE.test(h.createdAt))) bad(`${hp}/createdAt`, 'DATE_INVALID', 'createdAt must be an ISO date-time.');
        const rp = receiptShapeProblem(h.receipt, `${hp}/receipt`);
        if (rp) bad(rp.path, 'HISTORY_INVALID', `History ${hi + 1}: ${rp.message}`);
        else if ((h.receipt as Record<string, unknown>).beacon !== null) bad(`${hp}/receipt/beacon`, 'HISTORY_INVALID', 'beacon must be null.');
        if (h.teamNames !== undefined && h.teamNames !== null && !(Array.isArray(h.teamNames) && h.teamNames.length <= 1000 && h.teamNames.every((t) => typeof t === 'string' && codePointLength(t) <= MAX_NAME && TEXT_CHARS.test(t)))) bad(`${hp}/teamNames`, 'HISTORY_INVALID', 'teamNames must be null or a list of names (≤ 80 characters).');
        if (ok) history.push({ id: h.id as string, wheelId: h.wheelId as string, createdAt: h.createdAt as string, receipt: h.receipt as Receipt, teamNames: (h.teamNames as string[] | null | undefined) ?? null });
      });
    }
  }
  if (errors.length) return { ok: false, errors, warnings };

  // Trim history to the newest 500 per wheel (kept in file order).
  const perWheel = new Map<string, number>();
  for (const h of history) perWheel.set(h.wheelId, (perWheel.get(h.wheelId) ?? 0) + 1);
  let trimmed = history;
  if ([...perWheel.values()].some((n) => n > MAX_HISTORY_PER_WHEEL)) {
    const byTime = history.map((h, i) => ({ h, i })).sort((a, b) => (a.h.createdAt < b.h.createdAt ? 1 : a.h.createdAt > b.h.createdAt ? -1 : b.i - a.i));
    const keep = new Set<number>();
    const seen = new Map<string, number>();
    for (const { h, i } of byTime) {
      const n = seen.get(h.wheelId) ?? 0;
      if (n < MAX_HISTORY_PER_WHEEL) keep.add(i);
      seen.set(h.wheelId, n + 1);
    }
    trimmed = history.filter((_, i) => keep.has(i));
    warn('/history', 'HISTORY_TRIMMED', `History kept to the newest ${MAX_HISTORY_PER_WHEEL} records per wheel; ${history.length - trimmed.length} older records were dropped.`);
  }

  let activeWheelId = (json.activeWheelId as string | undefined) ?? wheels[0]!.id;
  if (!wheels.some((w) => w.id === activeWheelId)) {
    if (json.activeWheelId !== undefined) warn('/activeWheelId', 'ACTIVE_WHEEL_MISSING', 'activeWheelId is not one of the wheels; the first wheel is active.');
    activeWheelId = wheels[0]!.id;
  }
  const now = opts.now ?? new Date().toISOString();
  const project: WhirlProject = {
    ...(json.$schema !== undefined ? { $schema: json.$schema as string } : {}),
    format: 'whirlpick-project',
    version: 1,
    generator: (json.generator as string | undefined) ?? 'unknown',
    createdAt: (json.createdAt as string | undefined) ?? now,
    updatedAt: (json.updatedAt as string | undefined) ?? (json.createdAt as string | undefined) ?? now,
    activeWheelId,
    layout: null,
    wheels,
    images,
    history: trimmed,
  };
  return { ok: true, errors, warnings, project };
}

type Report = (path: string, code: string, message: string) => void;

function validateSettings(s: unknown, sp: string, err: Report, warn: Report, imageIds: Set<string>, entryIds: Set<string>): Settings {
  const out = defaultSettings();
  if (s === undefined) return out;
  if (!isObj(s)) {
    err(sp, 'SETTING_INVALID', 'settings must be an object.');
    return out;
  }
  const bad = (k: string, msg: string) => err(`${sp}/${k}`, 'SETTING_INVALID', msg);
  const known = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const k of Object.keys(s)) if (!known.has(k)) warn(`${sp}/${esc(k)}`, 'SETTING_UNKNOWN', `Unknown setting "${k}" was ignored.`);
  const o = out as unknown as Record<string, unknown>;
  const setIf = (k: string, ok: (v: unknown) => boolean, msg: string) => {
    if (s[k] === undefined) return;
    if (ok(s[k])) o[k] = s[k];
    else bad(k, msg);
  };
  setIf('title', (v) => typeof v === 'string' && codePointLength(v) <= MAX_TITLE && TEXT_CHARS.test(v), `title must be at most ${MAX_TITLE} characters.`);
  setIf('mode', (v) => ['normal', 'elimination', 'multi', 'teams'].includes(v as string), 'mode must be normal, elimination, multi or teams.');
  setIf('spinDuration', (v) => isNum(v, 1, 30) && Number.isInteger((v as number) * 2), 'spinDuration must be 1–30 seconds in steps of 0.5.');
  setIf('sound', (v) => typeof v === 'boolean', 'sound must be true or false.');
  setIf('volume', (v) => isNum(v, 0, 1), 'volume must be 0–1.');
  setIf('theme', (v) => typeof v === 'string' && THEME_RE.test(v), 'theme must be a theme id.');
  setIf('palette', (v) => v === null || (Array.isArray(v) && v.length >= 2 && v.length <= 24 && v.every((c) => typeof c === 'string' && COLOR_RE.test(c))), 'palette must be null or 2–24 #RRGGBB colours.');
  for (const k of ['confetti', 'mysteryMode', 'fairDraw', 'commitEverySpin', 'showChances']) setIf(k, (v) => typeof v === 'boolean', `${k} must be true or false.`);
  setIf('fontScale', (v) => isNum(v, 0.75, 1.5), 'fontScale must be 0.75–1.5.');
  setIf('background', (v) => v === null || v === 'transparent' || (typeof v === 'string' && COLOR_RE.test(v)), 'background must be null, "transparent" or #RRGGBB.');
  if (s.multi !== undefined) {
    const m = s.multi;
    if (!isObj(m) || Object.keys(m).some((k) => !['count', 'reveal'].includes(k))) bad('multi', 'multi must be {count, reveal}.');
    else {
      if (m.count !== undefined) {
        if (m.count === 'all' || isInt(m.count, 1, MAX_ENTRIES)) out.multi.count = m.count as number | 'all';
        else bad('multi/count', 'multi.count must be 1–1000 or "all".');
      }
      if (m.reveal !== undefined) {
        if (m.reveal === 'sequential' || m.reveal === 'instant') out.multi.reveal = m.reveal;
        else bad('multi/reveal', 'multi.reveal must be sequential or instant.');
      }
    }
  }
  if (s.teams !== undefined) {
    const t = s.teams;
    if (!isObj(t) || Object.keys(t).some((k) => !['by', 'count', 'size', 'balance', 'keepApart', 'keepTogether'].includes(k))) bad('teams', 'teams must be {by, count, size, balance, keepApart, keepTogether}.');
    else {
      if (t.by !== undefined) {
        if (t.by === 'count' || t.by === 'size') out.teams.by = t.by;
        else bad('teams/by', 'teams.by must be count or size.');
      }
      if (t.count !== undefined) {
        if (isInt(t.count, 2, MAX_ENTRIES)) out.teams.count = t.count;
        else bad('teams/count', 'teams.count must be 2–1000.');
      }
      if (t.size !== undefined) {
        if (isInt(t.size, 1, MAX_ENTRIES)) out.teams.size = t.size;
        else bad('teams/size', 'teams.size must be 1–1000.');
      }
      if (t.balance !== undefined) {
        if (typeof t.balance === 'boolean') out.teams.balance = t.balance;
        else bad('teams/balance', 'teams.balance must be true or false.');
      }
      for (const k of ['keepApart', 'keepTogether'] as const) {
        const v = t[k];
        if (v === undefined) continue;
        if (!Array.isArray(v) || !v.every((r) => Array.isArray(r) && r.length >= 2 && r.every((x) => typeof x === 'string' && ID_RE.test(x)))) {
          bad(`teams/${k}`, `teams.${k} must be a list of rules, each a list of 2 or more entry ids.`);
          continue;
        }
        const rules: string[][] = [];
        for (const r of v as string[][]) {
          const known2 = [...new Set(r)].filter((x) => entryIds.has(x));
          if (known2.length < r.length) warn(`${sp}/teams/${k}`, 'TEAM_RULE_UNKNOWN_ENTRY', `A ${k} rule names entries that aren't on the wheel; they were dropped.`);
          if (known2.length >= 2) rules.push(known2);
        }
        out.teams[k] = rules;
      }
    }
  }
  if (s.centre !== undefined) {
    const c = s.centre;
    if (!isObj(c) || Object.keys(c).some((k) => !['text', 'imageRef'].includes(k))) bad('centre', 'centre must be {text, imageRef}.');
    else {
      if (c.text !== undefined) {
        if (c.text === null || (typeof c.text === 'string' && codePointLength(c.text) <= MAX_CENTRE_TEXT && TEXT_CHARS.test(c.text))) out.centre.text = c.text as string | null;
        else bad('centre/text', `centre.text must be null or at most ${MAX_CENTRE_TEXT} characters.`);
      }
      if (c.imageRef !== undefined) {
        if (c.imageRef === null) out.centre.imageRef = null;
        else if (typeof c.imageRef !== 'string' || !IMAGE_REF_RE.test(c.imageRef)) bad('centre/imageRef', 'centre.imageRef must be null or an image id.');
        else if (!imageIds.has(c.imageRef)) err(`${sp}/centre/imageRef`, 'IMAGE_REF_MISSING', `Centre image ${c.imageRef} is not in images.`);
        else out.centre.imageRef = c.imageRef;
      }
    }
  }
  return out;
}

/** Validate or throw WhirlError (SCHEMA_INVALID, with the first error's pointer). */
export function parseProject(json: unknown, opts: ValidateOptions = {}): { project: WhirlProject; warnings: ValidationIssue[] } {
  const r = validateProject(json, opts);
  if (!r.ok || !r.project) {
    const e = r.errors[0]!;
    throw new WhirlError('SCHEMA_INVALID', `${e.message} (at ${e.path || '/'})`, { errors: r.errors });
  }
  return { project: r.project, warnings: r.warnings };
}

// ---------------- JSON Schema ----------------

const TEXT_ANY = '^[^\\u0000-\\u001F\\u007F-\\u009F\\uD800-\\uDFFF]*$';
const ID = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,32}$' } as const;
const COLOR = { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' } as const;
const IMAGE_REF = { type: 'string', pattern: '^img_[0-9a-f]{16}$' } as const;
const BOOL = { type: 'boolean' } as const;
const RULES = { type: 'array', items: { type: 'array', minItems: 2, items: ID } } as const;
const { $schema: _s, $id: _i, ...RECEIPT_DEF } = RECEIPT_SCHEMA_V1;

export const WHIRL_SCHEMA_V1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: SCHEMA_URLS.whirl,
  title: 'Whirlpick project (whirl-v1)',
  description:
    'A .whirl.json project: wheels, entries, settings, images and history. Unknown keys are rejected except inside settings (ignored with a warning). Rules JSON Schema cannot express, enforced by `whirlpick validate`: every imageRef must exist in images (IMAGE_REF_MISSING). Weights use multipleOf 0.001 (validators need a float tolerance, e.g. ajv multipleOfPrecision 6).',
  type: 'object',
  additionalProperties: false,
  required: ['format', 'version', 'wheels'],
  properties: {
    $schema: { type: 'string' },
    format: { const: 'whirlpick-project' },
    version: { const: 1 },
    generator: { type: 'string', maxLength: 64 },
    createdAt: DATE_SCHEMA,
    updatedAt: DATE_SCHEMA,
    activeWheelId: ID,
    layout: { type: 'null', description: 'Reserved for multi-wheel layouts (v1.1); must be null.' },
    wheels: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_WHEELS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entries'],
        properties: {
          id: ID,
          name: { ...LABEL_SCHEMA, maxLength: MAX_NAME },
          entries: {
            type: 'array',
            maxItems: MAX_ENTRIES,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label'],
              properties: {
                id: ID,
                label: LABEL_SCHEMA,
                weight: WEIGHT_SCHEMA,
                enabled: BOOL,
                color: COLOR,
                imageRef: IMAGE_REF,
                tags: { type: 'array', maxItems: 8, items: TAG_SCHEMA },
              },
            },
          },
          settings: {
            type: 'object',
            additionalProperties: true,
            properties: {
              title: { type: 'string', maxLength: MAX_TITLE, pattern: TEXT_ANY },
              mode: { enum: ['normal', 'elimination', 'multi', 'teams'] },
              spinDuration: { type: 'number', minimum: 1, maximum: 30, multipleOf: 0.5 },
              multi: {
                type: 'object',
                additionalProperties: false,
                properties: { count: { anyOf: [{ type: 'integer', minimum: 1, maximum: MAX_ENTRIES }, { const: 'all' }] }, reveal: { enum: ['sequential', 'instant'] } },
              },
              teams: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  by: { enum: ['count', 'size'] },
                  count: { type: 'integer', minimum: 2, maximum: MAX_ENTRIES },
                  size: { type: 'integer', minimum: 1, maximum: MAX_ENTRIES },
                  balance: BOOL,
                  keepApart: RULES,
                  keepTogether: RULES,
                },
              },
              sound: BOOL,
              volume: { type: 'number', minimum: 0, maximum: 1 },
              theme: { type: 'string', pattern: '^[a-z0-9-]{1,32}$' },
              palette: { anyOf: [{ type: 'null' }, { type: 'array', minItems: 2, maxItems: 24, items: COLOR }] },
              confetti: BOOL,
              mysteryMode: BOOL,
              centre: {
                type: 'object',
                additionalProperties: false,
                properties: { text: { anyOf: [{ type: 'null' }, { type: 'string', maxLength: MAX_CENTRE_TEXT, pattern: TEXT_ANY }] }, imageRef: { anyOf: [{ type: 'null' }, IMAGE_REF] } },
              },
              fontScale: { type: 'number', minimum: 0.75, maximum: 1.5 },
              background: { anyOf: [{ type: 'null' }, { const: 'transparent' }, COLOR] },
              fairDraw: BOOL,
              commitEverySpin: BOOL,
              showChances: BOOL,
            },
          },
        },
      },
    },
    images: {
      type: 'object',
      propertyNames: { pattern: '^img_[0-9a-f]{16}$' },
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['dataUrl', 'width', 'height'],
        properties: {
          dataUrl: { type: 'string', maxLength: MAX_IMAGE_DATA_URL, pattern: '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$' },
          width: { type: 'integer', minimum: 1, maximum: MAX_IMAGE_PX },
          height: { type: 'integer', minimum: 1, maximum: MAX_IMAGE_PX },
        },
      },
    },
    history: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'wheelId', 'createdAt', 'receipt'],
        properties: {
          id: ID,
          wheelId: ID,
          createdAt: DATE_SCHEMA,
          receipt: { $ref: '#/$defs/receipt' },
          teamNames: { anyOf: [{ type: 'null' }, { type: 'array', maxItems: 1000, items: { type: 'string', maxLength: MAX_NAME, pattern: TEXT_ANY } }] },
        },
      },
    },
  },
  $defs: { receipt: RECEIPT_DEF },
} as const;
