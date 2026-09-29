import { expect, test } from "@playwright/test";
import { openApp, snap } from "./helpers";

// PLAN §8: each landing page opens the tool with its preset and mode (ACCEPTANCE O2).
const PAGES: [string, number, string][] = [
  ["random-name-picker", 12, "normal"],
  ["yes-or-no-wheel", 2, "normal"],
  ["random-team-generator", 16, "teams"],
  ["random-group-generator", 24, "teams"],
  ["random-number-wheel", 10, "normal"],
  ["letter-wheel", 26, "normal"],
  ["what-should-i-eat-wheel", 20, "normal"],
  ["truth-or-dare-wheel", 2, "normal"],
  ["raffle-winner-picker", 30, "multi"],
  ["classroom-name-picker", 24, "elimination"],
  ["classroom-wheel-no-ads", 24, "normal"],
  ["decision-wheel", 4, "normal"],
  ["chore-wheel", 10, "elimination"],
  ["country-wheel", 195, "normal"],
  ["list-randomizer", 8, "multi"],
  ["is-the-wheel-rigged", 12, "normal"],
];

for (const [slug, n, mode] of PAGES) {
  test(`/${slug}/ opens ${n} entries in ${mode} mode (O2)`, async ({ page }) => {
    await openApp(page, `/${slug}/`);
    const s = await snap(page);
    expect(s.entries).toHaveLength(n);
    expect(s.mode).toBe(mode);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".faq dt").first()).toBeVisible();
  });
}

test("fair-draw pages open with a commitment on show", async ({ page }) => {
  await openApp(page, "/raffle-winner-picker/");
  await expect(page.getByTestId("commitment")).toHaveAttribute("data-full", /^[0-9a-f]{64}$/);
});
