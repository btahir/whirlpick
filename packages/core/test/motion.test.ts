// C4–C5 and the design SPEC §7 motion: angle as a pure function of time.
import { describe, expect, it } from 'vitest';
import {
  crossings,
  DEFAULT_PROFILE,
  easing,
  easingVelocity,
  extraTurns,
  FlapSim,
  flapDeflection,
  landingTurn,
  LONG_PROFILE,
  pegTurns,
  planRotationAt,
  planSpin,
  profileFor,
  REDUCED_PROFILE,
  rotationAt,
  skipMotion,
  sliceUnderPointer,
  slicesFor,
  WIND_UP_SECONDS,
} from '../src/index.js';
import { uniform } from './helpers.js';

describe('motion', () => {
  it('C4 easing: exact endpoints, monotonic over 10 000 samples, velocity continuous at a (default, long, reduced)', () => {
    for (const prof of [DEFAULT_PROFILE, LONG_PROFILE, REDUCED_PROFILE]) {
      expect(easing(0, prof)).toBe(0);
      expect(easing(1, prof)).toBe(1);
      let prev = 0;
      for (let i = 0; i <= 10_000; i++) {
        const e = easing(i / 10_000, prof);
        expect(e).toBeGreaterThanOrEqual(prev);
        prev = e;
      }
      expect(easingVelocity(1, prof)).toBe(0);
      if (prof.a > 0) {
        const h = 1e-7;
        const left = (easing(prof.a, prof) - easing(prof.a - h, prof)) / h;
        const right = (easing(prof.a + h, prof) - easing(prof.a, prof)) / h;
        expect(Math.abs(left - right) / right).toBeLessThan(0.01);
      }
    }
  });
  it('SPEC §7.1 constants: v0 ≈ 2.913, pa ≈ 0.0874 for k = 3; last 25 % of time covers ≈ 1.7 % of Θ (SPEC: "about 1.6 %")', () => {
    const { a, p } = DEFAULT_PROFILE;
    const v0 = p / (1 - a + (a * p) / 2);
    expect(v0).toBeCloseTo(2.913, 3);
    expect(easing(a)).toBeCloseTo(0.0874, 4);
    expect(1 - easing(0.75)).toBeCloseTo(0.0172, 4);
    expect(profileFor(11.5)).toEqual(DEFAULT_PROFILE);
    expect(profileFor(12)).toEqual(LONG_PROFILE);
    expect(profileFor(6, true)).toEqual(REDUCED_PROFILE);
  });
  it('rotationAt: t = 0 → from, t = D → to exactly, t > D → to', () => {
    const spin = { from: 0.3, to: 6.9, duration: 6 };
    expect(rotationAt(0, spin)).toBe(0.3);
    expect(rotationAt(-1, spin)).toBe(0.3);
    expect(rotationAt(6, spin)).toBe(6.9);
    expect(rotationAt(60, spin)).toBe(6.9);
  });
  it('matches the SPEC §7.1 formula written out independently, for k = 3, 3.4 and 2', () => {
    // θ(t) = θstart + Θ·p(t/D), v0 = k/(1 − τa + τa·k/2), pa = v0·τa/2,
    // p(τ) = τ < τa ? pa·(τ/τa)² : pa + (1 − pa)·(1 − (1 − s)^k), s = (τ − τa)/(1 − τa)
    const spec = (tau: number, ta: number, k: number) => {
      const v0 = k / (1 - ta + (ta * k) / 2);
      const pa = (v0 * ta) / 2;
      if (tau < ta) return pa * (tau / ta) ** 2;
      const s = (tau - ta) / (1 - ta);
      return pa + (1 - pa) * (1 - (1 - s) ** k);
    };
    for (const [prof, D] of [[DEFAULT_PROFILE, 6], [LONG_PROFILE, 15], [REDUCED_PROFILE, 1.2]] as const) {
      const spin = { from: 0.25, to: 7.5, duration: D, profile: prof };
      for (let i = 0; i <= 1000; i++) {
        const t = (D * i) / 1000;
        expect(rotationAt(t, spin)).toBeCloseTo(0.25 + 7.25 * spec(t / D, prof.a, prof.p), 12);
      }
    }
  });
  it('golden angles for a 6 s spin from 0 to 6.5 turns (frozen)', () => {
    const spin = { from: 0, to: 6.5, duration: 6 };
    const got = [0, 0.18, 0.36, 1, 3, 4.5, 5.9, 6].map((t) => Number(rotationAt(t, spin).toFixed(10)));
    expect(got).toEqual([0, 0.1419902913, 0.567961165, 2.366892639, 5.60724881, 6.3884061013, 6.4999669351, 6.5]);
  });
  it('planSpin (1–30 s): lands exactly on the landing angle, wind-up goes back first, monotonic afterwards', () => {
    const entries = uniform(12);
    const slices = slicesFor(entries);
    for (let d = 1; d <= 30; d += 0.5) {
      for (const reduced of [false, true]) {
        const pos = Math.floor(d) % 12;
        const lt = landingTurn(slices, pos, 123456789 * (pos + 1));
        const plan = planSpin({ from: 0.4, landingTurn: lt, durationSec: d, reducedMotion: reduced, slices });
        expect(planRotationAt(0, plan)).toBe(0.4);
        expect(planRotationAt(plan.totalSeconds, plan)).toBe(plan.to);
        expect(sliceUnderPointer(plan.to, slices)).toBe(pos);
        expect(plan.extraTurns).toBe(extraTurns(reduced ? 1.2 : d, reduced));
        if (reduced) {
          expect(plan.windUpSeconds).toBe(0);
          expect(plan.totalSeconds).toBe(1.2);
        } else {
          expect(plan.windUpSeconds).toBe(WIND_UP_SECONDS);
          expect(plan.windTo).toBeCloseTo(0.4 - Math.min(4 / 360, 0.25 / 12), 12);
          expect(planRotationAt(WIND_UP_SECONDS, plan)).toBeCloseTo(plan.windTo, 12);
        }
        let prev = planRotationAt(plan.windUpSeconds, plan);
        for (let i = 1; i <= 400; i++) {
          const r = planRotationAt(plan.windUpSeconds + (plan.duration * i) / 400, plan);
          expect(r).toBeGreaterThanOrEqual(prev);
          prev = r;
        }
        // No overshoot: never past the landing.
        expect(prev).toBe(plan.to);
      }
    }
  });
  it('skipMotion: 300 ms ease-out ending exactly on the landing', () => {
    const m = skipMotion(2.2, 5.5);
    expect(m.duration).toBe(0.3);
    expect(rotationAt(0.3, m)).toBe(5.5);
    expect(rotationAt(0.15, m)).toBeGreaterThan(2.2 + (5.5 - 2.2) / 2);
  });
  it('C5 crossings: inside a slice 0, one boundary 1, 3 turns on 10 slices 30, wrap at 0/1, backwards counted', () => {
    const s = slicesFor(uniform(10));
    expect(crossings(0.01, 0.05, s)).toBe(0);
    expect(crossings(0.05, 0.15, s)).toBe(1);
    expect(crossings(0.05, 3.05, s)).toBe(30);
    expect(crossings(0.95, 1.05, s)).toBe(1);
    expect(crossings(-0.02, 0.02, s)).toBe(1);
    expect(crossings(0.15, 0.05, s)).toBe(1);
  });
  it('C5 flap: maximal just past a boundary, 0 after wFlap, never negative', () => {
    const s = slicesFor(uniform(10));
    // R slightly past 0.1: pointer local angle 0.9 − ε, just passed the boundary at 0.9.
    const just = flapDeflection(0.1 + 1e-9, s, 22);
    expect(just).toBeCloseTo(22, 5);
    const w = Math.min(0.05, 6 / 360);
    expect(flapDeflection(0.1 + w + 1e-9, s, 22)).toBe(0);
    for (let r = 0; r < 2; r += 0.0007) expect(flapDeflection(r, s, 22)).toBeGreaterThanOrEqual(0);
  });
  it('pegTurns: every boundary on small wheels, every k-th on dense ones', () => {
    expect(pegTurns(slicesFor(uniform(12)))).toHaveLength(12);
    const dense = pegTurns(slicesFor(uniform(1000)));
    expect(dense.length).toBeLessThan(1000);
    expect(dense.length).toBeGreaterThan(50);
  });
  it('FlapSim (SPEC §7.2): deterministic, bounded to [−6°, 28°], one tick per peg passed, settles after the stop', () => {
    const slices = slicesFor(uniform(12));
    const pegs = pegTurns(slices);
    const run = () => {
      const sim = new FlapSim({ pegs });
      const plan = planSpin({ from: 0, landingTurn: landingTurn(slices, 3, 2e9), durationSec: 6, slices });
      sim.reset(plan.from);
      let ticks = 0;
      let lo = 0;
      let hi = 0;
      const out: number[] = [];
      for (let t = 1 / 60; t <= plan.totalSeconds + 1; t += 1 / 60) {
        const { deflection, ticks: k } = sim.update(planRotationAt(t, plan), 1 / 60);
        ticks += k;
        lo = Math.min(lo, deflection);
        hi = Math.max(hi, deflection);
        out.push(deflection);
      }
      return { ticks, lo, hi, out, plan };
    };
    const a = run();
    const b = run();
    expect(a.out).toEqual(b.out);
    expect(a.lo).toBeGreaterThanOrEqual(-6);
    expect(a.hi).toBeLessThanOrEqual(28);
    expect(a.hi).toBeGreaterThan(20);
    const expectedTicks = crossings(a.plan.from, a.plan.windTo, slices) + crossings(a.plan.windTo, a.plan.to, slices);
    expect(a.ticks).toBe(expectedTicks);
    expect(Math.abs(a.out[a.out.length - 1]!)).toBeLessThan(1);
  });
});
