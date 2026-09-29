// Share links and receipt codes (PLAN §3.1, §4.3).
// code = "1." + base64url(deflate-raw(utf8(JSON))) via the web-standard CompressionStream
// (browsers and Node ≥ 20), or "1j." + base64url(utf8(JSON)) when CompressionStream is missing.
import { base64urlDecode, base64urlEncode, fromUtf8, utf8 } from './bytes.js';
import { WhirlError } from './errors.js';
import { parseProject } from './project.js';
import { SITE_URL } from './site.js';
import type { Receipt, WhirlProject } from './types.js';

export const MAX_LINK_CODE = 64 * 1024;
export const LONG_LINK_WARNING = 8 * 1024;
export const MAX_QR_URL = 1800;
export const MAX_DECODED = 2 * 1024 * 1024;

export interface CodecOptions {
  /** false forces the uncompressed "1j." form (also used automatically without CompressionStream). */
  compress?: boolean;
}

const hasCompression = () => typeof globalThis.CompressionStream === 'function';
const hasDecompression = () => typeof globalThis.DecompressionStream === 'function';

async function readAll(readable: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array> {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap) {
      await reader.cancel().catch(() => {});
      throw new WhirlError('LINK_PAYLOAD_TOO_LARGE', `The link's content is larger than ${Math.round(cap / 1024 / 1024)} MB.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function pipeThrough(bytes: Uint8Array, t: CompressionStream | DecompressionStream, cap: number): Promise<Uint8Array> {
  const writer = t.writable.getWriter();
  const done = (async () => {
    await writer.write(bytes as Uint8Array<ArrayBuffer>);
    await writer.close();
  })().catch(() => {});
  try {
    return await readAll(t.readable as ReadableStream<Uint8Array>, cap);
  } finally {
    await done;
  }
}

export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new CompressionStream('deflate-raw'), Number.MAX_SAFE_INTEGER);
}

export async function inflateRaw(bytes: Uint8Array, cap = MAX_DECODED): Promise<Uint8Array> {
  try {
    return await pipeThrough(bytes, new DecompressionStream('deflate-raw'), cap);
  } catch (e) {
    if (e instanceof WhirlError) throw e;
    throw new WhirlError('LINK_INVALID', "This link is damaged (it didn't decompress). Ask for a new link.");
  }
}

/** Encode any JSON value as a "1." (or "1j.") code. */
export async function encodeJsonCode(value: unknown, opts: CodecOptions = {}): Promise<string> {
  const bytes = utf8(JSON.stringify(value));
  if (opts.compress !== false && hasCompression()) return `1.${base64urlEncode(await deflateRaw(bytes))}`;
  return `1j.${base64urlEncode(bytes)}`;
}

/** Decode a "1." / "1j." code to its JSON value (2 MB cap before parsing). */
export async function decodeJsonCode(code: string): Promise<unknown> {
  const c = code.trim();
  let bytes: Uint8Array;
  try {
    if (c.startsWith('1j.')) {
      bytes = base64urlDecode(c.slice(3));
      if (bytes.length > MAX_DECODED) throw new WhirlError('LINK_PAYLOAD_TOO_LARGE', "The link's content is larger than 2 MB.");
    } else if (c.startsWith('1.')) {
      if (!hasDecompression()) throw new WhirlError('LINK_UNSUPPORTED', 'Update your browser to open this link.');
      bytes = await inflateRaw(base64urlDecode(c.slice(2)));
    } else throw new WhirlError('LINK_INVALID', 'Not a Whirlpick link code (expected it to start with "1." or "1j.").');
  } catch (e) {
    if (e instanceof WhirlError && e.code !== 'BASE64_INVALID') throw e;
    throw new WhirlError('LINK_INVALID', 'This link is damaged. Ask for a new link.');
  }
  try {
    return JSON.parse(fromUtf8(bytes));
  } catch {
    throw new WhirlError('LINK_INVALID', "This link is damaged (its content isn't valid JSON).");
  }
}

/**
 * The share document for one wheel (§4.3): no images, no history, image refs stripped, ids kept.
 * Default-valued entry fields (weight 1, enabled true) are left out to keep links short; the
 * project validator restores them on decode.
 */
export function shareDocFor(project: WhirlProject, wheelId: string = project.activeWheelId): Record<string, unknown> {
  const w = project.wheels.find((x) => x.id === wheelId) ?? project.wheels[0];
  if (!w) throw new WhirlError('WHEELS_EMPTY', 'Nothing to share: the project has no wheels.');
  const entries = w.entries.map((e) => {
    const o: Record<string, unknown> = { id: e.id, label: e.label };
    if (e.weight !== 1) o.weight = e.weight;
    if (!e.enabled) o.enabled = false;
    if (e.color !== undefined) o.color = e.color;
    if (e.tags !== undefined) o.tags = e.tags;
    return o;
  });
  return {
    format: 'whirlpick-project',
    version: 1,
    generator: project.generator,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    activeWheelId: w.id,
    layout: null,
    wheels: [{ id: w.id, name: w.name, entries, settings: { ...w.settings, centre: { ...w.settings.centre, imageRef: null } } }],
  };
}

/** Encode a wheel for `#w=`. Throws LINK_TOO_LONG past 64 KiB. */
export async function encodeShare(project: WhirlProject, opts: CodecOptions & { wheelId?: string } = {}): Promise<string> {
  const code = await encodeJsonCode(shareDocFor(project, opts.wheelId), opts);
  if (code.length > MAX_LINK_CODE) throw new WhirlError('LINK_TOO_LONG', 'Too long for a link. Export a file instead.', { length: code.length, max: MAX_LINK_CODE });
  return code;
}

/** Decode a `#w=` code into a validated project (throws LINK_* or SCHEMA_INVALID). */
export async function decodeShare(code: string): Promise<WhirlProject> {
  return parseProject(await decodeJsonCode(code)).project;
}

export async function encodeReceiptCode(r: Receipt, opts: CodecOptions = {}): Promise<string> {
  return encodeJsonCode(r, opts);
}

/** Decode a receipt code to raw JSON; pass the result to verifyReceipt. */
export async function decodeReceiptCode(code: string): Promise<unknown> {
  return decodeJsonCode(code);
}

export type LinkKind = 'w' | 'spin' | 'r';

/** `${base}${path}#${kind}=${code}`. Default path: "/verify/" for receipts (r), else "/". */
export function shareUrl(kind: LinkKind, code: string, base: string = SITE_URL, path?: string): string {
  const p = path ?? (kind === 'r' ? '/verify/' : '/');
  return `${base.replace(/\/+$/, '')}${p.startsWith('/') ? p : `/${p}`}#${kind}=${code}`;
}

/** Plain list link: `#names=` + encodeURIComponent(labels joined by "\n"). */
export function namesUrl(labels: readonly string[], base: string = SITE_URL, path = '/'): string {
  return `${base.replace(/\/+$/, '')}${path}#names=${encodeURIComponent(labels.join('\n'))}`;
}

/** Parse a `#names=` fragment value back to labels. */
export function parseNamesFragment(value: string): string[] {
  return decodeURIComponent(value)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface LinkInfo {
  length: number;
  qrAvailable: boolean;
  warnings: { code: string; message: string }[];
}

export function linkInfo(url: string): LinkInfo {
  const warnings = url.length > LONG_LINK_WARNING ? [{ code: 'LINK_LONG', message: 'Some chat apps cut long links.' }] : [];
  return { length: url.length, qrAvailable: url.length <= MAX_QR_URL, warnings };
}

/** Pull `{kind, code}` out of a code, a fragment or a full URL (`#w=`, `#spin=`, `#r=`). */
export function extractCode(input: string): { kind: LinkKind | null; code: string } {
  const s = input.trim();
  const m = /[#&](w|spin|r)=([^&\s]+)/.exec(s);
  if (m) return { kind: m[1] as LinkKind, code: m[2]! };
  return { kind: null, code: s };
}

/** Receipt from pasted text: JSON, a receipt code, or a /verify/#r= or /#spin= URL. BAD_JSON-ish input is returned as text. */
export async function receiptFromText(text: string): Promise<unknown> {
  const t = text.replace(/^﻿/, '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return t;
  const { code } = extractCode(t);
  return decodeReceiptCode(code);
}
