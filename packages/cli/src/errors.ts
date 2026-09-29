// Stable exit codes (PLAN §5.1, AGENTS.md) and the mapping from error codes to them.
import { isWhirlError, WhirlError } from '@whirlpick/core';

export const EXIT = {
  OK: 0,
  INTERNAL: 1,
  USAGE: 2,
  INVALID_INPUT: 3,
  VERIFY_FAILED: 4,
  UNREVEALED: 5,
  INFEASIBLE: 6,
} as const;

export class UsageError extends WhirlError {
  constructor(message: string, details?: unknown) {
    super('USAGE', message, details);
  }
}

/** Codes for draws that can't be done with these inputs (exit 6). */
export const INFEASIBLE_CODES = new Set([
  'COUNT_TOO_LARGE',
  'NO_ELIGIBLE_ENTRIES',
  'TEAM_COUNT_INVALID',
  'TOGETHER_TOO_LARGE',
  'APART_TOO_MANY',
  'CONSTRAINT_CONFLICT',
  'CONSTRAINTS_UNSATISFIED',
  'CONSTRAINTS_SEARCH_LIMIT',
]);

export function exitCodeFor(e: unknown): number {
  if (!isWhirlError(e)) return EXIT.INTERNAL;
  if (e.code === 'USAGE') return EXIT.USAGE;
  if (INFEASIBLE_CODES.has(e.code)) return EXIT.INFEASIBLE;
  if (e.code === 'INTERNAL') return EXIT.INTERNAL;
  return EXIT.INVALID_INPUT;
}

export interface ErrorDoc {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  exitCode: number;
}

export function errorDoc(e: unknown): ErrorDoc {
  const exitCode = exitCodeFor(e);
  if (isWhirlError(e)) {
    return { ok: false, error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) }, exitCode };
  }
  return { ok: false, error: { code: 'INTERNAL', message: `Internal error: ${(e as Error)?.message ?? String(e)}. Please report this.` }, exitCode };
}
