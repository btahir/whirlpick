import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReceipt, commitmentFor, normaliseEntries } from '@whirlpick/core';

export const PKG = new URL('..', import.meta.url).pathname;
export const BIN = join(PKG, 'bin/whirlpick.js');
export const MCP_BIN = join(PKG, 'bin/whirlpick-mcp.js');
export const FIXED_NOW = '2026-01-01T00:00:00.000Z';
export const SEED = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(args: string[], opts: { cwd: string; stdin?: string; env?: Record<string, string> }): Promise<Run> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [BIN, ...args], { cwd: opts.cwd, env: { PATH: process.env.PATH ?? '', WHIRLPICK_FIXED_NOW: FIXED_NOW, ...opts.env }, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr });
    });
    if (opts.stdin !== undefined) child.stdin!.end(opts.stdin);
    else child.stdin!.end();
  });
}

/** A temp working dir with the fixtures plus generated receipts. */
export function workdir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'whirlpick-cli-'));
  cpSync(join(PKG, 'test/fixtures'), dir, { recursive: true });
  const entries = normaliseEntries(['Ada', 'Grace', 'Linus', 'Margaret']).entries;
  const valid = buildReceipt({ entries, seed: SEED, mode: 'single', createdAt: FIXED_NOW, app: 'whirlpick-cli/0.1.0' });
  writeFileSync(join(dir, 'receipt.json'), JSON.stringify(valid, null, 2));
  writeFileSync(join(dir, 'receipt-tampered.json'), JSON.stringify({ ...valid, result: { picks: [{ ...valid.result.picks![0]!, index: 0, label: 'Ada' }] } }, null, 2));
  writeFileSync(join(dir, 'receipt-unrevealed.json'), JSON.stringify(buildReceipt({ entries, seed: SEED, mode: 'multi', count: 2, reveal: false, createdAt: FIXED_NOW, app: 'whirlpick-cli/0.1.0' }), null, 2));
  writeFileSync(join(dir, 'seed.json'), JSON.stringify({ seed: 'ab'.repeat(32), commitment: commitmentFor('ab'.repeat(32)), createdAt: FIXED_NOW }));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
