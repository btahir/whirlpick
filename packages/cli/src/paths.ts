// File-path safety (PLAN §5.3). CLI: the user's own shell, paths relative to cwd. MCP: stricter,
// every path must resolve (realpath, so `..` and symlinks can't escape) inside an allowed root.
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { WhirlError } from '@whirlpick/core';

export const MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 20 * 1024 * 1024;

const isProjectName = (p: string) => /\.json$/i.test(p);

/** Read a UTF-8 text file (BOM stripped). Regular files only, size-capped. */
export async function readInputFile(path: string, cwd: string): Promise<string> {
  const abs = resolve(cwd, path);
  let st;
  try {
    st = await stat(abs);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new WhirlError('FILE_NOT_FOUND', `No such file: ${path}`, { path });
    throw new WhirlError('FILE_UNREADABLE', `Can't read ${path} (${code ?? 'error'}).`, { path });
  }
  if (!st.isFile()) throw new WhirlError('PATH_NOT_FILE', `${path} is not a regular file (directories, FIFOs, sockets and devices aren't read).`, { path });
  const max = isProjectName(abs) ? MAX_PROJECT_BYTES : MAX_INPUT_BYTES;
  if (st.size > max) throw new WhirlError('FILE_TOO_LARGE', `${path} is ${(st.size / 1024 / 1024).toFixed(1)} MB; the limit is ${max / 1024 / 1024} MB.`, { path, size: st.size, max });
  let buf: Buffer;
  try {
    // O_NONBLOCK guards against a file swapped for a FIFO between stat and open.
    const fh = await open(abs, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const st2 = await fh.stat();
      if (!st2.isFile()) throw new WhirlError('PATH_NOT_FILE', `${path} is not a regular file.`, { path });
      buf = await fh.readFile();
    } finally {
      await fh.close();
    }
  } catch (e) {
    if (e instanceof WhirlError) throw e;
    throw new WhirlError('FILE_UNREADABLE', `Can't read ${path} (${(e as NodeJS.ErrnoException).code ?? 'error'}).`, { path });
  }
  if (buf.length > max) throw new WhirlError('FILE_TOO_LARGE', `${path} is larger than ${max / 1024 / 1024} MB.`, { path, max });
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new WhirlError('FILE_UNREADABLE', `${path} is not UTF-8 text.`, { path });
  }
  return text.replace(/^﻿/, '');
}

export interface WriteHooks {
  /** Test hook: runs after the temp file is written and before the rename. */
  beforeRename?: (tmp: string) => Promise<void> | void;
}

/**
 * Write a new file atomically: the parent must exist, the destination must not be a symlink, and an
 * existing file is only replaced with `force`. Writes a temp file in the same directory, then renames.
 */
export async function writeOutputFile(path: string, data: string, opts: { cwd: string; force?: boolean; mode?: number; hooks?: WriteHooks }): Promise<string> {
  const abs = resolve(opts.cwd, path);
  const dir = dirname(abs);
  try {
    if (!(await stat(dir)).isDirectory()) throw new Error('not a dir');
  } catch {
    throw new WhirlError('OUTPUT_DIR_MISSING', `The folder for ${path} doesn't exist.`, { path });
  }
  let exists = false;
  try {
    const l = await lstat(abs);
    if (l.isSymbolicLink()) throw new WhirlError('OUTPUT_SYMLINK', `${path} is a symbolic link; refusing to write through it.`, { path });
    if (!l.isFile()) throw new WhirlError('PATH_NOT_FILE', `${path} exists and is not a regular file.`, { path });
    exists = true;
  } catch (e) {
    if (e instanceof WhirlError) throw e;
  }
  if (exists && !opts.force) throw new WhirlError('OUTPUT_EXISTS', `${path} already exists. Use --force (CLI) or overwrite: true (MCP) to replace it.`, { path });
  const tmp = join(dir, `.${basename(abs)}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`);
  try {
    await writeFile(tmp, data, { mode: opts.mode ?? 0o644, flag: 'wx' });
    await opts.hooks?.beforeRename?.(tmp);
    await rename(tmp, abs);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    if (e instanceof WhirlError) throw e;
    throw new WhirlError('OUTPUT_UNWRITABLE', `Couldn't write ${path} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}).`, { path });
  }
  return abs;
}

// ---------------- MCP roots ----------------

export const MCP_READ_EXT = ['.txt', '.csv', '.tsv', '.json'];
export const MCP_WRITE_EXT = ['.json', '.svg'];

export class Roots {
  private constructor(readonly roots: string[]) {}

  static async create(dirs: string[]): Promise<Roots> {
    const out: string[] = [];
    for (const d of dirs) {
      try {
        out.push(await realpath(resolve(d)));
      } catch {
        throw new WhirlError('ROOT_INVALID', `MCP root ${d} doesn't exist.`);
      }
    }
    return new Roots(out);
  }

  private inside(p: string): boolean {
    return this.roots.some((r) => {
      const rel = relative(r, p);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith(`..${sep}`));
    });
  }

  private base(p: string): string {
    return isAbsolute(p) ? p : resolve(this.roots[0]!, p);
  }

  /** Resolve a read path: realpath inside a root, allowed extension. Returns the real path. */
  async readable(p: string): Promise<string> {
    if (!MCP_READ_EXT.includes(extname(p).toLowerCase())) throw new WhirlError('PATH_EXTENSION', `Only ${MCP_READ_EXT.join(' ')} files can be read (got ${p}).`, { path: p });
    const abs = this.base(p);
    if (!this.inside(resolve(abs))) throw new WhirlError('PATH_OUTSIDE_ROOT', `${p} is outside the allowed folders.`, { path: p, roots: this.roots });
    let real: string;
    try {
      real = await realpath(abs);
    } catch {
      throw new WhirlError('FILE_NOT_FOUND', `No such file: ${p}`, { path: p });
    }
    if (!this.inside(real)) throw new WhirlError('PATH_OUTSIDE_ROOT', `${p} resolves outside the allowed folders.`, { path: p, roots: this.roots });
    if (!MCP_READ_EXT.includes(extname(real).toLowerCase())) throw new WhirlError('PATH_EXTENSION', `${p} resolves to a file type that can't be read.`, { path: p });
    return real;
  }

  /** Resolve a write path: parent's realpath inside a root, allowed extension. */
  async writable(p: string): Promise<string> {
    if (!MCP_WRITE_EXT.includes(extname(p).toLowerCase())) throw new WhirlError('PATH_EXTENSION', `Only ${MCP_WRITE_EXT.join(' ')} files can be written (got ${p}).`, { path: p });
    const abs = this.base(p);
    if (!this.inside(resolve(abs))) throw new WhirlError('PATH_OUTSIDE_ROOT', `${p} is outside the allowed folders.`, { path: p, roots: this.roots });
    let parent: string;
    try {
      parent = await realpath(dirname(abs));
    } catch {
      throw new WhirlError('OUTPUT_DIR_MISSING', `The folder for ${p} doesn't exist.`, { path: p });
    }
    const real = join(parent, basename(abs));
    if (!this.inside(real)) throw new WhirlError('PATH_OUTSIDE_ROOT', `${p} resolves outside the allowed folders.`, { path: p, roots: this.roots });
    return real;
  }
}
