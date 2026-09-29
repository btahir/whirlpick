// Confetti (PLAN §6.8, SPEC §7.5). Paper, not glitter: matte rectangles and dots from the pick tip.
// Every particle's state is a closed-form function of (t, seed), so frames are deterministic and
// seekable (screenshot tests can sample any instant). ≤ 160 particles, 2.4 s.

// REVIEW P1-2: 120 pieces on desktop, 70 on phones, 180 in presenter and stream mode.
export const MAX_PARTICLES = 180;
export const LIFETIME = 2.6;
const FADE = 0.4;
const GRAVITY = 1800; // px/s²
const DRAG = 0.9; // 1/s

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Particle {
  vx: number;
  vy: number;
  spin: number;
  rot0: number;
  flipHz: number;
  phase: number;
  /** Rectangle length (px) or dot radius. */
  size: number;
  color: string;
  dot: boolean;
}

export interface BurstOptions {
  /** Emitter (the pick tip), CSS px in the overlay. */
  x: number;
  y: number;
  colors: string[];
  /** The winner's slice colour, weighted 30 %. */
  winnerColor?: string;
  seed: number;
  /** 120 desktop, 70 phone, 180 presenter/stream. */
  count: number;
  /** Rectangle length range in px: [11, 17] desktop, [8, 12] phone, [14, 20] presenter/stream. */
  size?: [number, number];
  phone?: boolean;
}

export function makeParticles(o: BurstOptions): Particle[] {
  const rand = mulberry32(o.seed);
  const n = Math.max(0, Math.min(MAX_PARTICLES, o.count));
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    // A 110° cone centred 20° left of vertical, so the burst rises over the wheel and falls
    // across it rather than across the panel.
    const cone = (rand() - 0.5) * 110 - 20;
    const ang = ((-90 + cone) * Math.PI) / 180;
    const speed = 750 + rand() * 750;
    const dot = rand() >= 0.72;
    const [lo, hi] = o.size ?? (o.phone ? [8, 12] : [11, 17]);
    const size = dot ? 3 + rand() * 2 : lo + rand() * (hi - lo);
    const color = o.winnerColor && rand() < 0.3 ? o.winnerColor : o.colors[Math.floor(rand() * o.colors.length) % Math.max(1, o.colors.length)] ?? "#C2361F";
    out.push({
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      spin: ((rand() * 2 - 1) * Math.PI), // ±180°/s
      rot0: rand() * Math.PI * 2,
      flipHz: 4 + rand() * 5,
      phase: rand() * Math.PI * 2,
      size,
      color,
      dot,
    });
  }
  return out;
}

/** Position of a particle t seconds after launch (linear drag with gravity, closed form). */
export function particleAt(p: Particle, t: number, x0: number, y0: number) {
  if (t < 0 || t > LIFETIME) return null;
  const k = DRAG;
  const e = 1 - Math.exp(-k * t);
  // dv/dt = g − k·v  ⇒  x = x0 + (vx/k)·e ;  y = y0 + (g/k)·t + ((vy − g/k)/k)·e
  const x = x0 + (p.vx / k) * e;
  const y = y0 + (GRAVITY / k) * t + ((p.vy - GRAVITY / k) / k) * e;
  const alpha = t < LIFETIME - FADE ? 1 : Math.max(0, (LIFETIME - t) / FADE);
  return { x, y, rot: p.rot0 + p.spin * t, alpha, flip: Math.cos(p.phase + t * p.flipHz * Math.PI * 2) };
}

/** Draw the frame at time t. Returns how many particles were drawn. */
export function drawConfetti(ctx: CanvasRenderingContext2D, particles: Particle[], t: number, o: { x: number; y: number; width: number; height: number }): number {
  ctx.clearRect(0, 0, o.width, o.height);
  if (t > LIFETIME) return 0;
  let drawn = 0;
  for (const p of particles) {
    const s = particleAt(p, t, o.x, o.y);
    if (!s || s.alpha <= 0) continue;
    if (s.x < -30 || s.x > o.width + 30 || s.y > o.height + 30) continue;
    drawn++;
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = p.color;
    if (p.dot) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    // 1.6 : 0.8 paper; the length is `size`, flipping on its local X axis.
    const w = p.size;
    const h = p.size * 0.5 * Math.max(0.08, Math.abs(s.flip));
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  return drawn;
}

/** Run a burst on an overlay canvas. The canvas is cleared and `done` resolves after 2.4 s. */
export function burst(canvas: HTMLCanvasElement, o: BurstOptions): { done: Promise<void>; cancel: () => void } {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let cancelled = false;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  if (!ctx) {
    resolveDone();
    return { done, cancel: () => {} };
  }
  const particles = makeParticles(o);
  const start = performance.now();
  const finish = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resolveDone();
  };
  const step = () => {
    if (cancelled) return;
    const t = (performance.now() - start) / 1000;
    if (t > LIFETIME) {
      finish();
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawConfetti(ctx, particles, t, { x: o.x, y: o.y, width: w, height: h });
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return {
    done,
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      finish();
    },
  };
}
