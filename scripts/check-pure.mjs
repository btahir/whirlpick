#!/usr/bin/env node
// `pnpm check:pure` (PLAN §1.1): packages/core/src must not touch DOM or Node APIs, and may import
// only @noble/hashes and its own files. Allowed web-standard globals: TextEncoder, TextDecoder,
// CompressionStream, DecompressionStream, crypto.getRandomValues (default of injectable params).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../packages/core/src/', import.meta.url).pathname;
const BANNED = /node:|from ["'](fs|path|os|zlib|crypto|child_process)["']|\bwindow\b|\bdocument\b|\bprocess\.|\bBuffer\b|\brequire\(|\batob\b|\bbtoa\b|\blocalStorage\b|\bnavigator\b|\bfetch\(|\bXMLHttpRequest\b|\bindexedDB\b|\bsetTimeout\b|\bsetInterval\b|\bBlob\b|\bstructuredClone\b/;
const bad = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
  const lines = readFileSync(join(dir, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '').replace(/^\s*(\/\*\*?|\*).*$/, '');
    if (BANNED.test(code)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
    const imp = /\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/.exec(code);
    const spec = imp && (imp[1] ?? imp[2]);
    if (spec && !spec.startsWith('./') && !spec.startsWith('@noble/hashes/')) bad.push(`${f}:${i + 1}: disallowed import "${spec}"`);
  });
}
const pkg = JSON.parse(readFileSync(new URL('../packages/core/package.json', import.meta.url), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
if (deps.length !== 1 || deps[0] !== '@noble/hashes') bad.push(`packages/core/package.json: runtime dependencies must be exactly @noble/hashes (found: ${deps.join(', ') || 'none'})`);
if (bad.length) {
  console.error('Core purity check failed:\n' + bad.join('\n'));
  process.exit(1);
}
console.log('Core purity check passed (packages/core/src: no DOM/Node APIs; only dependency @noble/hashes).');
