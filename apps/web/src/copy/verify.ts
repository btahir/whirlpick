// Plain-language copy for /verify/ results (REVIEW P1-9). Core's check details are written for
// the CLI; here every failure gets a sentence that never interpolates a missing field.
import { CHECK_TEXT, type VerifyCheck } from "@whirlpick/core";

const ALGO = "whirlpick-draw-v1";

/** A short, quoted rendering of an arbitrary receipt value. Never returns "undefined". */
export function quoteValue(v: unknown): string {
  let s: string;
  if (v === undefined) return "(nothing)";
  if (typeof v === "string") s = v;
  else if (v === null) s = "null";
  else {
    try {
      s = JSON.stringify(v) ?? String(v);
    } catch {
      s = String(v);
    }
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 40) s = `${s.slice(0, 39)}…`;
  return `"${s}"`;
}

const has = (o: Record<string, unknown> | null, k: string) => !!o && o[k] !== undefined && o[k] !== null && o[k] !== "";

/** The sentence shown for a failed check. `raw` is the parsed receipt object, if there was one. */
export function failureSentence(check: VerifyCheck | undefined, raw: unknown): string {
  if (!check) return "This isn't a receipt.";
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const fallback = CHECK_TEXT[check.id]?.fail ?? "This receipt doesn't check out.";
  switch (check.code) {
    case "BAD_JSON":
      return "This isn't a readable receipt. Paste the whole receipt, a replay link or a verify link.";
    case "UNSUPPORTED_VERSION":
      if (!has(o, "format")) return "This isn't a Whirlpick receipt: it doesn't say what format it is.";
      if (o!.format !== "whirlpick-receipt") return `This receipt's format is ${quoteValue(o!.format)}, which Whirlpick doesn't read.`;
      if (!has(o, "version")) return "This receipt doesn't say which version it is. Whirlpick reads version 1.";
      return `This receipt is version ${quoteValue(o!.version)}. Whirlpick reads version 1.`;
    case "UNKNOWN_ALGORITHM":
      if (!has(o, "algorithm")) return `This receipt doesn't name an algorithm. Whirlpick checks ${ALGO}.`;
      return `This receipt uses ${quoteValue(o!.algorithm)}, which Whirlpick doesn't know.`;
    default:
      break;
  }
  const d = check.detail ?? "";
  // Core's details can quote receipt fields with String(); a missing one would read "undefined".
  if (!d || /\bundefined\b/.test(d)) return fallback;
  return d;
}

/** "11 checks passed" (REVIEW P1-9: a count instead of the camelCase ids). */
export function passedLine(checks: readonly VerifyCheck[]): string {
  const n = checks.filter((c) => c.ok).length;
  return `${n} ${n === 1 ? "check" : "checks"} passed`;
}

export type DetailPart = { kind: "text"; text: string } | { kind: "hash"; hex: string };

/** Splits a check detail into text and 64-hex hashes, so hashes can render as mono chips. */
export function splitHashes(detail: string): DetailPart[] {
  const out: DetailPart[] = [];
  const re = /\b[0-9a-f]{64}\b/g;
  let last = 0;
  for (let m = re.exec(detail); m; m = re.exec(detail)) {
    if (m.index > last) out.push({ kind: "text", text: detail.slice(last, m.index) });
    out.push({ kind: "hash", hex: m[0] });
    last = m.index + m[0].length;
  }
  if (last < detail.length) out.push({ kind: "text", text: detail.slice(last) });
  // "(6aab…)" → drop the brackets around a lone hash so the chip isn't wrapped in punctuation.
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1]!, h = out[i]!, b = out[i + 1]!;
    if (h.kind === "hash" && a.kind === "text" && b.kind === "text" && a.text.endsWith("(") && b.text.startsWith(")")) {
      a.text = a.text.slice(0, -1);
      b.text = b.text.slice(1);
    }
  }
  return out.filter((p) => p.kind === "hash" || p.text !== "");
}
