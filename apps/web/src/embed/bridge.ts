// Embed postMessage API v1 wiring (PLAN §6.12). Accepts messages only from window.parent (and
// from `origin` when given); replies to that origin, or "*" when none was given.
import type { Controller } from "../app/controller";
import { activeWheel } from "../state/reducer";
import { acceptEvent, EMBED_VERSION, outbound, parseInbound } from "./protocol";

export function startEmbedBridge(c: Controller, origin: string | null): () => void {
  const parent = window.parent !== window ? window.parent : null;
  if (!parent) return () => {};
  const target = origin ?? "*";
  const post = (type: string, body: Record<string, unknown>) => {
    try {
      parent.postMessage(outbound(type, body), target);
    } catch {
      /* the parent may have navigated away */
    }
  };
  let pendingRequest: string | undefined;
  c.onSpinStart((spinIndex) => post("spinStart", { requestId: pendingRequest, spinIndex }));
  c.onResult(({ receipt, winners }) => {
    post("result", { requestId: pendingRequest, winners, receipt });
    pendingRequest = undefined;
  });
  const onMessage = (ev: MessageEvent) => {
    if (!acceptEvent({ source: ev.source, origin: ev.origin }, parent, origin)) return;
    const r = parseInbound(ev.data);
    if (r.ok === "ignore") return;
    if (r.ok === false) {
      post("error", { requestId: r.requestId, code: r.code, message: r.message });
      return;
    }
    const m = r.msg;
    const st = c.store.getState();
    switch (m.type) {
      case "spin":
        if (st.spin.phase !== "idle") {
          post("error", { requestId: m.requestId, code: "BUSY", message: "The wheel is already spinning." });
          return;
        }
        pendingRequest = m.requestId;
        c.spin();
        if (c.store.getState().spin.phase === "idle" && !c.store.getState().teams) {
          post("error", { requestId: m.requestId, code: "NO_ELIGIBLE_ENTRIES", message: "Add at least two entries to spin." });
          pendingRequest = undefined;
        }
        return;
      case "setEntries":
        try {
          c.embedSetEntries(m.entries);
          post("state", stateBody(c, m.requestId));
        } catch (e) {
          post("error", { requestId: m.requestId, code: (e as { code?: string }).code ?? "BAD_MESSAGE", message: (e as Error).message });
        }
        return;
      case "setOptions": {
        const o = m.options;
        c.embedSetOptions({
          ...(o.spinDuration !== undefined ? { spinDuration: o.spinDuration } : {}),
          ...(o.sound !== undefined ? { sound: o.sound } : {}),
          ...(o.confetti !== undefined ? { confetti: o.confetti } : {}),
          ...(o.mysteryMode !== undefined ? { mysteryMode: o.mysteryMode } : {}),
          ...(o.mode ? { mode: o.mode } : {}),
          ...(o.count !== undefined ? { multi: { count: o.count } } : {}),
          ...(o.theme ? { theme: o.theme } : {}),
          ...(o.background !== undefined ? { background: o.background } : {}),
        });
        post("state", stateBody(c, m.requestId));
        return;
      }
      case "reset":
        c.putEveryoneBack();
        post("state", stateBody(c, m.requestId));
        return;
      case "getState":
        post("state", stateBody(c, m.requestId));
        return;
    }
  };
  window.addEventListener("message", onMessage);
  post("ready", { version: EMBED_VERSION, entries: activeWheel(c.store.getState()).entries.length });
  return () => window.removeEventListener("message", onMessage);
}

function stateBody(c: Controller, requestId?: string) {
  const st = c.store.getState();
  const w = activeWheel(st);
  return {
    requestId,
    entries: w.entries.map((e) => ({ label: e.label, weight: e.weight, enabled: e.enabled })),
    settings: w.settings,
    spinning: st.spin.phase !== "idle",
  };
}
