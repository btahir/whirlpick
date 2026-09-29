import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeWinner, openApp, spinAndWait } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function audit(page: Page, label: string) {
  // Let entrance animations finish so colours are measured at rest.
  await page.waitForTimeout(450);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const LANDING = ["random-name-picker", "yes-or-no-wheel", "random-team-generator", "random-group-generator", "random-number-wheel", "letter-wheel", "what-should-i-eat-wheel", "truth-or-dare-wheel", "raffle-winner-picker", "classroom-name-picker", "classroom-wheel-no-ads", "decision-wheel", "chore-wheel", "country-wheel", "list-randomizer", "is-the-wheel-rigged"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme} (L1)`, () => {
    test.use({ colorScheme: scheme });
    test("tool, content and utility pages", async ({ page }) => {
      test.setTimeout(120_000);
      for (const p of ["/", ...LANDING.map((s) => `/${s}/`), "/verify/", "/about/", "/support/", "/docs/agents/", "/embed/", "/404.html"]) {
        await page.goto(p);
        await page.waitForLoadState("load");
        await page.waitForTimeout(150);
        await audit(page, p);
      }
    });
    test("dialogs and states", async ({ page }) => {
      await openApp(page, "/?duration=1");
      await spinAndWait(page);
      await audit(page, "winner dialog");
      await closeWinner(page);
      await page.getByTestId("share").click();
      await expect(page.getByTestId("share-url")).not.toHaveValue("");
      await audit(page, "share dialog");
      await page.keyboard.press("Escape");
      await page.getByTestId("tab-results").click();
      await page.getByTestId("history").locator("button").first().click();
      await audit(page, "receipt dialog");
      await page.keyboard.press("Escape");
      await page.evaluate(() => (window as unknown as { __whirlpick: { controller: { openDialog(k: string): void } } }).__whirlpick.controller.openDialog("details"));
      await audit(page, "details table");
      await page.keyboard.press("Escape");
      await page.getByTestId("tab-teams").click();
      await page.getByTestId("split").click();
      await audit(page, "teams");
    });
    test("mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openApp(page, "/");
      await audit(page, "mobile /");
    });
  });
}

test("accessible names: the spin button counts entries; the list gives chances; icon buttons are named (L2)", async ({ page }) => {
  await openApp(page, "/");
  await expect(page.getByTestId("wheel")).toHaveAccessibleName("Spin the wheel: 12 entries");
  const items = page.getByTestId("wheel-list").locator("li");
  await expect(items).toHaveCount(12);
  await expect(items.first()).toHaveText("Ada, 1 in 12");
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      if (!r.width) return false;
      const byRef = (b.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join("");
      const name = (b.getAttribute("aria-label") ?? "") + byRef + (b.textContent ?? "").trim() + [...(b.labels ?? [])].map((l) => l.textContent).join("");
      return !name.trim();
    }).length,
  );
  expect(unnamed).toBe(0);
});

test("dialogs: focus in, Tab stays, Esc closes, focus returns, background inert (L3)", async ({ page }) => {
  await openApp(page, "/?duration=1");
  for (const open of ["share", "saved"] as const) {
    const opener = page.getByTestId(open);
    await opener.focus();
    await page.keyboard.press("Enter");
    const dlg = page.locator("dialog[open]");
    await expect(dlg).toHaveCount(1);
    expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      // Focus may pass through the browser chrome, but never lands on the page behind.
      const inPage = await page.evaluate(() => document.activeElement && document.activeElement !== document.body && !document.querySelector("dialog[open]")!.contains(document.activeElement));
      expect(inPage).toBe(false);
    }
    // The page behind is inert: a click on the wheel does nothing.
    const before = await page.evaluate(() => (window as unknown as { __whirlpick: { store: { getState(): { spin: { phase: string } } } } }).__whirlpick.store.getState().spin.phase);
    await page.getByTestId("wheel").click({ force: true, trial: false }).catch(() => {});
    const after = await page.evaluate(() => (window as unknown as { __whirlpick: { store: { getState(): { spin: { phase: string } } } } }).__whirlpick.store.getState().spin.phase);
    expect(after).toBe(before);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});
