// Rotation as a pure function of time, pegs, pointer flap and boundary crossings.
// Curve shape follows docs/design/SPEC.md §7.1–7.2 (design wins on shape); determinism and the
// contract follow PLAN §2.10–2.11. All angles are in turns unless a name says Deg.
//
// SPEC §7.1 spin phase, τ = t/D, τa = 0.06, k = 3 (3.4 when D ≥ 12 s):
//   v0 = k / (1 − τa + τa·k/2);  pa = v0·τa/2
//   p(τ) = τ < τa ? pa·(τ/τa)² : pa + (1 − pa)·(1 − (1 − s)^k),  s = (τ − τa)/(1 − τa)
// This is algebraically the same curve as PLAN §2.11's E(x) with a = τa, p = k.
import { extraTurns, finalRotation, mod1 } from './geometry.js';
import type { Slice } from './types.js';

export interface MotionProfile {
  /** Acceleration share τa of the duration (0 = start at full speed). */
  a: number;
  /** Decay exponent k. */
  p: number;
}

export const DEFAULT_PROFILE: MotionProfile = { a: 0.06, p: 3 };
/** SPEC §7.1: k = 3.4 when D ≥ 12 s (longer crawl at the end). */
export const LONG_PROFILE: MotionProfile = { a: 0.06, p: 3.4 };
export const LONG_SPIN_FROM = 12;
/** SPEC §7.6: 1.2 s, k = 2, no ramp. */
export const REDUCED_PROFILE: MotionProfile = { a: 0, p: 2 };
export const REDUCED_DURATION = 1.2;
export const DEFAULT_SPIN_DURATION = 6;
export const MIN_SPIN_DURATION = 1;
export const MAX_SPIN_DURATION = 30;
/** SPEC §7.1 wind-up: 180 ms, not counted in D, ease-in-out cubic, back by min(4°, 0.25 × smallest slice). */
export const WIND_UP_SECONDS = 0.18;
export const WIND_UP_MAX = 4 / 360;
/** SPEC §7.1 skip-to-end: 300 ms ease-out. */
export const SKIP_SECONDS = 0.3;
export const SKIP_PROFILE: MotionProfile = { a: 0, p: 3 };
/** PLAN §2.11 simple flap default (degrees). */
export const DEFAULT_MAX_DEFLECTION = 22;
/**
 * Design pointer placement: SPEC §6.3 puts slice 0's start at 3 o'clock at rotation 0 and the pick
 * at 3 o'clock, so in core's frame (measured from the wheel's zero mark) the pointer is at 0.
 * Renderers add a fixed 0.25-turn screen offset when drawing; core math uses pointerTurn = 0.
 */
export const DESIGN_POINTER_TURN = 0;
export const DESIGN_SCREEN_OFFSET = 0.25;

export function profileFor(durationSec: number, reducedMotion = false): MotionProfile {
  if (reducedMotion) return REDUCED_PROFILE;
  return durationSec >= LONG_SPIN_FROM ? LONG_PROFILE : DEFAULT_PROFILE;
}

/** Easing E(x) / SPEC p(τ): E(0) = 0, E(1) = 1, E'(1) = 0, monotonic, C¹ at a. */
export function easing(x: number, profile: MotionProfile = DEFAULT_PROFILE): number {
  const { a, p } = profile;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const v0 = p / (1 - a + (a * p) / 2);
  const pa = (v0 * a) / 2;
  if (x < a) return pa * (x / a) * (x / a);
  const s = (x - a) / (1 - a);
  return pa + (1 - pa) * (1 - Math.pow(1 - s, p));
}

/** dE/dx. */
export function easingVelocity(x: number, profile: MotionProfile = DEFAULT_PROFILE): number {
  const { a, p } = profile;
  if (x < 0 || x > 1) return 0;
  const v0 = p / (1 - a + (a * p) / 2);
  if (x < a) return (v0 * x) / a;
  return v0 * Math.pow((1 - x) / (1 - a), p - 1);
}

export function easeInOutCubic(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export interface SpinMotion {
  from: number;
  to: number;
  duration: number;
  profile?: MotionProfile;
}

/** R(t) = R0 + (R1 − R0) · E(clamp(t / D, 0, 1)); exactly `to` once t ≥ D. */
export function rotationAt(tSec: number, spin: SpinMotion): number {
  const x = spin.duration > 0 ? Math.min(1, Math.max(0, tSec / spin.duration)) : 1;
  if (x === 1) return spin.to;
  return spin.from + (spin.to - spin.from) * easing(x, spin.profile ?? DEFAULT_PROFILE);
}

/** Angular velocity in turns/second at time t of a spin phase. */
export function velocityAt(tSec: number, spin: SpinMotion): number {
  if (spin.duration <= 0) return 0;
  const x = tSec / spin.duration;
  return ((spin.to - spin.from) / spin.duration) * easingVelocity(x, spin.profile ?? DEFAULT_PROFILE);
}

export interface SpinPlan {
  /** Rotation before the spin (R0). */
  from: number;
  /** Final rotation R1 (lands on the landing angle). */
  to: number;
  /** Wind-up target (R0 − wind); equals `from` when there is no wind-up. */
  windTo: number;
  windUpSeconds: number;
  /** Spin-phase duration D (seconds). */
  duration: number;
  profile: MotionProfile;
  /** Total time including wind-up. */
  totalSeconds: number;
  extraTurns: number;
  landingTurn: number;
}

/**
 * The full motion of one spin (SPEC §7.1): optional wind-up, then the eased spin phase ending
 * exactly on `to = finalRotation(from, landing, extraTurns(D), pointerTurn)`.
 */
export function planSpin(o: { from: number; landingTurn: number; durationSec: number; reducedMotion?: boolean; slices?: readonly Slice[]; pointerTurn?: number; windUp?: boolean }): SpinPlan {
  const reduced = o.reducedMotion ?? false;
  const D = reduced ? REDUCED_DURATION : Math.min(MAX_SPIN_DURATION, Math.max(MIN_SPIN_DURATION, o.durationSec));
  const extra = extraTurns(D, reduced);
  const to = finalRotation(o.from, o.landingTurn, extra, o.pointerTurn ?? 0);
  let wind = 0;
  if (!reduced && (o.windUp ?? true)) {
    let smallest = 1;
    for (const s of o.slices ?? []) smallest = Math.min(smallest, s.end - s.start);
    wind = Math.min(WIND_UP_MAX, 0.25 * smallest);
  }
  const windUpSeconds = wind > 0 ? WIND_UP_SECONDS : 0;
  return { from: o.from, to, windTo: o.from - wind, windUpSeconds, duration: D, profile: profileFor(D, reduced), totalSeconds: windUpSeconds + D, extraTurns: extra, landingTurn: o.landingTurn };
}


/** Rotation at time t (seconds since the spin started, wind-up included). Exactly `to` at the end. */
export function planRotationAt(tSec: number, plan: SpinPlan): number {
  if (tSec >= plan.totalSeconds) return plan.to;
  if (tSec < plan.windUpSeconds) return plan.from + (plan.windTo - plan.from) * easeInOutCubic(tSec / plan.windUpSeconds);
  return rotationAt(tSec - plan.windUpSeconds, { from: plan.windTo, to: plan.to, duration: plan.duration, profile: plan.profile });
}

/** Skip to the end (SPEC §7.1): a 300 ms ease-out from the current rotation to the landing. */
export function skipMotion(current: number, to: number): SpinMotion {
  return { from: current, to, duration: SKIP_SECONDS, profile: SKIP_PROFILE };
}

// ---- pegs ----

/** SPEC §6.1 geometry, as fractions of the wheel radius R. */
export const PEG_RADIUS = 0.017;
export const RIM_WIDTH = 0.052;
export const PEG_RING = 1 - RIM_WIDTH / 2;

/**
 * Boundaries (turns, wheel-local) that carry a drawn peg (SPEC §6.4 "Peg spacing"): every
 * boundary, or every k-th with k = ceil(3.2 · 2·pegR / minArc) when they are too close.
 */
export function pegTurns(slices: readonly Slice[]): number[] {
  if (slices.length < 2) return [];
  let minTurn = 1;
  for (const s of slices) minTurn = Math.min(minTurn, s.end - s.start);
  const minArc = minTurn * 2 * Math.PI * PEG_RING;
  const k = Math.max(1, Math.ceil((3.2 * 2 * PEG_RADIUS) / minArc));
  const out: number[] = [];
  for (let i = 0; i < slices.length; i += k) out.push(slices[i]!.start);
  return out;
}

// ---- simple flap (PLAN §2.11, pure function of R) ----

function boundaries(slices: readonly Slice[]): number[] {
  return slices.map((s) => s.start);
}

/** Pointer deflection in degrees for rotation R: max just past a boundary, 0 after travelling wFlap. */
export function flapDeflection(r: number, slices: readonly Slice[], maxDeg: number = DEFAULT_MAX_DEFLECTION, pointerTurn = 0): number {
  if (slices.length === 0) return 0;
  const theta = mod1(pointerTurn - r);
  const b = boundaries(slices);
  // θ decreases as R increases, so the boundary most recently passed is the smallest one above θ.
  let next = 1 + b[0]!;
  for (const x of b) {
    if (x > theta) {
      next = x;
      break;
    }
  }
  const d = next - theta;
  let smallest = 1;
  for (const s of slices) smallest = Math.min(smallest, s.end - s.start);
  const wFlap = Math.min(0.5 * smallest, 6 / 360);
  return maxDeg * Math.max(0, 1 - d / wFlap);
}

/** Number of boundaries (`turns` list, or slice starts) the pointer passed between two rotations. */
export function crossingsAt(rPrev: number, rNow: number, turns: readonly number[], pointerTurn = 0): number {
  const tp = pointerTurn - rPrev;
  const tn = pointerTurn - rNow;
  const hi = Math.max(tp, tn);
  const lo = Math.min(tp, tn);
  let n = 0;
  for (const b of turns) n += Math.floor(hi - b) - Math.floor(lo - b);
  return n;
}

/** Number of slice boundaries the pointer passed between two frames (either direction). */
export function crossings(rPrev: number, rNow: number, slices: readonly Slice[], pointerTurn = 0): number {
  if (slices.length === 0) return 0;
  return crossingsAt(rPrev, rNow, boundaries(slices), pointerTurn);
}

// ---- pick flap physics (SPEC §7.2) ----

export interface FlapOptions {
  /** Wheel-local peg angles in turns (use pegTurns). */
  pegs: readonly number[];
  pointerTurn?: number;
  /** Natural frequency (Hz). */
  hz?: number;
  zeta?: number;
  maxDeg?: number;
  minDeg?: number;
  clampMaxDeg?: number;
  /** Contact window in turns; default 2·asin((pegR + 0.012)/(PEG_RING)) from SPEC geometry. */
  windowTurns?: number;
}

export const FLAP_WINDOW_TURNS = (2 * Math.asin((PEG_RADIUS + 0.012) / PEG_RING)) / (2 * Math.PI);

/**
 * Deterministic damped-spring pick with a peg contact constraint, integrated in 1 ms substeps.
 * `update(R, dt)` advances to rotation R over dt seconds (R interpolated linearly) and returns the
 * deflection in degrees and the number of peg releases (ticks) in that interval.
 */
export class FlapSim {
  phi = 0;
  vel = 0;
  private r: number | null = null;
  private readonly o: Required<Omit<FlapOptions, 'pegs'>> & { pegs: readonly number[] };

  constructor(opts: FlapOptions) {
    this.o = {
      pegs: opts.pegs,
      pointerTurn: opts.pointerTurn ?? 0,
      hz: opts.hz ?? 3.2,
      zeta: opts.zeta ?? 0.32,
      maxDeg: opts.maxDeg ?? 24,
      minDeg: opts.minDeg ?? -6,
      clampMaxDeg: opts.clampMaxDeg ?? 28,
      windowTurns: opts.windowTurns ?? FLAP_WINDOW_TURNS,
    };
  }

  reset(r: number): void {
    this.r = r;
    this.phi = 0;
    this.vel = 0;
  }

  /** Lower bound on φ from the peg in contact (0 when none), for wheel rotation R moving in `dir`. */
  private contactBound(r: number, dir: number): number {
    const { pegs, pointerTurn, windowTurns: w, maxDeg } = this.o;
    let best = 0;
    for (const b of pegs) {
      // Distance the peg still has to travel to reach the pick axis, in the direction of travel.
      const d = dir >= 0 ? mod1(pointerTurn - r - b) : mod1(b + r - pointerTurn);
      if (d < w) best = Math.max(best, maxDeg * (1 - d / w));
    }
    return dir >= 0 ? best : -best;
  }

  update(r: number, dtSec: number): { deflection: number; ticks: number } {
    if (this.r === null) {
      this.reset(r);
      return { deflection: 0, ticks: 0 };
    }
    const r0 = this.r;
    const steps = Math.max(1, Math.round(dtSec * 1000));
    const h = dtSec / steps;
    const wn = 2 * Math.PI * this.o.hz;
    const { zeta, minDeg, clampMaxDeg } = this.o;
    const dir = r >= r0 ? 1 : -1;
    for (let i = 1; i <= steps; i++) {
      const ri = r0 + ((r - r0) * i) / steps;
      const acc = -wn * wn * this.phi - 2 * zeta * wn * this.vel;
      this.vel += acc * h;
      this.phi += this.vel * h;
      const bound = this.contactBound(ri, dir);
      if (dir >= 0 ? this.phi < bound : this.phi > bound) {
        const v = (bound - this.phi) / h;
        this.phi = bound;
        this.vel = dir >= 0 ? Math.max(this.vel, v) : Math.min(this.vel, v);
      }
      if (this.phi < minDeg) {
        this.phi = minDeg;
        if (this.vel < 0) this.vel = 0;
      } else if (this.phi > clampMaxDeg) {
        this.phi = clampMaxDeg;
        if (this.vel > 0) this.vel = 0;
      }
    }
    this.r = r;
    const ticks = Math.abs(crossingsAt(r0, r, this.o.pegs, this.o.pointerTurn));
    return { deflection: this.phi, ticks };
  }
}
