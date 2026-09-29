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
