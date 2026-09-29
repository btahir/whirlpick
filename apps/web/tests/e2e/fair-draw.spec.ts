import { expect, test } from "@playwright/test";
import { commitmentFor, verifyReceipt } from "@whirlpick/core";
import { closeWinner, openApp, setEntries, snap, spinAndWait } from "./helpers";

const commitmentShown = (page: import("@playwright/test").Page) => page.getByTestId("commitment").getAttribute("data-full");

test("commitment and fingerprint before the spin; the revealed seed hashes to it (I10)", async ({ page }) => {
  await openApp(page);
  await page.getByRole("switch", { name: /Fair draw/ }).click();
  const shown = await commitmentShown(page);
  expect(shown).toMatch(/^[0-9a-f]{64}$/);
  await page.getByRole("button", { name: "Fair draw details" }).click();
  await expect(page.getByTestId("fair-fingerprint")).toHaveText(/^[0-9a-f]{64}$/);
  await page.keyboard.press("Escape");
  await spinAndWait(page);
  const r = (await snap(page)).history[0]!.receipt as { commitment: string; seed: string };
  expect(r.commitment).toBe(shown);
  expect(commitmentFor(r.seed)).toBe(shown);
  expect(verifyReceipt(r).status).toBe("valid");
});

test("one commitment for 3 spins: unrevealed until Reveal seed, room word locked (I10)", async ({ page }) => {
  await openApp(page);
  await page.getByRole("switch", { name: /Fair draw/ }).click();
  await page.getByRole("button", { name: "Fair draw details" }).click();
  await page.getByRole("switch", { name: /New commitment after every spin/ }).click();
  await page.getByText("Ask the room for a word (optional)").click();
  await page.getByTestId("room-word").fill("blue sky");
  await page.getByTestId("room-word").blur();
  await page.keyboard.press("Escape");
  for (let i = 0; i < 3; i++) {
    await spinAndWait(page);
    await closeWinner(page);
  }
  const hist = (await snap(page)).history;
  expect(hist).toHaveLength(3);
  for (const h of hist) expect(verifyReceipt(h.receipt).status).toBe("unrevealed");
  expect(hist.map((h) => (h.receipt as { spinIndex: number }).spinIndex).sort()).toEqual([0, 1, 2]);
  await page.getByTestId("tab-results").click();
  await expect(page.getByTestId("history")).toContainText("unrevealed");
  await page.getByRole("button", { name: "Fair draw details" }).click();
  await expect(page.getByTestId("room-word")).toBeDisabled();
  await page.getByTestId("reveal-seed").click();
  const after = (await snap(page)).history;
  for (const h of after) {
    expect(verifyReceipt(h.receipt).status).toBe("valid");
    expect((h.receipt as { publicInput: string }).publicInput).toBe("blue sky");
  }
});

test("editing the list after committing flags the receipt (I10)", async ({ page }) => {
  await openApp(page);
  await page.getByRole("switch", { name: /Fair draw/ }).click();
  await setEntries(page, ["Ada", "Grace", "Linus", "Margaret", "Priya"]);
  await expect(page.getByTestId("ticket")).toContainText("The list changed after this commitment");
  await spinAndWait(page);
  const rep = verifyReceipt((await snap(page)).history[0]!.receipt);
  expect(rep.status).toBe("valid");
  expect(rep.warnings).toContain("WHEEL_CHANGED_AFTER_COMMIT");
});

test("a reload mid-session keeps the pending seed (I10)", async ({ page }) => {
  await openApp(page);
  await setEntries(page, ["Ada", "Grace", "Linus", "Margaret"]);
  await page.getByRole("switch", { name: /Fair draw/ }).click();
  const shown = await commitmentShown(page);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
  expect(await commitmentShown(page)).toBe(shown);
  await spinAndWait(page);
  expect(((await snap(page)).history[0]!.receipt as { commitment: string }).commitment).toBe(shown);
});
