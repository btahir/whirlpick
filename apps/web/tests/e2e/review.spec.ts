// Regression checks for the design review (docs/design/REVIEW.md P0-1, P0-2, P0-3, P1-10).
import { expect, test } from "@playwright/test";
import { buildReceipt, encodeReceiptCode, normaliseEntries } from "@whirlpick/core";
import { closeWinner, openApp, setEntries, snap, spinAndWait } from "./helpers";

const FIVE = ["Ada", "Grace", "Linus", "Margaret", "Priya"];

/** The entry index under the pick on the canvas right now. */
const underPick = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const d = (window as unknown as { __whirlpick: { controller: { driver: { currentScene: { slices: { index: number; start: number }[]; pointerTurn: number } | null; angle: number } | null } } }).__whirlpick.controller.driver!;
    const sc = d.currentScene!;
    const x = sc.pointerTurn - d.angle;
    const local = x - Math.floor(x);
    let pos = 0;
    for (let i = 0; i < sc.slices.length; i++) if (sc.slices[i]!.start <= local) pos = i;
    return { index: sc.slices[pos]!.index, count: sc.slices.length };
  });

test("P0-1: elimination keeps the winner under the pick while the plate is open, then removes it", async ({ page }) => {
  await openApp(page, "/?duration=1&mode=elimination");
  await setEntries(page, FIVE);
  await spinAndWait(page);
  const winner = (await snap(page)).last[0]!.index;
  // The removal is recorded 1.2 s after the plate opens; the wheel must not reshuffle under it.
  await expect.poll(async () => (await snap(page)).excluded.length, { timeout: 4000 }).toBe(1);
  await page.waitForTimeout(700);
  const held = await underPick(page);
  expect(held.index).toBe(winner);
  expect(held.count).toBe(5);
  await closeWinner(page);
  await expect.poll(async () => (await underPick(page)).count, { timeout: 3000 }).toBe(4);
});

test("P0-3: in presenter mode Space spins", async ({ page }) => {
  await openApp(page, "/?duration=1");
  await page.keyboard.press("f");
  await expect(page.locator("main.app.presenter")).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(page.locator("dialog.winner[open]")).toBeVisible({ timeout: 12_000 });
});

test.describe("round 2 (R2-1, R2-2, R2-5)", () => {
  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("R2-1: the winner sheet reaches the bottom of the screen", async ({ page }) => {
      await openApp(page, "/?duration=1");
      await spinAndWait(page);
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ b: document.querySelector("dialog.winner[open]")!.getBoundingClientRect().bottom, h: innerHeight }));
      expect(Math.abs(r.b - r.h)).toBeLessThanOrEqual(1);
    });
  });

  test.describe("desktop 1440", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test("R2-2: presenter at rest centres the wheel and focuses nothing; the reveal slides it clear of the plate", async ({ page }) => {
      await openApp(page, "/?duration=1");
      await page.keyboard.press("f");
      await expect(page.locator("main.app.presenter")).toHaveCount(1);
      await page.waitForTimeout(400);
      const rest = await page.evaluate(() => {
        const r = document.querySelector(".wheelwrap")!.getBoundingClientRect();
        return { mid: (r.left + r.right) / 2, focused: document.activeElement === document.body };
      });
      expect(rest.focused).toBe(true);
      expect(Math.abs(rest.mid - 720)).toBeLessThanOrEqual(40);
      await page.keyboard.press("Space");
      await expect(page.locator("dialog.winner[open]")).toBeVisible({ timeout: 12_000 });
      await page.waitForTimeout(700);
      const lit = await page.evaluate(() => ({ wheel: document.querySelector(".wheelwrap")!.getBoundingClientRect().right, plate: document.querySelector("dialog.winner[open]")!.getBoundingClientRect().left }));
      expect(lit.plate).toBeGreaterThanOrEqual(lit.wheel);
    });
  });

  test.describe("laptop 1180", () => {
    test.use({ viewport: { width: 1180, height: 820 } });
    test("R2-5: the side plate starts right of the pick", async ({ page }) => {
      await openApp(page, "/?duration=1");
      await spinAndWait(page);
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => ({ wheel: document.querySelector(".wheelwrap")!.getBoundingClientRect(), plate: document.querySelector("dialog.winner[open]")!.getBoundingClientRect() }));
      const clear = r.plate.left >= r.wheel.right + 11 || r.plate.top >= r.wheel.bottom;
      expect(clear).toBe(true);
    });
  });
});

test.describe("round 3", () => {
  test.use({ viewport: { width: 1024, height: 768 } });
  test("segmented labels stay on one line at 1024 px", async ({ page }) => {
    await openApp(page, "/?duration=1");
    const h = await page.locator(".seg button", { hasText: "Remove winner" }).evaluate((b) => ({ h: b.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(b).lineHeight) || 20, sw: b.scrollWidth, cw: b.clientWidth }));
    expect(h.h).toBeLessThanOrEqual(46);
    expect(h.sw).toBeLessThanOrEqual(h.cw + 1);
  });
  test("presenter: after Esc closes the plate, Spin shows no ring", async ({ page }) => {
    await openApp(page, "/?duration=1");
    await page.keyboard.press("f");
    await page.keyboard.press("Space");
    await expect(page.locator("dialog.winner[open]")).toBeVisible({ timeout: 12_000 });
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.winner[open]")).toHaveCount(0);
    await page.waitForTimeout(500);
    const ring = await page.evaluate(() => ({ spin: !!document.querySelector('[data-testid="spin"]:focus-visible'), a: document.activeElement?.outerHTML.slice(0, 80) }));
    expect(ring.spin, ring.a).toBe(false);
    await expect(page.locator("main.app.presenter")).toHaveCount(1);
  });
});

test.describe("390 px: no sideways scroll", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("P0-2: /verify/ with a passing receipt fits 390 px, hashes are grouped and copyable", async ({ page }) => {
    const r = buildReceipt({ entries: normaliseEntries(["Ada", "Grace", "Linus", "Margaret", "Oskar"]).entries, seed: "0f".repeat(32), mode: "single", title: "Raffle", createdAt: "2026-01-01T00:00:00.000Z", app: "whirlpick-test/0" });
    await page.goto(`/verify/#r=${await encodeReceiptCode(r)}`);
    await expect(page.getByTestId("stamp")).toHaveText("Checks out");
    await expect(page.getByTestId("checks-passed")).toHaveText(/^\d+ checks passed$/);
    const hash = page.locator(".checks .hash").first();
    await expect(hash).toHaveText(/^[0-9a-f]{4} [0-9a-f]{4} … [0-9a-f]{4} [0-9a-f]{4}$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test("P1-10: static pages fit 390 px", async ({ page }) => {
    for (const p of ["/about/", "/support/", "/docs/agents/", "/verify/", "/404.html"]) {
      await page.goto(p);
      const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(w.s, p).toBe(w.c);
    }
  });
});

test.describe("owner feedback: spin-length popover stays on screen", () => {
  for (const height of [720, 800, 1200]) {
    test(`1440×${height}: the popover is fully visible without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height });
      await openApp(page, "/?duration=6");
      await page.locator("button.dur").click();
      const pop = page.locator(".popover");
      await expect(pop).toBeVisible();
      const r = (await pop.boundingBox())!;
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(height);
      expect(await page.evaluate(() => scrollY)).toBe(0);
    });
  }
});
