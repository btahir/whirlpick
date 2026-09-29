#!/usr/bin/env node
// Licence gate (PLAN §7): fails if any installed package (prod or dev, every workspace) has a licence
// outside the allowlist (GPL/AGPL/LGPL/unknown included), or if a banned package is anywhere in
// the tree. With --credits it also checks that CREDITS.md names every production dependency.
//   pnpm licenses:check              # human output
//   pnpm licenses:check --json       # machine output
//   pnpm licenses:check --credits    # + CREDITS.md coverage of `pnpm licenses list --prod`
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOWED = ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'MPL-2.0', 'CC0-1.0', 'CC-BY-4.0', 'Unlicense', 'BlueOak-1.0.0', 'Python-2.0', 'OFL-1.1'];
// Banned regardless of what their package.json claims (PLAN §7, RULES §4).
const BANNED = [/^sharp$/, /^@img\/sharp-/, /^mini-qr$/, /^qrbtf$/, /^@imgly\/background-removal/, /^inpaint-web$/];

function isAllowed(expr) {
  if (!expr || typeof expr !== 'string') return false;
  const clean = expr.replace(/[()]/g, ' ').trim();
  if (/\sOR\s/i.test(clean)) return clean.split(/\s+OR\s+/i).some((p) => isAllowed(p));
  if (/\sAND\s/i.test(clean)) return clean.split(/\s+AND\s+/i).every((p) => isAllowed(p));
  return ALLOWED.includes(clean.replace(/\+$/, ''));
}

function list(prod) {
  const args = ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])];
  const raw = execFileSync('pnpm', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const data = JSON.parse(raw);
  const rows = [];
  for (const [license, pkgs] of Object.entries(data)) for (const p of pkgs) rows.push({ name: p.name, versions: p.versions, license: p.license ?? license });
  return rows;
}

const rows = list(false);
const bad = rows.filter((r) => !isAllowed(r.license));
const banned = rows.filter((r) => BANNED.some((re) => re.test(r.name)));
let why = '';
try {
  why = execFileSync('pnpm', ['why', '-r', 'sharp'], { encoding: 'utf8' }).trim();
} catch {
  why = '';
}
const sharpFound = /sharp@/.test(why);
const counts = {};
for (const r of rows) counts[r.license] = (counts[r.license] ?? 0) + 1;

let missingCredits = [];
if (process.argv.includes('--credits')) {
  const credits = readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
  const ours = new Set(['whirlpick', '@whirlpick/core', '@whirlpick/web', 'whirlpick-monorepo']);
  // Direct production dependencies of our packages must be named in CREDITS.md.
  const direct = new Set();
  for (const f of ['packages/core/package.json', 'packages/cli/package.json', 'apps/web/package.json']) {
    try {
      const pj = JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
      for (const d of Object.keys(pj.dependencies ?? {})) if (!ours.has(d)) direct.add(d);
    } catch {
      // package not present yet
    }
  }
  missingCredits = [...direct].filter((d) => !credits.includes(d));
}

const ok = !bad.length && !banned.length && !sharpFound && !missingCredits.length;
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok, total: rows.length, counts, disallowed: bad, banned, sharpFound, missingCredits }, null, 2));
} else {
  console.log(`Checked ${rows.length} packages: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const r of bad) console.log(`  DISALLOWED  ${r.name}@${r.versions.join(',')}  ${r.license}`);
  for (const r of banned) console.log(`  BANNED      ${r.name}@${r.versions.join(',')}`);
  if (sharpFound) console.log(`  BANNED      sharp is in the tree:\n${why}`);
  for (const m of missingCredits) console.log(`  CREDITS     ${m} is a production dependency but is not listed in CREDITS.md`);
  console.log(ok ? 'Licence check passed' : 'Licence check FAILED');
}
process.exit(ok ? 0 : 1);
