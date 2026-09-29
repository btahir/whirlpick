// `whirlpick-mcp`: local stdio MCP server (PLAN §5.4). No network, no keys. Every tool returns
// structuredContent plus one text item with the same JSON; failures are isError with
// structuredContent {error: {code, message, details}}. Value checks happen in the handlers (not in
// the zod schemas) so agents always get a stable error code.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { APP_VERSION, WhirlError, wheelHash, type EntryIn } from '@whirlpick/core';
import { z } from 'zod';
import { errorDoc } from './errors.js';
import { COMMIT_NOTE, nowIso, opCommit, opLink, opSpin, opTeams, opValidate, opVerify, presetList, roundsFromHistory, type SeedOpts } from './ops.js';
import { readInputFile, Roots, writeOutputFile } from './paths.js';
import { fromEntries, fromPreset, fromText, resolveMembers, type Resolved } from './sources.js';

const entryIn = z.union([
  z.string(),
  z.object({ label: z.string(), weight: z.number().optional(), enabled: z.boolean().optional(), tags: z.array(z.string()).optional() }),
]);
const source = {
  entries: z.array(entryIn).optional().describe('Inline entries (1–1000): strings, or {label, weight?, enabled?, tags?}. Weights 0.001–1,000,000.'),
  file: z.string().optional().describe('Path to a .txt/.csv/.tsv/.json/.whirl.json file inside the allowed roots.'),
  wheel: z.string().optional().describe('For a .whirl.json file: wheel id or name (default: the active wheel).'),
  preset: z.string().optional().describe('Preset id (see list_presets). Exactly one of entries, file, preset.'),
};
const seedOpts = {
  seed: z.string().optional().describe('64 hex chars. Default: 256 fresh random bits. Use the seed from create_commitment for a committed draw.'),
  seedPhrase: z.string().optional().describe('Derive the seed from a phrase (guessable; demos only).'),
  publicInput: z.string().optional().describe('Optional room word supplied after the commitment was published (≤ 64 chars).'),
  spinIndex: z.number().optional().describe('Spin index under this seed (integer ≥ 0, default 0).'),
};
const receiptZ = z
  .object({
    format: z.literal('whirlpick-receipt'),
    version: z.literal(1),
    algorithm: z.literal('whirlpick-draw-v1'),
    entries: z.array(z.object({ label: z.string(), weight: z.number(), enabled: z.boolean(), tags: z.array(z.string()).optional() })),
    wheelHash: z.string(),
    seed: z.string().nullable(),
    commitment: z.string(),
    spinIndex: z.number(),
    mode: z.enum(['single', 'multi', 'elimination', 'teams']),
    params: z.record(z.string(), z.unknown()),
    result: z.record(z.string(), z.unknown()),
  })
  .loose()
  .describe('A receipt-v1 object (see `whirlpick schema receipt`).');
const winnerZ = z.object({ index: z.number(), label: z.string() });
const checkZ = z.object({ id: z.string(), ok: z.boolean(), code: z.string().optional(), detail: z.string() });
const issueZ = z.object({ path: z.string(), code: z.string(), message: z.string() });
const errorZ = z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }).describe('Present only on failure (isError: true).');

/**
 * Output shapes: the SDK client validates structuredContent against the output schema even for
 * isError results, so every field is optional and failures carry {error}. On success every listed
 * field is present (checked by the tests against goldens).
 */
function out<T extends z.ZodRawShape>(shape: T) {
  const o: Record<string, z.ZodType> = {};
  for (const [k, v] of Object.entries(shape)) o[k] = (v as z.ZodType).optional();
  return { ...o, error: errorZ.optional() } as { [K in keyof T]: z.ZodOptional<T[K]> } & { error: z.ZodOptional<typeof errorZ> };
}

export interface ServerOptions {
  roots: string[];
  env?: Record<string, string | undefined>;
}

export async function createServer(opts: ServerOptions): Promise<McpServer> {
  const roots = await Roots.create(opts.roots);
  const env = opts.env ?? process.env;
  const server = new McpServer({ name: 'whirlpick', version: APP_VERSION });

  const ok = (v: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }], structuredContent: v });
  const fail = (e: unknown) => {
    const { error } = errorDoc(e);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error }) }], structuredContent: { error }, isError: true };
  };
  const wrap =
    <A>(fn: (a: A) => Promise<Record<string, unknown>>) =>
    async (a: A) => {
      try {
        return ok(await fn(a));
      } catch (e) {
        return fail(e);
      }
    };

  async function resolveSource(a: { entries?: EntryIn[] | undefined; file?: string | undefined; wheel?: string | undefined; preset?: string | undefined }, title: string | null, now: string): Promise<Resolved> {
    const n = [a.entries !== undefined, a.file !== undefined, a.preset !== undefined].filter(Boolean).length;
    if (n !== 1) throw new WhirlError('USAGE', 'Give exactly one of entries, file or preset.');
    const o = { title, now, generator: `whirlpick-mcp/${APP_VERSION}` };
    if (a.entries !== undefined) {
      if (a.entries.length === 0) throw new WhirlError('ENTRIES_INVALID', 'entries is empty.');
      return fromEntries(a.entries, o);
    }
    if (a.preset !== undefined) return fromPreset(a.preset, {}, o);
    const real = await roots.readable(a.file!);
    const text = await readInputFile(real, '/');
    const ext = real.toLowerCase().split('.').pop();
    return fromText(text, ext === 'txt' || ext === 'csv' || ext === 'tsv' || ext === 'json' ? ext : undefined, { ...o, name: a.file!, ...(a.wheel ? { wheel: a.wheel } : {}) });
  }
  const seeds = (a: { seed?: string | undefined; seedPhrase?: string | undefined; publicInput?: string | undefined; spinIndex?: number | undefined }): SeedOpts => ({
    ...(a.seed !== undefined ? { seed: a.seed } : {}),
    ...(a.seedPhrase !== undefined ? { seedPhrase: a.seedPhrase } : {}),
    ...(a.publicInput !== undefined ? { publicInput: a.publicInput } : {}),
    ...(a.spinIndex !== undefined ? { spinIndex: a.spinIndex } : {}),
  });
  async function save(path: string, data: string, overwrite: boolean | undefined): Promise<string> {
    const real = await roots.writable(path);
    await writeOutputFile(real, data, { cwd: '/', force: overwrite ?? false });
    return path;
  }

  server.registerTool(
    'spin_wheel',
    {
      title: 'Spin the wheel',
      description: 'Pick a fair, reproducible random winner (or several without repeats, or an elimination series) from a list, with a checkable receipt; use includeLink to hand people a link that replays the spin.',
      inputSchema: {
        ...source,
        ...seedOpts,
        count: z.union([z.number(), z.literal('all')]).optional().describe('Winners without repeats (integer ≥ 1 or "all"; default 1; > 1 means mode multi).'),
        mode: z.enum(['single', 'multi', 'elimination']).optional(),
        spins: z.number().optional().describe('Elimination: number of sequential spins (1–1000) under one seed.'),
        exclude: z.array(z.number()).optional().describe('Entry indices already removed (elimination).'),
        title: z.string().optional(),
        includeLink: z.boolean().optional().describe('Add a #spin= replay link for the last receipt.'),
        base: z.string().optional().describe('Site base URL for the link (default https://whirlpick.vercel.app).'),
        receiptPath: z.string().optional().describe('Also save the receipt (or list of receipts) as .json inside the allowed roots.'),
        overwrite: z.boolean().optional(),
      },
      outputSchema: out({
        mode: z.enum(['single', 'multi', 'elimination']),
        winners: z.array(winnerZ),
        receipts: z.array(receiptZ),
        link: z.string().optional(),
        receiptPath: z.string().optional(),
        warnings: z.array(z.string()),
      }),
    },
    wrap(async (a) => {
      const now = nowIso(env);
      const src = await resolveSource(a, a.title ?? null, now);
      const out = await opSpin(src, { ...seeds(a), count: a.count, mode: a.mode, spins: a.spins, exclude: a.exclude, title: a.title, includeLink: a.includeLink, base: a.base }, 'mcp', now);
      const { ok: _ok, ...rest } = out;
      const res: Record<string, unknown> = { ...rest };
      if (a.receiptPath !== undefined) res.receiptPath = await save(a.receiptPath, JSON.stringify(a.spins !== undefined ? out.receipts : out.receipts[0], null, 2) + '\n', a.overwrite);
      return res;
    }),
  );

  server.registerTool(
    'split_teams',
    {
      title: 'Split into teams',
      description: 'Split a list into fair random teams (by count or size), spreading tags such as skill levels evenly, honouring keep-apart / keep-together rules and avoiding repeat teammates from previous rounds, with a checkable receipt.',
      inputSchema: {
        ...source,
        ...seedOpts,
        teams: z.number().optional().describe('Number of teams (≥ 2). Exactly one of teams or teamSize.'),
        teamSize: z.number().optional().describe('Team size (teams = ceil(entries / size)).'),
        balance: z.boolean().optional().describe('Spread each entry\'s first tag evenly (default: on when tags exist).'),
        keepApart: z.array(z.array(z.string())).optional().describe('Rules: each a list of labels (or "#<index>") to keep in different teams.'),
        keepTogether: z.array(z.array(z.string())).optional().describe('Rules: each a list of labels (or "#<index>") to keep in one team.'),
        previousRounds: z.array(z.array(z.array(z.string()))).optional().describe('Earlier splits as lists of teams of labels; the new split minimises repeat pairs.'),
        history: z.array(receiptZ).optional().describe('Earlier team receipts (alternative to previousRounds).'),
        title: z.string().optional(),
      },
      outputSchema: out({
        teams: z.array(z.object({ name: z.string(), members: z.array(z.object({ index: z.number(), label: z.string(), tags: z.array(z.string()) })) })),
        sizes: z.array(z.number()),
        balance: z.object({ byTag: z.record(z.string(), z.array(z.number())), withinOne: z.boolean() }),
        repeatPairs: z.number(),
        receipt: receiptZ,
        text: z.string(),
        csv: z.string(),
        warnings: z.array(z.string()),
      }),
    },
    wrap(async (a) => {
      const now = nowIso(env);
      const src = await resolveSource(a, a.title ?? null, now);
      const rounds: number[][][] = [];
      if (a.previousRounds) for (const round of a.previousRounds) rounds.push(round.map((t) => resolveMembers(t, src.entries, 'previousRounds')));
      if (a.history) rounds.push(...roundsFromHistory(a.history, src.entries, wheelHash(src.entries)));
      const out = opTeams(
        src,
        {
          ...seeds(a),
          teams: a.teams,
          teamSize: a.teamSize,
          balance: a.balance,
          keepApart: (a.keepApart ?? []).map((r) => resolveMembers(r, src.entries, 'keepApart')),
          keepTogether: (a.keepTogether ?? []).map((r) => resolveMembers(r, src.entries, 'keepTogether')),
          previousRounds: rounds,
          title: a.title,
        },
        'mcp',
        now,
      );
      const { ok: _ok, ...rest } = out;
      return rest;
    }),
  );

  server.registerTool(
    'verify_receipt',
    {
      title: 'Verify a receipt',
      description: 'Check a Whirlpick receipt (object, receipt code, or /verify/#r= or /#spin= URL): the list fingerprint, the seed commitment and a full re-run of the draw; pass the commitment and fingerprint you saw before the draw to confirm nothing changed.',
      inputSchema: {
        receipt: z.union([receiptZ, z.string()]).optional(),
        file: z.string().optional().describe('A receipt .json file inside the allowed roots.'),
        expectedCommitment: z.string().optional(),
        expectedWheelHash: z.string().optional(),
      },
      outputSchema: out({
        ok: z.boolean(),
        status: z.enum(['valid', 'invalid', 'unrevealed']),
        checks: z.array(checkZ),
        warnings: z.array(z.string()),
        recomputed: z.object({ wheelHash: z.string().optional(), commitment: z.string().optional(), picks: z.array(z.object({ index: z.number(), label: z.string(), landingU32: z.number() })).optional(), teams: z.array(z.array(z.number())).optional(), repeatPairs: z.number().optional() }),
      }),
    },
    wrap(async (a) => {
      if ((a.receipt === undefined) === (a.file === undefined)) throw new WhirlError('USAGE', 'Give exactly one of receipt or file.');
      const input = a.file !== undefined ? await readInputFile(await roots.readable(a.file), '/') : a.receipt;
      return (await opVerify(input, { commitment: a.expectedCommitment, wheelHash: a.expectedWheelHash })) as unknown as Record<string, unknown>;
    }),
  );

  server.registerTool(
    'create_commitment',
    {
      title: 'Create a commitment',
      description: 'Before a public draw: publish the returned commitment to the audience first, keep the seed secret (or save it with savePath), then call spin_wheel with that seed.',
      inputSchema: {
        seed: z.string().optional().describe('Commit to this 64-hex seed instead of a fresh random one.'),
        savePath: z.string().optional().describe('Save {seed, commitment, createdAt} to a new .json file (mode 0600); the seed is then omitted from the result.'),
        overwrite: z.boolean().optional(),
      },
      outputSchema: out({ commitment: z.string(), seed: z.string().optional(), createdAt: z.string(), savedTo: z.string().optional(), instructions: z.string() }),
    },
    wrap(async (a) => {
      const c = opCommit(a.seed, nowIso(env));
      if (a.savePath !== undefined) {
        const real = await roots.writable(a.savePath);
        await writeOutputFile(real, JSON.stringify({ seed: c.seed, commitment: c.commitment, createdAt: c.createdAt }, null, 2) + '\n', { cwd: '/', force: a.overwrite ?? false, mode: 0o600 });
        return { commitment: c.commitment, createdAt: c.createdAt, savedTo: a.savePath, instructions: COMMIT_NOTE };
      }
      return { commitment: c.commitment, seed: c.seed, createdAt: c.createdAt, instructions: COMMIT_NOTE };
    }),
  );

  server.registerTool(
    'make_share_link',
    {
      title: 'Make a share link',
      description: 'Make a link that opens a ready-to-spin wheel in the browser (the wheel travels in the URL fragment, nothing is uploaded), or a replay link for a receipt; optionally with a QR code SVG.',
      inputSchema: {
        ...source,
        title: z.string().optional(),
        settings: z.record(z.string(), z.unknown()).optional().describe('Partial wheel settings (mode, spinDuration, theme, fairDraw, …) as in .whirl.json.'),
        replayReceipt: receiptZ.optional().describe('Make a #spin= replay link for this receipt instead.'),
        base: z.string().optional(),
        qrSvg: z.boolean().optional().describe('Include an SVG QR code (links ≤ 1800 characters).'),
      },
      outputSchema: out({ url: z.string(), length: z.number(), qrAvailable: z.boolean(), qrSvg: z.string().optional(), warnings: z.array(z.string()) }),
    },
    wrap(async (a) => {
      const now = nowIso(env);
      const src = a.replayReceipt !== undefined ? null : await resolveSource(a, a.title ?? null, now);
      const out = await opLink(src, { ...(a.replayReceipt !== undefined ? { replay: a.replayReceipt } : {}), base: a.base, ...(a.title !== undefined ? { title: a.title } : {}), ...(a.settings ? { settings: a.settings } : {}), qrSvg: a.qrSvg });
      const { ok: _ok, qr: _qr, ...rest } = out;
      return rest;
    }),
  );

  server.registerTool(
    'validate_wheel',
    {
      title: 'Validate a .whirl.json',
      description: 'Check a .whirl.json project (inline object or file) against the whirl-v1 schema before handing it to a person or importing it; returns every problem with its JSON pointer.',
      inputSchema: { project: z.record(z.string(), z.unknown()).optional(), file: z.string().optional() },
      outputSchema: out({ valid: z.boolean(), errors: z.array(issueZ), warnings: z.array(issueZ), summary: z.object({ wheels: z.number(), entries: z.number(), images: z.number(), history: z.number() }) }),
    },
    wrap(async (a) => {
      if ((a.project === undefined) === (a.file === undefined)) throw new WhirlError('USAGE', 'Give exactly one of project or file.');
      let json: unknown = a.project;
      if (a.file !== undefined) {
        const t = await readInputFile(await roots.readable(a.file), '/');
        try {
          json = JSON.parse(t);
        } catch (e) {
          return { valid: false, errors: [{ path: '', code: 'BAD_JSON', message: `Not valid JSON: ${(e as Error).message}` }], warnings: [], summary: { wheels: 0, entries: 0, images: 0, history: 0 } };
        }
      }
      const { ok: _ok, ...rest } = opValidate(json);
      return rest;
    }),
  );

  server.registerTool(
    'list_presets',
    {
      title: 'List presets',
      description: 'List the built-in preset wheels (yes/no, coin, numbers, letters, countries, samples for raffles, classes and teams) to use as `preset` in the other tools.',
      inputSchema: {},
      outputSchema: out({ presets: z.array(z.object({ id: z.string(), title: z.string(), slug: z.string().nullable(), entries: z.number(), mode: z.string() })) }),
    },
    wrap(async () => ({ presets: presetList() })),
  );

  return server;
}

export function rootsFromArgs(argv: readonly string[], env: Record<string, string | undefined>, cwd: string): string[] {
  const roots: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--root') {
      const v = argv[++i];
      if (!v) throw new WhirlError('USAGE', '--root needs a directory.');
      roots.push(v);
    } else if (a.startsWith('--root=')) roots.push(a.slice(7));
    else if (a === '--help' || a === '-h') throw new WhirlError('HELP', 'whirlpick-mcp [--root <dir>]... : stdio MCP server. Roots default to $WHIRLPICK_MCP_ROOT (path-delimiter-separated), else the current directory.');
    else if (a === '--version') throw new WhirlError('VERSION', APP_VERSION);
    else throw new WhirlError('USAGE', `Unknown argument ${a}. Usage: whirlpick-mcp [--root <dir>]...`);
  }
  if (roots.length) return roots;
  const fromEnv = env.WHIRLPICK_MCP_ROOT;
  if (fromEnv) return fromEnv.split(process.platform === 'win32' ? ';' : ':').filter(Boolean);
  return [cwd];
}

export async function runStdio(argv: readonly string[]): Promise<number> {
  let roots: string[];
  try {
    roots = rootsFromArgs(argv, process.env, process.cwd());
  } catch (e) {
    const err = e as WhirlError;
    if (err.code === 'HELP' || err.code === 'VERSION') {
      process.stdout.write(err.message + '\n');
      return 0;
    }
    process.stderr.write(`whirlpick-mcp: ${err.message}\n`);
    return 2;
  }
  const server = await createServer({ roots });
  await server.connect(new StdioServerTransport());
  return -1;
}
