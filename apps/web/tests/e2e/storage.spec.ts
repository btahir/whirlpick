import { expect, test } from "@playwright/test";
import { closeWinner, openApp, setEntries, snap, spinAndWait } from "./helpers";

type St = { wheels: { id: string; name: string; entries: { label: string }[]; settings: { spinDuration: number } }[]; meta: Record<string, { saved: boolean }>; history: Record<string, unknown[]>; storage: string };
const state = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __whirlpick: { store: { getState(): unknown } } }).__whirlpick.store.getState() as St);

test("create, rename, duplicate, reload; delete with undo (I6)", async ({ page }) => {
  await openApp(page);
  await setEntries(page, ["Ada", "Grace", "Linus"]);
  await spinAndWait(page);
  await closeWinner(page);
  await page.getByTestId("saved").click();
  await page.getByTestId("new-wheel").click();
  await setEntries(page, ["Red", "Green", "Blue"]);
  // Rename the second wheel from the header.
  await page.getByRole("button", { name: /Wheel name: .*Rename/ }).click();
  await page.getByLabel("Wheel name").fill("Colours");
  await page.keyboard.press("Enter");
  // Duplicate it from the drawer.
  await page.getByTestId("saved").click();
  await page.getByRole("button", { name: "Actions for Colours" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByTestId("wheels").locator("li")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600); // debounced writes (300 ms)
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
  const s = await state(page);
  const saved = s.wheels.filter((w) => s.meta[w.id]?.saved);
  expect(saved.map((w) => w.name).sort()).toEqual(["Colours", "Colours (copy)", "Name picker"].sort());
  const first = saved.find((w) => w.name === "Name picker")!;
  expect(first.entries.map((e) => e.label)).toEqual(["Ada", "Grace", "Linus"]);
  expect(s.history[first.id]).toHaveLength(1);
  // Delete, then undo from the toast.
  await page.getByTestId("saved").click();
  await page.getByRole("button", { name: "Actions for Colours (copy)" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.keyboard.press("Escape");
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
  const after = await state(page);
  expect(after.wheels.filter((w) => after.meta[w.id]?.saved).map((w) => w.name)).toContain("Colours (copy)");
});

test("with IndexedDB blocked, wheels persist in localStorage (I6)", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: { open: () => { throw new Error("blocked"); } }, configurable: true });
  });
  await openApp(page);
  expect((await snap(page)).storage).toBe("local");
  await setEntries(page, ["Kept", "In", "Local"]);
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
  expect((await snap(page)).entries.map((e) => e.label)).toEqual(["Kept", "In", "Local"]);
});

test("with both blocked, the 'isn't saving' banner shows (I6)", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: { open: () => { throw new Error("blocked"); } }, configurable: true });
    const bad = { getItem: () => null, setItem: () => { throw new Error("blocked"); }, removeItem: () => {}, key: () => null, length: 0, clear: () => {} };
    Object.defineProperty(window, "localStorage", { value: bad, configurable: true });
  });
  await openApp(page);
  expect((await snap(page)).storage).toBe("memory");
  await expect(page.getByText("This browser isn't saving. Export a file to keep your wheel.")).toBeVisible();
});
