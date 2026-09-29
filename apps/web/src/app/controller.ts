// The app controller: every side effect lives here (randomness, clock, storage, audio, confetti,
// the wheel driver, clipboard, files). Components call these methods; the reducer stays pure.
import {
  buildReceipt,
  commitmentFor,
  createProject,
  createSession,
  decodeReceiptCode,
  decodeShare,
  encodeReceiptCode,
  encodeShare,
  generateSeed,
  isHex64,
  isWhirlError,
  landingTurn,
  linkInfo,
  normaliseEntries,
  parseEntriesText,
  planSpin,
  presetById,
  revealReceipt,
  shareUrl,
  slicesFor,
  validateProject,
  verifyReceipt,
  wheelHash,
  type DrawSession,
  type Entry,
  type EntryIn,
  type HistoryRecord,
  type ImageAsset,
  type Pick,
  type Receipt,
  type Settings,
  type TeamsResult,
  type Wheel,
  type WhirlProject,
} from "@whirlpick/core";
import { APP_ID } from "../config/site";
import { t } from "../copy/en";
import { burst } from "../confetti/confetti";
import { createSynth, readMuted, writeMuted, type Synth } from "../audio/synth";
import { parseLocation, type LinkIntent } from "../share/links";
import { defaultSettings, emptySession, normaliseTheme, presetWheel, wheelFromPreset } from "../state/defaults";
import { entriesToText, MAX_ENTRIES, mergeItems, shuffleEntries, sortEntries, dedupeEntries, textToItems } from "../state/entries";
import { newId, randomInt } from "../state/ids";
import { activeWheel, sessionOf } from "../state/reducer";
import type { Store } from "../state/store";
import type { AppState, Prefs, SettingsPatch, SpinPlan, Surface, TeamsView, Toast, WheelMeta, WheelSession } from "../state/types";
import { openStorage, type Storage } from "../storage/storage";
import type { WheelDriver } from "../wheel/driver";
import { POINTER_TURN } from "../wheel/scene";
import { imageFromFile } from "./images";
import type { Route } from "./routes";

export interface Controller {
  readonly store: Store;
  readonly synth: Synth;
  boot(route: Route, loc: { hash: string; search: string; pathname: string }): Promise<void>;
  /** Content pages: read the saved scheme and mute only. */
  bootPrefs(): Promise<void>;
  attachDriver(d: WheelDriver | null): void;
  attachConfetti(c: HTMLCanvasElement | null): void;
  attachPickTip(fn: (() => { x: number; y: number } | null) | null): void;
  reducedMotion(): boolean;
  // spin
  spin(): void;
  nextSpin(): void;
  finishSequence(): void;
  closeWinner(): void;
  removeWinner(): void;
  putEveryoneBack(): void;
  // entries
  setText(text: string, prevText?: string): void;
  pasteEntries(text: string, at: { before: string; after: string }): boolean;
  patchEntry(id: string, patch: Partial<Entry>): void;
  tool(kind: "shuffle" | "sort" | "dedupe" | "clear"): void;
  loadExample(): void;
  loadPreset(id: string, params?: Record<string, string>): void;
  importTextFile(file: File): Promise<void>;
  setEntryImage(id: string, file: File | null): Promise<void>;
  setCentreImage(file: File | null): Promise<void>;
  // settings
  setSettings(patch: SettingsPatch, undoLabel?: string): void;
  rename(name: string): void;
  undo(): void;
  redo(): void;
  // fair draw
  setFair(on: boolean): void;
  newCommitment(seed?: string): string | null;
  setPublicInput(v: string): void;
  revealSeeds(): void;
  // teams
  splitTeams(newRound?: boolean): void;
  renameTeam(i: number, name: string): void;
  teamsText(): string;
  teamsCsv(): string;
  // wheels
  newWheel(): void;
  openWheel(id: string): void;
  duplicateWheel(id: string): void;
  deleteWheel(id: string): void;
  restoreWheel(): void;
  renameWheel(id: string, name: string): void;
  saveCurrent(): void;
  // history
  historyCsv(): string;
  historyJson(): string;
  clearHistory(): void;
  receiptOf(historyId: string): HistoryRecord | undefined;
  // sharing and files
  shareLink(kind: "wheel" | "replay", historyId?: string): Promise<{ url: string; length: number; qr: boolean; warning: string | null; error: string | null }>;
  replayUrl(historyId: string): Promise<string>;
  verifyUrl(historyId: string): Promise<string>;
  exportProject(scope: "active" | "all" | string): { name: string; json: string };
  importProject(file: File): Promise<void>;
  // prefs and ui
  toggleMute(): void;
  setScheme(s: Prefs["scheme"]): void;
  setReducedMotion(v: Prefs["reducedMotion"]): void;
  togglePresenter(on?: boolean): void;
  toggleEditor(on?: boolean): void;
  openDialog(kind: NonNullable<AppState["ui"]["dialog"]>["kind"], arg?: string): void;
  closeDialog(): void;
  toast(message: string, action?: Toast["action"], ms?: number): void;
  toastAction(id: string): void;
  copy(text: string, done?: string): Promise<boolean>;
  download(name: string, text: string, type?: string): void;
  /** Embed API hooks. */
  embedSetEntries(entries: EntryIn[]): void;
  embedSetOptions(o: SettingsPatch): void;
  onResult(fn: ((r: { receipt: Receipt; winners: { index: number; label: string }[] }) => void) | null): void;
  onSpinStart(fn: ((spinIndex: number) => void) | null): void;
}

const now = () => Date.now();
const iso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function hashedEntries(entries: Entry[]) {
  return entries.map((e) => ({ label: e.label, weight: e.weight, enabled: e.enabled, tags: e.tags }));
}

export function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function modeOf(settings: Settings): "single" | "multi" | "elimination" | "teams" {
  return settings.mode === "normal" ? "single" : settings.mode;
}

function pickTitle(w: Wheel): string | null {
  return (w.settings.title || w.name || "").trim() || null;
}

export function createController(store: Store, opts: { surface: Surface }): Controller {
  let storage: Storage | null = null;
  let driver: WheelDriver | null = null;
  let confettiCanvas: HTMLCanvasElement | null = null;
  let pickTip: (() => { x: number; y: number } | null) | null = null;
  let resultListener: ((r: { receipt: Receipt; winners: { index: number; label: string }[] }) => void) | null = null;
  let spinStartListener: ((spinIndex: number) => void) | null = null;
  let removalTimer: ReturnType<typeof setTimeout> | null = null;
  let trashTimer: ReturnType<typeof setTimeout> | null = null;
  const synth = createSynth({ muted: readMuted(), volume: 0.8 });
  const embed = opts.surface === "embed";
  const s = () => store.getState();
  const d = store.dispatch;

  /* -------------------------------------------------------------- persistence */

  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  const dirty = new Set<string>();
  let lastWheels = s().wheels;
  let lastMeta = s().meta;
  let lastSessions = s().sessions;
  let lastPrefs = s().prefs;

  const persist = async () => {
    writeTimer = null;
    if (!storage) return;
    const st = s();
    for (const id of Array.from(dirty)) {
      dirty.delete(id);
      const w = st.wheels.find((x) => x.id === id);
      const m = st.meta[id];
      if (!w || !m || !m.saved) continue;
      try {
        await storage.putWheel({ id, name: w.name, createdAt: m.createdAt, updatedAt: m.updatedAt, wheel: w });
      } catch {
        toast(t.toast.storageFull);
      }
    }
  };

  const persistSession = (wheelId: string, ses: WheelSession) => {
    if (!storage || !s().meta[wheelId]?.saved) return;
    void storage.setMeta(`session:${wheelId}`, ses).catch(() => {});
  };

  store.subscribe(() => {
    const st = s();
    if (st.meta !== lastMeta && storage && !embed) {
      // A wheel that just became saved: persist its draw session and history too.
      for (const [id, m] of Object.entries(st.meta)) {
        if (m.saved && lastMeta[id] && !lastMeta[id]!.saved) {
          const ses = st.sessions[id];
          if (ses) void storage.setMeta(`session:${id}`, ses).catch(() => {});
          const hist = st.history[id];
          if (hist?.length) void storage.putHistory(hist).catch(() => {});
        }
      }
    }
    if (st.wheels !== lastWheels || st.meta !== lastMeta) {
      for (const w of st.wheels) {
        const prev = lastWheels.find((x) => x.id === w.id);
        if (prev !== w || lastMeta[w.id] !== st.meta[w.id]) dirty.add(w.id);
      }
      lastWheels = st.wheels;
      lastMeta = st.meta;
      if (!writeTimer) writeTimer = setTimeout(() => void persist(), 300);
    }
    if (st.sessions !== lastSessions) {
      for (const [id, ses] of Object.entries(st.sessions)) if (lastSessions[id] !== ses) persistSession(id, ses);
      lastSessions = st.sessions;
    }
    if (st.prefs !== lastPrefs) {
      lastPrefs = st.prefs;
      if (storage) void storage.setMeta("prefs", st.prefs).catch(() => {});
    }
  });

  /** A wheel that came from a preset (not a link) becomes saved on its first edit. */
  const autoSave = (id: string) => {
    const m = s().meta[id];
    if (m && !m.saved && m.source !== "link" && !linkWheels.has(id) && !embed) d({ type: "wheels/markSaved", id, now: now() });
  };
  const linkWheels = new Set<string>();

  /* ------------------------------------------------------------------- toasts */

  function toast(message: string, action?: Toast["action"], ms?: number) {
    const id = newId("t");
    const life = ms ?? (action ? 8000 : 4000);
    d({ type: "toast/show", toast: { id, message, action, until: now() + life } });
    setTimeout(() => d({ type: "toast/dismiss", id }), life);
  }

  /* --------------------------------------------------------------------- boot */

  async function boot(route: Route, loc: { hash: string; search: string; pathname: string }) {
    const intent: LinkIntent = parseLocation(loc);
    storage = await openStorage({ memoryOnly: embed });
    const kind = storage.kind;
    let prefs: Prefs = { ...s().prefs };
    try {
      const saved = await storage.getMeta<Prefs>("prefs");
      if (saved) prefs = { ...prefs, ...saved };
    } catch {
      /* ignore */
    }
    prefs.muted = readMuted();
    prefs.scheme = readScheme();
    synth.setMuted(prefs.muted);

    const records = embed ? [] : await storage.listWheels().catch(() => []);
    const wheels: Wheel[] = [];
    const meta: Record<string, WheelMeta> = {};
    for (const r of records) {
      wheels.push({ ...r.wheel, settings: normaliseTheme({ ...defaultSettings(), ...r.wheel.settings }) });
      meta[r.id] = { createdAt: r.createdAt, updatedAt: r.updatedAt, saved: true };
    }
    const history: Record<string, HistoryRecord[]> = {};
    const sessions: Record<string, WheelSession> = {};
    for (const w of wheels) {
      history[w.id] = await storage.listHistory(w.id).catch(() => []);
      const ses = await storage.getMeta<WheelSession>(`session:${w.id}`).catch(() => undefined);
      sessions[w.id] = ses ? { ...emptySession(), ...ses } : emptySession();
    }

    // Precedence: #w / #names / #spin > ?preset > the route's preset (landing) > last saved wheel > sample.
    let active: Wheel | null = null;
    let fromLink = false;
    let replay: AppState["replay"] = null;
    const h = intent.hash;
    if (h?.kind === "w") {
      try {
        const p = await decodeShare(h.code);
        const w = p.wheels.find((x) => x.id === p.activeWheelId) ?? p.wheels[0]!;
        active = { ...w, id: wheels.some((x) => x.id === w.id) ? newId("w") : w.id, settings: normaliseTheme(w.settings) };
        fromLink = true;
      } catch {
        queueMicrotask(() => toast(t.toast.damagedLink));
      }
    } else if (h?.kind === "names") {
      try {
        const { entries } = normaliseEntries(h.labels.slice(0, MAX_ENTRIES));
        active = { id: newId("w"), name: "Shared list", entries, settings: defaultSettings() };
        fromLink = true;
      } catch {
        queueMicrotask(() => toast(t.toast.damagedLink));
      }
    } else if (h?.kind === "spin") {
      try {
        const raw = await decodeReceiptCode(h.code);
        const report = verifyReceipt(raw);
        const r = raw as Receipt;
        const entries = normaliseEntries(r.entries.map((e) => ({ label: e.label, weight: e.weight, enabled: e.enabled, tags: e.tags }))).entries;
        const settings = defaultSettings();
        settings.title = r.title ?? "";
        if (r.mode === "multi") {
          settings.mode = "multi";
          settings.multi = { count: r.params.count ?? 1, reveal: "sequential" };
        } else if (r.mode === "elimination") settings.mode = "elimination";
        else if (r.mode === "teams") settings.mode = "teams";
        settings.fairDraw = true;
        active = { id: newId("w"), name: r.title ?? "Recorded draw", entries, settings };
        replay = { receipt: r, status: report };
        fromLink = true;
      } catch {
        queueMicrotask(() => toast(t.toast.damagedLink));
      }
    }
    if (!active && intent.query.preset) active = presetWheel(intent.query.preset, intent.query.presetParams);
    if (!active && route.kind === "landing") {
      const cur = activeWheel(s());
      active = cur;
    }
    if (!active && route.kind === "home" && prefs.lastWheelId) active = wheels.find((w) => w.id === prefs.lastWheelId) ?? null;
    if (!active && route.kind === "home" && wheels.length) active = wheels[0]!;
    if (!active) active = activeWheel(s());

    if (intent.query.patch && Object.keys(intent.query.patch).length) {
      const p = intent.query.patch;
      active = {
        ...active,
        settings: {
          ...active.settings,
          ...p,
          multi: { ...active.settings.multi, ...p.multi },
          teams: { ...active.settings.teams, ...p.teams },
          centre: { ...active.settings.centre, ...p.centre },
        } as Settings,
      };
    }
    if (!wheels.some((w) => w.id === active!.id)) {
      wheels.push(active);
      meta[active.id] = { createdAt: iso(), updatedAt: iso(), saved: false, source: fromLink ? "link" : "preset" };
      sessions[active.id] = emptySession();
      history[active.id] = [];
    } else {
      const i = wheels.findIndex((w) => w.id === active!.id);
      wheels[i] = active;
    }
    if (fromLink) linkWheels.add(active.id);
    if (replay) sessions[active.id] = { ...emptySession(), excluded: replay.receipt.params.excluded ?? [] };

    // Images for the wheels we show.
    const images: Record<string, ImageAsset> = {};
    const refs = new Set<string>();
    for (const w of wheels) {
      for (const e of w.entries) if (e.imageRef) refs.add(e.imageRef);
      if (w.settings.centre.imageRef) refs.add(w.settings.centre.imageRef);
    }
    for (const img of await storage.getImages([...refs]).catch(() => [])) images[img.id] = { dataUrl: img.dataUrl, width: img.width, height: img.height };

    let sessionSpins = 0;
    let supportShown = false;
    try {
      sessionSpins = Number(sessionStorage.getItem("whirlpick:spins") || 0);
      supportShown = sessionStorage.getItem("whirlpick:asked") === "1";
    } catch {
      /* ignore */
    }
    d({
      type: "boot",
      wheels,
      meta,
      activeId: active.id,
      images,
      history,
      sessions,
      prefs: { ...prefs, lastWheelId: meta[active.id]?.saved ? active.id : prefs.lastWheelId },
      storage: kind,
      sessionSpins,
      supportShownThisSession: supportShown,
      replay,
    });
    lastWheels = s().wheels;
    lastMeta = s().meta;
    lastSessions = s().sessions;
    lastPrefs = s().prefs;
    if (intent.query.presenter) togglePresenter(true);
    // Fair draw on: make sure there is a commitment to show before the first spin.
    if (active.settings.fairDraw && !replay && !sessionOf(s()).fair) newCommitment();
    // Remove the fragment so later shares don't carry stale data (the embed keeps its own).
    if (!embed && (h || /[#&](w|names|spin)=/.test(loc.hash))) {
      try {
        history_replace(loc.pathname + loc.search);
      } catch {
        /* ignore */
      }
    }
    if (replay && intent.query.autoplay) setTimeout(() => spin(), 1000);
    if (kind !== "idb" && !embed) {
      /* the banner is rendered from state.storage */
    }
  }

  async function bootPrefs() {
    d({ type: "prefs/set", patch: { muted: readMuted(), scheme: readScheme() } });
  }

  function readScheme(): Prefs["scheme"] {
    try {
      const v = localStorage.getItem("whirlpick:scheme");
      return v === "light" || v === "dark" ? v : "system";
    } catch {
      return "system";
    }
  }

  function history_replace(url: string) {
    globalThis.history?.replaceState(null, "", url);
  }

  /* ---------------------------------------------------------------- utilities */

  function reducedMotion(): boolean {
    const p = s().prefs.reducedMotion;
    if (p === "on") return true;
    if (p === "off") return false;
    return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function announce(text: string) {
    d({ type: "ui/announce", text });
  }

  function currentSession(): WheelSession {
    return sessionOf(s());
  }

  /* --------------------------------------------------------------------- spin */

  function eligibleCount(w: Wheel, excluded: number[]): number {
    const ex = new Set(excluded);
    return w.entries.filter((e, i) => e.enabled && !ex.has(i)).length;
  }

  function spin() {
    const st = s();
    if (st.spin.phase === "spinning") {
      driver?.skip();
      return;
    }
    if (st.spin.phase === "paused") {
      nextSpin();
      return;
    }
    const w = activeWheel(st);
    if (w.settings.mode === "teams" && !st.replay) {
      splitTeams(false);
      return;
    }
    synth.unlock();
    if (removalTimer) flushRemoval();
    const ses = currentSession();
    const excluded = w.settings.mode === "elimination" ? ses.excluded : [];
    if (st.replay) {
      startReplay();
      return;
    }
    const n = eligibleCount(w, excluded);
    if (n < 1 || (n < 2 && w.settings.mode !== "elimination")) {
      if (w.settings.mode === "elimination" && n === 0) announce(t.everyoneHadTurn);
      return;
    }
    let receipt: Receipt;
    try {
      receipt = makeReceipt(w, ses, excluded);
    } catch (e) {
      toast(isWhirlError(e) ? e.message : "That spin couldn't be drawn.");
      return;
    }
    const picks = receipt.result.picks ?? [];
    runPlan(w, receipt, picks, excluded, false);
  }

  function makeReceipt(w: Wheel, ses: WheelSession, excluded: number[]): Receipt {
    const entries = hashedEntries(w.entries);
    const mode = modeOf(w.settings);
    const count = mode === "multi" ? w.settings.multi.count : 1;
    let fair = ses.fair;
    if (w.settings.fairDraw && !fair) {
      fair = createSession({ entries, now: iso() });
      d({ type: "fair/set", wheelId: w.id, fair });
    }
    const seed = w.settings.fairDraw && fair ? fair.seed : generateSeed();
    const spinIndex = w.settings.fairDraw && fair && !w.settings.commitEverySpin ? fair.nextSpinIndex : 0;
    const eligible = eligibleCount(w, excluded);
    return buildReceipt({
      entries,
      seed,
      publicInput: w.settings.fairDraw ? fair?.publicInput ?? null : null,
      spinIndex,
      mode,
      count: mode === "multi" ? (count === "all" ? "all" : Math.min(count, eligible)) : undefined,
      excluded,
      title: pickTitle(w),
      committedWheelHash: w.settings.fairDraw ? fair?.committedWheelHash ?? null : null,
      committedAt: w.settings.fairDraw ? fair?.committedAt ?? null : null,
      createdAt: iso(),
      app: APP_ID,
      reveal: !(w.settings.fairDraw && !w.settings.commitEverySpin),
    });
  }

  function segmentsFor(w: Wheel, picks: Pick[], excluded: number[]): SpinPlan["segments"] {
    const sequential = w.settings.mode === "multi" && w.settings.multi.reveal === "sequential";
    if (!sequential) return picks.length ? [{ pick: picks[0]!, excluded }] : [];
    return picks.map((p, j) => ({ pick: p, excluded: [...excluded, ...picks.slice(0, j).map((x) => x.index)].sort((a, b) => a - b) }));
  }

  function runPlan(w: Wheel, receipt: Receipt, picks: Pick[], excluded: number[], replay: boolean) {
    const plan: SpinPlan = { id: newId("h"), receipt, picks, segments: segmentsFor(w, picks, excluded), replay, startedAt: now() };
    const instant = w.settings.mode === "multi" && w.settings.multi.reveal === "instant";
    d({ type: "spin/start", plan });
    spinStartListener?.(receipt.spinIndex);
    if (instant) {
      // Instant draw: no animation; the plate lists every winner, confetti fires once.
      void finishSpin(w, plan, 0);
      return;
    }
    void animateSegment(w, plan, 0);
  }

  async function animateSegment(w: Wheel, plan: SpinPlan, j: number) {
    const seg = plan.segments[j];
    if (!seg) return;
    const slices = slicesFor(hashedEntries(w.entries), seg.excluded);
    const pos = slices.findIndex((x) => x.index === seg.pick.index);
    const reduced = reducedMotion();
    if (driver && pos >= 0) {
      const lt = landingTurn(slices, pos, seg.pick.landingU32);
      // Keep the rotation small so float precision holds on tiny slices (core's note).
      const from = driver.angle - Math.floor(driver.angle);
      if (from !== driver.angle) driver.setRotation(from);
      const p = planSpin({ from, landingTurn: lt, durationSec: w.settings.spinDuration, reducedMotion: reduced, slices, pointerTurn: POINTER_TURN, windUp: true });
      await driver.run(p, reduced);
    } else {
      await sleep(reduced ? 300 : 600);
    }
    if (j < plan.segments.length - 1) {
      // Sequential pick-several: reveal this winner, wait for "Next spin".
      revealEffects(w, seg.pick, pos, reduced, false);
      const names = plan.segments.slice(0, j + 1).map((x) => x.pick.label);
      d({ type: "spin/pause", segment: j });
      announce(`Winner ${j + 1} of ${plan.segments.length}: ${names[names.length - 1]}`);
      return;
    }
    await finishSpin(w, plan, pos);
  }

  function revealEffects(w: Wheel, pick: Pick, pos: number, reduced: boolean, big: boolean) {
    setTimeout(() => driver?.setVeil(pos >= 0 ? pos : null, reduced), reduced ? 0 : 120);
    if (w.settings.sound) setTimeout(() => synth.win(), reduced ? 0 : 200);
    const stream = s().surface === "stream";
    if (w.settings.confetti && !reduced && confettiCanvas) {
      setTimeout(() => {
        const tip = pickTip?.() ?? { x: innerWidth / 2, y: innerHeight / 2 };
        const scene = driver?.currentScene;
        const fills = scene?.theme.palette.map((p) => p.fill) ?? ["#C2361F", "#F2A93B", "#2A55A8", "#17735D"];
        const phone = innerWidth < 760;
        const count = s().ui.presenter || stream || big ? 160 : phone ? 52 : 96;
        burst(confettiCanvas!, {
          x: tip.x,
          y: tip.y,
          colors: fills,
          winnerColor: scene?.slices[pos]?.fill,
          seed: (pick.landingU32 ^ 0x9e3779b9) >>> 0,
          count,
          phone,
        });
      }, 240);
    }
  }

  async function finishSpin(w: Wheel, plan: SpinPlan, pos: number) {
    const reduced = reducedMotion();
    const last = plan.segments[plan.segments.length - 1];
    const winners = plan.picks;
    revealEffects(w, last?.pick ?? winners[0]!, pos, reduced, winners.length > 3);
    const names = winners.map((p) => p.label);
    const text = names.length === 1 ? t.winnerAnnounce(names[0]!) : t.winnersAnnounce(names);
    const record: HistoryRecord = { id: plan.id, wheelId: w.id, createdAt: plan.receipt.createdAt, receipt: plan.receipt, teamNames: null };
    await sleep(reduced ? 0 : 320);
    const stream = s().surface !== "app";
    d({ type: "spin/end", record, announce: text, streamCaption: stream ? names.join(", ") : null, now: now() });
    if (plan.replay) {
      d({ type: "replay/status", status: verifyReceipt(plan.receipt) });
    } else {
      afterSpin(w, plan.receipt, winners);
      if (!embed) void storage?.addHistory(record).catch(() => {});
      if (s().meta[w.id]?.saved === false) autoSave(w.id);
    }
    try {
      sessionStorage.setItem("whirlpick:spins", String(s().sessionSpins));
    } catch {
      /* ignore */
    }
    resultListener?.({ receipt: plan.receipt, winners: winners.map((p) => ({ index: p.index, label: p.label })) });
  }

  function afterSpin(w: Wheel, receipt: Receipt, winners: Pick[]) {
    const ses = currentSession();
    if (w.settings.fairDraw && ses.fair) {
      if (w.settings.commitEverySpin) {
        // Reveal happened in the receipt; commit a fresh seed for the next spin.
        const fair = createSession({ entries: hashedEntries(activeWheel(s()).entries), now: iso() });
        d({ type: "fair/set", wheelId: w.id, fair });
      } else {
        d({ type: "fair/set", wheelId: w.id, fair: { ...ses.fair, nextSpinIndex: ses.fair.nextSpinIndex + 1, excluded: [...ses.excluded, ...(w.settings.mode === "elimination" ? winners.map((p) => p.index) : [])] } });
        d({ type: "fair/unrevealed", wheelId: w.id, ids: [...ses.unrevealed, s().last?.historyId ?? ""].filter(Boolean) });
      }
    }
    if (w.settings.mode === "elimination" && winners[0]) {
      const idx = winners[0].index;
      // SPEC §10: removal is automatic 1.2 s after the plate opens, with an Undo toast.
      removalTimer = setTimeout(() => {
        removalTimer = null;
        d({ type: "elim/exclude", wheelId: w.id, index: idx });
        if (w.settings.sound) synth.pop();
        announce(t.removedAnnounce(winners[0]!.label));
        // With the plate open, its own "Undo" line covers this; otherwise say it in a toast.
        if (s().ui.dialog?.kind !== "winner") toast(t.toast.removed(winners[0]!.label), { label: "Undo", type: "undo" });
      }, 1200);
    }
  }

  function flushRemoval() {
    // Apply a pending automatic removal right away (the user spun again quickly).
    const st = s();
    const lastPick = st.last?.picks[0];
    if (removalTimer && lastPick) {
      clearTimeout(removalTimer);
      removalTimer = null;
      d({ type: "elim/exclude", wheelId: st.activeId, index: lastPick.index });
    }
  }

  function startReplay() {
    const st = s();
    const r = st.replay!.receipt;
    const w = activeWheel(st);
    if (r.mode === "teams") {
      showTeamsFromReceipt(w, r, true);
      return;
    }
    synth.unlock();
    const picks = r.result.picks ?? [];
    runPlan(w, r, picks, r.params.excluded ?? [], true);
  }

  function nextSpin() {
    const st = s();
    if (st.spin.phase !== "paused") return;
    const w = activeWheel(st);
    const plan = st.spin.plan;
    const j = st.spin.segment + 1;
    driver?.setVeil(null);
    d({ type: "spin/resume", segment: j });
    synth.unlock();
    void sleep(reducedMotion() ? 0 : 460).then(() => animateSegment(w, plan, j));
  }

  /** Close the plate mid-sequence: reveal the remaining winners at once. */
  function finishSequence() {
    const st = s();
    if (st.spin.phase !== "paused") return;
    const w = activeWheel(st);
    const plan = st.spin.plan;
    d({ type: "spin/resume", segment: plan.segments.length - 1 });
    void finishSpin(w, plan, -1);
  }

  function closeWinner() {
    const st = s();
    if (st.spin.phase === "paused") {
      finishSequence();
      return;
    }
    d({ type: "ui/dialog", dialog: null });
    driver?.setVeil(null);
  }

  function removeWinner() {
    const st = s();
    const w = activeWheel(st);
    const p = st.last?.picks[0];
    if (!p) return;
    d({ type: "ui/dialog", dialog: null });
    driver?.setVeil(null);
    if (w.settings.mode === "elimination") {
      flushRemoval();
      return;
    }
    d({ type: "entry/disable", index: p.index, now: now() });
    if (w.settings.sound) synth.pop();
    announce(t.removedAnnounce(p.label));
    toast(t.toast.removed(p.label), { label: "Undo", type: "undo" });
  }

  function putEveryoneBack() {
    const w = activeWheel(s());
    if (removalTimer) {
      clearTimeout(removalTimer);
      removalTimer = null;
    }
    d({ type: "elim/reset", wheelId: w.id });
    const ses = currentSession();
    if (ses.fair && !w.settings.commitEverySpin) d({ type: "fair/set", wheelId: w.id, fair: { ...ses.fair, excluded: [] } });
    announce(t.toast.everyoneBack);
  }

  /* ------------------------------------------------------------------ entries */

  function setEntries(entries: Entry[], undo?: string, coalesce?: string) {
    const w = activeWheel(s());
    d({ type: "entries/set", entries: entries.slice(0, MAX_ENTRIES), undo, coalesce, now: now() });
    autoSave(w.id);
  }

  function setText(text: string) {
    const w = activeWheel(s());
    const items = textToItems(text);
    if (items.length > MAX_ENTRIES) toast(t.toast.kept1000);
    const entries = mergeItems(items.slice(0, MAX_ENTRIES), w.entries, () => newId("e"));
    setEntries(entries, "Edit entries", "typing");
  }

  function pasteEntries(text: string, at: { before: string; after: string }): boolean {
    // Spreadsheet or CSV paste (tabs, or a name/weight header): parse columns with core.
    const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
    const tabbed = lines.length > 0 && lines.filter((l) => l.includes("\t")).length >= Math.ceil(lines.length * 0.8);
    const header = /^\s*"?(name|label|entry|names)"?\s*[,;\t]/i.test(lines[0] ?? "");
    const csvWeights = lines.length > 1 && lines.every((l) => /^[^,]+,\s*\d+([.]\d+)?\s*(,.*)?$/.test(l));
    if (!tabbed && !header && !csvWeights) return false;
    const { entries: parsed, warnings } = parseEntriesText(text, tabbed ? "tsv" : "csv");
    if (!parsed.length) return false;
    const w = activeWheel(s());
    const beforeItems = textToItems(at.before.replace(/[^\n]*$/, ""));
    const afterItems = textToItems(at.after.replace(/^[^\n]*/, ""));
    const prevBefore = mergeItems(beforeItems, w.entries, () => newId("e"));
    const prevAfter = mergeItems(afterItems, w.entries.slice(beforeItems.length), () => newId("e"));
    let entries = [...prevBefore, ...parsed, ...prevAfter];
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(0, MAX_ENTRIES);
      toast(t.toast.kept1000);
    } else toast(t.toast.imported(parsed.length) + (warnings.length ? ` ${warnings.length} lines had problems.` : ""));
    setEntries(entries, "Paste entries");
    return true;
  }

  function patchEntry(id: string, patch: Partial<Entry>) {
    const w = activeWheel(s());
    d({ type: "entries/patch", id, patch, now: now() });
    autoSave(w.id);
  }

  function tool(kind: "shuffle" | "sort" | "dedupe" | "clear") {
    const w = activeWheel(s());
    if (kind === "shuffle") setEntries(shuffleEntries(w.entries, randomInt), "Shuffle");
    else if (kind === "sort") setEntries(sortEntries(w.entries), "Sort A to Z");
    else if (kind === "dedupe") {
      const next = dedupeEntries(w.entries);
      const removed = w.entries.length - next.length;
      setEntries(next, "Remove duplicates");
      toast(removed ? `Removed ${removed} duplicate${removed === 1 ? "" : "s"}.` : "No duplicates found.", removed ? { label: "Undo", type: "undo" } : undefined);
    } else {
      setEntries([], "Clear");
      toast("Entries cleared.", { label: "Undo", type: "undo" });
    }
  }

  function loadExample() {
    const p = presetById("names-sample");
    if (!p) return;
    setEntries(wheelFromPreset({ ...p, entries: p.entries.slice(0, 8) }).entries.map((e) => ({ ...e, id: newId("e") })), "Example");
  }

  function loadPreset(id: string, params?: Record<string, string>) {
    let w: Wheel | null;
    try {
      const p = presetById(id, params);
      w = p ? wheelFromPreset(p) : null;
    } catch (e) {
      toast(isWhirlError(e) ? e.message : "That preset couldn't be loaded.");
      return;
    }
    if (!w) return;
    const wheel: Wheel = { ...w, id: newId("w"), entries: w.entries.map((e) => ({ ...e, id: newId("e") })) };
    d({ type: "wheels/add", wheel, meta: { createdAt: iso(), updatedAt: iso(), saved: !embed }, activate: true });
    if (wheel.settings.fairDraw) newCommitment();
  }

  async function importTextFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast("That file is over 5 MB.");
      return;
    }
    const text = await file.text();
    if (/\.json$/i.test(file.name) || text.trimStart().startsWith("{")) {
      await importProject(file);
      return;
    }
    const fmt = /\.tsv$/i.test(file.name) ? "tsv" : /\.csv$/i.test(file.name) ? "csv" : undefined;
    const { entries, warnings } = parseEntriesText(text, fmt);
    if (!entries.length) {
      toast("That file has no entries.");
      return;
    }
    setEntries(entries, "Import");
    toast(t.toast.imported(entries.length) + (warnings.length ? ` ${warnings.length} lines had problems.` : ""));
  }

  async function setEntryImage(id: string, file: File | null) {
    if (!file) {
      patchEntry(id, { imageRef: undefined });
      return;
    }
    try {
      const { id: imgId, asset } = await imageFromFile(file);
      d({ type: "images/put", id: imgId, image: asset });
      if (storage?.supportsImages) await storage.putImage({ id: imgId, ...asset, createdAt: iso() }).catch(() => {});
      else toast(t.imagesNeedIdb);
      patchEntry(id, { imageRef: imgId });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function setCentreImage(file: File | null) {
    if (!file) {
      setSettings({ centre: { imageRef: null } }, "Centre image");
      return;
    }
    try {
      const { id: imgId, asset } = await imageFromFile(file);
      d({ type: "images/put", id: imgId, image: asset });
      if (storage?.supportsImages) await storage.putImage({ id: imgId, ...asset, createdAt: iso() }).catch(() => {});
      setSettings({ centre: { imageRef: imgId, text: null } }, "Centre image");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  /* ----------------------------------------------------------------- settings */

  function setSettings(patch: SettingsPatch, undoLabel?: string) {
    const w = activeWheel(s());
    d({ type: "settings/patch", patch, undo: undoLabel, now: now() });
    autoSave(w.id);
    if (patch.volume !== undefined) synth.setVolume(patch.volume);
  }

  function rename(name: string) {
    const w = activeWheel(s());
    d({ type: "wheel/rename", name, now: now() });
    autoSave(w.id);
  }

  /* ---------------------------------------------------------------- fair draw */

  function setFair(on: boolean) {
    setSettings({ fairDraw: on });
    if (on && !currentSession().fair) newCommitment();
  }

  /** Commit a fresh (or given) seed now. Returns an error message, or null. */
  function newCommitment(seed?: string): string | null {
    const w = activeWheel(s());
    if (seed !== undefined && !isHex64(seed.trim().toLowerCase())) return "A seed is exactly 64 hex characters (0–9, a–f).";
    const ses = currentSession();
    if (ses.unrevealed.length) return "Reveal the seed for the spins you've already made first.";
    const fair = createSession({ entries: hashedEntries(w.entries), seed: seed?.trim().toLowerCase(), now: iso() });
    d({ type: "fair/set", wheelId: w.id, fair });
    return null;
  }

  function setPublicInput(v: string) {
    const w = activeWheel(s());
    const value = v.normalize("NFC").trim().slice(0, 64);
    d({ type: "fair/publicInput", wheelId: w.id, value: value || null });
  }

  function revealSeeds() {
    const st = s();
    const w = activeWheel(st);
    const ses = sessionOf(st);
    if (!ses.fair || !ses.unrevealed.length) return;
    const list = (st.history[w.id] ?? []).map((h) => {
      if (!ses.unrevealed.includes(h.id) || h.receipt.seed) return h;
      try {
        return { ...h, receipt: revealReceipt(h.receipt, ses.fair!.seed) };
      } catch {
        return h;
      }
    });
    d({ type: "history/replace", wheelId: w.id, records: list });
    void storage?.putHistory(list.filter((h) => ses.unrevealed.includes(h.id))).catch(() => {});
    d({ type: "fair/unrevealed", wheelId: w.id, ids: [] });
    const fair = createSession({ entries: hashedEntries(w.entries), now: iso() });
    d({ type: "fair/set", wheelId: w.id, fair });
    toast("Seed revealed. Every receipt can be checked now.");
  }

  /* -------------------------------------------------------------------- teams */

  const TEAM_ERRORS: Record<string, string> = {
    TEAM_COUNT_INVALID: "That many teams doesn't work with this list. Use at least 2 teams and no more teams than people.",
    TOGETHER_TOO_LARGE: "A keep-together group is bigger than a team. Try fewer teams or a smaller group.",
    APART_TOO_MANY: "A keep-apart rule names more people than there are teams. Try more teams or fewer names in the rule.",
    CONSTRAINT_CONFLICT: "Two rules contradict each other: the same people are kept together and apart.",
    CONSTRAINT_UNKNOWN_ENTRY: "A rule names someone who isn't on the wheel.",
    CONSTRAINT_INVALID: "A rule needs at least two different people.",
  };

  function teamError(e: unknown): string {
    if (!isWhirlError(e)) return "Those teams couldn't be made.";
    if (e.code === "CONSTRAINTS_UNSATISFIED") return e.message || "Couldn't satisfy every rule. Try more teams or fewer rules.";
    return TEAM_ERRORS[e.code] ?? e.message;
  }

  function idsToIndices(w: Wheel, sets: string[][]): number[][] {
    const pos = new Map(w.entries.map((e, i) => [e.id, i]));
    return sets.map((set) => set.map((id) => pos.get(id)).filter((x): x is number => x !== undefined)).filter((x) => x.length >= 2);
  }

  function splitTeams(newRound = false) {
    const st = s();
    if (st.spin.phase !== "idle") return;
    const w = activeWheel(st);
    synth.unlock();
    const ses = currentSession();
    const ts = w.settings.teams;
    const fair = w.settings.fairDraw ? ses.fair ?? createSession({ entries: hashedEntries(w.entries), now: iso() }) : null;
    const seed = fair ? fair.seed : generateSeed();
    try {
      const receipt = buildReceipt({
        entries: hashedEntries(w.entries),
        seed,
        publicInput: fair?.publicInput ?? null,
        spinIndex: fair && !w.settings.commitEverySpin ? fair.nextSpinIndex : 0,
        mode: "teams",
        teamCount: ts.by === "count" ? ts.count : null,
        teamSize: ts.by === "size" ? ts.size : null,
        balance: ts.balance,
        keepApart: idsToIndices(w, ts.keepApart),
        keepTogether: idsToIndices(w, ts.keepTogether),
        previousRounds: newRound ? ses.teamRounds : [],
        title: pickTitle(w),
        committedWheelHash: fair?.committedWheelHash ?? null,
        committedAt: fair?.committedAt ?? null,
        createdAt: iso(),
        app: APP_ID,
        reveal: !(fair && !w.settings.commitEverySpin),
      });
      if (!newRound) d({ type: "teams/resetRounds", wheelId: w.id });
      const record: HistoryRecord = { id: newId("h"), wheelId: w.id, createdAt: receipt.createdAt, receipt, teamNames: null };
      showTeamsFromReceipt(w, receipt, false, record.id);
      d({ type: "teams/round", wheelId: w.id, round: receipt.result.teams ?? [] });
      d({ type: "history/replace", wheelId: w.id, records: [record, ...(s().history[w.id] ?? [])].slice(0, 500) });
      void storage?.addHistory(record).catch(() => {});
      if (fair) afterSpin(w, receipt, []);
      autoSave(w.id);
    } catch (e) {
      d({ type: "teams/set", view: { historyId: "", result: emptyTeams(), receipt: null as unknown as Receipt, names: [], error: teamError(e) } });
    }
  }

  function emptyTeams(): TeamsResult {
    return { teams: [], sizes: [], balance: { byTag: {}, withinOne: true }, repeatPairs: 0, cost: 0, warnings: [], order: [], wheelHash: "", teamCount: 0 };
  }

  function showTeamsFromReceipt(w: Wheel, receipt: Receipt, replay: boolean, historyId = "") {
    const teams = receipt.result.teams ?? [];
    const result: TeamsResult = { ...emptyTeams(), teams, sizes: teams.map((x) => x.length), repeatPairs: receipt.result.repeatPairs ?? 0, teamCount: teams.length, wheelHash: receipt.wheelHash };
    const view: TeamsView = { historyId, result, receipt, names: teams.map((_, i) => `Team ${i + 1}`), error: null };
    d({ type: "teams/set", view, announce: t.teamsAnnounce(teams.length) });
    if (replay) d({ type: "replay/status", status: verifyReceipt(receipt) });
    if (w.settings.sound) teams.flat().forEach((_, i) => i < 40 && setTimeout(() => synth.flick(), reducedMotion() ? 0 : i * 60));
    resultListener?.({ receipt, winners: [] });
  }

  function renameTeam(i: number, name: string) {
    d({ type: "teams/rename", index: i, name });
  }

  function teamsText(): string {
    const st = s();
    const v = st.teams;
    if (!v) return "";
    const w = activeWheel(st);
    return v.result.teams.map((team, i) => `${v.names[i] ?? `Team ${i + 1}`}: ${team.map((x) => w.entries[x]?.label ?? v.receipt.entries[x]?.label ?? "").join(", ")}`).join("\n");
  }

  function teamsCsv(): string {
    const st = s();
    const v = st.teams;
    if (!v) return "";
    const rows = ["team,name,tags"];
    v.result.teams.forEach((team, i) => {
      for (const x of team) {
        const e = v.receipt.entries[x];
        rows.push([v.names[i] ?? `Team ${i + 1}`, e?.label ?? "", (e?.tags ?? []).join("|")].map(csvCell).join(","));
      }
    });
    return rows.join("\n") + "\n";
  }

  /* ------------------------------------------------------------------- wheels */

  function newWheel() {
    const wheel: Wheel = { id: newId("w"), name: "New wheel", entries: [], settings: defaultSettings() };
    d({ type: "wheels/add", wheel, meta: { createdAt: iso(), updatedAt: iso(), saved: true }, activate: true });
    d({ type: "prefs/set", patch: { lastWheelId: wheel.id } });
  }

  function openWheel(id: string) {
    d({ type: "wheels/open", id });
    const w = activeWheel(s());
    if (w.settings.fairDraw && !currentSession().fair) newCommitment();
  }

  function duplicateWheel(id: string) {
    const src = s().wheels.find((w) => w.id === id);
    if (!src) return;
    const wheel: Wheel = { ...structuredClone(src), id: newId("w"), name: `${src.name} (copy)`, entries: src.entries.map((e) => ({ ...e, id: newId("e") })) };
    d({ type: "wheels/add", wheel, meta: { createdAt: iso(), updatedAt: iso(), saved: true }, activate: false });
    toast(`Made a copy of ${src.name}.`);
  }

  function deleteWheel(id: string) {
    const st = s();
    const fallback = st.wheels.length <= 1 ? { id: newId("w"), name: "New wheel", entries: [], settings: defaultSettings() } : null;
    const wasSaved = st.meta[id]?.saved;
    d({ type: "wheels/delete", id, fallback, now: now() });
    if (wasSaved && storage) void storage.deleteWheel(id).catch(() => {});
    toast(t.toast.wheelDeleted, { label: "Undo", type: "undoDelete" });
    if (trashTimer) clearTimeout(trashTimer);
    trashTimer = setTimeout(() => d({ type: "wheels/dropTrash" }), 8000);
  }

  function restoreWheel() {
    const tr = s().trash;
    if (!tr) return;
    d({ type: "wheels/restore" });
    if (tr.meta.saved && storage) {
      void storage.putWheel({ id: tr.wheel.id, name: tr.wheel.name, createdAt: tr.meta.createdAt, updatedAt: tr.meta.updatedAt, wheel: tr.wheel }).catch(() => {});
      void storage.putHistory(tr.history).catch(() => {});
    }
  }

  function renameWheel(id: string, name: string) {
    const st = s();
    if (st.activeId === id) {
      rename(name);
      return;
    }
    const prev = st.activeId;
    d({ type: "wheels/open", id });
    d({ type: "wheel/rename", name, now: now() });
    d({ type: "wheels/open", id: prev });
  }

  function saveCurrent() {
    const st = s();
    const w = activeWheel(st);
    linkWheels.delete(w.id);
    d({ type: "wheels/markSaved", id: w.id, now: now() });
    d({ type: "prefs/set", patch: { lastWheelId: w.id } });
    d({ type: "replay/clear" });
    if (storage) void storage.putHistory(st.history[w.id] ?? []).catch(() => {});
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
    toast(t.toast.savedWheel);
  }

  /* ------------------------------------------------------------------ history */

  function historyCsv(): string {
    const st = s();
    const w = activeWheel(st);
    const rows = ["time,wheel,mode,spin_index,winners,seed,commitment,wheel_hash"];
    for (const h of st.history[w.id] ?? []) {
      const r = h.receipt;
      const winners = r.mode === "teams" ? (r.result.teams ?? []).map((tm, i) => `Team ${i + 1}: ${tm.map((x) => r.entries[x]?.label).join(" / ")}`).join("; ") : (r.result.picks ?? []).map((p) => p.label).join("; ");
      rows.push([h.createdAt, w.name, r.mode, String(r.spinIndex), winners, r.seed ?? "", r.commitment, r.wheelHash].map(csvCell).join(","));
    }
    return rows.join("\n") + "\n";
  }

  function historyJson(): string {
    const st = s();
    return JSON.stringify((st.history[st.activeId] ?? []).map((h) => h.receipt), null, 2) + "\n";
  }

  function clearHistory() {
    const st = s();
    const w = activeWheel(st);
    const list = st.history[w.id] ?? [];
    if (!list.length) return;
    d({ type: "history/clear", wheelId: w.id });
    void storage?.deleteHistory(list.map((h) => h.id)).catch(() => {});
    pendingHistoryUndo = { wheelId: w.id, list };
    toast(t.toast.historyCleared, { label: "Undo", type: "undo" });
  }
  let pendingHistoryUndo: { wheelId: string; list: HistoryRecord[] } | null = null;

  function receiptOf(historyId: string): HistoryRecord | undefined {
    const st = s();
    for (const list of Object.values(st.history)) {
      const h = list.find((x) => x.id === historyId);
      if (h) return h;
    }
    if (st.last?.historyId === historyId) return { id: historyId, wheelId: st.activeId, createdAt: st.last.receipt.createdAt, receipt: st.last.receipt, teamNames: null };
    if (st.teams?.historyId === historyId && st.teams.receipt) return { id: historyId, wheelId: st.activeId, createdAt: st.teams.receipt.createdAt, receipt: st.teams.receipt, teamNames: st.teams.names };
    return undefined;
  }

  /* --------------------------------------------------------- sharing and files */

  function projectFor(wheels: Wheel[], withExtras: boolean): WhirlProject {
    const st = s();
    const p = createProject(wheels, { generator: APP_ID, now: iso(), activeWheelId: wheels.some((w) => w.id === st.activeId) ? st.activeId : wheels[0]!.id });
    if (withExtras) {
      const refs = new Set<string>();
      for (const w of wheels) {
        for (const e of w.entries) if (e.imageRef) refs.add(e.imageRef);
        if (w.settings.centre.imageRef) refs.add(w.settings.centre.imageRef);
      }
      p.images = Object.fromEntries([...refs].filter((r) => st.images[r]).map((r) => [r, st.images[r]!]));
      p.history = wheels.flatMap((w) => st.history[w.id] ?? []);
    }
    // Drop dangling image refs (e.g. images that couldn't be stored in localStorage).
    p.wheels = p.wheels.map((w) => ({
      ...w,
      entries: w.entries.map((e) => (e.imageRef && !p.images[e.imageRef] ? (({ imageRef: _i, ...rest }) => rest)(e) : e)),
      settings: w.settings.centre.imageRef && !p.images[w.settings.centre.imageRef] ? { ...w.settings, centre: { ...w.settings.centre, imageRef: null } } : w.settings,
    }));
    return p;
  }

  const origin = () => (typeof location !== "undefined" ? location.origin : "");

  async function shareLink(kind: "wheel" | "replay", historyId?: string) {
    const st = s();
    try {
      if (kind === "replay" && historyId) {
        const url = await replayUrl(historyId);
        const info = linkInfo(url);
        return { url, length: info.length, qr: info.qrAvailable, warning: info.warnings[0]?.message ?? null, error: null };
      }
      const w = activeWheel(st);
      const code = await encodeShare(projectFor([w], false));
      const url = shareUrl("w", code, origin(), "/");
      const info = linkInfo(url);
      return { url, length: info.length, qr: info.qrAvailable, warning: info.warnings[0]?.message ?? null, error: null };
    } catch (e) {
      return { url: "", length: 0, qr: false, warning: null, error: isWhirlError(e) ? e.message : "That link couldn't be made." };
    }
  }

  async function replayUrl(historyId: string) {
    const h = receiptOf(historyId);
    if (!h) return "";
    return shareUrl("spin", await encodeReceiptCode(h.receipt), origin(), "/");
  }

  async function verifyUrl(historyId: string) {
    const h = receiptOf(historyId);
    if (!h) return "";
    return shareUrl("r", await encodeReceiptCode(h.receipt), origin(), "/verify/");
  }

  function exportProject(scope: "active" | "all" | string) {
    const st = s();
    const wheels = scope === "all" ? st.wheels.filter((w) => st.meta[w.id]?.saved || w.id === st.activeId) : [st.wheels.find((w) => w.id === (scope === "active" ? st.activeId : scope)) ?? activeWheel(st)];
    const p = projectFor(wheels, true);
    const base = scope === "all" ? "whirlpick-wheels" : (wheels[0]!.name || "wheel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wheel";
    return { name: `${base}.whirl.json`, json: JSON.stringify(p, null, 2) + "\n" };
  }

  async function importProject(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast("That file is over 20 MB.");
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse((await file.text()).replace(/^﻿/, ""));
    } catch {
      toast(t.toast.notWhirl, { label: "Details", type: "dismiss" });
      importError = "The file isn't valid JSON.";
      return;
    }
    const res = validateProject(json);
    if (!res.ok || !res.project) {
      importError = res.errors
        .slice(0, 3)
        .map((e) => `${describePath(e.path)}: ${e.message}`)
        .join("\n");
      d({ type: "ui/dialog", dialog: { kind: "import", arg: importError } });
      return;
    }
    const p = res.project;
    const st = s();
    let firstId = "";
    for (const w0 of p.wheels) {
      // Only a saved wheel with the same id forces a new id; an unsaved sample is replaced.
      const clash = st.wheels.some((x) => x.id === w0.id && st.meta[x.id]?.saved);
      const w: Wheel = { ...w0, id: clash ? newId("w") : w0.id, settings: normaliseTheme(w0.settings) };
      if (!firstId || w0.id === p.activeWheelId) firstId = w.id;
      d({ type: "wheels/add", wheel: w, meta: { createdAt: p.createdAt, updatedAt: p.updatedAt, saved: !embed }, activate: false });
      const hist = p.history.filter((h) => h.wheelId === w0.id).map((h) => ({ ...h, wheelId: w.id }));
      d({ type: "history/replace", wheelId: w.id, records: hist });
      if (storage && !embed) {
        void storage.putHistory(hist).catch(() => {});
      }
    }
    for (const [id, img] of Object.entries(p.images)) {
      d({ type: "images/put", id, image: img });
      if (storage?.supportsImages) void storage.putImage({ id, ...img, createdAt: iso() }).catch(() => {});
    }
    if (firstId) d({ type: "wheels/open", id: firstId });
    if (s().ui.dialog?.kind === "wheels") d({ type: "ui/dialog", dialog: null });
    toast(p.wheels.length === 1 ? `Opened ${p.wheels[0]!.name}.` : `Imported ${p.wheels.length} wheels.`);
  }
  let importError = "";

  function describePath(ptr: string): string {
    const m = /^\/wheels\/(\d+)\/entries\/(\d+)(?:\/(\w+))?/.exec(ptr);
    if (m) return `Wheel ${Number(m[1]) + 1}, entry ${Number(m[2]) + 1}${m[3] ? ` (${m[3]})` : ""}`;
    const w = /^\/wheels\/(\d+)(?:\/(\w+))?/.exec(ptr);
    if (w) return `Wheel ${Number(w[1]) + 1}${w[2] ? ` (${w[2]})` : ""}`;
    return ptr || "File";
  }

  /* --------------------------------------------------------------- prefs, ui */

  function toggleMute() {
    const m = !s().prefs.muted;
    writeMuted(m);
    synth.setMuted(m);
    if (!m) synth.unlock();
    d({ type: "prefs/set", patch: { muted: m } });
    announce(m ? "Sound off" : "Sound on");
  }

  function setScheme(sc: Prefs["scheme"]) {
    d({ type: "prefs/set", patch: { scheme: sc } });
    try {
      if (sc === "system") localStorage.removeItem("whirlpick:scheme");
      else localStorage.setItem("whirlpick:scheme", sc);
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    if (sc === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", sc);
  }

  function setReducedMotion(v: Prefs["reducedMotion"]) {
    d({ type: "prefs/set", patch: { reducedMotion: v } });
  }

  let wakeLock: { release(): Promise<void> } | null = null;
  function togglePresenter(on?: boolean) {
    const next = on ?? !s().ui.presenter;
    d({ type: "ui/presenter", value: next });
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (next) {
      if (document.fullscreenElement == null && el.requestFullscreen) void el.requestFullscreen().catch(() => {});
      const nav = navigator as Navigator & { wakeLock?: { request(k: "screen"): Promise<{ release(): Promise<void> }> } };
      void nav.wakeLock?.request("screen").then((l) => (wakeLock = l)).catch(() => {});
    } else {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      void wakeLock?.release().catch(() => {});
      wakeLock = null;
    }
  }

  function toggleEditor(on?: boolean) {
    d({ type: "ui/editorHidden", value: on ?? !s().ui.editorHidden });
  }

  function openDialog(kind: NonNullable<AppState["ui"]["dialog"]>["kind"], arg?: string) {
    d({ type: "ui/dialog", dialog: { kind, arg } });
  }

  function closeDialog() {
    const st = s();
    if (st.ui.dialog?.kind === "winner") closeWinner();
    else d({ type: "ui/dialog", dialog: null });
  }

  function toastAction(id: string) {
    const tt = s().ui.toasts.find((x) => x.id === id);
    d({ type: "toast/dismiss", id });
    if (!tt?.action) return;
    if (tt.action.type === "undoDelete") restoreWheel();
    else if (tt.action.type === "undo") {
      if (pendingHistoryUndo && tt.message === t.toast.historyCleared) {
        const u = pendingHistoryUndo;
        pendingHistoryUndo = null;
        d({ type: "history/replace", wheelId: u.wheelId, records: u.list });
        void storage?.putHistory(u.list).catch(() => {});
      } else d({ type: "undo" });
    } else if (tt.action.type === "reload") location.reload();
    else if (tt.action.type === "dismiss" && importError) d({ type: "ui/dialog", dialog: { kind: "import", arg: importError } });
  }

  async function copy(text: string, done = t.toast.copied): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
      return true;
    } catch {
      toast("Couldn't copy. Select the text and press Ctrl+C.");
      return false;
    }
  }

  function download(name: string, text: string, type = "application/json") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* -------------------------------------------------------------------- embed */

  function embedSetEntries(entries: EntryIn[]) {
    const { entries: norm } = normaliseEntries(entries);
    setEntries(norm, "Embed");
    d({ type: "elim/reset", wheelId: s().activeId });
  }

  function embedSetOptions(o: SettingsPatch) {
    setSettings(o);
  }

  return {
    store,
    synth,
    boot,
    bootPrefs,
    attachDriver: (x) => (driver = x),
    attachConfetti: (c) => (confettiCanvas = c),
    attachPickTip: (fn) => (pickTip = fn),
    reducedMotion,
    spin,
    nextSpin,
    finishSequence,
    closeWinner,
    removeWinner,
    putEveryoneBack,
    setText,
    pasteEntries,
    patchEntry,
    tool,
    loadExample,
    loadPreset,
    importTextFile,
    setEntryImage,
    setCentreImage,
    setSettings,
    rename,
    undo: () => d({ type: "undo" }),
    redo: () => d({ type: "redo" }),
    setFair,
    newCommitment,
    setPublicInput,
    revealSeeds,
    splitTeams,
    renameTeam,
    teamsText,
    teamsCsv,
    newWheel,
    openWheel,
    duplicateWheel,
    deleteWheel,
    restoreWheel,
    renameWheel,
    saveCurrent,
    historyCsv,
    historyJson,
    clearHistory,
    receiptOf,
    shareLink,
    replayUrl,
    verifyUrl,
    exportProject,
    importProject,
    toggleMute,
    setScheme,
    setReducedMotion,
    togglePresenter,
    toggleEditor,
    openDialog,
    closeDialog,
    toast,
    toastAction,
    copy,
    download,
    embedSetEntries,
    embedSetOptions,
    onResult: (fn) => (resultListener = fn),
    onSpinStart: (fn) => (spinStartListener = fn),
  };
}

export { commitmentFor, wheelHash, entriesToText };
export type { DrawSession };
