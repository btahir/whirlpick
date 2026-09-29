import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { verifyReceipt } from "@whirlpick/core";
import { closeWinner, openApp, snap, spinAndWait } from "./helpers";

test("history: 3 spins, newest first, CSV and JSON exports, receipt JSON matches (I5)", async ({ page }) => {
  await openApp(page);
  const winners: string[] = [];
  for (let i = 0; i < 3; i++) {
    await spinAndWait(page);
    winners.push((await snap(page)).last[0]!.label);
    await closeWinner(page);
  }
  await page.getByTestId("tab-results").click();
  const rows = page.getByTestId("history").locator("li");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(winners[2]!);
  await expect(rows.first()).toContainText("#03");

  const [csvDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
  const csv = readFileSync((await csvDl.path())!, "utf8").trim().split("\n");
  expect(csv[0]).toBe("time,wheel,mode,spin_index,winners,seed,commitment,wheel_hash");
  expect(csv).toHaveLength(4);

  const [jsonDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
  const receipts = JSON.parse(readFileSync((await jsonDl.path())!, "utf8")) as unknown[];
  expect(receipts).toHaveLength(3);
  for (const r of receipts) expect(verifyReceipt(r).status).toBe("valid");

  const history = (await snap(page)).history;
  for (let i = 0; i < 3; i++) {
    await rows.nth(i).locator("button").click();
    await page.locator("dialog.receipt summary").click();
    const shown = JSON.parse((await page.getByTestId("receipt-json").textContent())!);
    expect(shown).toEqual(history[i]!.receipt);
    await page.keyboard.press("Escape");
  }
});
