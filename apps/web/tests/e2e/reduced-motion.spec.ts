import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test.use({ reducedMotion: "reduce" });

test("reduced motion: a calm ≤ 1.5 s spin, no confetti, still announced (I13, K4)", async ({ page }) => {
  await openApp(page, "/?duration=10");
  const t0 = Date.now();
  await page.getByTestId("spin").click();
  await expect(page.getByTestId("live")).toContainText("Winner", { timeout: 3000 });
  expect(Date.now() - t0).toBeLessThanOrEqual(1500 + 300);
  await page.waitForTimeout(400);
  const painted = await page.getByTestId("confetti").evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d");
    if (!ctx || !c.width) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i]! > 0) n++;
    return n;
  });
  expect(painted).toBe(0);
});
