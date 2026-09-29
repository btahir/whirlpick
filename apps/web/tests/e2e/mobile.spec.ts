import { devices, expect, test } from "@playwright/test";
import { openApp } from "./helpers";

for (const name of ["iPhone 13", "Pixel 7"] as const) {
  test.describe(name, () => {
    const d = devices[name];
    test.use({ viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: d.userAgent });

    test(`no sideways scroll, big wheel, tap to spin, 44 px targets (I14)`, async ({ page }) => {
      await openApp(page, "/?duration=1");
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      expect(m.sw).toBeLessThanOrEqual(m.iw);
      const box = (await page.getByTestId("wheel").boundingBox())!;
      const diameter = (box.width / 2.24) * 2;
      expect(diameter / m.iw).toBeGreaterThanOrEqual(0.85);
      expect(box.x + (0.04 / 2.24) * box.width).toBeGreaterThanOrEqual(0);
      // Every visible button and input is at least 44 × 44.
      const small = await page.evaluate(() =>
        [...document.querySelectorAll("button, input, select, textarea")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !el.closest(".sr-only") && !(el as HTMLInputElement).hidden;
          })
          .map((el) => ({ el: `${el.tagName}.${(el as HTMLElement).className}:${(el as HTMLElement).getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20)}`, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
          .filter((x) => x.w < 44 - 0.5 || x.h < 44 - 0.5),
      );
      expect(small, JSON.stringify(small)).toEqual([]);
      await page.getByTestId("wheel").tap();
      await expect(page.getByTestId("live")).toContainText("Winner", { timeout: 8000 });
      await expect(page.locator("dialog.winner[open]")).toBeVisible();
      // The editor follows the wheel on phones (SPEC §9) and is reachable.
      await page.keyboard.press("Escape");
      await page.getByTestId("entries").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("entries")).toBeInViewport();
    });
  });
}
