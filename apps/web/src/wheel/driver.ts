// The spin animation loop (PLAN §6.6, SPEC §7). requestAnimationFrame samples core's motion
// (planSpin / planRotationAt / skipMotion: the single source of truth for the curve and the
// landing) and core's FlapSim (the pick's spring and the ticks), then renders straight into the
// canvas. React only learns when a spin starts and ends. The end is computed from the clock, not
// from frame counts, so a hidden tab still finishes on time.
import { FlapSim, pegTurns, planRotationAt, rotationAt, skipMotion, type SpinMotion, type SpinPlan } from "@whirlpick/core";
import { renderWheel, type RenderDeps, type RenderReport } from "./renderer";
import { posUnderPointer, type SceneSlice, type WheelScene } from "./scene";

/** Minimum gap between tick voices: ≤ 25 per second in any 1 s window (ACCEPTANCE K2). */
export const TICK_GAP_MS = 41;

export interface DriverOptions {
  /** A peg released the pick: play a tick at this gain (0…1). */
  onTick?: (gain: number) => void;
  /** Angular speed as a fraction of the spin's peak (whoosh). */
  onSpeed?: (ratio: number) => void;
  onFrame?: (r: RenderReport) => void;
  /** The slice under the pick changed (pointer readout). */
  onPointer?: (pos: number) => void;
  now?: () => number;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  perf?: boolean;
}

type Phase =
  | { kind: "plan"; startedAt: number; plan: SpinPlan; reduced: boolean; peak: number }
  | { kind: "skip"; startedAt: number; motion: SpinMotion; reduced: boolean };

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class WheelDriver {
  private scene: WheelScene | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private rotation = 0;
  private phase: Phase | null = null;
  private resolveSpin: (() => void) | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private raf = 0;
  private destroyed = false;
  private lastFrameAt = 0;
  private flap: FlapSim | null = null;
  private flapKey = "";
  private phi = 0;
  private settleUntil = 0;
  private lastTickAt = -1e9;
  private pendingTicks = 0;
  private tickTimes: number[] = [];
  private veilPos: number | null = null;
  private veil = 0;
  private veilTarget = 0;
  private outline = 0;
  private veilMs = 240;
  private mysteryAlpha = 1;
  private transition: { from: WheelScene; to: WheelScene; startedAt: number; ms: number } | null = null;
  private lastPointerPos = -2;
  private readonly now: () => number;
  private readonly rafFn: (cb: FrameRequestCallback) => number;
  private readonly cafFn: (id: number) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly deps: RenderDeps,
    private readonly opts: DriverOptions = {},
  ) {
    this.now = opts.now ?? (() => performance.now());
    this.rafFn = opts.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cafFn = opts.caf ?? ((id) => cancelAnimationFrame(id));
  }

  get angle(): number {
    return this.rotation;
  }

  get spinning(): boolean {
    return this.phase !== null;
  }

  get currentScene(): WheelScene | null {
    return this.scene;
  }

  get cssWidth(): number {
    return this.width;
  }

  /** Replace the scene. With `animateMs`, slices tween from the old geometry (SPEC §7.4). */
  setScene(scene: WheelScene, animateMs = 0): void {
    const prev = this.scene;
    this.scene = scene;
    const key = scene.geometry.map((g) => g.start.toFixed(7)).join(",");
    if (key !== this.flapKey) {
      this.flapKey = key;
      this.flap = new FlapSim({ pegs: pegTurns(scene.geometry), pointerTurn: scene.pointerTurn });
      this.flap.reset(this.rotation);
      this.phi = 0;
    }
    if (animateMs > 0 && prev && prev !== scene && !this.phase && prev.slices.length <= 200 && scene.slices.length <= 200 && prev.slices.length > 0) {
      this.transition = { from: prev, to: scene, startedAt: this.now(), ms: animateMs };
      this.kick();
    } else {
      this.transition = null;
      this.draw();
    }
  }

  setRotation(r: number): void {
    this.rotation = r;
    this.flap?.reset(r);
    this.phi = 0;
    this.draw();
  }

  resize(width: number, height: number, dpr: number): void {
    const s = Math.min(Math.max(dpr || 1, 1), 2);
    const pw = Math.max(1, Math.round(width * s));
    const ph = Math.max(1, Math.round(height * s));
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.draw();
  }

  /** Lights down on every slice but `pos` (SPEC §6.6). null clears (160 ms). */
  setVeil(pos: number | null, reduced = false): void {
    if (pos === null) {
      if (this.veilTarget === 0 && this.veil === 0) return;
      this.veilTarget = 0;
      this.veilMs = 160;
    } else {
      this.veilPos = pos;
      this.veilTarget = 1;
      this.veilMs = reduced ? 160 : 240;
      this.outline = reduced ? 1 : 0;
    }
    this.kick();
  }

  setMysteryAlpha(a: number): void {
    this.mysteryAlpha = a;
    this.draw();
  }

  /** Run a planned spin (core planSpin). Resolves when the wheel stops. */
  run(plan: SpinPlan, reduced: boolean): Promise<void> {
    if (this.phase) return Promise.resolve();
    this.transition = null;
    this.setVeil(null);
    return new Promise((resolve) => {
      const t = this.now();
      this.resolveSpin = resolve;
      this.lastTickAt = -1e9;
      this.pendingTicks = 0;
      this.tickTimes = [];
      const peak = Math.abs(plan.to - plan.windTo) / Math.max(plan.duration, 0.001) * 2.9;
      this.phase = { kind: "plan", startedAt: t, plan, reduced, peak };
      this.flap?.reset(this.rotation);
      this.endTimer = setTimeout(() => this.finishNow(), plan.totalSeconds * 1000 + 150);
      if (plan.windUpSeconds > 0) for (let i = 0; i < 3; i++) setTimeout(() => this.opts.onTick?.(0.5 - i * 0.08), i * 40);
      this.kick();
    });
  }

  /** Space / button during a spin: 300 ms ease-out to the landing angle (SPEC §7.1). */
  skip(): void {
    const p = this.phase;
    if (!p || p.kind === "skip") return;
    this.phase = { kind: "skip", startedAt: this.now(), motion: skipMotion(this.rotation, p.plan.to), reduced: p.reduced };
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => this.finishNow(), 450);
    this.kick();
  }

  /** Jump to the end (hidden tab or teardown). */
  finishNow(): void {
    const p = this.phase;
    if (!p) return;
    this.rotation = p.kind === "skip" ? p.motion.to : p.plan.to;
    this.flap?.reset(this.rotation);
    this.end();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) this.cafFn(this.raf);
    if (this.endTimer) clearTimeout(this.endTimer);
    this.phase = null;
    this.resolveSpin?.();
  }

  private end() {
    const reduced = this.phase?.reduced ?? false;
    this.phase = null;
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    this.opts.onSpeed?.(0);
    const r = this.resolveSpin;
    this.resolveSpin = null;
    if (reduced) {
      // SPEC §7.6: only the final tick, and one 3° nudge at the stop.
      this.opts.onTick?.(0.8);
      if (this.flap) {
        this.flap.phi = 3;
        this.flap.vel = 0;
      }
    }
    this.settleUntil = this.now() + 1400;
    this.draw();
    this.kick();
    r?.();
  }

  private kick() {
    if (this.raf || this.destroyed) return;
    this.raf = this.rafFn(this.frame);
  }

  private frame = () => {
    this.raf = 0;
    if (this.destroyed) return;
    const t = this.now();
    const dt = Math.min(0.064, Math.max(0.001, (t - (this.lastFrameAt || t - 16)) / 1000));
    let keep = false;
    const p = this.phase;
    let done = false;
    if (p) {
      const el = (t - p.startedAt) / 1000;
      if (p.kind === "plan") {
        this.rotation = planRotationAt(el, p.plan);
        done = el >= p.plan.totalSeconds;
        if (this.opts.onSpeed) {
          const inSpin = el - p.plan.windUpSeconds;
          const v =
            inSpin > 0 && inSpin < p.plan.duration
              ? Math.abs(
                  rotationAt(inSpin + 0.01, { from: p.plan.windTo, to: p.plan.to, duration: p.plan.duration, profile: p.plan.profile }) -
                    rotationAt(inSpin, { from: p.plan.windTo, to: p.plan.to, duration: p.plan.duration, profile: p.plan.profile }),
                ) / 0.01
              : 0;
          this.opts.onSpeed(p.reduced ? 0 : Math.min(1, v / Math.max(p.peak, 1e-6)));
        }
      } else {
        this.rotation = rotationAt(el, p.motion);
        done = el >= p.motion.duration;
      }
      keep = true;
    }
    // Pick spring + peg releases (core FlapSim, 1 ms substeps).
    if (this.flap && (p || t < this.settleUntil)) {
      const { deflection, ticks } = this.flap.update(this.rotation, dt);
      this.phi = deflection;
      if (p && !p.reduced) {
        this.pendingTicks += ticks;
        this.emitTicks(t);
      }
      if (t < this.settleUntil) keep = true;
    }
    if (this.veil !== this.veilTarget || (this.veilTarget === 1 && this.outline < 1)) {
      const step = (dt * 1000) / this.veilMs;
      this.veil = this.veilTarget > this.veil ? Math.min(1, this.veil + step) : Math.max(0, this.veil - step);
      this.outline = this.veilTarget === 1 ? Math.min(1, this.outline + (dt * 1000) / 200) : this.veil;
      if (this.veil === 0 && this.veilTarget === 0) this.veilPos = null;
      keep = true;
    }
    if (this.transition) {
      if (t - this.transition.startedAt >= this.transition.ms) this.transition = null;
      keep = true;
    }
    this.lastFrameAt = t;
    this.draw();
    if (done) {
      this.end();
      return;
    }
    if (keep) this.kick();
  };

  private emitTicks(t: number) {
    if (this.pendingTicks <= 0 || t - this.lastTickAt < TICK_GAP_MS) return;
    // SPEC §8.2: above 12 ticks/s, scale gain by 1/√(rate/12): fast spins buzz softly and the
    // final slow ticks land loud and distinct.
    this.tickTimes = this.tickTimes.filter((x) => t - x < 1000);
    const rate = this.tickTimes.length + 1;
    const gain = rate > 12 ? 1 / Math.sqrt(rate / 12) : 1;
    this.opts.onTick?.(gain);
    this.lastTickAt = t;
    this.tickTimes.push(t);
    this.pendingTicks = 0;
  }

  private frameScene(): WheelScene | null {
    const tr = this.transition;
    if (!tr || !this.scene) return this.scene;
    const x = Math.min(1, (this.now() - tr.startedAt) / tr.ms);
    return x >= 1 ? this.scene : interpolateScene(tr.from, tr.to, easeInOutCubic(x));
  }

  draw(): RenderReport | null {
    const scene = this.frameScene();
    if (!scene || this.width <= 0) return null;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return null;
    const perf = this.opts.perf;
    const t0 = perf ? performance.now() : 0;
    const report = renderWheel(
      ctx,
      scene,
      this.rotation,
      {
        width: this.width,
        dpr: this.dpr,
        pick: this.phi,
        veilPos: this.veilPos,
        veil: this.veil,
        outline: this.outline,
        mysteryAlpha: this.mysteryAlpha,
      },
      this.deps,
    );
    if (perf) {
      try {
        performance.measure("whirlpick:frame", { start: t0, end: performance.now() });
      } catch {
        /* older engines */
      }
    }
    if (this.opts.onPointer) {
      const pos = posUnderPointer(scene, this.rotation);
      if (pos !== this.lastPointerPos) {
        this.lastPointerPos = pos;
        this.opts.onPointer(pos);
      }
    }
    this.opts.onFrame?.(report);
    return report;
  }
}

function mixHex(a: string, b: string, t: number): string {
  if (a === b || t <= 0) return a;
  if (t >= 1) return b;
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${ca.map((v, i) => Math.round(v + (cb[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Tween between two scenes of the same wheel (SPEC §7.4): removed slices shrink to zero width,
 * the rest move to their new angles, and colours crossfade over the first 240 ms of the 420 ms.
 */
export function interpolateScene(from: WheelScene, to: WheelScene, x: number): WheelScene {
  const byIndex = new Map(to.slices.map((s) => [s.index, s]));
  const fromBy = new Map(from.slices.map((s) => [s.index, s]));
  const colourT = Math.min(1, x / (240 / 420));
  const out: SceneSlice[] = [];
  for (const f of from.slices) {
    const t = byIndex.get(f.index);
    if (t) {
      out.push({
        ...t,
        start: f.start + (t.start - f.start) * x,
        end: f.end + (t.end - f.end) * x,
        fill: mixHex(f.fill, t.fill, colourT),
        textFill: colourT < 0.5 ? f.textFill : t.textFill,
      });
    } else {
      const mid = (f.start + f.end) / 2;
      out.push({ ...f, start: f.start + (mid - f.start) * x, end: f.end - (f.end - mid) * x });
    }
  }
  for (const t of to.slices) {
    if (fromBy.has(t.index)) continue;
    const mid = (t.start + t.end) / 2;
    out.push({ ...t, start: mid - (mid - t.start) * x, end: mid + (t.end - mid) * x });
  }
  out.sort((a, b) => a.start - b.start);
  const slices = out.filter((s) => s.end - s.start > 1e-6).map((s, i) => ({ ...s, pos: i }));
  return { ...to, slices, key: `${to.key}~${x.toFixed(4)}` };
}
