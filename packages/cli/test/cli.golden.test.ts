// G1–G3, G5: golden --json outputs, stable exit codes, human output, help and version.
// Update goldens after a reviewed change: UPDATE_GOLDEN=1 pnpm --filter whirlpick test
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PKG, run, SEED, workdir } from './helpers.js';

const GOLDEN = join(PKG, 'test/golden');
let dir: string;
let cleanup: () => void;
beforeAll(async () => {
  ({ dir, cleanup } = workdir());
  // A team receipt used as --history.
  const r = await run(['teams', 'squad.tsv', '--teams', '3', '--seed-phrase', 'round one', '--receipt-out', 'round1.json', '--json'], { cwd: dir });
  expect(r.code).toBe(0);
});
afterAll(() => cleanup());

type Case = [name: string, args: string[], exit: number, stdin?: string];
const CASES: Case[] = [
  ['spin-txt', ['spin', 'names.txt', '--seed', SEED, '--json'], 0],
  ['spin-csv', ['spin', 'names.csv', '--seed', SEED, '--json'], 0],
  ['spin-whirl', ['spin', 'class.whirl.json', '--seed', SEED, '--json'], 0],
  ['spin-whirl-wheel-name', ['spin', 'class.whirl.json', '--wheel', 'Class 4A', '--seed', SEED, '--json'], 0],
  ['spin-stdin', ['spin', '-', '--seed', SEED, '--json'], 0, 'Ada\nGrace\nLinus\n'],
  ['spin-stdin-csv', ['spin', '-', '--format', 'csv', '--seed', SEED, '--json'], 0, 'Ada,3\nGrace,1\n'],
  ['spin-entries', ['spin', '--entries', 'Ada,Grace,Linus,Margaret', '--seed', SEED, '--json'], 0],
  ['spin-entries-sep', ['spin', '--entries', 'Ada;Grace;Linus', '--entries-sep', ';', '--seed', SEED, '--json'], 0],
  ['spin-preset', ['spin', '--preset', 'yes-no', '--seed', SEED, '--json'], 0],
  ['spin-preset-numbers', ['spin', '--preset', 'numbers', '--min', '5', '--max', '15', '--seed', SEED, '--json'], 0],
  ['spin-count-3', ['spin', 'names.txt', '--count', '3', '--seed', SEED, '--json'], 0],
  ['spin-count-all', ['spin', 'names.txt', '--count', 'all', '--seed', SEED, '--json'], 0],
  ['spin-elimination-spins-3', ['spin', 'names.txt', '--mode', 'elimination', '--spins', '3', '--seed', SEED, '--json'], 0],
  ['spin-seed-phrase', ['spin', 'names.txt', '--seed-phrase', 'friday raffle', '--json'], 0],
  ['spin-seed-file', ['spin', 'names.txt', '--seed-file', 'seed.json', '--json'], 0],
  ['spin-public-input', ['spin', 'names.txt', '--seed', SEED, '--public-input', 'blue sky', '--spin-index', '2', '--json'], 0],
  ['spin-exclude', ['spin', 'names.txt', '--mode', 'elimination', '--exclude', '0,2', '--seed', SEED, '--json'], 0],
  ['spin-link', ['spin', 'names.txt', '--seed', SEED, '--title', 'Friday raffle', '--link', '--json'], 0],
  ['teams-json', ['teams', 'squad.tsv', '--teams', '3', '--seed', SEED, '--json'], 0],
  ['teams-format-json', ['teams', 'squad.tsv', '--size', '4', '--seed', SEED, '--format', 'json'], 0],
  ['teams-no-balance', ['teams', 'squad.tsv', '--teams', '3', '--no-balance', '--seed', SEED, '--json'], 0],
  ['teams-apart-together', ['teams', 'squad.tsv', '--teams', '3', '--apart', 'Ada,Grace', '--together', 'Linus,#4', '--seed', SEED, '--json'], 0],
  ['teams-history', ['teams', 'squad.tsv', '--teams', '3', '--history', 'round1.json', '--seed', SEED, '--json'], 0],
  ['verify-valid', ['verify', 'receipt.json', '--json'], 0],
  ['verify-invalid', ['verify', 'receipt-tampered.json', '--json'], 4],
  ['verify-unrevealed', ['verify', 'receipt-unrevealed.json', '--json'], 5],
  ['verify-expected-commitment', ['verify', 'receipt.json', '--commitment', 'ee'.repeat(32), '--json'], 4],
  ['commit-seed', ['commit', '--seed', 'ab'.repeat(32), '--json'], 0],
  ['commit-out', ['commit', '--seed', 'cd'.repeat(32), '--out', 'commit-out.json', '--json'], 0],
  ['link-entries', ['link', '--entries', 'Ada,Grace,Linus', '--title', 'Pick one', '--json'], 0],
  ['link-preset-base', ['link', '--preset', 'coin', '--base', 'http://127.0.0.1:4324', '--json'], 0],
  ['link-replay', ['link', '--replay', 'receipt.json', '--json'], 0],
  ['link-qr', ['link', '--entries', 'Ada,Grace', '--qr', '--json'], 0],
  ['open-entries', ['open', '--entries', 'Ada,Grace,Linus', '--json'], 0],
  ['validate-good', ['validate', 'class.whirl.json', '--json'], 0],
  ['validate-bad', ['validate', 'bad.whirl.json', '--json'], 3],
  ['presets', ['presets', '--json'], 0],
  ['presets-yes-no', ['presets', 'yes-no', '--json'], 0],
  ['schema-whirl', ['schema', 'whirl', '--json'], 0],
  ['schema-receipt', ['schema', 'receipt', '--json'], 0],
  // errors (every error is one JSON document too)
  ['err-count-too-large', ['spin', '--entries', 'Ada,Grace', '--count', '3', '--seed', SEED, '--json'], 6],
  ['err-team-count', ['teams', '--entries', 'Ada,Grace,Linus', '--teams', '5', '--seed', SEED, '--json'], 6],
  ['err-label-ambiguous', ['teams', '--entries', 'Ada,Ada,Grace,Linus', '--teams', '2', '--apart', 'Ada,Grace', '--seed', SEED, '--json'], 3],
];

describe('cli golden', () => {
  it(`${CASES.length} golden --json outputs (≥ 20)`, async () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    for (const [name, args, exit, stdin] of CASES) {
      const r = await run(args, { cwd: dir, ...(stdin !== undefined ? { stdin } : {}) });
      expect(r.code, `${name}: ${r.stderr}${r.stdout}`).toBe(exit);
      const doc = JSON.parse(r.stdout);
      const file = join(GOLDEN, `${name}.json`);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) writeFileSync(file, JSON.stringify({ args, exit, stdout: doc }, null, 2) + '\n');
      const golden = JSON.parse(readFileSync(file, 'utf8'));
      expect(golden.args, name).toEqual(args);
      expect(doc, name).toEqual(golden.stdout);
    }
  });

  it('commit --out writes a 0600 file and leaves the seed out of stdout', async () => {
    const r = await run(['commit', '--out', 'secret.json', '--json'], { cwd: dir });
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.stdout);
    expect(doc.seed).toBeUndefined();
    expect(r.stdout).not.toMatch(/"seed"/);
    const { statSync } = await import('node:fs');
    expect(statSync(join(dir, 'secret.json')).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(readFileSync(join(dir, 'secret.json'), 'utf8'));
    expect(saved.commitment).toBe(doc.commitment);
    // Spinning with the saved seed gives a receipt with that commitment.
    const s = await run(['spin', 'names.txt', '--seed-file', 'secret.json', '--json'], { cwd: dir });
    expect(JSON.parse(s.stdout).receipts[0].commitment).toBe(doc.commitment);
  });

  it('random seeds by default: two spins differ and both verify', async () => {
    const a = JSON.parse((await run(['spin', 'names.txt', '--json'], { cwd: dir })).stdout).receipts[0];
    const b = JSON.parse((await run(['spin', 'names.txt', '--json'], { cwd: dir })).stdout).receipts[0];
    expect(a.seed).not.toBe(b.seed);
    for (const x of [a, b]) {
      writeFileSync(join(dir, 'x.json'), JSON.stringify(x));
      expect((await run(['verify', 'x.json', '--json'], { cwd: dir })).code).toBe(0);
    }
  });

  it('verify accepts a receipt code and a /verify/#r= URL', async () => {
    const link = JSON.parse((await run(['spin', 'names.txt', '--seed', SEED, '--link', '--json'], { cwd: dir })).stdout).link as string;
    expect(link).toMatch(/^https:\/\/whirlpick\.vercel\.app\/#spin=1\./);
    const code = link.split('#spin=')[1]!;
    for (const arg of [code, link, `https://whirlpick.vercel.app/verify/#r=${code}`]) {
      const r = await run(['verify', arg, '--json'], { cwd: dir });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout).status).toBe('valid');
    }
    const stdin = await run(['verify', '-', '--json'], { cwd: dir, stdin: readFileSync(join(dir, 'receipt.json'), 'utf8') });
    expect(stdin.code).toBe(0);
  });

  it('G2: exit codes 0, 2, 3, 4, 5, 6 each from ≥ 2 cases; --json stdout is one JSON document; no stack traces for 2–6', async () => {
    const cases: [string[], number, string?][] = [
      [['spin', '--entries', 'A,B', '--json'], 0],
      [['presets', '--json'], 0],
      [['bogus', '--json'], 2],
      [['spin', '--wat', '--json'], 2],
      [['spin', '--json'], 2],
      [['spin', 'names.txt', '--entries', 'A', '--json'], 2],
      [['teams', 'names.txt', '--json'], 2],
      [['spin', 'missing.txt', '--json'], 3],
      [['spin', 'names.txt', '--seed', 'xyz', '--json'], 3],
      [['spin', '--entries', 'A,B', '--preset', 'nope', '--json'], 2],
      [['spin', '--preset', 'nope', '--json'], 3],
      [['validate', 'names.txt', '--json'], 3],
      [['spin', '-', '--json'], 3, '{"format": "whirlpick-project", "version": 2, "wheels": []}'],
      [['verify', 'receipt-tampered.json', '--json'], 4],
      [['verify', 'receipt.json', '--wheel-hash', 'ab'.repeat(32), '--json'], 4],
      [['verify', 'receipt-unrevealed.json', '--json'], 5],
      [['verify', '-', '--json'], 5, 'UNREVEALED_STDIN'],
      [['spin', '--entries', 'A,B', '--count', '5', '--json'], 6],
      [['spin', 'names.txt', '--mode', 'elimination', '--spins', '7', '--json'], 6],
      [['teams', '--entries', 'A,B,C,D', '--teams', '2', '--apart', 'A,B', '--apart', 'A,C', '--apart', 'A,D', '--json'], 6],
    ];
    const seen = new Map<number, number>();
    for (const [args, exit, stdin] of cases) {
      const input = stdin === 'UNREVEALED_STDIN' ? readFileSync(join(dir, 'receipt-unrevealed.json'), 'utf8') : stdin;
      const r = await run(args, { cwd: dir, ...(input !== undefined ? { stdin: input } : {}) });
      expect(r.code, `${args.join(' ')}: ${r.stdout}`).toBe(exit);
      const doc = JSON.parse(r.stdout);
      expect(typeof doc).toBe('object');
      expect(r.stdout.trim().startsWith('{')).toBe(true);
      if (exit === 2 || exit === 6 || (exit === 3 && args[0] !== 'validate')) {
        expect(doc.ok).toBe(false);
        expect(doc.exitCode).toBe(exit);
        expect(typeof doc.error.code).toBe('string');
      }
      if (exit >= 2) expect(r.stderr).not.toMatch(/\n\s+at /);
      seen.set(exit, (seen.get(exit) ?? 0) + 1);
    }
    for (const c of [0, 2, 3, 4, 5, 6]) expect(seen.get(c) ?? 0, `exit ${c}`).toBeGreaterThanOrEqual(2);
    // Human mode errors go to stderr without stack traces.
    const h = await run(['spin', '--entries', 'A,B', '--count', '5'], { cwd: dir });
    expect(h.code).toBe(6);
    expect(h.stdout).toBe('');
    expect(h.stderr).toBe("error: Can't pick 5 from 2 eligible entries. [COUNT_TOO_LARGE]\n");
  });

  it('G3: human output: "Winner: <label>" first; --quiet prints only labels', async () => {
    const h = await run(['spin', 'names.txt', '--seed', SEED], { cwd: dir });
    expect(h.stdout.split('\n')[0]).toMatch(/^Winner: (Ada|Grace|Linus|Margaret|Priya|Tomas)$/);
    const q = await run(['spin', 'names.txt', '--seed', SEED, '--quiet'], { cwd: dir });
    expect(q.stdout).toBe(h.stdout.split('\n')[0]!.slice('Winner: '.length) + '\n');
    const m = await run(['spin', 'names.txt', '--seed', SEED, '--count', '3', '--quiet'], { cwd: dir });
    expect(m.stdout.trim().split('\n')).toHaveLength(3);
    const t = await run(['teams', 'squad.tsv', '--teams', '3', '--seed', SEED, '--format', 'csv', '--quiet'], { cwd: dir });
    expect(t.stdout.split('\n')[0]).toBe('team,name,tags');
    expect(t.stdout.trim().split('\n')).toHaveLength(13);
    const v = await run(['verify', 'receipt.json'], { cwd: dir });
    expect(v.stdout.split('\n')[0]).toBe('Valid: the draw checks out.');
  });

  it('G5: --help for the CLI and every command lists every flag; --version prints 0.1.0', async () => {
    const top = await run(['--help'], { cwd: dir });
    expect(top.code).toBe(0);
    for (const c of ['spin', 'teams', 'verify', 'commit', 'link', 'open', 'validate', 'presets', 'schema']) expect(top.stdout).toContain(c);
    const flags: Record<string, string[]> = {
      spin: ['--count', '--mode', '--spins', '--seed', '--seed-phrase', '--seed-file', '--public-input', '--spin-index', '--exclude', '--title', '--receipt-out', '--link', '--entries', '--entries-sep', '--preset', '--format', '--wheel'],
      teams: ['--teams', '--size', '--[no-]balance', '--apart', '--together', '--history', '--format', '--receipt-out', '--seed'],
      verify: ['--commitment', '--wheel-hash'],
      commit: ['--seed', '--out'],
      link: ['--replay', '--base', '--preset', '--qr', '--qr-svg'],
      open: ['--replay', '--base', '--preset', '--qr', '--qr-svg'],
      validate: [],
      presets: [],
      schema: [],
    };
    for (const [cmd, fs] of Object.entries(flags)) {
      const r = await run([cmd, '--help'], { cwd: dir });
      expect(r.code, cmd).toBe(0);
      for (const f of [...fs, '--json', '--quiet', '--help', '--version', '--no-color']) expect(r.stdout, `${cmd} ${f}`).toContain(f);
    }
    expect((await run(['--version'], { cwd: dir })).stdout).toBe('0.1.0\n');
  });
});
