// Node pixel regression for the wheel renderer (ACCEPTANCE J1, J4, plus the landing check of J5
// in Node). Renders fixtures × themes × sizes with @napi-rs/canvas and compares them with the PNG
// baselines next to this file (pixelmatch threshold 0.1, ≤ 0.1 % differing pixels).
//   UPDATE_PIXELS=1 pnpm vitest run --project web-unit pixel   # write missing/changed baselines
// @napi-rs/canvas can't set font variation axes, so Node renders use the font's default instance
// (labelWeight 800); Chrome baselines (tests/pixel/) cover the real 760/wdth rendering.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createCanvas, GlobalFonts, Path2D } from "@napi-rs/canvas";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { buildReceipt, finalRotation, landingTurn, slicesFor, type Entry } from "@whirlpick/core";
import { buildScene, POINTER_TURN, type WheelScene } from "../../src/wheel/scene";
import { renderWheel, heightFor, pickTipPoint, type RenderDeps } from "../../src/wheel/renderer";
import { THEMES, wheelTheme } from "../../src/wheel/theme";

const HERE = resolve(import.meta.dirname);
const WEB = resolve(HERE, "../..");
const UPDATE = process.env.UPDATE_PIXELS === "1";
(globalThis as { Path2D?: unknown }).Path2D ??= Path2D;
GlobalFonts.registerFromPath(join(WEB, "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-standard-normal.woff2"), "Bricolage Grotesque Variable");

const NAMES = ["Ada", "Grace", "Linus", "Margaret", "Priya", "Tomas", "Amara", "Kenji", "Sofia", "Mateo", "Zara", "Oskar", "Lena", "Ravi", "Nadia", "Felix", "Iris", "Omar", "Hana", "Theo", "Mira", "Jonah", "Elif", "Bruno"];
const make = (labels: string[], w?: number[]): Entry[] => labels.map((label, i) => ({ id: `e_${String(i).padStart(8, "0")}`, label, weight: w?.[i] ?? 1, enabled: true }));
const names = (n: number) => Array.from({ length: n }, (_, i) => (i < NAMES.length ? NAMES[i]! : `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`));

const tile = (() => {
  const c = createCanvas(64, 64);
  const g = c.getContext("2d");
  g.fillStyle = "#E9B04A";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#2A55A8";
  for (let i = -64; i < 64; i += 12) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 6, 0);
    g.lineTo(i + 70, 64);
    g.lineTo(i + 64, 64);
    g.fill();
  }
  return c;
})();

interface Fixture {
  id: string;
  entries: Entry[];
  mystery?: boolean;
  centre?: string;
  pick?: number;
  veil?: number;
  rotation?: number;
}
const FIXTURES: Fixture[] = [
  { id: "e0", entries: [] },
  { id: "e1", entries: make(["Ada"]) },
  { id: "e2", entries: make(["Yes", "No"]), rotation: 0.1 },
  { id: "e12", entries: make(names(12)), rotation: 0.02 },
  { id: "e24", entries: make(names(24)), rotation: 0.01 },
  { id: "e100", entries: make(names(100)) },
  { id: "e1000", entries: make(names(1000)) },
  { id: "weighted", entries: make(["Rare", "Even", "Often", "Mostly"], [0.125, 1, 2.5, 10]) },
  { id: "long", entries: make(["Amara", "Theo", "Priya Venkataraman-Holloway", "Jonah", "Mei", "Santiago de la Cruz", "Hana", "Olu"]), rotation: 0.03 },
  { id: "mystery", entries: make(names(11)), mystery: true },
  { id: "image", entries: make(["Beach", "Museum", "Hike", "Picnic", "Cinema", "Bowling"]).map((e, i) => (i === 0 ? { ...e, imageRef: "img_tile" } : e)) },
  { id: "centre", entries: make(names(8)), centre: "Class 4B" },
  { id: "deflected", entries: make(names(12)), pick: 18 },
  { id: "veil", entries: make(names(11)), veil: 2 },
];
// Sizes 320 and 640 CSS px (the 640 case doubles as 320 at dpr 2); dense fixtures at 320 only to
// keep the committed baselines small.
const SIZES = [
  { w: 320, dpr: 1 },
  { w: 320, dpr: 2 },
  { w: 640, dpr: 1 },
];
const DENSE = new Set(["e100", "e1000"]);

function render(f: Fixture, themeId: string, scheme: "light" | "dark", w: number, dpr: number) {
  const theme = { ...wheelTheme(themeId, scheme), labelWeight: 800 };
  const scene: WheelScene = buildScene({
    entries: f.entries,
    settings: { palette: null, mysteryMode: !!f.mystery, fontScale: 1, centre: { text: f.centre ?? null, imageRef: null } },
    theme,
    radiusPx: w / 2.24,
  });
  const h = heightFor(w);
  const canvas = createCanvas(Math.round(w * dpr), Math.round(h * dpr));
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const deps: RenderDeps = {
    createCanvas: (a, b) => createCanvas(a, b) as unknown as ReturnType<RenderDeps["createCanvas"]>,
    images: new Map([["img_tile", tile as unknown as CanvasImageSource]]),
    graphemes: (s) => Array.from(s),
  };
  const report = renderWheel(ctx, scene, f.rotation ?? 0, { width: w, dpr, pick: f.pick ?? 0, veilPos: f.veil ?? null, veil: f.veil !== undefined ? 1 : 0, outline: f.veil !== undefined ? 1 : 0 }, deps);
  return { png: canvas.toBuffer("image/png"), report, scene, canvas };
}

function compare(name: string, png: Buffer) {
  const file = join(HERE, `${name}.png`);
  if (!existsSync(file) || UPDATE) {
    if (!UPDATE && process.env.CI) throw new Error(`missing baseline ${name}`);
    mkdirSync(HERE, { recursive: true });
    writeFileSync(file, png);
    return 0;
  }
  const a = PNG.sync.read(readFileSync(file));
  const b = PNG.sync.read(png);
  expect([b.width, b.height], `${name} size`).toEqual([a.width, a.height]);
  const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
  return diff / (a.width * a.height);
}

describe("renderer pixel baselines (J1)", () => {
  for (const f of FIXTURES)
    for (const scheme of ["light", "dark"] as const)
      for (const s of SIZES.filter((x) => !DENSE.has(f.id) || (x.w === 320 && x.dpr === 1)))
        it(`${f.id} enamel-${scheme} ${s.w}@${s.dpr}`, () => {
          const { png } = render(f, "enamel", scheme, s.w, s.dpr);
          expect(compare(`${f.id}-enamel-${scheme}-${s.w}x${s.dpr}`, png)).toBeLessThanOrEqual(0.001);
        });
  for (const th of THEMES.filter((t) => t.id !== "enamel"))
    for (const scheme of ["light", "dark"] as const)
      it(`e12 ${th.id}-${scheme} 320@2`, () => {
        const { png } = render(FIXTURES[3]!, th.id, scheme, 320, 2);
        expect(compare(`e12-${th.id}-${scheme}-320x2`, png)).toBeLessThanOrEqual(0.001);
      });
});

describe("label fitting (J4)", () => {
  it("every drawn label fits its radial room; labels drop above 200 entries", () => {
    for (const f of FIXTURES) {
      for (const w of [320, 640, 1080]) {
        const { report, scene } = render(f, "enamel", "light", w, 1);
        for (const l of report.labels) if (!l.hidden) expect(l.width, `${f.id}@${w} ${l.text}`).toBeLessThanOrEqual(l.room + 0.5);
        if (scene.slices.length > 200) expect(report.labels).toHaveLength(0);
      }
    }
  });
  it("long names are truncated with an ellipsis, never overflowing", () => {
    const { report } = render(FIXTURES.find((f) => f.id === "long")!, "enamel", "light", 320, 1);
    const long = report.labels.find((l) => l.text.startsWith("Priya"));
    expect(long).toBeDefined();
    expect(long!.hidden || long!.text.endsWith("…") || long!.width <= long!.room).toBe(true);
  });
});

describe("the slice under the pick is the winner (J5, Node)", () => {
  it("lands on the drawn winner for 10 seeds", () => {
    const entries = make(names(12), [1, 2, 1, 3, 1, 1, 2, 1, 1, 4, 1, 1]);
    for (let k = 0; k < 10; k++) {
      const seed = (k + 1).toString(16).padStart(2, "0").repeat(32);
      const r = buildReceipt({ entries, seed, mode: "single", createdAt: "2026-01-01T00:00:00.000Z", app: "test" });
      const pick = r.result.picks![0]!;
      const slices = slicesFor(entries);
      const pos = slices.findIndex((s) => s.index === pick.index);
      const rot = finalRotation(0.37, landingTurn(slices, pos, pick.landingU32), 3, POINTER_TURN);
      const w = 640;
      const theme = { ...wheelTheme("enamel", "light"), labelWeight: 800 };
      const scene = buildScene({ entries, settings: { palette: null, mysteryMode: true, fontScale: 1, centre: { text: null, imageRef: null } }, theme, radiusPx: w / 2.24 });
      const canvas = createCanvas(w, Math.round(heightFor(w)));
      const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
      renderWheel(ctx, { ...scene, mystery: false }, rot, { width: w, dpr: 1, pick: 0 }, { createCanvas: (a, b) => createCanvas(a, b) as never, images: new Map() });
      const p = pickTipPoint(w, 0.1);
      const px = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
      const want = scene.slices[pos]!.fill;
      const rgb = [1, 3, 5].map((i) => parseInt(want.slice(i, i + 2), 16));
      // The vignette darkens the face edge by at most 14 %; allow for it.
      for (let c = 0; c < 3; c++) expect(Math.abs(px[c]! - rgb[c]!), `seed ${k} channel ${c}`).toBeLessThanOrEqual(0.16 * 255);
    }
  });
});
