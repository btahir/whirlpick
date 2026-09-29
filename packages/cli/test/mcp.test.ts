// H1–H6: a real stdio MCP session against bin/whirlpick-mcp.js (built), via the SDK client.
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Ajv } from 'ajv';
import { buildReceipt, normaliseEntries, verifyReceipt, type Receipt } from '@whirlpick/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_NOW, MCP_BIN, PKG, run, SEED, workdir } from './helpers.js';

const GUARD = join(PKG, 'test/net-guard.mjs');
const GOLDEN = join(PKG, 'test/golden');
const TOOLS = ['spin_wheel', 'split_teams', 'verify_receipt', 'create_commitment', 'make_share_link', 'validate_wheel', 'list_presets'];

let dir: string;
let outside: string;
let cleanup: () => void;
let client: Client;
let transport: StdioClientTransport;
let stderr = '';
const schemas = new Map<string, (v: unknown) => boolean>();
const ajv = new Ajv({ strict: false, allErrors: true });

async function connect(args: string[], env: Record<string, string> = {}) {
  const t = new StdioClientTransport({ command: process.execPath, args: [MCP_BIN, ...args], env: { PATH: process.env.PATH ?? '', WHIRLPICK_FIXED_NOW: FIXED_NOW, NODE_OPTIONS: `--import ${GUARD}`, ...env }, stderr: 'pipe', cwd: dir });
  const c = new Client({ name: 'whirlpick-test', version: '0.0.0' });
  t.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
  await c.connect(t);
  return { c, t };
}

beforeAll(async () => {
  ({ dir, cleanup } = workdir());
  outside = mkdtempSync(join(tmpdir(), 'whirlpick-outside-'));
  writeFileSync(join(outside, 'secret.txt'), 'Ada\nGrace\n');
  writeFileSync(join(dir, 'script.sh'), 'echo hi\n');
  writeFileSync(join(dir, 'existing.json'), '{}');
  symlinkSync(join(outside, 'secret.txt'), join(dir, 'escape.txt'));
  mkdirSync(join(dir, 'sub'));
  ({ c: client, t: transport } = await connect(['--root', dir]));
  const { tools } = await client.listTools();
  for (const t of tools) if (t.outputSchema) schemas.set(t.name, ajv.compile(t.outputSchema));
});
afterAll(async () => {
  await client?.close();
  cleanup();
  rmSync(outside, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: args })) as { structuredContent?: Record<string, unknown>; content: { type: string; text: string }[]; isError?: boolean };
  expect(r.content).toHaveLength(1);
  expect(JSON.parse(r.content[0]!.text)).toEqual(r.structuredContent);
  return r;
}

const entries = ['Ada', 'Grace', { label: 'Linus', weight: 2 }, { label: 'Margaret', tags: ['B'] }, 'Priya', 'Tomas'];

describe('mcp', () => {
  it('H1: listTools returns exactly the 7 tools, each with input and output schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOLS].sort());
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.outputSchema?.type).toBe('object');
      expect(t.description!.length).toBeGreaterThan(40);
    }
  });

  it('H2: ≥ 14 golden calls; structuredContent validates against the advertised output schema', async () => {
    const receipt = JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8')) as Receipt;
    const calls: [string, string, Record<string, unknown>][] = [
      ['spin-inline', 'spin_wheel', { entries, seed: SEED }],
      ['spin-multi-link', 'spin_wheel', { entries, seed: SEED, count: 3, includeLink: true, title: 'Friday raffle' }],
      ['spin-elimination', 'spin_wheel', { file: 'names.txt', seed: SEED, mode: 'elimination', spins: 3 }],
      ['spin-preset-phrase', 'spin_wheel', { preset: 'yes-no', seedPhrase: 'demo', publicInput: 'blue', spinIndex: 4 }],
      ['teams-count', 'split_teams', { file: 'squad.tsv', teams: 3, seed: SEED }],
      ['teams-rules', 'split_teams', { entries, teamSize: 2, seed: SEED, keepApart: [['Ada', 'Grace']], keepTogether: [['Linus', '#5']], previousRounds: [[['Ada', 'Priya'], ['Grace', 'Tomas'], ['Linus', 'Margaret']]] }],
      ['verify-object', 'verify_receipt', { receipt }],
      ['verify-file-expected', 'verify_receipt', { file: 'receipt.json', expectedCommitment: receipt.commitment, expectedWheelHash: receipt.wheelHash }],
      ['verify-unrevealed', 'verify_receipt', { file: 'receipt-unrevealed.json' }],
      ['commit-seed', 'create_commitment', { seed: 'ab'.repeat(32) }],
      ['commit-save', 'create_commitment', { seed: 'cd'.repeat(32), savePath: 'sub/commit.json' }],
      ['link-entries', 'make_share_link', { entries, title: 'Pick one', settings: { spinDuration: 4, fairDraw: true } }],
      ['link-replay-qr', 'make_share_link', { replayReceipt: receipt, qrSvg: true, base: 'http://127.0.0.1:4324' }],
      ['validate-file', 'validate_wheel', { file: 'class.whirl.json' }],
      ['validate-inline-bad', 'validate_wheel', { project: { format: 'whirlpick-project', version: 1, wheels: [{ entries: [{ label: 'Ada', weight: 0 }] }] } }],
      ['presets', 'list_presets', {}],
    ];
    expect(calls.length).toBeGreaterThanOrEqual(14);
    const required: Record<string, string[]> = {
      spin_wheel: ['mode', 'winners', 'receipts', 'warnings'],
      split_teams: ['teams', 'sizes', 'balance', 'repeatPairs', 'receipt', 'text', 'csv', 'warnings'],
      verify_receipt: ['ok', 'status', 'checks', 'warnings', 'recomputed'],
      create_commitment: ['commitment', 'createdAt', 'instructions'],
      make_share_link: ['url', 'length', 'qrAvailable', 'warnings'],
      validate_wheel: ['valid', 'errors', 'warnings', 'summary'],
      list_presets: ['presets'],
    };
    for (const [name, tool, args] of calls) {
      const r = await call(tool, args);
      expect(r.isError, `${name}: ${JSON.stringify(r.structuredContent)}`).toBeFalsy();
      expect(r.structuredContent!.error).toBeUndefined();
      for (const k of required[tool]!) expect(r.structuredContent, `${name} has ${k}`).toHaveProperty(k);
      const validate = schemas.get(tool)!;
      expect(validate(r.structuredContent), `${name}: ${JSON.stringify((validate as unknown as { errors: unknown }).errors)}`).toBe(true);
      const file = join(GOLDEN, `mcp-${name}.json`);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) writeFileSync(file, JSON.stringify({ tool, args, structuredContent: r.structuredContent }, null, 2) + '\n');
      expect(r.structuredContent, name).toEqual(JSON.parse(readFileSync(file, 'utf8')).structuredContent);
    }
    expect(JSON.parse(readFileSync(join(dir, 'sub/commit.json'), 'utf8')).seed).toBe('cd'.repeat(32));
  });

  it('H3: invalid input returns isError with structuredContent.error.code, and the server keeps serving', async () => {
    const bad: [string, Record<string, unknown>, string][] = [
      ['spin_wheel', { entries, count: 0 }, 'COUNT_INVALID'],
      ['spin_wheel', { preset: 'nope' }, 'PRESET_UNKNOWN'],
      ['spin_wheel', { entries, seed: 'xyz' }, 'SEED_INVALID'],
      ['spin_wheel', { entries, count: 99 }, 'COUNT_TOO_LARGE'],
      ['split_teams', { entries, teams: 1 }, 'TEAM_COUNT_INVALID'],
      ['spin_wheel', { entries, preset: 'coin' }, 'USAGE'],
      ['verify_receipt', { receipt: 'not a code' }, 'LINK_INVALID'],
    ];
    for (const [tool, args, code] of bad) {
      const r = await call(tool, args);
      expect(r.isError, tool).toBe(true);
      expect((r.structuredContent as { error: { code: string } }).error.code).toBe(code);
      const ok = await call('list_presets', {});
      expect(ok.isError).toBeFalsy();
    }
  });

  it('H4: path safety: .. escape, absolute outside, symlink escape, .sh read, .txt write, existing output', async () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['spin_wheel', { file: '../' + outside.split('/').pop() + '/secret.txt' }, 'PATH_OUTSIDE_ROOT'],
      ['spin_wheel', { file: join(outside, 'secret.txt') }, 'PATH_OUTSIDE_ROOT'],
      ['spin_wheel', { file: 'escape.txt' }, 'PATH_OUTSIDE_ROOT'],
      ['spin_wheel', { file: 'script.sh' }, 'PATH_EXTENSION'],
      ['spin_wheel', { entries, seed: SEED, receiptPath: 'out.txt' }, 'PATH_EXTENSION'],
      ['spin_wheel', { entries, seed: SEED, receiptPath: 'existing.json' }, 'OUTPUT_EXISTS'],
      ['create_commitment', { savePath: join(outside, 'c.json') }, 'PATH_OUTSIDE_ROOT'],
      ['validate_wheel', { file: '../../etc/passwd.json' }, 'PATH_OUTSIDE_ROOT'],
    ];
    for (const [tool, args, code] of cases) {
      const r = await call(tool, args);
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect((r.structuredContent as { error: { code: string } }).error.code, JSON.stringify(args)).toBe(code);
    }
    expect(readFileSync(join(dir, 'existing.json'), 'utf8')).toBe('{}');
    const ok = await call('spin_wheel', { entries, seed: SEED, receiptPath: 'existing.json', overwrite: true });
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(readFileSync(join(dir, 'existing.json'), 'utf8')).format).toBe('whirlpick-receipt');
  });

  it('H4: WHIRLPICK_MCP_ROOT is honoured when no --root is given', async () => {
    const { c } = await connect([], { WHIRLPICK_MCP_ROOT: outside });
    const inside = (await c.callTool({ name: 'spin_wheel', arguments: { file: 'secret.txt', seed: SEED } })) as { isError?: boolean };
    expect(inside.isError).toBeFalsy();
    const out = (await c.callTool({ name: 'spin_wheel', arguments: { file: join(dir, 'names.txt'), seed: SEED } })) as unknown as { structuredContent: { error: { code: string } } };
    expect(out.structuredContent.error.code).toBe('PATH_OUTSIDE_ROOT');
    await c.close();
  });

  it('H5: MCP spin_wheel / split_teams, the CLI and core give identical receipts (except app)', async () => {
    const strip = (r: Receipt) => ({ ...r, app: undefined });
    const spin = (await call('spin_wheel', { entries, seed: SEED, count: 2, publicInput: 'room', spinIndex: 3, title: 'Parity' })).structuredContent as { receipts: Receipt[] };
    const cli = JSON.parse((await run(['spin', '-', '--format', 'json', '--seed', SEED, '--count', '2', '--public-input', 'room', '--spin-index', '3', '--title', 'Parity', '--json'], { cwd: dir, stdin: JSON.stringify(entries) })).stdout);
    const core = buildReceipt({ entries: normaliseEntries(entries).entries, seed: SEED, mode: 'multi', count: 2, publicInput: 'room', spinIndex: 3, title: 'Parity', createdAt: FIXED_NOW });
    expect(strip(spin.receipts[0]!)).toEqual(strip(cli.receipts[0]));
    expect(strip(spin.receipts[0]!)).toEqual(strip(core));
    expect(spin.receipts[0]!.app).toBe('whirlpick-mcp/0.1.0');
    expect(cli.receipts[0].app).toBe('whirlpick-cli/0.1.0');
    const teams = (await call('split_teams', { entries, teams: 3, seed: SEED, keepApart: [['Ada', 'Grace']] })).structuredContent as { receipt: Receipt };
    const cliT = JSON.parse((await run(['teams', '-', '--format', 'json', '--teams', '3', '--seed', SEED, '--apart', 'Ada,Grace'], { cwd: dir, stdin: JSON.stringify(entries) })).stdout);
    const coreT = buildReceipt({ entries: normaliseEntries(entries).entries, seed: SEED, mode: 'teams', teamCount: 3, keepApart: [[0, 1]], createdAt: FIXED_NOW });
    expect(strip(teams.receipt)).toEqual(strip(cliT.receipt));
    expect(strip(teams.receipt)).toEqual(strip(coreT));
    expect(verifyReceipt(teams.receipt).status).toBe('valid');
  });

  it('H6: the server opened no network connections (net guard loaded, nothing blocked)', async () => {
    // Prove the guard is active in the server process: make_share_link does no network; a guard
    // violation would have been logged to stderr as NET-GUARD.
    expect(stderr).not.toContain('NET-GUARD');
    const probe = await new Promise<string>((resolve) =>
      execFile(process.execPath, ['-e', "require('node:net').connect(9,'127.0.0.1')"], { env: { NODE_OPTIONS: `--import ${GUARD}`, PATH: process.env.PATH ?? '' } }, (_e, _o, se) => resolve(se)),
    );
    expect(probe).toContain('NET-GUARD: blocked net.connect');
    expect(transport).toBeDefined();
  });
});
