// A small strict argv parser: per-command flag specs, `--flag value`, `--flag=value`, repeatable
// flags, `--no-<bool>`, and `-` as a positional (stdin). Unknown flags are usage errors (exit 2).
import { UsageError } from './errors.js';

export type FlagKind = 'bool' | 'string' | 'list';

export interface FlagSpec {
  kind: FlagKind;
  /** Help text. */
  help: string;
  /** Placeholder for the value in help output. */
  value?: string;
  /** Accept --no-<name> (bool only). */
  negatable?: boolean;
}

export interface Parsed {
  positionals: string[];
  flags: Record<string, string | boolean | string[] | undefined>;
}

export const GLOBAL_FLAGS: Record<string, FlagSpec> = {
  json: { kind: 'bool', help: 'Print exactly one JSON document on stdout (success or error).' },
  quiet: { kind: 'bool', help: 'Print only the essential result (e.g. the winner labels).' },
  help: { kind: 'bool', help: 'Show help for this command.' },
  version: { kind: 'bool', help: 'Print the version.' },
  'no-color': { kind: 'bool', help: 'Disable colour in human output.' },
};

export function parseArgs(argv: readonly string[], spec: Record<string, FlagSpec>): Parsed {
  const all = { ...GLOBAL_FLAGS, ...spec };
  const flags: Parsed['flags'] = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a === '-' || !a.startsWith('-')) {
      positionals.push(a);
      continue;
    }
    if (a === '-h') {
      flags.help = true;
      continue;
    }
    if (!a.startsWith('--')) throw new UsageError(`Unknown option ${a}. Run with --help to see the options.`);
    const eq = a.indexOf('=');
    let name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    let inline: string | undefined = eq >= 0 ? a.slice(eq + 1) : undefined;
    let neg = false;
    if (!all[name] && name.startsWith('no-') && all[name.slice(3)]?.negatable) {
      name = name.slice(3);
      neg = true;
    }
    const s = all[name];
    if (!s) throw new UsageError(`Unknown option --${name}. Run with --help to see the options.`);
    if (s.kind === 'bool') {
      if (inline !== undefined) throw new UsageError(`--${name} takes no value.`);
      flags[name] = !neg;
      continue;
    }
    if (inline === undefined) {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith('--') && next !== '--')) throw new UsageError(`--${name} needs a value${s.value ? ` (${s.value})` : ''}.`);
      inline = next;
      i++;
    }
    if (s.kind === 'list') {
      const prev = flags[name];
      flags[name] = [...(Array.isArray(prev) ? prev : []), inline];
    } else {
      if (flags[name] !== undefined) throw new UsageError(`--${name} was given more than once.`);
      flags[name] = inline;
    }
  }
  return { positionals, flags };
}

export const str = (p: Parsed, k: string): string | undefined => (typeof p.flags[k] === 'string' ? (p.flags[k] as string) : undefined);
export const bool = (p: Parsed, k: string): boolean | undefined => (typeof p.flags[k] === 'boolean' ? (p.flags[k] as boolean) : undefined);
export const list = (p: Parsed, k: string): string[] => (Array.isArray(p.flags[k]) ? (p.flags[k] as string[]) : []);

export function int(p: Parsed, k: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const v = str(p, k);
  if (v === undefined) return undefined;
  if (!/^-?\d+$/.test(v.trim())) throw new UsageError(`--${k} must be a whole number (got "${v}").`);
  const n = Number(v);
  if (n < min || n > max) throw new UsageError(`--${k} must be from ${min} to ${max} (got ${n}).`);
  return n;
}

export function helpText(usage: string, summary: string, spec: Record<string, FlagSpec>, extra = ''): string {
  const rows = Object.entries({ ...spec, ...GLOBAL_FLAGS }).map(([k, s]) => {
    const left = `  --${s.negatable ? `[no-]${k}` : k}${s.value ? ` <${s.value}>` : ''}`;
    return `${left.padEnd(34)} ${s.help}${s.kind === 'list' ? ' (repeatable)' : ''}`;
  });
  return `${summary}\n\nUsage: ${usage}\n\nOptions:\n${rows.join('\n')}\n${extra ? `\n${extra}\n` : ''}`;
}
