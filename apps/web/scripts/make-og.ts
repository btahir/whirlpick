// Renders public/og.png (1200 × 630) from the real wheel renderer: wheel left, wordmark and one
// plain line right, on the ground colour (SPEC §13). The launch agent may replace it.
// Also renders the 404 page's small wheel (public/brand/404-wheel-{day,night}.png, REVIEW P2-12):
// the pick resting on an empty sunk slice.
//   pnpm --filter @whirlpick/web exec tsx scripts/make-og.ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCanvas, GlobalFonts, loadImage, Path2D } from "@napi-rs/canvas";
import { normaliseEntries } from "@whirlpick/core";
import { buildScene } from "../src/wheel/scene";
import { heightFor, renderWheel } from "../src/wheel/renderer";
import { wheelTheme } from "../src/wheel/theme";

const WEB = resolve(import.meta.dirname, "..");
(globalThis as { Path2D?: unknown }).Path2D ??= Path2D;
GlobalFonts.registerFromPath(resolve(WEB, "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-standard-normal.woff2"), "Bricolage Grotesque Variable");

const W = 1200;
const H = 630;
const c = createCanvas(W, H);
const ctx = c.getContext("2d");
ctx.fillStyle = "#F4ECDF";
ctx.fillRect(0, 0, W, H);

const entries = normaliseEntries(["Amara", "Theo", "Priya", "Jonah", "Mei", "Santiago", "Hana", "Olu", "Freya", "Kofi", "Ines", "Rafael"]).entries;
const wheelW = 640;
const theme = { ...wheelTheme("enamel", "light"), labelWeight: 800 };
const scene = buildScene({ entries, settings: { palette: null, mysteryMode: false, fontScale: 1, centre: { text: null, imageRef: null } }, theme, radiusPx: wheelW / 2.24 });
const wheel = createCanvas(wheelW * 2, Math.round(heightFor(wheelW) * 2));
// The pick rests mid-slice (SPEC §13: never on a boundary).
const rest = (sc: typeof scene, pos: number) => sc.pointerTurn - (sc.geometry[pos]!.start + sc.geometry[pos]!.end) / 2;
renderWheel(wheel.getContext("2d") as unknown as CanvasRenderingContext2D, scene, rest(scene, 0), { width: wheelW, dpr: 2, pick: 6, veilPos: 2, veil: 0, outline: 0 }, { createCanvas: (a, b) => createCanvas(a, b) as never, images: new Map() });
ctx.drawImage(wheel, 26, 18, wheelW, heightFor(wheelW));

const mark = await loadImage(resolve(WEB, "public/brand/wordmark.svg"));
const mw = 420;
const mh = (mark.height / mark.width) * mw;
ctx.drawImage(mark, 700, 206, mw, mh);
ctx.fillStyle = "#1F1915";
ctx.font = '800 50px "Bricolage Grotesque Variable"';
ctx.fillText("Spin a wheel.", 704, 206 + mh + 78);
// An honest claim: the draw is checkable, not "proven fair".
const line2 = "Anyone can check it.";
let fs = 50;
while (fs > 36 && (ctx.font = `800 ${fs}px "Bricolage Grotesque Variable"`, ctx.measureText(line2).width > W - 704 - 40)) fs -= 1;
ctx.fillText(line2, 704, 206 + mh + 136);
ctx.fillStyle = "#5E5249";
ctx.font = '400 24px "Bricolage Grotesque Variable"';
ctx.fillText("Free, no ads, nothing uploaded.", 706, 206 + mh + 190);
writeFileSync(resolve(WEB, "public/og.png"), c.toBuffer("image/png"));
console.log("wrote public/og.png");

// 404: a 160 px wheel (box 179 px) without labels, the slice under the pick left empty (sunk).
for (const scheme of ["light", "dark"] as const) {
  const th = wheelTheme("enamel", scheme);
  const boxW = Math.round((160 * 2.24) / 2);
  const base = buildScene({ entries: normaliseEntries(["a", "b", "c", "d", "e", "f", "g", "h"]).entries, settings: { palette: null, mysteryMode: false, fontScale: 1, centre: { text: null, imageRef: null } }, theme: th, radiusPx: boxW / 2.24 });
  const sc = { ...base, labels: false, slices: base.slices.map((sl, i) => (i === 0 ? { ...sl, fill: th.emptyFace, label: "" } : sl)) };
  const art = createCanvas(boxW * 2, Math.round(heightFor(boxW) * 2));
  renderWheel(art.getContext("2d") as unknown as CanvasRenderingContext2D, sc, rest(sc, 0), { width: boxW, dpr: 2, pick: 0 }, { createCanvas: (a, b) => createCanvas(a, b) as never, images: new Map() });
  const name = `public/brand/404-wheel-${scheme === "light" ? "day" : "night"}.png`;
  writeFileSync(resolve(WEB, name), art.toBuffer("image/png"));
  console.log(`wrote ${name} (${boxW}×${Math.round(heightFor(boxW))} CSS px)`);
}
