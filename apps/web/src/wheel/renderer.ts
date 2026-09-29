// Canvas 2D wheel renderer (PLAN §6.5, SPEC §6). Pure with respect to its inputs: it touches only
// the given context, deps.createCanvas and the given images.
//
// Canvas box: 2.24 R wide × 2.08 R tall, wheel centre at (1.04 R, 1.04 R); the extra width on the
// right holds the pick at 3 o'clock. Static parts are cached offscreen:
//   base  shadow, rim, brass hairline                      (static)
//   face  slice fills, images, labels, spokes, pegs         (rotates; one drawImage per frame)
//   top   vignette and hub                                  (static)
// Per frame: base → rotated face → [mystery "?"] → veil + winner outline → top → pick.
//
// Angles are turns, clockwise, in core's wheel frame. Core puts the pick at pointerTurn 0 and
// renderers add DESIGN_SCREEN_OFFSET (0.25 turn) so that frame's zero sits at 3 o'clock (SPEC §6.3).
// Not used on purpose (compat, PLAN §9): ctx.letterSpacing, ctx.filter, ctx.reset(), roundRect.
import { DESIGN_SCREEN_OFFSET, pegTurns } from "@whirlpick/core";
import { FACE, type SceneSlice, type WheelScene } from "./scene";

export type Ctx = CanvasRenderingContext2D;

export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: "2d"): Ctx | null;
}

export interface RenderDeps {
  createCanvas(w: number, h: number): CanvasLike;
  images: Map<string, CanvasImageSource>;
  graphemes?: (s: string) => string[];
}

export interface Frame {
  /** CSS width of the canvas box (height = width · 2.08 / 2.24). */
  width: number;
  dpr: number;
  /** Pick deflection in degrees; positive = tip pushed in the wheel's direction of travel. */
  pick: number;
  /** Winner veil: slice position, strength 0…1, outline progress 0…1. */
  veilPos?: number | null;
  veil?: number;
  outline?: number;
  /** 0…1: mystery "?" fade (1 = fully shown). */
  mysteryAlpha?: number;
}

export interface LabelReport {
  pos: number;
  text: string;
  fontPx: number;
  stretch: number;
  width: number;
  /** Radial room (CSS px) between the rim end and the inner limit. */
  room: number;
  /** Chord of the slice (CSS px) at the label's inner end. */
  chordAtInner: number;
  hidden: boolean;
}

export interface RenderReport {
  labels: LabelReport[];
  cacheHit: boolean;
  geometry: Geometry;
  /** Every k-th boundary carries a peg. */
  pegStride: number;
}

export interface Geometry {
  R: number;
  cx: number;
  cy: number;
  rim: number;
  face: number;
  hub: number;
  width: number;
  height: number;
}

export const TAU = Math.PI * 2;
export const BOX_W = 2.24;
/** Layout box height (SPEC §6.1). */
export const BOX_H = 2.08;
/** Drawn canvas height: 0.16 R taller than the layout box so the soft shadow isn't clipped; the
 * extra strip overflows the box (it is transparent apart from the shadow). */
export const DRAW_H = 2.24;
export const GEO = {
  RIM: 0.052,
  HUB: 0.172,
  PEG: 0.017,
  PIVOT: 1.116,
  PICK: 0.0086,
  LABEL_OUT: 0.068,
  LABEL_IN: 0.05,
  FS_MAX: 0.116,
  FS_MIN_PX: 10,
  FS_MIN: 0.024,
} as const;
export const PICK_PATH =
  "M22 0 C16.5 -4.2 9 -10.5 1.5 -10.5 C-4.8 -10.5 -8.5 -6 -8.5 0 C-8.5 6 -4.8 10.5 1.5 10.5 C9 10.5 16.5 4.2 22 0 Z";

/** Canvas angle (0 = 3 o'clock, clockwise) of wheel-frame turn t at rotation 0. */
export const canvasAngle = (turn: number) => (turn + DESIGN_SCREEN_OFFSET - 0.25) * TAU;

export function geometryFor(width: number): Geometry {
  const R = width / BOX_W;
  return { R, cx: 1.04 * R, cy: 1.04 * R, rim: GEO.RIM * R, face: R * FACE, hub: GEO.HUB * R, width, height: DRAW_H * R };
}

/** Canvas height (CSS px) for a canvas box `width` wide. */
export function heightFor(width: number): number {
  return (width / BOX_W) * DRAW_H;
}

export function pixelRatio(dpr: number): number {
  return Math.min(Math.max(dpr || 1, 1), 2);
}

/* --------------------------------------------------------------- utilities */

let segmenter: { segment(s: string): Iterable<{ segment: string }> } | null | undefined;
export function defaultGraphemes(s: string): string[] {
  if (segmenter === undefined) {
    const I = (globalThis as { Intl?: { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } } }).Intl;
    segmenter = I?.Segmenter ? new I.Segmenter(undefined, { granularity: "grapheme" }) : null;
  }
  if (!segmenter) return Array.from(s);
  return Array.from(segmenter.segment(s), (x) => x.segment);
}

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
  ctx.closePath();
}

/** Wedge path around (0, 0). Full circle when the slice is the whole wheel. */
function wedge(ctx: Ctx, r: number, start: number, end: number) {
  ctx.beginPath();
  if (end - start >= 1 - 1e-9) {
    ctx.arc(0, 0, r, 0, TAU);
  } else {
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, canvasAngle(start), canvasAngle(end));
  }
  ctx.closePath();
}

let pickPath: Path2D | null | undefined;
function pickShape() {
  const P = (globalThis as { Path2D?: typeof Path2D }).Path2D;
  if (pickPath === undefined) {
    try {
      pickPath = P ? new P(PICK_PATH) : null;
    } catch {
      pickPath = null;
    }
  }
  return pickPath;
}

function pickPathManual(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.bezierCurveTo(16.5, -4.2, 9, -10.5, 1.5, -10.5);
  ctx.bezierCurveTo(-4.8, -10.5, -8.5, -6, -8.5, 0);
  ctx.bezierCurveTo(-8.5, 6, -4.8, 10.5, 1.5, 10.5);
  ctx.bezierCurveTo(9, 10.5, 16.5, 4.2, 22, 0);
  ctx.closePath();
}

function brassGradient(ctx: Ctx, x: number, y: number, r: number, t: WheelScene["theme"]) {
  // SPEC: radial from hi at 35 %/30 % to lo.
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r * 1.5);
  g.addColorStop(0, t.brassHi);
  g.addColorStop(0.55 / 1.5 + 0.2, t.brass);
  g.addColorStop(1, t.brassLo);
  return g;
}

const stretchKeyword = (wdth: number) => (wdth <= 80 ? "condensed" : wdth <= 92 ? "semi-condensed" : "normal");

export function labelFont(px: number, wdth: number, family: string, weight = 760): string {
  return `${weight} ${stretchKeyword(wdth)} ${Math.max(1, Math.round(px * 100) / 100)}px ${family}`;
}

/* ------------------------------------------------------------ label layout */

export interface FitInput {
  label: string;
  /** Slice angle in radians. */
  angle: number;
  g: Geometry;
  globalFs: number;
  fsMin: number;
  measure: (text: string, px: number, wdth: number) => number;
  graphemes: (s: string) => string[];
}

/** SPEC §6.4 label fitting for one slice. */
export function fitLabel(i: FitInput): Omit<LabelReport, "pos"> {
  const { g } = i;
  const rhoOut = g.face - GEO.LABEL_OUT * g.R;
  const rhoInMin = g.hub + GEO.LABEL_IN * g.R;
  const room = rhoOut - rhoInMin;
  const chord = (rho: number, A: number) => 2 * rho * Math.sin(Math.min(A, Math.PI) / 2);
  const A = i.angle;
  let text = i.label;
  let wdth = 84;
  let fs = i.globalFs;
  let w = i.measure(text, fs, wdth);
  const rin = () => Math.max(rhoOut - w, rhoInMin);
  const fits = () => w <= room && fs <= 0.9 * chord(rin() + fs * 0.5, A);
  for (let k = 0; k < 4 && !fits(); k++) {
    if (wdth > 75) {
      wdth = 75;
      w = i.measure(text, fs, wdth);
      continue;
    }
    const byChord = 0.9 * chord(rin() + fs * 0.5, A);
    const byLen = (fs * room) / Math.max(w, 1e-6);
    fs = Math.max(i.fsMin, Math.min(fs, byChord, byLen) * 0.98);
    w = i.measure(text, fs, wdth);
  }
  if (!fits()) {
    let gs = i.graphemes(text);
    while (!fits() && gs.length > 3) {
      gs = gs.slice(0, -2);
      text = gs.join("").trimEnd() + "…";
      gs = i.graphemes(text).slice(0, -1);
      w = i.measure(text, fs, wdth);
    }
  }
  const hidden = fs < i.fsMin - 1e-9 || !fits();
  return { text, fontPx: fs, stretch: wdth, width: w, room, chordAtInner: chord(rin(), A), hidden };
}

export function globalFontSize(g: Geometry, n: number, fontScale: number): { globalFs: number; fsMin: number } {
  const chord = (rho: number, A: number) => 2 * rho * Math.sin(Math.min(A, Math.PI) / 2);
  const fsMax = GEO.FS_MAX * g.R * fontScale;
  const fsMin = Math.max(GEO.FS_MIN_PX * fontScale, GEO.FS_MIN * g.R);
  return { globalFs: Math.min(fsMax, 0.9 * chord(0.8 * g.face, TAU / Math.max(n, 2)) * fontScale), fsMin };
}

export function pegStrideFor(scene: Pick<WheelScene, "slices">, R: number): number {
  if (scene.slices.length < 2) return 0;
  const pegR = GEO.PEG * R;
  const pr = R - (GEO.RIM * R) / 2;
  let min = Infinity;
  for (const s of scene.slices) min = Math.min(min, (s.end - s.start) * TAU);
  const minArc = pr * min;
  return Math.max(1, Math.ceil((pegR * 2 * 3.2) / Math.max(minArc, 1e-9)));
}

/* ------------------------------------------------------------ layer caches */

interface Layers {
  key: string;
  base: CanvasLike;
  face: CanvasLike;
  top: CanvasLike;
  labels: LabelReport[];
  pegStride: number;
}

const cache = new WeakMap<object, Layers>();

function layer(deps: RenderDeps, w: number, h: number, scale: number): { c: CanvasLike; ctx: Ctx } {
  const c = deps.createCanvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { c, ctx };
}

function drawBase(ctx: Ctx, scene: WheelScene, g: Geometry) {
  const t = scene.theme;
  ctx.save();
  ctx.translate(g.cx, g.cy);
  if (!t.flat) {
    // Shadow: an ellipse under the wheel, blurred 0.036 R (canvas blur ≈ 2σ), projected from far
    // away so only the shadow lands on the canvas.
    const off = 10000;
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${t.shadowOpacity})`;
    ctx.shadowBlur = 0.072 * g.R;
    ctx.shadowOffsetX = off;
    ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.ellipse(-off, 0.088 * g.R, 0.98 * g.R, 0.98 * g.R, 0, 0, TAU);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
  }
  circle(ctx, 0, 0, g.R);
  ctx.fillStyle = t.rim;
  ctx.fill();
  circle(ctx, 0, 0, g.R - 0.006 * g.R);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.004 * g.R;
  ctx.strokeStyle = t.brass;
  ctx.stroke();
  ctx.restore();
}

function measureWith(ctx: Ctx, family: string, weight = 760) {
  const cache = new Map<string, number>();
  return (text: string, px: number, wdth: number) => {
    const k = `${px.toFixed(2)}|${wdth}|${text}`;
    let w = cache.get(k);
    if (w === undefined) {
      ctx.font = labelFont(px, wdth, family, weight);
      w = ctx.measureText(text).width;
      cache.set(k, w);
    }
    return w;
  };
}

function drawFace(ctx: Ctx, scene: WheelScene, g: Geometry, deps: RenderDeps): { labels: LabelReport[]; pegStride: number } {
  const t = scene.theme;
  const graphemes = deps.graphemes ?? defaultGraphemes;
  const n = scene.slices.length;
  ctx.save();
  ctx.translate(g.R, g.R); // face canvas is 2R × 2R
  // Fills.
  if (scene.empty) {
    circle(ctx, 0, 0, g.face);
    ctx.fillStyle = t.sunk;
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = t.rule;
    ctx.lineWidth = Math.max(1, 0.008 * g.R);
    ctx.setLineDash([0.028 * g.R, 0.024 * g.R]);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.moveTo(Math.cos(a) * g.hub, Math.sin(a) * g.hub);
      ctx.lineTo(Math.cos(a) * g.face, Math.sin(a) * g.face);
    }
    ctx.stroke();
    ctx.restore();
  }
  for (const s of scene.slices) {
    wedge(ctx, g.face + 0.5, s.start, s.end);
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  // Images: cover the slice, centred on its centroid at 0.62 r, rotating with the slice.
  for (const s of scene.slices) {
    if (!s.imageRef) continue;
    const img = deps.images.get(s.imageRef);
    if (!img) continue;
    const A = (s.end - s.start) * TAU;
    const mid = canvasAngle((s.start + s.end) / 2);
    const side = Math.min(2 * g.face, Math.max(0.8 * g.face, 2 * g.face * Math.sin(Math.min(A, Math.PI) / 2)));
    ctx.save();
    wedge(ctx, g.face, s.start, s.end);
    ctx.clip();
    ctx.rotate(mid);
    ctx.translate(0.62 * g.face, 0);
    ctx.rotate(Math.PI / 2);
    const iw = (img as { width?: number }).width || 1;
    const ih = (img as { height?: number }).height || 1;
    const k = Math.max(side / iw, side / ih);
    ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
    ctx.restore();
  }
  // Labels (after all fills so halos are never covered).
  const labels: LabelReport[] = [];
  if (scene.labels && n > 0) {
    const measure = measureWith(ctx, t.labelFamily, t.labelWeight ?? 760);
    const { globalFs, fsMin } = globalFontSize(g, n, scene.fontScale);
    const rhoOut = g.face - GEO.LABEL_OUT * g.R;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (const s of scene.slices) {
      const A = n === 1 ? Math.PI : (s.end - s.start) * TAU;
      const fit = fitLabel({ label: s.label, angle: A, g, globalFs, fsMin, measure, graphemes });
      labels.push({ pos: s.pos, ...fit });
      if (fit.hidden) continue;
      ctx.save();
      ctx.rotate(n === 1 ? 0 : canvasAngle((s.start + s.end) / 2));
      ctx.font = labelFont(fit.fontPx, fit.stretch, t.labelFamily, t.labelWeight ?? 760);
      if (RTL.test(fit.text)) ctx.direction = "rtl";
      if (s.halo) {
        ctx.lineJoin = "round";
        ctx.lineWidth = fit.fontPx * 0.18;
        ctx.strokeStyle = s.halo;
        ctx.strokeText(fit.text, rhoOut, 0);
      }
      ctx.fillStyle = s.textFill;
      ctx.fillText(fit.text, rhoOut, 0);
      ctx.restore();
    }
  }
  // Spokes: only when the slice arc at the face edge is ≥ 5 CSS px, fading in from 5 to 10 px.
  if (n > 1) {
    ctx.strokeStyle = t.sep;
    ctx.lineWidth = Math.max(1, Math.min(4, 0.008 * g.R));
    ctx.lineCap = "butt";
    for (const s of scene.slices) {
      const arcPx = g.face * (s.end - s.start) * TAU;
      if (arcPx < 5) continue;
      ctx.globalAlpha = Math.min(1, (arcPx - 5) / 5);
      const a = canvasAngle(s.start);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.155 * g.R, Math.sin(a) * 0.155 * g.R);
      ctx.lineTo(Math.cos(a) * g.face, Math.sin(a) * g.face);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Pegs at slice boundaries on the rim band (every k-th boundary on dense wheels).
  const stride = scene.empty || n < 2 ? 0 : pegStrideFor(scene, g.R);
  if (stride) {
    const pegR = GEO.PEG * g.R;
    const pr = g.R - g.rim / 2;
    // Same boundaries as core's pegTurns, so the ticks follow the drawn pegs.
    for (const b of pegTurns(scene.geometry)) {
      const a = canvasAngle(b);
      const x = Math.cos(a) * pr;
      const y = Math.sin(a) * pr;
      if (t.scheme === "dark") {
        circle(ctx, x + 0.003 * g.R, y + 0.005 * g.R, pegR);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fill();
      }
      circle(ctx, x, y, pegR);
      ctx.fillStyle = brassGradient(ctx, x, y, pegR, t);
      ctx.fill();
    }
  }
  ctx.restore();
  return { labels, pegStride: stride };
}

function drawTop(ctx: Ctx, scene: WheelScene, g: Geometry, deps: RenderDeps) {
  const t = scene.theme;
  const graphemes = deps.graphemes ?? defaultGraphemes;
  ctx.save();
  ctx.translate(g.cx, g.cy);
  if (!t.flat) {
    const v = ctx.createRadialGradient(0, 0, 0, 0, 0, g.face);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.72, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${t.vignette})`);
    circle(ctx, 0, 0, g.face);
    ctx.fillStyle = v;
    ctx.fill();
  }
  // Hub: rim-coloured collar, hub disc, faint inner ring, brass pin with a dark centre dot.
  circle(ctx, 0, 0, g.hub + 0.016 * g.R);
  ctx.fillStyle = t.rim;
  ctx.fill();
  circle(ctx, 0, 0, g.hub);
  ctx.fillStyle = t.hub;
  ctx.fill();
  const img = scene.centre.imageRef ? deps.images.get(scene.centre.imageRef) : undefined;
  if (img) {
    const r = g.hub * 0.9;
    ctx.save();
    circle(ctx, 0, 0, r);
    ctx.clip();
    const iw = (img as { width?: number }).width || 1;
    const ih = (img as { height?: number }).height || 1;
    const k = Math.max((2 * r) / iw, (2 * r) / ih);
    ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
    ctx.restore();
  } else if (scene.centre.text) {
    const box = 0.26 * g.R;
    let text = scene.centre.text;
    let px = box * 0.42;
    const font = () => labelFont(px, 88, t.labelFamily, t.labelWeight ?? 780);
    ctx.font = font();
    let w = ctx.measureText(text).width;
    if (w > box) {
      px = Math.max(box * 0.2, (px * box) / w);
      ctx.font = font();
      w = ctx.measureText(text).width;
      if (w > box) {
        const gs = graphemes(text);
        while (gs.length > 1 && ctx.measureText(gs.join("") + "…").width > box) gs.pop();
        text = gs.join("") + "…";
      }
    }
    ctx.fillStyle = t.scheme === "dark" ? "#1F1915" : t.rim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 0);
  } else {
    circle(ctx, 0, 0, g.hub - 0.028 * g.R);
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 0.004 * g.R;
    ctx.strokeStyle = t.rim;
    ctx.stroke();
    ctx.globalAlpha = 1;
    const pr = 0.04 * g.R;
    circle(ctx, 0, 0, pr);
    ctx.fillStyle = brassGradient(ctx, 0, 0, pr, t);
    ctx.fill();
    circle(ctx, 0, 0, 0.012 * g.R);
    ctx.fillStyle = t.brassLo;
    ctx.fill();
  }
  ctx.restore();
}

function layersFor(scene: WheelScene, width: number, dpr: number, deps: RenderDeps): { layers: Layers; hit: boolean } {
  const scale = pixelRatio(dpr);
  let loaded = 0;
  for (const s of scene.slices) if (s.imageRef && deps.images.has(s.imageRef)) loaded++;
  if (scene.centre.imageRef && deps.images.has(scene.centre.imageRef)) loaded++;
  const key = `${scene.key}|${width.toFixed(2)}|${scale}|${loaded}`;
  const found = cache.get(scene);
  if (found && found.key === key) return { layers: found, hit: true };
  const g = geometryFor(width);
  const base = layer(deps, g.width, g.height, scale);
  drawBase(base.ctx, scene, g);
  const face = layer(deps, 2 * g.R, 2 * g.R, scale);
  const { labels, pegStride } = drawFace(face.ctx, scene, g, deps);
  const top = layer(deps, g.width, g.height, scale);
  drawTop(top.ctx, scene, g, deps);
  const layers: Layers = { key, base: base.c, face: face.c, top: top.c, labels, pegStride };
  cache.set(scene, layers);
  return { layers, hit: false };
}

/* ----------------------------------------------------------------- per-frame */

function drawVeil(ctx: Ctx, scene: WheelScene, g: Geometry, s: SceneSlice, veil: number, outline: number) {
  const t = scene.theme;
  if (veil > 0 && scene.slices.length > 1) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, veil) * t.veilOpacity;
    ctx.fillStyle = t.veil;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, g.face + 0.5, canvasAngle(s.end), canvasAngle(s.start) + TAU);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (outline > 0 && scene.slices.length > 1) {
    const r = g.face - 0.008 * g.R;
    const a0 = canvasAngle(s.start);
    const a1 = canvasAngle(s.end);
    const len = 2 * r + r * (a1 - a0);
    ctx.save();
    ctx.lineWidth = 0.016 * g.R;
    ctx.lineJoin = "round";
    ctx.strokeStyle = t.sep;
    if (outline < 1) ctx.setLineDash([len * outline, len]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    ctx.arc(0, 0, r, a0, a1);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function drawMystery(ctx: Ctx, scene: WheelScene, g: Geometry, rotation: number, alpha: number) {
  const n = scene.slices.length;
  if (!n || n > 200 || alpha <= 0) return;
  const chord = (rho: number, A: number) => 2 * rho * Math.sin(Math.min(A, Math.PI) / 2);
  const fsMax = GEO.FS_MAX * g.R;
  const fsMin = Math.max(GEO.FS_MIN_PX, GEO.FS_MIN * g.R);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of scene.slices) {
    const A = n === 1 ? Math.PI : (s.end - s.start) * TAU;
    const fs = Math.min(fsMax, 0.9 * chord(0.72 * g.face, A));
    if (fs < fsMin) continue;
    const a = canvasAngle((s.start + s.end) / 2 + rotation);
    ctx.font = labelFont(fs, 100, scene.theme.labelFamily, scene.theme.labelWeight ?? 800);
    ctx.fillStyle = s.textFill;
    ctx.fillText("?", Math.cos(a) * 0.72 * g.face, Math.sin(a) * 0.72 * g.face);
  }
  ctx.restore();
}

export function drawPick(ctx: Ctx, scene: WheelScene, g: Geometry, deflectionDeg: number) {
  const t = scene.theme;
  const inactive = scene.slices.length < 2;
  const k = GEO.PICK * g.R;
  ctx.save();
  ctx.translate(g.cx + GEO.PIVOT * g.R, g.cy);
  ctx.rotate(Math.PI - (deflectionDeg * Math.PI) / 180);
  ctx.scale(k, k);
  const path = pickShape();
  const fillPath = (style: string) => {
    ctx.fillStyle = style;
    if (path) ctx.fill(path);
    else {
      pickPathManual(ctx);
      ctx.fill();
    }
  };
  // Soft contact shadow (offset down-right on screen).
  ctx.save();
  ctx.translate(-1, -1.6);
  ctx.globalAlpha = 0.28;
  fillPath("#000");
  ctx.restore();
  fillPath(inactive ? t.rule : t.accent);
  ctx.lineWidth = 1.35;
  ctx.lineJoin = "round";
  ctx.strokeStyle = t.rim;
  if (path) ctx.stroke(path);
  else {
    pickPathManual(ctx);
    ctx.stroke();
  }
  // Highlight along the top edge.
  ctx.beginPath();
  ctx.moveTo(16, 2.6);
  ctx.bezierCurveTo(11, 6, 6, 8, 2, 8);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Brass pivot.
  circle(ctx, 0, 0, 3);
  ctx.fillStyle = brassGradient(ctx, 0, 0, 3, t);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = t.rim;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw one frame into `ctx`, whose canvas is width × height(width) CSS px at pixelRatio(dpr).
 * Returns the label layout report (for tests) and whether the static layers were cached.
 */
export function renderWheel(ctx: Ctx, scene: WheelScene, rotationTurns: number, frame: Frame, deps: RenderDeps): RenderReport {
  const { layers, hit } = layersFor(scene, frame.width, frame.dpr, deps);
  const g = geometryFor(frame.width);
  const scale = pixelRatio(frame.dpr);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, g.width, g.height);
  ctx.drawImage(layers.base as unknown as CanvasImageSource, 0, 0, g.width, g.height);
  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.rotate(rotationTurns * TAU);
  ctx.drawImage(layers.face as unknown as CanvasImageSource, -g.R, -g.R, 2 * g.R, 2 * g.R);
  const vp = frame.veilPos;
  if (vp != null && scene.slices[vp]) drawVeil(ctx, scene, g, scene.slices[vp]!, frame.veil ?? 0, frame.outline ?? 0);
  ctx.restore();
  if (scene.mystery) {
    ctx.save();
    ctx.translate(g.cx, g.cy);
    drawMystery(ctx, scene, g, rotationTurns, frame.mysteryAlpha ?? 1);
    ctx.restore();
  }
  ctx.drawImage(layers.top as unknown as CanvasImageSource, 0, 0, g.width, g.height);
  drawPick(ctx, scene, g, frame.pick);
  ctx.restore();
  return { labels: layers.labels, cacheHit: hit, geometry: g, pegStride: layers.pegStride };
}

/** CSS px position of a point just inside the pick tip (for pixel tests sampling the winner). */
export function pickTipPoint(width: number, inset = 0.06): { x: number; y: number } {
  const g = geometryFor(width);
  const tip = GEO.PIVOT * g.R - 22 * GEO.PICK * g.R;
  return { x: g.cx + tip - inset * g.R, y: g.cy };
}
