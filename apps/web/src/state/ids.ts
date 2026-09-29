// Id generation (PLAN §4.1: ^[a-z]_[a-z0-9]{8}$). Uses crypto.getRandomValues when present.
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
}

export function newId(prefix: "w" | "e" | "h" | "t" = "e"): string {
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i]! % 36];
  return `${prefix}_${s}`;
}

/** Uniform integer in [0, n) from crypto, for UI-only shuffles (never the draw stream). */
export function randomInt(n: number): number {
  if (n <= 1) return 0;
  const limit = Math.floor(0x100000000 / n) * n;
  for (;;) {
    const b = randomBytes(4);
    const x = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
    if (x < limit) return x % n;
  }
}
