// Embed postMessage API v1 (PLAN §6.12). Pure validation so it can be unit-tested; the wiring to
// window lives in embed/bridge.ts.
import type { EntryIn } from "@whirlpick/core";

export const EMBED_VERSION = "0.1.0";

export type InboundMessage =
  | { type: "spin"; requestId?: string }
  | { type: "setEntries"; entries: EntryIn[]; requestId?: string }
  | {
      type: "setOptions";
      options: {
        spinDuration?: number;
        sound?: boolean;
        confetti?: boolean;
        mode?: "normal" | "elimination" | "multi";
        count?: number | "all";
        theme?: string;
        background?: string | null;
        mysteryMode?: boolean;
      };
      requestId?: string;
    }
  | { type: "reset"; requestId?: string }
  | { type: "getState"; requestId?: string };

export type ParseResult = { ok: true; msg: InboundMessage } | { ok: false; code: string; message: string; requestId?: string } | { ok: "ignore" };

const reqId = (v: unknown): string | undefined => (typeof v === "string" && v.length <= 128 ? v : undefined);

/** Validate a message object from the parent. Non-Whirlpick messages are ignored silently. */
export function parseInbound(data: unknown): ParseResult {
  if (!data || typeof data !== "object") return { ok: "ignore" };
  const d = data as Record<string, unknown>;
  if (d.source !== "whirlpick") return { ok: "ignore" };
  const requestId = reqId(d.requestId);
  if (d.v !== 1) return { ok: false, code: "UNSUPPORTED_VERSION", message: "Only v: 1 is supported.", requestId };
  switch (d.type) {
    case "spin":
    case "reset":
    case "getState":
      return { ok: true, msg: { type: d.type, requestId } };
    case "setEntries": {
      if (!Array.isArray(d.entries) || d.entries.length > 1000)
        return { ok: false, code: "BAD_MESSAGE", message: "entries must be an array of at most 1000 items.", requestId };
      for (const e of d.entries) {
        if (typeof e === "string") continue;
        if (!e || typeof e !== "object" || typeof (e as { label?: unknown }).label !== "string")
          return { ok: false, code: "BAD_MESSAGE", message: "Each entry is a string or {label, weight?, enabled?, tags?}.", requestId };
      }
      return { ok: true, msg: { type: "setEntries", entries: d.entries as EntryIn[], requestId } };
    }
    case "setOptions": {
      const o = d.options;
      if (!o || typeof o !== "object") return { ok: false, code: "BAD_MESSAGE", message: "options must be an object.", requestId };
      const src = o as Record<string, unknown>;
      const options: Extract<InboundMessage, { type: "setOptions" }>["options"] = {};
      if (typeof src.spinDuration === "number" && Number.isFinite(src.spinDuration))
        options.spinDuration = Math.min(30, Math.max(1, Math.round(src.spinDuration * 2) / 2));
      if (typeof src.sound === "boolean") options.sound = src.sound;
      if (typeof src.confetti === "boolean") options.confetti = src.confetti;
      if (typeof src.mysteryMode === "boolean") options.mysteryMode = src.mysteryMode;
      if (src.mode === "normal" || src.mode === "elimination" || src.mode === "multi") options.mode = src.mode;
      if (src.count === "all" || (typeof src.count === "number" && Number.isInteger(src.count) && src.count >= 1 && src.count <= 1000))
        options.count = src.count as number | "all";
      if (typeof src.theme === "string" && /^[a-z0-9-]{1,32}$/.test(src.theme)) options.theme = src.theme;
      if (src.background === null || src.background === "transparent") options.background = src.background;
      else if (typeof src.background === "string" && /^#?[0-9a-fA-F]{6}$/.test(src.background))
        options.background = `#${src.background.replace("#", "").toUpperCase()}`;
      return { ok: true, msg: { type: "setOptions", options, requestId } };
    }
    default:
      return { ok: false, code: "UNKNOWN_TYPE", message: `Unknown message type.`, requestId };
  }
}

/** Should this MessageEvent be accepted? Only from our parent window, and from `origin` if set. */
export function acceptEvent(ev: { source: unknown; origin: string }, parent: unknown, origin: string | null): boolean {
  if (!parent || ev.source !== parent) return false;
  if (origin && ev.origin !== origin) return false;
  return true;
}

export function outbound<T extends Record<string, unknown>>(type: string, body: T): T & { source: "whirlpick"; v: 1; type: string } {
  return { source: "whirlpick", v: 1, type, ...body };
}
