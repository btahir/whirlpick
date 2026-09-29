#!/usr/bin/env node
// Package `test` scripts: run vitest from the repo root for one project, passing test-name filters
// through even when pnpm forwards them after a literal `--` (`pnpm --filter whirlpick test -- mcp`).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2).filter((a) => a !== '--');
const bin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const r = spawnSync(process.execPath, [bin, 'run', '--root', root, ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
