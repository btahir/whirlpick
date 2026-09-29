// `whirlpick` CLI (PLAN §5). main() never throws: it returns the exit code and writes through `io`.
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { APP_VERSION, CHECK_TEXT, RECEIPT_SCHEMA_V1, SITE_URL, WHIRL_SCHEMA_V1, wheelHash, WhirlError, type EntryIn, type VerifyReport } from '@whirlpick/core';
import { bool, helpText, int, list, parseArgs, str, type FlagSpec, type Parsed } from './args.js';
import { errorDoc, EXIT, UsageError } from './errors.js';
import { COMMIT_NOTE, nowIso, opCommit, opLink, opSpin, opTeams, opValidate, opVerify, presetAsProject, presetList, roundsFromHistory, type SeedOpts } from './ops.js';
import { readInputFile, writeOutputFile } from './paths.js';
import { fromEntries, fromPreset, fromText, resolveMembers, type Resolved, type TextFormatHint } from './sources.js';

export interface CliIo {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  stdin: () => Promise<string>;
  cwd: string;
  env: Record<string, string | undefined>;
}

export function nodeIo(): CliIo {
  return {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    stdin: async () => {
      const chunks: Buffer[] = [];
      let n = 0;
      for await (const c of process.stdin) {
        n += (c as Buffer).length;
        if (n > 20 * 1024 * 1024) throw new WhirlError('FILE_TOO_LARGE', 'stdin is larger than 20 MB.');
        chunks.push(c as Buffer);
      }
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)).replace(/^﻿/, '');
      } catch {
        throw new WhirlError('FILE_UNREADABLE', 'stdin is not UTF-8 text.');
      }
    },
    cwd: process.cwd(),
    env: process.env,
  };
}

// ---------------- flag specs ----------------

const SOURCE: Record<string, FlagSpec> = {
  entries: { kind: 'string', value: 'list', help: 'Entries inline, comma-separated: "Ada,Grace,Linus".' },
  'entries-sep': { kind: 'string', value: 'sep', help: 'Separator for --entries (default ",").' },
  preset: { kind: 'string', value: 'id', help: 'Use a preset wheel (see `whirlpick presets`).' },
  min: { kind: 'string', value: 'n', help: 'Preset "numbers": first number.' },
  max: { kind: 'string', value: 'n', help: 'Preset "numbers": last number (≤ 1000 values).' },
  format: { kind: 'string', value: 'txt|csv|tsv|json', help: 'Input format for stdin (default: detect).' },
  wheel: { kind: 'string', value: 'id|name', help: 'Which wheel of a .whirl.json project (default: the active one).' },
  title: { kind: 'string', value: 'text', help: 'Title recorded in the receipt / shown above the wheel.' },
};
const SEED: Record<string, FlagSpec> = {
  seed: { kind: 'string', value: 'hex64', help: 'Use this 64-hex seed (default: 256 random bits).' },
  'seed-phrase': { kind: 'string', value: 'text', help: 'Derive the seed from a phrase (guessable: tests and demos only).' },
  'seed-file': { kind: 'string', value: 'path', help: 'Use the seed saved by `whirlpick commit --out`.' },
  'public-input': { kind: 'string', value: 'text', help: 'Room word supplied after the commitment (≤ 64 chars).' },
  'spin-index': { kind: 'string', value: 'n', help: 'Spin index under this seed (default 0).' },
};
const OUT: Record<string, FlagSpec> = {
  'receipt-out': { kind: 'string', value: 'path', help: 'Write the receipt JSON to a new file.' },
  force: { kind: 'bool', help: 'Allow replacing an existing output file.' },
};

const COMMANDS: Record<string, { usage: string; summary: string; flags: Record<string, FlagSpec>; run: (p: Parsed, io: CliIo, json: boolean, quiet: boolean) => Promise<number> }> = {};

// ---------------- helpers ----------------

function hintFor(path: string): TextFormatHint | undefined {
  const e = extname(path).toLowerCase();
  return e === '.txt' ? 'txt' : e === '.csv' ? 'csv' : e === '.tsv' ? 'tsv' : e === '.json' ? 'json' : undefined;
}

async function resolveSource(p: Parsed, io: CliIo, now: string, required = true): Promise<Resolved | null> {
  const file = p.positionals[0];
  const entries = str(p, 'entries');
  const preset = str(p, 'preset');
  const given = [file !== undefined, entries !== undefined, preset !== undefined].filter(Boolean).length;
  if (given > 1) throw new UsageError('Give exactly one entry source: a file, - (stdin), --entries or --preset.');
  if (p.positionals.length > 1) throw new UsageError(`Unexpected argument "${p.positionals[1]}".`);
  const title = str(p, 'title') ?? null;
  const opts = { title, now, generator: `whirlpick-cli/${APP_VERSION}` };
  const fmt = str(p, 'format');
  if (fmt !== undefined && !['txt', 'csv', 'tsv', 'json'].includes(fmt)) throw new UsageError('--format must be txt, csv, tsv or json.');
  if (given === 0) {
    if (!required) return null;
    throw new UsageError('No entries given. Pass a file, - for stdin, --entries "Ada,Grace" or --preset <id>.');
  }
  if ((str(p, 'min') !== undefined || str(p, 'max') !== undefined) && preset !== 'numbers') throw new UsageError('--min/--max only apply to --preset numbers.');
  if (entries !== undefined) {
    const sep = str(p, 'entries-sep') ?? ',';
    const labels = entries.split(sep).map((s) => s.trim()).filter(Boolean);
    return fromEntries(labels as EntryIn[], opts);
  }
  if (preset !== undefined) {
    const params: Record<string, string> = {};
    if (str(p, 'min') !== undefined) params.min = str(p, 'min')!;
    if (str(p, 'max') !== undefined) params.max = str(p, 'max')!;
    return fromPreset(preset, params, opts);
  }
  const wheel = str(p, 'wheel');
  if (file === '-') return fromText(await io.stdin(), fmt as TextFormatHint | undefined, { ...opts, name: 'stdin', ...(wheel ? { wheel } : {}) });
  const text = await readInputFile(file!, io.cwd);
  return fromText(text, (fmt as TextFormatHint | undefined) ?? hintFor(file!), { ...opts, name: file!, ...(wheel ? { wheel } : {}) });
}

async function seedOpts(p: Parsed, io: CliIo): Promise<SeedOpts> {
  const o: SeedOpts = {};
  if (str(p, 'seed') !== undefined) o.seed = str(p, 'seed');
  if (str(p, 'seed-phrase') !== undefined) o.seedPhrase = str(p, 'seed-phrase');
  const sf = str(p, 'seed-file');
  if (sf !== undefined) {
    const t = await readInputFile(sf, io.cwd);
    try {
      o.seedFile = JSON.parse(t);
    } catch {
      throw new WhirlError('SEED_FILE_INVALID', `${sf} is not JSON (expected the file written by \`whirlpick commit --out\`).`);
    }
  }
  if (str(p, 'public-input') !== undefined) o.publicInput = str(p, 'public-input');
  const si = int(p, 'spin-index', 0, 0xffffffff);
  if (si !== undefined) o.spinIndex = si;
  return o;
}

const printJson = (io: CliIo, v: unknown) => io.stdout(JSON.stringify(v, null, 2) + '\n');
const warnHuman = (io: CliIo, ws: readonly string[]) => ws.forEach((w) => io.stderr(`warning: ${w}\n`));

async function maybeWriteReceipt(p: Parsed, io: CliIo, value: unknown): Promise<string | undefined> {
  const out = str(p, 'receipt-out');
  if (out === undefined) return undefined;
  await writeOutputFile(out, JSON.stringify(value, null, 2) + '\n', { cwd: io.cwd, force: bool(p, 'force') ?? false });
  return out;
}

// ---------------- commands ----------------

COMMANDS.spin = {
  usage: 'whirlpick spin [<file>|-] [--entries "A,B"|--preset <id>] [options]',
  summary: 'Spin the wheel: pick one winner, several without repeats (--count), or run an elimination session (--spins).',
  flags: {
    ...SOURCE,
    ...SEED,
    count: { kind: 'string', value: 'n|all', help: 'Winners to pick without repeats (default 1; >1 or all ⇒ mode multi).' },
    mode: { kind: 'string', value: 'single|multi|elimination', help: 'Draw mode (default: from --count).' },
    spins: { kind: 'string', value: 'n', help: 'Elimination: run n spins in one call (spin index 0…n−1, winners excluded as they go).' },
    exclude: { kind: 'string', value: 'i,j,…', help: 'Entry indices already removed (elimination).' },
    link: { kind: 'bool', help: 'Add a replay link (#spin=) that plays the draw on the website.' },
    base: { kind: 'string', value: 'url', help: `Base URL for --link (default ${SITE_URL}).` },
    ...OUT,
  },
  async run(p, io, json, quiet) {
    const now = nowIso(io.env);
    const src = (await resolveSource(p, io, now))!;
    const c = str(p, 'count');
    let count: number | 'all' | undefined;
    if (c !== undefined) {
      if (c === 'all') count = 'all';
      else if (/^\d+$/.test(c)) count = Number(c);
      else throw new UsageError('--count must be a whole number or "all".');
    }
    const mode = str(p, 'mode');
    if (mode !== undefined && !['single', 'multi', 'elimination'].includes(mode)) throw new UsageError('--mode must be single, multi or elimination.');
    const ex = str(p, 'exclude');
    let exclude: number[] | undefined;
    if (ex !== undefined) {
      if (!/^\s*\d+(\s*,\s*\d+)*\s*$/.test(ex)) throw new UsageError('--exclude takes comma-separated entry indices, e.g. 0,3,7.');
      exclude = ex.split(',').map((s) => Number(s.trim()));
    }
    const spins = int(p, 'spins', 1, 1000);
    const out = await opSpin(
      src,
      {
        ...(await seedOpts(p, io)),
        ...(count !== undefined ? { count } : {}),
        ...(mode ? { mode: mode as 'single' | 'multi' | 'elimination' } : {}),
        ...(spins !== undefined ? { spins } : {}),
        ...(exclude ? { exclude } : {}),
        ...(str(p, 'title') !== undefined ? { title: str(p, 'title') } : {}),
        includeLink: bool(p, 'link') ?? false,
        ...(str(p, 'base') !== undefined ? { base: str(p, 'base') } : {}),
      },
      'cli',
      now,
    );
    const written = await maybeWriteReceipt(p, io, spins !== undefined ? out.receipts : out.receipts[0]);
    if (json) printJson(io, written ? { ...out, receiptPath: written } : out);
    else if (quiet) io.stdout(out.winners.map((w) => w.label).join('\n') + '\n');
    else {
      if (out.winners.length === 1) io.stdout(`Winner: ${out.winners[0]!.label}\n`);
      else io.stdout(`Winners:\n${out.winners.map((w, i) => `  ${i + 1}. ${w.label}`).join('\n')}\n`);
      const r = out.receipts[0]!;
      io.stdout(`seed ${r.seed}  commitment ${r.commitment}\nlist fingerprint ${r.wheelHash}\n`);
      if (out.link) io.stdout(`replay ${out.link}\n`);
      if (written) io.stdout(`receipt written to ${written}\n`);
      warnHuman(io, out.warnings);
    }
    return EXIT.OK;
  },
};

function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

COMMANDS.teams = {
  usage: 'whirlpick teams [<file>|-] (--teams <n> | --size <k>) [options]',
  summary: 'Split entries into balanced teams (tags spread evenly), with keep-apart / keep-together rules and new rounds that avoid repeat teammates.',
  flags: {
    ...SOURCE,
    ...SEED,
    teams: { kind: 'string', value: 'n', help: 'Number of teams.' },
    size: { kind: 'string', value: 'k', help: 'Team size (teams = ceil(entries / k)).' },
    balance: { kind: 'bool', negatable: true, help: 'Spread each primary tag evenly across teams (default: on when tags exist).' },
    apart: { kind: 'list', value: '"A,B"', help: 'Keep these entries in different teams (labels or #index).' },
    together: { kind: 'list', value: '"A,B"', help: 'Keep these entries in the same team (labels or #index).' },
    history: { kind: 'string', value: 'path', help: 'Earlier team receipts (one, a list, or a .whirl.json): the new split avoids repeat pairs.' },
    format: { kind: 'string', value: 'json|text|csv|txt|tsv', help: 'Human output: text (default), csv or json. With a stdin source, txt/csv/tsv/json set the input format.' },
    ...OUT,
  },
  async run(p, io, json, quiet) {
    const now = nowIso(io.env);
    const outFmt = str(p, 'format');
    // --format doubles as the output format for teams; input format is detected (or taken from the file extension).
    const pIn: Parsed = outFmt && ['json', 'text', 'csv'].includes(outFmt) ? { ...p, flags: { ...p.flags, format: undefined } } : p;
    if (outFmt && !['json', 'text', 'csv', 'txt', 'tsv'].includes(outFmt)) throw new UsageError('--format must be json, text or csv.');
    const src = (await resolveSource(pIn, io, now))!;
    const teams = int(p, 'teams', 0);
    const size = int(p, 'size', 0);
    const hist = str(p, 'history');
    let previousRounds: number[][][] | undefined;
    if (hist !== undefined) {
      const t = await readInputFile(hist, io.cwd);
      let v: unknown;
      try {
        v = JSON.parse(t);
      } catch {
        throw new WhirlError('HISTORY_INVALID', `${hist} is not JSON.`);
      }
      previousRounds = roundsFromHistory(v, src.entries, wheelHash(src.entries));
    }
    const out = opTeams(
      src,
      {
        ...(await seedOpts(p, io)),
        ...(teams !== undefined ? { teams } : {}),
        ...(size !== undefined ? { teamSize: size } : {}),
        ...(bool(p, 'balance') !== undefined ? { balance: bool(p, 'balance') } : {}),
        keepApart: list(p, 'apart').map((s) => resolveMembers(splitList(s), src.entries, 'Keep apart')),
        keepTogether: list(p, 'together').map((s) => resolveMembers(splitList(s), src.entries, 'Keep together')),
        ...(previousRounds ? { previousRounds } : {}),
        ...(str(p, 'title') !== undefined ? { title: str(p, 'title') } : {}),
      },
      'cli',
      now,
    );
    const written = await maybeWriteReceipt(p, io, out.receipt);
    if (json || outFmt === 'json') printJson(io, written ? { ...out, receiptPath: written } : out);
    else {
      io.stdout(outFmt === 'csv' ? out.csv : out.text);
      if (!quiet) {
        io.stdout(`seed ${out.receipt.seed}  commitment ${out.receipt.commitment}\n`);
        if (out.repeatPairs) io.stdout(`repeat pairs from earlier rounds: ${out.repeatPairs}\n`);
        if (written) io.stdout(`receipt written to ${written}\n`);
        warnHuman(io, out.warnings);
      }
    }
    return EXIT.OK;
  },
};

function looksLikeCode(s: string): boolean {
  return /^1j?\./.test(s.trim()) || /[#&](r|spin)=/.test(s) || /^https?:\/\//.test(s.trim());
}

function verifyHuman(io: CliIo, r: VerifyReport) {
  const head = r.status === 'valid' ? 'Valid: the draw checks out.' : r.status === 'unrevealed' ? 'Not revealed yet: the seed is still secret.' : `Doesn't match: ${r.checks.at(-1)?.detail ?? ''}`;
  io.stdout(head + '\n');
  for (const c of r.checks) io.stdout(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.detail}${c.code && !c.ok ? ` [${c.code}]` : ''}\n`);
  for (const w of r.warnings) io.stdout(`  warn ${CHECK_TEXT.committedWheelHash!.fail} [${w}]\n`);
}

COMMANDS.verify = {
  usage: 'whirlpick verify <receipt.json|-|code|url> [--commitment <hex>] [--wheel-hash <hex>]',
  summary: 'Check a receipt: list fingerprint, seed commitment, and a full re-run of the draw. Exit 0 valid, 4 invalid, 5 not revealed.',
  flags: {
    commitment: { kind: 'string', value: 'hex64', help: 'The commitment you saw before the draw.' },
    'wheel-hash': { kind: 'string', value: 'hex64', help: 'The list fingerprint you saw before the draw.' },
  },
  async run(p, io, json, quiet) {
    const arg = p.positionals[0];
    if (arg === undefined) throw new UsageError('Give a receipt: a file, - for stdin, a receipt code or a /verify/#r= link.');
    if (p.positionals.length > 1) throw new UsageError(`Unexpected argument "${p.positionals[1]}".`);
    // A receipt code or URL, unless a file of that name exists (e.g. a receipt saved as 1.json).
    const input = arg === '-' ? await io.stdin() : looksLikeCode(arg) && !existsSync(resolve(io.cwd, arg)) ? arg : await readInputFile(arg, io.cwd);
    const report = await opVerify(input, { commitment: str(p, 'commitment'), wheelHash: str(p, 'wheel-hash') });
    if (json) printJson(io, report);
    else if (quiet) io.stdout(report.status + '\n');
    else verifyHuman(io, report);
    return report.status === 'valid' ? EXIT.OK : report.status === 'unrevealed' ? EXIT.UNREVEALED : EXIT.VERIFY_FAILED;
  },
};

COMMANDS.commit = {
  usage: 'whirlpick commit [--seed <hex64>] [--out <path>]',
  summary: 'Before a public draw: make a secret seed and its commitment. Publish the commitment, keep the seed, spin later with --seed-file.',
  flags: {
    seed: { kind: 'string', value: 'hex64', help: 'Commit to this seed instead of a new random one.' },
    out: { kind: 'string', value: 'path', help: 'Save {seed, commitment, createdAt} to a new file (mode 0600); the seed is then left out of stdout.' },
    force: OUT.force!,
  },
  async run(p, io, json) {
    const now = nowIso(io.env);
    const c = opCommit(str(p, 'seed'), now);
    const out = str(p, 'out');
    if (out !== undefined) {
      await writeOutputFile(out, JSON.stringify({ seed: c.seed, commitment: c.commitment, createdAt: c.createdAt }, null, 2) + '\n', { cwd: io.cwd, force: bool(p, 'force') ?? false, mode: 0o600 });
      const doc = { ok: true, commitment: c.commitment, createdAt: c.createdAt, savedTo: out, note: COMMIT_NOTE };
      if (json) printJson(io, doc);
      else io.stdout(`commitment ${c.commitment}\nseed saved to ${out} (keep it secret)\n${COMMIT_NOTE}\n`);
      return EXIT.OK;
    }
    if (json) printJson(io, c);
    else io.stdout(`commitment ${c.commitment}\nseed       ${c.seed}  (keep secret until after the draw)\n${COMMIT_NOTE}\n`);
    return EXIT.OK;
  },
};

const LINK_FLAGS: Record<string, FlagSpec> = {
  ...SOURCE,
  replay: { kind: 'string', value: 'receipt', help: 'Make a replay link (#spin=) for this receipt file instead of a wheel link.' },
  base: { kind: 'string', value: 'url', help: `Site to link to (default ${SITE_URL}; e.g. http://127.0.0.1:4324).` },
  qr: { kind: 'bool', help: 'Also print a QR code (only for links ≤ 1800 characters).' },
  'qr-svg': { kind: 'string', value: 'path', help: 'Write the QR code as SVG to a new file.' },
  force: OUT.force!,
};

async function runLink(p: Parsed, io: CliIo, json: boolean, quiet: boolean, urlOnly: boolean): Promise<number> {
  const now = nowIso(io.env);
  const replayPath = str(p, 'replay');
  let replay: unknown;
  if (replayPath !== undefined) {
    const t = replayPath === '-' ? await io.stdin() : await readInputFile(replayPath, io.cwd);
    try {
      replay = JSON.parse(t);
    } catch {
      throw new WhirlError('BAD_JSON', `${replayPath} is not a JSON receipt.`);
    }
    if (Array.isArray(replay)) replay = replay[replay.length - 1];
  }
  const src = replayPath !== undefined ? null : await resolveSource(p, io, now);
  const svgPath = str(p, 'qr-svg');
  const out = await opLink(src, {
    ...(replay !== undefined ? { replay } : {}),
    ...(str(p, 'base') !== undefined ? { base: str(p, 'base') } : {}),
    qr: bool(p, 'qr') ?? false,
    qrSvg: svgPath !== undefined,
  });
  let written: string | undefined;
  if (svgPath !== undefined && out.qrSvg) {
    await writeOutputFile(svgPath, out.qrSvg, { cwd: io.cwd, force: bool(p, 'force') ?? false });
    written = svgPath;
  }
  const { qrSvg: _svg, ...doc } = out;
  if (urlOnly) {
    if (json) printJson(io, { ok: true, url: out.url });
    else io.stdout(out.url + '\n');
    return EXIT.OK;
  }
  if (json) printJson(io, written ? { ...doc, qrSvgPath: written } : doc);
  else {
    io.stdout(out.url + '\n');
    if (!quiet) {
      io.stdout(`${out.length} characters${out.qrAvailable ? '' : ' (too long for a QR code)'}\n`);
      if (out.qr) io.stdout(out.qr + '\n');
      if (written) io.stdout(`QR SVG written to ${written}\n`);
      warnHuman(io, out.warnings);
    }
  }
  return EXIT.OK;
}

COMMANDS.link = {
  usage: 'whirlpick link [<file>|-] [--entries|--preset] [--replay <receipt>] [--base <url>] [--qr] [--qr-svg <path>]',
  summary: 'Make a share link that opens the wheel in the browser (the wheel lives in the #fragment; nothing is uploaded), or a replay link for a receipt.',
  flags: LINK_FLAGS,
  run: (p, io, json, quiet) => runLink(p, io, json, quiet, false),
};

COMMANDS.open = {
  usage: 'whirlpick open [<file>|-] [link options]',
  summary: 'Like `link`, but prints only the URL. It does not launch a browser.',
  flags: LINK_FLAGS,
  run: (p, io, json, quiet) => runLink(p, io, json, quiet, true),
};

COMMANDS.validate = {
  usage: 'whirlpick validate <file.whirl.json|->',
  summary: 'Check a .whirl.json project file against the whirl-v1 schema. Exit 0 if valid, 3 if not.',
  flags: {},
  async run(p, io, json) {
    const arg = p.positionals[0];
    if (arg === undefined) throw new UsageError('Give a .whirl.json file (or - for stdin).');
    const t = arg === '-' ? await io.stdin() : await readInputFile(arg, io.cwd);
    let v: unknown;
    try {
      v = JSON.parse(t);
    } catch (e) {
      const doc = { ok: false, valid: false, errors: [{ path: '', code: 'BAD_JSON', message: `Not valid JSON: ${(e as Error).message}` }], warnings: [], summary: { wheels: 0, entries: 0, images: 0, history: 0 } };
      if (json) printJson(io, doc);
      else io.stdout(`Invalid: ${doc.errors[0]!.message}\n`);
      return EXIT.INVALID_INPUT;
    }
    const r = opValidate(v);
    if (json) printJson(io, r);
    else {
      const s = r.summary;
      if (r.valid) io.stdout(`Valid: ${s.wheels} wheel${s.wheels === 1 ? '' : 's'}, ${s.entries} entries, ${s.images} images, ${s.history} history records.\n`);
      else io.stdout(`Invalid (${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}):\n${r.errors.map((e) => `  ${e.path || '/'}  ${e.code}  ${e.message}`).join('\n')}\n`);
      for (const w of r.warnings) io.stderr(`warning: ${w.path} ${w.code} ${w.message}\n`);
    }
    return r.valid ? EXIT.OK : EXIT.INVALID_INPUT;
  },
};

COMMANDS.presets = {
  usage: 'whirlpick presets [<id>] [--min <n> --max <n>]',
  summary: 'List preset wheels, or print one as a .whirl.json project.',
  flags: { min: SOURCE.min!, max: SOURCE.max! },
  async run(p, io, json) {
    const id = p.positionals[0];
    if (id === undefined) {
      const presets = presetList();
      if (json) printJson(io, { ok: true, presets });
      else io.stdout(presets.map((x) => `${x.id.padEnd(15)} ${String(x.entries).padStart(4)}  ${x.mode.padEnd(11)} ${x.title}`).join('\n') + '\n');
      return EXIT.OK;
    }
    const params: Record<string, string> = {};
    if (str(p, 'min') !== undefined) params.min = str(p, 'min')!;
    if (str(p, 'max') !== undefined) params.max = str(p, 'max')!;
    printJson(io, presetAsProject(id, params, nowIso(io.env), 'cli'));
    return EXIT.OK;
  },
};

COMMANDS.schema = {
  usage: 'whirlpick schema whirl|receipt',
  summary: 'Print the JSON Schema (2020-12) for .whirl.json projects or receipts.',
  flags: {},
  async run(p, io) {
    const which = p.positionals[0];
    if (which === 'whirl') printJson(io, WHIRL_SCHEMA_V1);
    else if (which === 'receipt') printJson(io, RECEIPT_SCHEMA_V1);
    else throw new UsageError('Usage: whirlpick schema whirl|receipt');
    return EXIT.OK;
  },
};

export const COMMAND_NAMES = Object.keys(COMMANDS);

function mainHelp(): string {
  const rows = Object.entries(COMMANDS).map(([k, c]) => `  ${k.padEnd(10)} ${c.summary}`);
  return `whirlpick ${APP_VERSION}: fair, reproducible spins, picks and team splits with checkable receipts.\n\nUsage: whirlpick <command> [options]\n\nCommands:\n${rows.join('\n')}\n\nGlobal options: --json --quiet --help --version --no-color\nExit codes: 0 ok · 1 internal error · 2 usage · 3 invalid input · 4 verification failed · 5 not revealed · 6 infeasible draw\nRun \`whirlpick <command> --help\` for a command's options. MCP server: whirlpick-mcp.\n`;
}

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  const json = argv.includes('--json');
  const fail = (e: unknown): number => {
    const doc = errorDoc(e);
    if (json) printJson(io, doc);
    else {
      io.stderr(`error: ${doc.error.message}${doc.error.code !== 'USAGE' && doc.error.code !== 'INTERNAL' ? ` [${doc.error.code}]` : ''}\n`);
      if (doc.exitCode === EXIT.INTERNAL && e instanceof Error && io.env.WHIRLPICK_DEBUG) io.stderr(`${e.stack}\n`);
    }
    return doc.exitCode;
  };
  try {
    const [cmd, ...rest] = argv;
    if (cmd === undefined || cmd === '--help' || cmd === '-h' || cmd === 'help') {
      if (cmd === undefined && json) throw new UsageError('No command given. Commands: ' + COMMAND_NAMES.join(', '));
      io.stdout(mainHelp());
      return cmd === undefined ? EXIT.USAGE : EXIT.OK;
    }
    if (cmd === '--version' || cmd === '-v') {
      io.stdout(json ? JSON.stringify({ ok: true, version: APP_VERSION }) + '\n' : `${APP_VERSION}\n`);
      return EXIT.OK;
    }
    if (cmd.startsWith('-') && cmd !== '--json') throw new UsageError(`Unknown option ${cmd} before the command.`);
    const realCmd = cmd === '--json' ? rest.shift() : cmd;
    const c = realCmd ? COMMANDS[realCmd] : undefined;
    if (!c) throw new UsageError(`Unknown command "${realCmd ?? ''}". Commands: ${COMMAND_NAMES.join(', ')}.`);
    const p = parseArgs(rest, c.flags);
    if (bool(p, 'help')) {
      io.stdout(helpText(c.usage, c.summary, c.flags));
      return EXIT.OK;
    }
    if (bool(p, 'version')) {
      io.stdout(`${APP_VERSION}\n`);
      return EXIT.OK;
    }
    return await c.run(p, io, json, bool(p, 'quiet') ?? false);
  } catch (e) {
    return fail(e);
  }
}

export { COMMANDS };
