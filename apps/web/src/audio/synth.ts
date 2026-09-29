// WebAudio synth (PLAN §6.7, SPEC §8). Every sound is generated here; there are no audio files.
// The AudioContext is created lazily inside a user gesture and never while muted.
//
// Graph: voices → master gain (0.8 × volume) → compressor (−18 dB, knee 12, ratio 4, 3 ms, 120 ms)
// → destination. One shared 2 s noise buffer from a fixed LCG (not Math.random).

export type VoiceName = "tick" | "win" | "start" | "pop" | "flick";

export interface VoiceParams {
  /** 0…1 gain scale for ticks. */
  intensity?: number;
  /** Cents of detune for ticks (±40 in the app, 0 in tests). */
  detune?: number;
  /** Semitone offset of the tick body (wind-up ratchet). */
  semitones?: number;
}

export function makeNoise(ctx: BaseAudioContext, seconds = 2, seed = 0x2f6b1d): AudioBuffer {
  const len = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let x = seed >>> 0;
  for (let i = 0; i < len; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    d[i] = (x / 0xffffffff) * 2 - 1;
  }
  return buf;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseFor(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = makeNoise(ctx);
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Attack to `peak`, then an exponential decay to 0.001 over `decay` seconds. */
function env(g: AudioParam, t: number, peak: number, attack: number, decay: number) {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export interface Stoppable {
  stop(at?: number): void;
}

/** Schedule one voice on any (online or offline) context. Returns its length in seconds. */
export function playVoice(ctx: BaseAudioContext, dest: AudioNode, name: VoiceName, t: number, p: VoiceParams = {}, track?: Stoppable[]): number {
  const add = (n: AudioScheduledSourceNode) => track?.push(n);
  if (name === "tick") {
    const k = Math.max(0.1, Math.min(1, p.intensity ?? 1));
    const cents = p.detune ?? 0;
    const semi = p.semitones ?? 0;
    // Click: noise through a band-pass.
    const src = ctx.createBufferSource();
    src.buffer = noiseFor(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 3.5;
    bp.detune.value = cents;
    const g1 = ctx.createGain();
    env(g1.gain, t, 0.5 * k, 0.001, 0.026);
    src.connect(bp).connect(g1).connect(dest);
    src.start(t, (Math.abs(Math.sin(t * 91.7)) * 1.8) % 1.9, 0.03);
    src.stop(t + 0.03);
    add(src);
    // Body: a triangle gliding down.
    const o = ctx.createOscillator();
    o.type = "triangle";
    const f0 = 1650 * Math.pow(2, semi / 12);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(900 * Math.pow(2, semi / 12), t + 0.018);
    o.detune.value = cents;
    const g2 = ctx.createGain();
    env(g2.gain, t, 0.25 * k, 0.0008, 0.022);
    o.connect(g2).connect(dest);
    o.start(t);
    o.stop(t + 0.026);
    add(o);
    // Wood: a low sine thump.
    const w = ctx.createOscillator();
    w.type = "sine";
    w.frequency.value = 420;
    w.detune.value = cents;
    const g3 = ctx.createGain();
    env(g3.gain, t, 0.12 * k, 0.001, 0.027);
    w.connect(g3).connect(dest);
    w.start(t);
    w.stop(t + 0.03);
    add(w);
    return 0.03;
  }
  if (name === "start") {
    // A short filtered-noise swell (used when the whoosh can't run continuously).
    const src = ctx.createBufferSource();
    src.buffer = noiseFor(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2000;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(1200, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(lp).connect(bp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.31);
    add(src);
    return 0.31;
  }
  if (name === "pop") {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.09);
    const g = ctx.createGain();
    env(g.gain, t, 0.3, 0.003, 0.09);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.1);
    add(o);
    return 0.1;
  }
  if (name === "flick") {
    const src = ctx.createBufferSource();
    src.buffer = noiseFor(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    env(g.gain, t, 0.25, 0.001, 0.007);
    src.connect(hp).connect(g).connect(dest);
    src.start(t, 0.5, 0.01);
    src.stop(t + 0.01);
    add(src);
    return 0.01;
  }
  // win: a small brass bell. E5, G♯5, B5 at 0, 60 and 120 ms; each note a sine fundamental with
  // partials at 2.76× and 5.4×, into a short feedback delay for room.
  const notes = [659.25, 830.61, 987.77];
  const bus = ctx.createGain();
  bus.gain.value = 1;
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.18;
  const fb = ctx.createGain();
  fb.gain.value = 0.22;
  const wet = ctx.createGain();
  wet.gain.value = 0.18;
  bus.connect(dest);
  bus.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(dest);
  const FUND = 0.82;
  notes.forEach((f, i) => {
    const at = t + i * 0.06;
    for (const [mult, level, decay] of [
      [1, 0.35, FUND],
      [2.76, 0.3 * 0.35, 0.5],
      [5.4, 0.12 * 0.35, 0.28],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      env(g.gain, at, level, 0.004, decay);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + 0.004 + decay + 0.02);
      add(o);
    }
  });
  return 0.12 + 0.004 + FUND;
}

type Ctor = new (opts?: AudioContextOptions) => AudioContext;

export interface Synth {
  /** Call synchronously inside a user gesture: creates/resumes the context if unmuted. */
  unlock(): void;
  tick(intensity: number, semitones?: number): void;
  win(): void;
  pop(): void;
  flick(): void;
  /** Continuous spin whoosh: level = ω/ωpeak (0…1); 0 stops it. */
  whoosh(level: number): void;
  setMuted(m: boolean): void;
  setVolume(v: number): void;
  readonly muted: boolean;
  /** Whether an AudioContext exists (tests). */
  readonly hasContext: boolean;
  /** Test instrumentation: timestamps (ms) of every tick voice started. */
  readonly tickLog: number[];
}

export const MUTE_KEY = "whirlpick:muted";

export function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(m: boolean): void {
  try {
    if (m) globalThis.localStorage?.setItem(MUTE_KEY, "1");
    else globalThis.localStorage?.removeItem(MUTE_KEY);
  } catch {
    /* storage blocked */
  }
}

export function createSynth(opts: { muted: boolean; volume: number; ctor?: Ctor | null }): Synth {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = opts.muted;
  let volume = opts.volume;
  const ticks: { nodes: Stoppable[]; end: number }[] = [];
  const tickLog: number[] = [];
  let whooshNodes: { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode } | null = null;

  const ctorOf = (): Ctor | null => {
    if (opts.ctor !== undefined) return opts.ctor;
    const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
  };
  const ensure = (): AudioContext | null => {
    if (muted) return null;
    if (!ctx) {
      const C = ctorOf();
      if (!C) return null;
      try {
        ctx = new C({ latencyHint: "interactive" });
      } catch {
        return null;
      }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      master = ctx.createGain();
      master.gain.value = 0.8 * volume;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  };
  const ready = (): AudioContext | null => {
    if (muted || !ctx || !master) return null;
    if (ctx.state !== "running") {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      return null;
    }
    return ctx;
  };

  return {
    unlock() {
      ensure();
    },
    tick(intensity, semitones = 0) {
      tickLog.push(typeof performance !== "undefined" ? performance.now() : Date.now());
      const c = ready();
      if (!c) return;
      const now = c.currentTime;
      // Voice limit: at most 6 concurrent ticks; steal the oldest.
      for (let i = ticks.length - 1; i >= 0; i--) if (ticks[i]!.end < now) ticks.splice(i, 1);
      if (ticks.length >= 6) {
        const old = ticks.shift()!;
        for (const n of old.nodes) {
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        }
      }
      const nodes: Stoppable[] = [];
      const gainVar = Math.pow(10, ((Math.random() * 2 - 1) * 1.5) / 20);
      const len = playVoice(c, master!, "tick", now + 0.004, { intensity: intensity * gainVar, detune: (Math.random() * 2 - 1) * 40, semitones }, nodes);
      ticks.push({ nodes, end: now + 0.004 + len });
    },
    win() {
      const c = ready();
      if (c) playVoice(c, master!, "win", c.currentTime + 0.005);
    },
    pop() {
      const c = ready();
      if (c) playVoice(c, master!, "pop", c.currentTime + 0.005);
    },
    flick() {
      const c = ready();
      if (c) playVoice(c, master!, "flick", c.currentTime + 0.003);
    },
    whoosh(level) {
      const c = ready();
      if (!c) return;
      const now = c.currentTime;
      if (level < 0.05) {
        if (whooshNodes) {
          const w = whooshNodes;
          whooshNodes = null;
          w.g.gain.setTargetAtTime(0.0001, now, 0.06);
          try {
            w.src.stop(now + 0.4);
          } catch {
            /* stopped */
          }
        }
        return;
      }
      if (!whooshNodes) {
        const src = c.createBufferSource();
        src.buffer = noiseFor(c);
        src.loop = true;
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2000;
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 0.9;
        bp.frequency.value = 300;
        const g = c.createGain();
        g.gain.value = 0.0001;
        src.connect(lp).connect(bp).connect(g).connect(master!);
        src.start(now);
        whooshNodes = { src, bp, g };
      }
      whooshNodes.bp.frequency.setTargetAtTime(300 + 900 * level, now, 0.06);
      whooshNodes.g.gain.setTargetAtTime(0.1 * Math.pow(level, 1.5), now, 0.06);
    },
    setMuted(m) {
      muted = m;
      if (ctx) {
        if (m) void ctx.suspend().catch(() => {});
        else void ctx.resume().catch(() => {});
      }
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = 0.8 * volume;
    },
    get muted() {
      return muted;
    },
    get hasContext() {
      return ctx !== null;
    },
    tickLog,
  };
}

/** Render one voice offline (ACCEPTANCE K1). Returns channel 0 and the scheduled length. */
export async function renderVoiceOffline(name: VoiceName, sampleRate = 48000): Promise<{ samples: Float32Array; duration: number }> {
  const O = (globalThis as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const ctx = new O(1, Math.ceil((name === "win" ? 1.6 : 0.4) * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);
  const duration = playVoice(ctx, master, name, 0, { intensity: 1 });
  const buf = await ctx.startRendering();
  return { samples: buf.getChannelData(0), duration };
}
