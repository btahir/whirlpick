import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { buildReceipt, encodeReceiptCode, normaliseEntries } from "@whirlpick/core";

const entries = normaliseEntries(["Ada", "Grace", "Linus", "Margaret", "Priya"]).entries;
const receipt = (over: Record<string, unknown> = {}) => ({
  ...buildReceipt({ entries, seed: "0f".repeat(32), mode: "single", title: "Friday raffle", createdAt: "2026-01-01T00:00:00.000Z", app: "whirlpick-test/0" }),
  ...over,
});

const hydrated = (page: import("@playwright/test").Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");

test.describe("/verify/ (I11)", () => {
  test("a genuine receipt checks out, every line passing", async ({ page }) => {
    await page.goto("/verify/");
    await hydrated(page);
    await page.getByTestId("verify-input").fill(JSON.stringify(receipt()));
    await page.getByTestId("verify-check").click();
    await expect(page.getByTestId("stamp")).toHaveText("Checks out");
    await expect(page.locator(".checks li.bad")).toHaveCount(0);
    expect(await page.locator(".checks li.ok").count()).toBeGreaterThanOrEqual(10);
  });

  test("a tampered receipt doesn't match and names the failed check", async ({ page }) => {
    const r = receipt();
    const bad = { ...r, result: { picks: [{ ...r.result.picks![0]!, landingU32: (r.result.picks![0]!.landingU32 + 1) >>> 0 }] } };
    await page.goto("/verify/");
    await hydrated(page);
    await page.getByTestId("verify-input").fill(JSON.stringify(bad));
    await page.getByTestId("verify-check").click();
    await expect(page.getByTestId("stamp")).toHaveText("Doesn't match");
    await expect(page.getByTestId("failed-check")).toContainText("Re-running the draw gives a different result.");
  });

  test("an unrevealed receipt says so", async ({ page }) => {
    await page.goto("/verify/");
    await hydrated(page);
    await page.getByTestId("verify-input").fill(JSON.stringify(receipt({ seed: null })));
    await page.getByTestId("verify-check").click();
    await expect(page.getByTestId("verify-result")).toContainText("Not revealed yet");
  });

  test("/verify/#r= verifies on load; the commitment you saw catches a mismatch", async ({ page }) => {
    const code = await encodeReceiptCode(receipt());
    await page.goto(`/verify/#r=${code}`);
    await expect(page.getByTestId("stamp")).toHaveText("Checks out");
    await page.getByText("Compare with what you saw before the draw (optional)").click();
    await page.getByTestId("verify-commitment").fill("ab".repeat(32));
    await page.getByTestId("verify-check").click();
    await expect(page.getByTestId("stamp")).toHaveText("Doesn't match");
    await expect(page.getByTestId("failed-check")).toContainText("commitment");
  });

  test("a dropped (opened) receipt file works", async ({ page }, info) => {
    const f = info.outputPath("receipt.json");
    writeFileSync(f, JSON.stringify(receipt(), null, 2));
    await page.goto("/verify/");
    await hydrated(page);
    await page.getByTestId("verify-file").setInputFiles(f);
    await expect(page.getByTestId("stamp")).toHaveText("Checks out");
  });

  test("/#spin= replays onto the recorded winner and shows the status", async ({ page }) => {
    const r = receipt();
    const code = await encodeReceiptCode(r);
    await page.goto(`/?duration=1#spin=${code}`);
    await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
    await expect(page.getByText("Replaying a recorded draw")).toBeVisible();
    await page.getByTestId("spin").click();
    await expect(page.getByTestId("winner-name")).toHaveText(r.result.picks![0]!.label, { timeout: 10_000 });
    await expect(page.locator("dialog.winner .stamp")).toHaveText("Checks out");
  });
});
