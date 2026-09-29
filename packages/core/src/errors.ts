// One error type for the whole core. `code` is stable and documented in AGENTS.md.
export class WhirlError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'WhirlError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isWhirlError(e: unknown): e is WhirlError {
  return e instanceof WhirlError || (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'WhirlError' && typeof (e as { code?: unknown }).code === 'string');
}
