import { expect, test } from "@playwright/test";
import { closeWinner, openApp, setEntries, snap, spinAndWait } from "./helpers";

const FIVE = ["Ada", "Grace", "Linus", "Margaret", "Priya"];

test.describe("elimination (I2)", () => {
  test("5 spins give 5 distinct winners; the 6th is disabled; put back and undo", async ({ page }) => {
    await openApp(page, "/?duration=1&mode=elimination");
    await setEntries(page, FIVE);
    const winners: string[] = [];
    for (let i = 0; i < 5; i++) {
      await spinAndWait(page);
      const w = (await snap(page)).last[0]!.label;
      winners.push(w);
      // Removal happens 1.2 s after the plate opens.
      await expect.poll(async () => (await snap(page)).excluded.length, { timeout: 4000 }).toBe(i + 1);
      await expect(page.getByTestId("wheel-list")).not.toContainText(w);
      await closeWinner(page);
    }
    expect(new Set(winners).size).toBe(5);
    expect(winners.sort()).toEqual([...FIVE].sort());
    await expect(page.getByTestId("spin")).toBeDisabled();
    await expect(page.getByTestId("spin")).toContainText("Everyone has had a turn");
    await page.getByTestId("put-back").click();
    await expect.poll(async () => (await snap(page)).excluded.length).toBe(0);
    await expect(page.getByTestId("wheel-list").locator("li")).toHaveCount(5);
    // Undo restores the last change (the put-back), then the removal before it.
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await snap(page)).excluded.length).toBe(5);
  });

  test("undo brings back an automatic removal", async ({ page }) => {
    await openApp(page, "/?duration=1&mode=elimination");
    await setEntries(page, FIVE);
    await spinAndWait(page);
    await expect.poll(async () => (await snap(page)).excluded.length, { timeout: 4000 }).toBe(1);
    await page.getByTestId("undo-removal").click();
    await expect.poll(async () => (await snap(page)).excluded.length).toBe(0);
  });
});

test.describe("pick several and presets (I3)", () => {
  for (const reveal of ["instant", "sequential"] as const) {
    test(`multi count 3 (${reveal}) gives 3 distinct winners and one receipt`, async ({ page }) => {
      await openApp(page, `/?duration=1&count=3&reveal=${reveal}`);
      await setEntries(page, ["Ada", "Grace", "Linus", "Margaret", "Priya", "Tomas"]);
      await page.getByTestId("spin").click();
      if (reveal === "sequential") {
        for (let i = 0; i < 2; i++) {
          const next = page.locator("dialog.winner").getByRole("button", { name: "Next spin" });
          await expect(next).toBeVisible({ timeout: 8000 });
          await next.click();
        }
      }
      await expect(page.getByTestId("live")).toContainText("Winners:", { timeout: 12_000 });
      const s = await snap(page);
      expect(new Set(s.last.map((p) => p.index)).size).toBe(3);
      expect(s.history).toHaveLength(1);
      expect((s.history[0]!.receipt.result as { picks: unknown[] }).picks).toHaveLength(3);
    });
  }

  const presets: [string, number][] = [
    ["yes-no", 2],
    ["yes-no-maybe", 3],
    ["coin", 2],
    ["numbers-1-10", 10],
    ["numbers-1-100", 100],
    ["numbers&min=5&max=15", 11],
    ["letters", 26],
  ];
  for (const [p, n] of presets) {
    test(`?preset=${p} opens ${n} entries`, async ({ page }) => {
      await openApp(page, `/?preset=${p}`);
      expect((await snap(page)).entries).toHaveLength(n);
    });
  }
});

test.describe("stream and presenter (I16)", () => {
  test("stream mode with a transparent background shows a caption, not a dialog", async ({ page }) => {
    await openApp(page, "/?stream=1&bg=transparent&duration=1");
    await expect(page.locator(".tool-hdr")).toHaveCount(0);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg === "rgba(0, 0, 0, 0)" || bg === "transparent").toBe(true);
    const shot = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 4, height: 4 } });
    const { PNG } = await import("pngjs");
    const png = PNG.sync.read(shot);
    expect(png.data[3]).toBe(0);
    await page.getByTestId("wheel").click();
    await expect(page.locator(".stream-caption")).toBeVisible({ timeout: 12_000 });
    await expect(page.locator("dialog.winner[open]")).toHaveCount(0);
  });

  test("?bg=00B140 paints the page green", async ({ page }) => {
    await openApp(page, "/?stream=1&bg=00B140");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(0, 177, 64)");
  });

  test("presenter mode hides the editor and the header", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("f");
    await expect(page.locator("main.app.presenter")).toBeVisible();
    await expect(page.locator(".panel")).toHaveCount(0);
    await expect(page.locator(".tool-hdr")).toHaveCSS("opacity", "0");
    await page.keyboard.press("Escape");
    await expect(page.locator(".panel")).toBeVisible();
  });
});
