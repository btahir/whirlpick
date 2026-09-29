// Pure reducer (PLAN §6.3). No randomness, no clock: ids and timestamps arrive in actions.
import type { Entry, Settings, Wheel } from "@whirlpick/core";
import { emptySession } from "./defaults";
import type { Action, AppState, SettingsPatch, Snapshot, WheelSession } from "./types";

const UNDO_LIMIT = 50;
const COALESCE_MS = 1000;

export function activeWheel(s: AppState): Wheel {
  return s.wheels.find((w) => w.id === s.activeId) ?? s.wheels[0]!;
}

const EMPTY_SESSION: WheelSession = Object.freeze(emptySession()) as WheelSession;
export const EMPTY: readonly never[] = Object.freeze([]);

export function sessionOf(s: AppState, wheelId = s.activeId): WheelSession {
  return s.sessions[wheelId] ?? EMPTY_SESSION;
}

function snapshot(s: AppState, label: string): Snapshot {
  return { wheels: s.wheels, meta: s.meta, activeId: s.activeId, sessions: s.sessions, label };
}

function restore(s: AppState, snap: Snapshot): AppState {
  return { ...s, wheels: snap.wheels, meta: snap.meta, activeId: snap.activeId, sessions: snap.sessions };
}

/** Push an undo step unless this action coalesces with the previous one (typing). */
function withUndo(prev: AppState, next: AppState, label: string, coalesce: string | undefined, now: number): AppState {
  const u = prev.undo;
  if (coalesce && u.coalesce === coalesce && now - u.coalesceAt < COALESCE_MS && u.past.length) {
    return { ...next, undo: { ...u, future: [], coalesceAt: now } };
  }
  const past = [...u.past, snapshot(prev, label)].slice(-UNDO_LIMIT);
  return { ...next, undo: { past, future: [], coalesce: coalesce ?? null, coalesceAt: now } };
}

function updateWheel(s: AppState, id: string, fn: (w: Wheel) => Wheel, now?: number): AppState {
  let changed = false;
  const wheels = s.wheels.map((w) => {
    if (w.id !== id) return w;
    const n = fn(w);
    if (n !== w) changed = true;
    return n;
  });
  if (!changed) return s;
  const meta = s.meta[id];
  return {
    ...s,
    wheels,
    meta:
      meta && now !== undefined
        ? { ...s.meta, [id]: { ...meta, updatedAt: new Date(now).toISOString() } }
        : s.meta,
  };
}

function setSession(s: AppState, wheelId: string, fn: (x: WheelSession) => WheelSession): AppState {
  return { ...s, sessions: { ...s.sessions, [wheelId]: fn(sessionOf(s, wheelId)) } };
}

export function applySettingsPatch(settings: Settings, p: SettingsPatch): Settings {
  return {
    ...settings,
    ...p,
    multi: { ...settings.multi, ...p.multi },
    teams: { ...settings.teams, ...p.teams },
    centre: { ...settings.centre, ...p.centre },
  } as Settings;
}

/** When entries change, elimination exclusions refer to snapshot indices; remap by entry id. */
function remapExcluded(prevEntries: Entry[], nextEntries: Entry[], excluded: number[]): number[] {
  if (!excluded.length) return excluded;
  const ids = new Set(excluded.map((i) => prevEntries[i]?.id).filter(Boolean) as string[]);
  const out: number[] = [];
  nextEntries.forEach((e, i) => {
    if (ids.has(e.id)) out.push(i);
  });
  return out;
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "boot": {
      return {
        ...s,
        ready: true,
        wheels: a.wheels,
        meta: a.meta,
        activeId: a.activeId,
        images: a.images,
        history: a.history,
        sessions: a.sessions,
        prefs: a.prefs,
        storage: a.storage,
        sessionSpins: a.sessionSpins,
        supportShownThisSession: a.supportShownThisSession,
        replay: a.replay ?? null,
        undo: { past: [], future: [], coalesce: null, coalesceAt: 0 },
        ui: {
          ...s.ui,
          panel: (a.wheels.find((w) => w.id === a.activeId)?.settings.mode ?? "normal") === "teams" ? "teams" : s.ui.panel,
        },
      };
    }

    case "entries/set": {
      if (s.spin.phase !== "idle") return s;
      const w = activeWheel(s);
      const prevEntries = w.entries;
      let next = updateWheel(s, w.id, (x) => ({ ...x, entries: a.entries }), a.now);
      if (next === s) return s;
      next = setSession(next, w.id, (x) => ({ ...x, excluded: remapExcluded(prevEntries, a.entries, x.excluded) }));
      return withUndo(s, next, a.undo ?? "Edit entries", a.coalesce, a.now);
    }

    case "entries/patch": {
      if (s.spin.phase !== "idle") return s;
      const w = activeWheel(s);
      const next = updateWheel(
        s,
        w.id,
        (x) => ({ ...x, entries: x.entries.map((e) => (e.id === a.id ? cleanEntry({ ...e, ...a.patch }) : e)) }),
        a.now,
      );
      return withUndo(s, next, a.undo ?? "Edit entry", `patch:${a.id}:${Object.keys(a.patch).join(",")}`, a.now);
    }

    case "settings/patch": {
      const w = activeWheel(s);
      const next = updateWheel(s, w.id, (x) => ({ ...x, settings: applySettingsPatch(x.settings, a.patch) }), a.now);
      let out = next;
      if (a.patch.mode) {
        const panel = a.patch.mode === "teams" ? "teams" : s.ui.panel === "teams" ? "entries" : s.ui.panel;
        out = { ...out, ui: { ...out.ui, panel } };
      }
      if (!a.undo) return out;
      return withUndo(s, out, a.undo, `settings:${Object.keys(a.patch).join(",")}`, a.now);
    }

    case "wheel/rename": {
      const w = activeWheel(s);
      const name = a.name.slice(0, 80);
      const next = updateWheel(s, w.id, (x) => ({ ...x, name }), a.now);
      return withUndo(s, next, "Rename wheel", `rename:${w.id}`, a.now);
    }

    case "wheels/add": {
      const next: AppState = {
        ...s,
        wheels: [...s.wheels.filter((w) => w.id !== a.wheel.id), a.wheel],
        meta: { ...s.meta, [a.wheel.id]: a.meta },
        sessions: { ...s.sessions, [a.wheel.id]: s.sessions[a.wheel.id] ?? emptySession() },
        activeId: a.activate ? a.wheel.id : s.activeId,
      };
      return a.activate ? { ...next, last: null, teams: null, replay: null } : next;
    }

    case "wheels/open": {
      if (!s.wheels.some((w) => w.id === a.id) || s.spin.phase !== "idle") return s;
      const w = s.wheels.find((x) => x.id === a.id)!;
      return {
        ...s,
        activeId: a.id,
        last: null,
        teams: null,
        replay: null,
        prefs: { ...s.prefs, lastWheelId: a.id },
        ui: { ...s.ui, panel: w.settings.mode === "teams" ? "teams" : "entries" },
      };
    }

    case "wheels/delete": {
      const idx = s.wheels.findIndex((w) => w.id === a.id);
      if (idx < 0) return s;
      const wheel = s.wheels[idx]!;
      let wheels = s.wheels.filter((w) => w.id !== a.id);
      const meta = { ...s.meta };
      const wmeta = meta[a.id]!;
      delete meta[a.id];
      const history = { ...s.history };
      const hist = history[a.id] ?? [];
      delete history[a.id];
      if (!wheels.length && a.fallback) {
        wheels = [a.fallback];
        meta[a.fallback.id] = { createdAt: new Date(a.now).toISOString(), updatedAt: new Date(a.now).toISOString(), saved: false };
      }
      const activeId = s.activeId === a.id ? wheels[Math.min(idx, wheels.length - 1)]!.id : s.activeId;
      return {
        ...s,
        wheels,
        meta,
        history,
        activeId,
        last: s.activeId === a.id ? null : s.last,
        teams: s.activeId === a.id ? null : s.teams,
        trash: { wheel, meta: wmeta, history: hist, index: idx },
      };
    }

    case "wheels/restore": {
      if (!s.trash) return s;
      const { wheel, meta, history, index } = s.trash;
      const wheels = s.wheels.slice();
      wheels.splice(Math.min(index, wheels.length), 0, wheel);
      return {
        ...s,
        wheels,
        meta: { ...s.meta, [wheel.id]: meta },
        history: { ...s.history, [wheel.id]: history },
        sessions: { ...s.sessions, [wheel.id]: s.sessions[wheel.id] ?? emptySession() },
        activeId: wheel.id,
        trash: null,
      };
    }

    case "wheels/dropTrash":
      return s.trash ? { ...s, trash: null } : s;

    case "wheels/markSaved": {
      const m = s.meta[a.id];
      if (!m) return s;
      const iso = new Date(a.now).toISOString();
      return { ...s, meta: { ...s.meta, [a.id]: { ...m, saved: true, updatedAt: iso } } };
    }

    case "images/put":
      return { ...s, images: { ...s.images, [a.id]: a.image } };

    case "spin/start":
      if (s.spin.phase !== "idle") return s;
      return {
        ...s,
        spin: { phase: "spinning", plan: a.plan, segment: 0 },
        last: null,
        ui: { ...s.ui, dialog: null, streamCaption: null, announce: "Spinning…", announceSeq: s.ui.announceSeq + 1 },
      };

    case "spin/segment":
      if (s.spin.phase !== "spinning") return s;
      return { ...s, spin: { ...s.spin, segment: a.segment } };

    case "spin/pause": {
      if (s.spin.phase !== "spinning") return s;
      const plan = s.spin.plan;
      const p = plan.segments[a.segment]!.pick;
      return {
        ...s,
        spin: { phase: "paused", plan, segment: a.segment },
        last: { historyId: plan.id, receipt: plan.receipt, picks: plan.segments.slice(0, a.segment + 1).map((x) => x.pick), replay: plan.replay },
        ui: {
          ...s.ui,
          announce: `Winner: ${p.label}`,
          announceSeq: s.ui.announceSeq + 1,
          streamCaption: s.surface !== "app" ? p.label : null,
          dialog: s.surface === "app" ? { kind: "winner" } : s.ui.dialog,
        },
      };
    }

    case "spin/resume":
      if (s.spin.phase !== "paused") return s;
      return { ...s, spin: { phase: "spinning", plan: s.spin.plan, segment: a.segment }, ui: { ...s.ui, dialog: null, streamCaption: null } };

    case "spin/end": {
      if (s.spin.phase === "idle") return s;
      const plan = s.spin.plan;
      const wheelId = a.record.wheelId;
      const list = s.history[wheelId] ?? [];
      const history = plan.replay
        ? s.history
        : { ...s.history, [wheelId]: [a.record, ...list.filter((h) => h.id !== a.record.id)].slice(0, 500) };
      return {
        ...s,
        spin: { phase: "idle" },
        history,
        last: { historyId: a.record.id, receipt: a.record.receipt, picks: plan.picks, replay: plan.replay },
        sessionSpins: plan.replay ? s.sessionSpins : s.sessionSpins + 1,
        ui: {
          ...s.ui,
          announce: a.announce,
          announceSeq: s.ui.announceSeq + 1,
          streamCaption: a.streamCaption,
          dialog: s.surface === "app" ? { kind: "winner" } : s.ui.dialog,
        },
      };
    }

    case "spin/abort":
      return s.spin.phase !== "idle" ? { ...s, spin: { phase: "idle" } } : s;

    case "elim/exclude": {
      const next = setSession(s, a.wheelId, (x) =>
        x.excluded.includes(a.index) ? x : { ...x, excluded: [...x.excluded, a.index].sort((p, q) => p - q) },
      );
      return withUndo(s, next, "Remove winner", undefined, 0);
    }

    case "elim/reset": {
      if (!sessionOf(s, a.wheelId).excluded.length) return s;
      const next = setSession(s, a.wheelId, (x) => ({ ...x, excluded: [] }));
      return withUndo(s, next, "Put everyone back", undefined, 0);
    }

    case "entry/disable": {
      const w = activeWheel(s);
      const e = w.entries[a.index];
      if (!e || !e.enabled) return s;
      const next = updateWheel(
        s,
        w.id,
        (x) => ({ ...x, entries: x.entries.map((y, i) => (i === a.index ? { ...y, enabled: false } : y)) }),
        a.now,
      );
      return withUndo(s, next, `Remove ${e.label}`, undefined, a.now);
    }

    case "fair/set":
      return setSession(s, a.wheelId, (x) => ({ ...x, fair: a.fair }));

    case "fair/publicInput":
      return setSession(s, a.wheelId, (x) => (x.fair ? { ...x, fair: { ...x.fair, publicInput: a.value } } : x));

    case "fair/unrevealed":
      return setSession(s, a.wheelId, (x) => ({ ...x, unrevealed: a.ids }));

    case "history/replace":
      return { ...s, history: { ...s.history, [a.wheelId]: a.records } };

    case "history/clear": {
      const history = { ...s.history, [a.wheelId]: [] };
      return { ...s, history, last: null };
    }

    case "teams/set":
      return {
        ...s,
        teams: a.view,
        ui: a.announce
          ? { ...s.ui, announce: a.announce, announceSeq: s.ui.announceSeq + 1 }
          : s.ui,
      };

    case "teams/rename": {
      if (!s.teams) return s;
      const names = s.teams.names.slice();
      names[a.index] = a.name.slice(0, 40);
      return { ...s, teams: { ...s.teams, names } };
    }

    case "teams/round":
      return setSession(s, a.wheelId, (x) => ({ ...x, teamRounds: [...x.teamRounds, a.round].slice(-20) }));

    case "teams/resetRounds":
      return setSession(s, a.wheelId, (x) => ({ ...x, teamRounds: [] }));

    case "ui/dialog":
      return { ...s, ui: { ...s.ui, dialog: a.dialog } };

    case "ui/editorHidden":
      return { ...s, ui: { ...s.ui, editorHidden: a.value } };

    case "ui/presenter":
      return { ...s, ui: { ...s.ui, presenter: a.value } };

    case "ui/panel":
      return { ...s, ui: { ...s.ui, panel: a.panel } };

    case "ui/sheet":
      return { ...s, ui: { ...s.ui, sheetOpen: a.open } };

    case "ui/announce":
      return { ...s, ui: { ...s.ui, announce: a.text, announceSeq: s.ui.announceSeq + 1 } };

    case "ui/streamCaption":
      return { ...s, ui: { ...s.ui, streamCaption: a.text } };

    case "toast/show":
      return { ...s, ui: { ...s.ui, toasts: [...s.ui.toasts.filter((t) => t.id !== a.toast.id), a.toast].slice(-3) } };

    case "toast/dismiss":
      return { ...s, ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== a.id) } };

    case "prefs/set":
      return { ...s, prefs: { ...s.prefs, ...a.patch } };

    case "storage/kind":
      return { ...s, storage: a.kind };

    case "surface/set":
      return s.surface === a.surface ? s : { ...s, surface: a.surface };

    case "replay/status":
      return s.replay ? { ...s, replay: { ...s.replay, status: a.status } } : s;

    case "replay/clear":
      return s.replay ? { ...s, replay: null } : s;

    case "support/shown":
      return { ...s, supportShownThisSession: true };

    case "undo": {
      if (s.spin.phase !== "idle") return s;
      const past = s.undo.past;
      const snap = past[past.length - 1];
      if (!snap) return s;
      const cur = snapshot(s, snap.label);
      return {
        ...restore(s, snap),
        undo: { past: past.slice(0, -1), future: [cur, ...s.undo.future].slice(0, UNDO_LIMIT), coalesce: null, coalesceAt: 0 },
      };
    }

    case "redo": {
      if (s.spin.phase !== "idle") return s;
      const [snap, ...rest] = s.undo.future;
      if (!snap) return s;
      const cur = snapshot(s, snap.label);
      return {
        ...restore(s, snap),
        undo: { past: [...s.undo.past, cur].slice(-UNDO_LIMIT), future: rest, coalesce: null, coalesceAt: 0 },
      };
    }
  }
}

function cleanEntry(e: Entry): Entry {
  const out: Entry = { ...e };
  if (!out.color) delete out.color;
  if (!out.imageRef) delete out.imageRef;
  if (!out.tags || !out.tags.length) delete out.tags;
  return out;
}
