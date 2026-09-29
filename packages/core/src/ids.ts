// Generated ids: `<prefix>_` + 8 chars of [a-z0-9] (PLAN §4.1).
const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function defaultRandom(b: Uint8Array): void {
  crypto.getRandomValues(b as Uint8Array<ArrayBuffer>);
}

export function newId(prefix: string, random: (b: Uint8Array) => void = defaultRandom): string {
  const b = new Uint8Array(8);
  random(b);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHA[b[i]! % 36]!;
  return `${prefix}_${s}`;
}
