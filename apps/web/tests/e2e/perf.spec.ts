import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openApp, snap } from "./helpers";

const OUT = resolve(import.meta.dirname, "../../../../test-results");
const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

async function measureSpin(page: Page) {
  await page.evaluate(() => {
    performance.clearMeasures("whirlpick:frame");
    const w = window as unknown as { __raf: number[]; __long: number[] };
    w.__raf = [];
    w.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: "longtask", buffered: false });
    let last = performance.now();
    const loop = (t: number) => {
      w.__raf.push(t - last);
      last = t;
      if (w.__raf.length < 2000) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.getByTestId("spin").click();
  await expect(page.getByTestId("live")).toContainText("Winner", { timeout: 20_000 });
  return page.evaluate(() => {
    const w = window as unknown as { __raf: number[]; __long: number[] };
    const frames = performance.getEntriesByName("whirlpick:frame").map((e) => e.duration);
    return { frames, raf: w.__raf.slice(2), long: w.__long };
  });
}

test("60 fps target at 100 entries (M2)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem("whirlpick:perf", "1"));
  await openApp(page, "/?preset=numbers-1-100&duration=6");
  const r = await measureSpin(page);
  const report = { draw: { p95: pct(r.frames, 95), max: Math.max(...r.frames), n: r.frames.length }, raf: { p95: pct(r.raf, 95), within20: r.raf.filter((x) => x <= 20).length / r.raf.length } };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "perf.json"), JSON.stringify(report, null, 2));
  expect(report.draw.p95).toBeLessThanOrEqual(4);
  expect(report.draw.max).toBeLessThanOrEqual(12);
  expect(report.raf.p95).toBeLessThanOrEqual(20);
  expect(report.raf.within20).toBeGreaterThanOrEqual(0.95);
});

test("1,000 entries stay responsive; ticks are rate-limited (M3, K2, I18)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem("whirlpick:perf", "1"));
  await openApp(page, "/?duration=6");
  const text = Array.from({ length: 1000 }, (_, i) => `Entrant ${i + 1}`).join("\n");
  const ta = page.getByTestId("entries");
  await ta.click();
  await ta.press("ControlOrMeta+a");
  const t = await page.evaluate(async (txt) => {
    const el = document.querySelector<HTMLTextAreaElement>('[data-testid="entries"]')!;
    performance.clearMeasures("whirlpick:frame");
    const t0 = performance.now();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(el, txt);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise<void>((res) => {
      const check = () => (performance.getEntriesByName("whirlpick:frame").length ? res() : requestAnimationFrame(check));
      check();
    });
    return performance.now() - t0;
  }, text);
  expect(t).toBeLessThanOrEqual(500);
  expect((await snap(page)).entries).toHaveLength(1000);
  await expect(page.getByTestId("on-wheel")).toHaveText("1,000 on the wheel");
  // One keystroke → next paint.
  await ta.press("End");
  const typing = await page.evaluate(async () => {
    const el = document.querySelector<HTMLTextAreaElement>('[data-testid="entries"]')!;
    const t0 = performance.now();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(el, el.value + "x");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - t0;
  });
  expect(typing).toBeLessThanOrEqual(100);
  const r = await measureSpin(page);
  expect(pct(r.frames, 95)).toBeLessThanOrEqual(8);
  expect(r.long.filter((x) => x > 100)).toEqual([]);
  // K2: tick voices ≤ 25 in every 1 s window.
  const ticks = await page.evaluate(() => (window as unknown as { __whirlpick: { controller: { synth: { tickLog: number[] } } } }).__whirlpick.controller.synth.tickLog.slice());
  for (let i = 0; i < ticks.length; i++) {
    const inWindow = ticks.filter((x) => x >= ticks[i]! && x < ticks[i]! + 1000).length;
    expect(inWindow).toBeLessThanOrEqual(25);
  }
  expect(ticks.length).toBeGreaterThan(10);
});

test("pasting 1,200 lines keeps 1,000 and says so (I18)", async ({ page }) => {
  await openApp(page, "/?duration=1");
  const text = Array.from({ length: 1200 }, (_, i) => `Entrant ${i + 1}`).join("\n");
  await page.getByTestId("entries").fill(text);
  await expect(page.getByTestId("toast")).toContainText("Kept the first 1,000 entries.");
  expect((await snap(page)).entries).toHaveLength(1000);
  await page.getByTestId("spin").click();
  await expect(page.getByTestId("live")).toContainText("Winner", { timeout: 8000 });
});
