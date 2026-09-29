// Renders public/og.png (1200 × 630) from the real wheel renderer: wheel left, wordmark and one
// plain line right, on the ground colour (SPEC §13). The launch agent may replace it.
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
renderWheel(wheel.getContext("2d") as unknown as CanvasRenderingContext2D, scene, 0.021, { width: wheelW, dpr: 2, pick: 6, veilPos: 2, veil: 0, outline: 0 }, { createCanvas: (a, b) => createCanvas(a, b) as never, images: new Map() });
ctx.drawImage(wheel, 26, 18, wheelW, heightFor(wheelW));

const mark = await loadImage(resolve(WEB, "public/brand/wordmark.svg"));
const mw = 420;
const mh = (mark.height / mark.width) * mw;
ctx.drawImage(mark, 700, 206, mw, mh);
ctx.fillStyle = "#1F1915";
ctx.font = '800 50px "Bricolage Grotesque Variable"';
ctx.fillText("Spin a wheel.", 704, 206 + mh + 78);
ctx.fillText("Prove it was fair.", 704, 206 + mh + 136);
ctx.fillStyle = "#5E5249";
ctx.font = '400 24px "Bricolage Grotesque Variable"';
ctx.fillText("Free, no ads, nothing uploaded.", 706, 206 + mh + 190);
writeFileSync(resolve(WEB, "public/og.png"), c.toBuffer("image/png"));
console.log("wrote public/og.png");
