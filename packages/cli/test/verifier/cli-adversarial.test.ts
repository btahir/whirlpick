// Verifier-owned adversarial CLI / MCP checks (pass 1, 2026-09-29). Runs the built bins.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildReceipt, normaliseEntries } from '@whirlpick/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_NOW, MCP_BIN, PKG, run, SEED, workdir } from '../helpers.js';

const GUARD = join(PKG, 'test/net-guard.mjs');
let dir: string;
let cleanup: () => void;
let client: Client;

beforeAll(async () => {
  ({ dir, cleanup } = workdir());
  const entries = normaliseEntries(['Ada', 'Grace', 'Linus']).entries;
  // A receipt saved under a name that also looks like a receipt code ("1.").
  writeFileSync(join(dir, '1.json'), JSON.stringify(buildReceipt({ entries, seed: SEED, mode: 'single', createdAt: FIXED_NOW })));
  const t = new StdioClientTransport({ command: process.execPath, args: [MCP_BIN, '--root', dir], env: { PATH: process.env.PATH ?? '', WHIRLPICK_FIXED_NOW: FIXED_NOW, NODE_OPTIONS: `--import ${GUARD}` }, stderr: 'pipe', cwd: dir });
  client = new Client({ name: 'verifier', version: '0.0.0' });
  await client.connect(t);
});
afterAll(async () => {
  await client?.close();
  cleanup();
});

type ToolResult = { structuredContent?: Record<string, any>; content: { type: string; text: string }[]; isError?: boolean };
const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as ToolResult;

describe('verifier: CLI', () => {
  it('spin --link validates --base like link does (no javascript: or relative links)', async () => {
    for (const base of ['javascript:alert(1)//', 'not a url']) {
      const r = await run(['spin', '--entries', 'Ada,Grace', '--seed', SEED, '--link', '--base', base, '--json'], { cwd: dir });
      expect(r.code).toBe(3);
      expect(JSON.parse(r.stdout).error.code).toBe('BASE_INVALID');
    }
    const ok = await run(['spin', '--entries', 'Ada,Grace', '--seed', SEED, '--link', '--base', 'http://127.0.0.1:4324/', '--json'], { cwd: dir });
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).link).toMatch(/^http:\/\/127\.0\.0\.1:4324\/#spin=1\./);
  });
  it('verify reads an existing file even when its name looks like a receipt code (1.json)', async () => {
    const r = await run(['verify', '1.json', '--json'], { cwd: dir });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).status).toBe('valid');
  });
  it('stdin "Last, First" lists keep the whole name', async () => {
    const r = await run(['spin', '-', '--seed', SEED, '--count', 'all', '--json'], { cwd: dir, stdin: 'Lovelace, Ada\nHopper, Grace\nTorvalds, Linus\n' });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).receipts[0].entries.map((e: { label: string }) => e.label)).toEqual(['Lovelace, Ada', 'Hopper, Grace', 'Torvalds, Linus']);
  });
  it('--json errors are exactly one JSON document with no stack trace', async () => {
    const cases: [string[], number][] = [
      [['spin', '--entries', 'A,B', '--count', '3'], 6],
      [['spin', 'missing.txt'], 3],
      [['spin', '--entries', 'A,B', '--nope'], 2],
      [['teams', '--entries', 'A,B,C,D', '--teams', '2', '--apart', 'A,B', '--together', 'A,B'], 6],
      [['verify', 'receipt-unrevealed.json'], 5],
      [['verify', 'receipt-tampered.json'], 4],
    ];
    for (const [args, code] of cases) {
      const r = await run([...args, '--json'], { cwd: dir });
      expect(r.code).toBe(code);
      expect(() => JSON.parse(r.stdout)).not.toThrow();
      expect(r.stderr).not.toMatch(/\n\s+at /);
    }
  });
});

describe('verifier: MCP over stdio', () => {
  it('verify_receipt returns a verify report (not an SDK validation error) for a malformed receipt object', async () => {
    const r = await call('verify_receipt', { receipt: { format: 'whirlpick-receipt', version: 2 } });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.status).toBe('invalid');
    expect(r.structuredContent!.checks.find((c: { ok: boolean }) => !c.ok).code).toBe('UNSUPPORTED_VERSION');
  });
  it('spin_wheel includeLink rejects a non-http base with BASE_INVALID', async () => {
    const r = await call('spin_wheel', { entries: ['Ada', 'Grace'], seed: SEED, includeLink: true, base: 'javascript:alert(1)//' });
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.error.code).toBe('BASE_INVALID');
  });
  it('make_share_link with an invalid replay receipt gives RECEIPT_INVALID', async () => {
    const r = await call('make_share_link', { replayReceipt: { format: 'whirlpick-receipt' } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.error.code).toBe('RECEIPT_INVALID');
  });
  it('the server keeps serving after bad calls', async () => {
    const r = await call('list_presets', {});
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.presets.length).toBeGreaterThan(10);
  });
});
