import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// These tests share the service worker file on disk; run them one after the other.
test.describe.configure({ mode: "serial" });
const SW = resolve(import.meta.dirname, "../../dist/sw.js");
import { openApp, snap, setEntries } from "./helpers";

test("offline reload: pages load from the service worker and a spin works (N2)", async ({ page, context }) => {
  await openApp(page, "/");
  await setEntries(page, ["Offline", "Still", "Works"]);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
  // Let the install finish caching everything.
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
  expect((await snap(page)).entries.map((e) => e.label)).toEqual(["Offline", "Still", "Works"]);
  await page.getByTestId("spin").click();
  await expect(page.getByTestId("live")).toContainText("Winner", { timeout: 12_000 });
  for (const p of ["/verify/", "/random-name-picker/", "/yes-or-no-wheel/"]) {
    const res = await page.goto(p);
    expect(res?.ok() ?? true, p).toBe(true);
    await expect(page.locator("h1")).toBeVisible();
  }
  await context.setOffline(false);
});

test("a new service worker shows 'Update ready' and drops the old cache (N3)", async ({ page }) => {
  await openApp(page, "/");
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
  const oldKeys = await page.evaluate(async () => caches.keys());
  // Change the worker on disk (as a rebuild with new content would) and ask the browser to update.
  const original = readFileSync(SW, "utf8");
  try {
    writeFileSync(SW, original.replace(/const VERSION = "([0-9a-f]+)";/, 'const VERSION = "$1ff";'));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await expect(page.getByTestId("toast")).toContainText("An update is ready.", { timeout: 20_000 });
    // Activation deletes every older cache.
    await expect.poll(async () => page.evaluate(async () => caches.keys()), { timeout: 10_000 }).toHaveLength(1);
    const keys = await page.evaluate(async () => caches.keys());
    expect(keys[0]).not.toBe(oldKeys[0]);
  } finally {
    writeFileSync(SW, original);
  }
});
