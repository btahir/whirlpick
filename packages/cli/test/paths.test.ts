// G4 (CLI path safety) and the atomic-write guarantee.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeOutputFile } from '../src/paths.js';
import { run, SEED, workdir } from './helpers.js';

let dir: string;
let cleanup: () => void;
beforeAll(() => {
  ({ dir, cleanup } = workdir());
  mkdirSync(join(dir, 'adir'));
  execFileSync('mkfifo', [join(dir, 'pipe.txt')]);
  writeFileSync(join(dir, 'big.txt'), 'Ada\n'.repeat(1_400_000));
  writeFileSync(join(dir, 'exists.json'), '{}');
  writeFileSync(join(dir, 'target.json'), '{}');
  symlinkSync(join(dir, 'target.json'), join(dir, 'link.json'));
});
afterAll(() => cleanup());

const code = async (args: string[]) => {
  const r = await run([...args, '--json'], { cwd: dir });
  return { exit: r.code, code: JSON.parse(r.stdout).error?.code as string };
};

describe('paths', () => {
  it('a directory → PATH_NOT_FILE', async () => expect(await code(['spin', 'adir'])).toEqual({ exit: 3, code: 'PATH_NOT_FILE' }));
  it('a FIFO → PATH_NOT_FILE (without blocking)', async () => expect(await code(['spin', 'pipe.txt'])).toEqual({ exit: 3, code: 'PATH_NOT_FILE' }));
  it('a file over 5 MB → FILE_TOO_LARGE', async () => expect(await code(['spin', 'big.txt'])).toEqual({ exit: 3, code: 'FILE_TOO_LARGE' }));
  it('a missing file → FILE_NOT_FOUND', async () => expect(await code(['spin', 'nope.txt'])).toEqual({ exit: 3, code: 'FILE_NOT_FOUND' }));
  it('an existing output without --force → OUTPUT_EXISTS; with --force it is replaced', async () => {
    expect(await code(['spin', 'names.txt', '--seed', SEED, '--receipt-out', 'exists.json'])).toEqual({ exit: 3, code: 'OUTPUT_EXISTS' });
    expect(readFileSync(join(dir, 'exists.json'), 'utf8')).toBe('{}');
    const r = await run(['spin', 'names.txt', '--seed', SEED, '--receipt-out', 'exists.json', '--force', '--json'], { cwd: dir });
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, 'exists.json'), 'utf8')).format).toBe('whirlpick-receipt');
  });
  it('a symlinked output → OUTPUT_SYMLINK, even with --force', async () => {
    expect(await code(['commit', '--out', 'link.json'])).toEqual({ exit: 3, code: 'OUTPUT_SYMLINK' });
    expect(await code(['commit', '--out', 'link.json', '--force'])).toEqual({ exit: 3, code: 'OUTPUT_SYMLINK' });
    expect(readFileSync(join(dir, 'target.json'), 'utf8')).toBe('{}');
  });
  it('a missing parent directory → OUTPUT_DIR_MISSING', async () => expect(await code(['commit', '--out', 'no/such/dir.json'])).toEqual({ exit: 3, code: 'OUTPUT_DIR_MISSING' }));
  it('a write interrupted before the rename leaves no partial file and no temp file', async () => {
    await expect(
      writeOutputFile('atomic.json', '{"x":1}', {
        cwd: dir,
        hooks: {
          beforeRename: (tmp) => {
            expect(existsSync(tmp)).toBe(true);
            throw new Error('simulated crash');
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'OUTPUT_UNWRITABLE' });
    expect(existsSync(join(dir, 'atomic.json'))).toBe(false);
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });
});
