// Chrome pixel regression for the renderer (ACCEPTANCE J2) and the landing check (J5).
// Baselines live in tests/pixel/; update only after a reviewed design change:
//   UPDATE_PIXELS=1 … playwright test pixel-chrome.spec.ts   (and note it in notes/fix-coordination.md)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { openApp } from "./helpers";

const DIR = resolve(import.meta.dirname, "../pixel");
const UPDATE = process.env.UPDATE_PIXELS === "1";
const NAMES = ["Ada", "Grace", "Linus", "Margaret", "Priya", "Tomas", "Amara", "Kenji", "Sofia", "Mateo", "Zara", "Oskar", "Lena", "Ravi", "Nadia", "Felix", "Iris", "Omar", "Hana", "Theo", "Mira", "Jonah", "Elif", "Bruno"];
const CASES: { id: string; n: number; w: number; dpr: number; scheme: "light" | "dark"; theme?: string; mystery?: boolean; veil?: number; long?: boolean }[] = [
  { id: "e2", n: 2, w: 320, dpr: 1, scheme: "light" },
  { id: "e12", n: 12, w: 320, dpr: 1, scheme: "light" },
  { id: "e12", n: 12, w: 320, dpr: 2, scheme: "dark" },
  { id: "e12", n: 12, w: 640, dpr: 1, scheme: "light" },
  { id: "e24", n: 24, w: 640, dpr: 1, scheme: "dark" },
  { id: "e100", n: 100, w: 640, dpr: 1, scheme: "light" },
  { id: "e1000", n: 1000, w: 320, dpr: 1, scheme: "dark" },
  { id: "long", n: 8, w: 320, dpr: 2, scheme: "light", long: true },
  { id: "mystery", n: 11, w: 320, dpr: 1, scheme: "dark", mystery: true },
  { id: "veil", n: 11, w: 320, dpr: 1, scheme: "light", veil: 3 },
  { id: "sherbet", n: 12, w: 320, dpr: 1, scheme: "light", theme: "sherbet" },
  { id: "broadcast", n: 12, w: 320, dpr: 1, scheme: "dark", theme: "broadcast" },
];

test("renderer matches Chrome baselines (J2)", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "/");
  await page.evaluate(() => document.fonts.ready);
  for (const c of CASES) {
    const labels = Array.from({ length: c.n }, (_, i) => (c.long && i === 2 ? "Priya Venkataraman-Holloway" : c.long && i === 5 ? "Santiago de la Cruz" : i < NAMES.length ? NAMES[i]! : `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`));
    const dataUrl = await page.evaluate(
      ({ c, labels }) => {
        const r = (window as unknown as { __whirlpick: { render: { renderWheel: Function; buildScene: Function; wheelTheme: Function; heightFor: (w: number) => number } } }).__whirlpick.render;
        const entries = labels.map((label: string, i: number) => ({ id: `e_${String(i).padStart(8, "0")}`, label, weight: 1, enabled: true }));
        const scene = r.buildScene({ entries, settings: { palette: null, mysteryMode: !!c.mystery, fontScale: 1, centre: { text: null, imageRef: null } }, theme: r.wheelTheme(c.theme ?? "enamel", c.scheme), radiusPx: c.w / 2.24 });
        const cv = document.createElement("canvas");
        cv.width = Math.round(c.w * c.dpr);
        cv.height = Math.round(r.heightFor(c.w) * c.dpr);
        r.renderWheel(cv.getContext("2d"), scene, 0.013, { width: c.w, dpr: c.dpr, pick: 0, veilPos: c.veil ?? null, veil: c.veil !== undefined ? 1 : 0, outline: c.veil !== undefined ? 1 : 0 }, { createCanvas: (w: number, h: number) => Object.assign(document.createElement("canvas"), { width: w, height: h }), images: new Map() });
        return cv.toDataURL("image/png");
      },
      { c, labels },
    );
    const png = Buffer.from(dataUrl.split(",")[1]!, "base64");
    const name = `${c.id}-${c.theme ?? "enamel"}-${c.scheme}-${c.w}x${c.dpr}.png`;
    const file = resolve(DIR, name);
    if (UPDATE || !existsSync(file)) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, png);
      continue;
    }
    const a = PNG.sync.read(readFileSync(file));
    const b = PNG.sync.read(png);
    const diff = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 });
    expect(diff / (a.width * a.height), name).toBeLessThanOrEqual(0.005);
  }
});

test("after a seeded spin the slice under the pick is the winner (J5)", async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page, "/?duration=1&confetti=0");
  await page.evaluate(() => (window as unknown as { __whirlpick: { controller: { setSettings(p: unknown): void } } }).__whirlpick.controller.setSettings({ confetti: false, fairDraw: true }));
  for (let k = 0; k < 10; k++) {
    const seed = ((k * 29 + 5) % 256).toString(16).padStart(2, "0").repeat(32);
    await page.evaluate((s) => (window as unknown as { __whirlpick: { controller: { newCommitment(s: string): string | null } } }).__whirlpick.controller.newCommitment(s), seed);
    await page.getByTestId("spin").click();
    await expect(page.locator("dialog.winner[open]")).toBeVisible({ timeout: 10_000 });
    const res = await page.evaluate(() => {
      const w = (window as unknown as { __whirlpick: { store: { getState(): any }; render: { pickTipPoint(w: number, i: number): { x: number; y: number }; buildScene: Function; wheelTheme: Function } } }).__whirlpick;
      const s = w.store.getState();
      const wheel = s.wheels.find((x: { id: string }) => x.id === s.activeId);
      const pick = s.last.picks[0];
      const cv = document.querySelector<HTMLCanvasElement>(".wheel-canvas")!;
      const cssW = cv.getBoundingClientRect().width;
      const k = cv.width / cssW;
      const p = w.render.pickTipPoint(cssW, 0.022); // between the label ends (0.88 R) and the pick tip
      const d = cv.getContext("2d")!.getImageData(Math.round(p.x * k), Math.round(p.y * k), 1, 1).data;
      const scheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const scene = w.render.buildScene({ entries: wheel.entries, settings: { ...wheel.settings, mysteryMode: false }, theme: w.render.wheelTheme(wheel.settings.theme, scheme), radiusPx: cssW / 2.24 });
      const fill = scene.slices.find((x: { index: number }) => x.index === pick.index).fill as string;
      return { px: [d[0], d[1], d[2]], fill };
    });
    const want = [1, 3, 5].map((i) => parseInt(res.fill.slice(i, i + 2), 16));
    for (let ch = 0; ch < 3; ch++) expect(Math.abs(res.px[ch]! - want[ch]!), `seed ${k}`).toBeLessThanOrEqual(40);
    await page.keyboard.press("Escape");
  }
});
