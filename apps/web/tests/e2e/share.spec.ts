import { expect, test } from "@playwright/test";
import { decodeQR } from "qr/decode.js";
import { PNG } from "pngjs";
import { openApp, snap } from "./helpers";

async function thirtyWithImage(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const w = (window as unknown as { __whirlpick: { controller: { store: { dispatch(a: unknown): void }; setEntryImage(id: string, f: File): Promise<void> } } }).__whirlpick;
    const entries = Array.from({ length: 30 }, (_, i) => ({ id: `e_t${String(i).padStart(7, "0")}`, label: `Player ${i + 1}`, weight: (i % 4) + 1, enabled: true, ...(i % 5 === 0 ? { color: "#2A55A8" } : {}) }));
    w.controller.store.dispatch({ type: "entries/set", entries, now: Date.now() });
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    g.fillStyle = "#C2361F";
    g.fillRect(0, 0, 32, 32);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    await w.controller.setEntryImage(entries[1]!.id, new File([blob], "x.png", { type: "image/png" }));
  });
}

test("share link opens elsewhere without images; the QR decodes to the link (I7)", async ({ page, browser }) => {
  await openApp(page);
  await thirtyWithImage(page);
  const mine = await snap(page);
  await page.getByTestId("share").click();
  await expect(page.getByTestId("images-note")).toBeVisible();
  const url = await page.getByTestId("share-url").inputValue();
  expect(url).toMatch(/\/#w=1j?\./);
  // QR: render the dialog's SVG large (a phone camera sees it at retina resolution) and decode.
  const svg = await page.getByTestId("qr").locator("svg").evaluate((el) => el.outerHTML);
  const big = await page.context().browser()!.newContext({ deviceScaleFactor: 1 });
  const qp = await big.newPage();
  await qp.setContent(`<body style="margin:0;background:#fff"><div style="width:640px;height:640px">${svg.replace("<svg ", '<svg width="640" height="640" ')}</div></body>`);
  const png = PNG.sync.read(await qp.screenshot({ clip: { x: 0, y: 0, width: 640, height: 640 } }));
  expect(decodeQR({ width: png.width, height: png.height, data: png.data })).toBe(url);
  await big.close();
  await page.keyboard.press("Escape");

  const ctx2 = await browser.newContext();
  const other = await ctx2.newPage();
  await other.goto(url);
  await other.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
  const theirs = await snap(other);
  expect(theirs.entries.map((e) => [e.label, e.weight, (e as { color?: string }).color ?? null])).toEqual(mine.entries.map((e) => [e.label, e.weight, (e as { color?: string }).color ?? null]));
  expect(theirs.entries.some((e) => (e as { imageRef?: string }).imageRef)).toBe(false);
  expect(await other.evaluate(() => location.hash)).toBe("");
  await expect(other.getByText("Opened from a link. Your saved wheels are untouched.")).toBeVisible();
  await ctx2.close();

  // Opening a link in the same browser leaves saved wheels alone.
  const before = await page.evaluate(() => (window as unknown as { __whirlpick: { store: { getState(): { wheels: { id: string }[]; meta: Record<string, { saved: boolean }> } } } }).__whirlpick.store.getState());
  const savedIds = before.wheels.filter((w) => before.meta[w.id]?.saved).map((w) => w.id).sort();
  const p2 = await page.context().newPage();
  await p2.goto(url);
  await p2.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
  const after = await p2.evaluate(() => (window as unknown as { __whirlpick: { store: { getState(): { wheels: { id: string }[]; meta: Record<string, { saved: boolean }> } } } }).__whirlpick.store.getState());
  expect(after.wheels.filter((w) => after.meta[w.id]?.saved).map((w) => w.id).sort()).toEqual(savedIds);
});

test("#names= opens a plain list (I7)", async ({ page }) => {
  await openApp(page, "/#names=Ada%0AGrace");
  expect((await snap(page)).entries.map((e) => e.label)).toEqual(["Ada", "Grace"]);
});

test("a damaged link loads nothing and says so", async ({ page }) => {
  await openApp(page, "/#w=1.not-a-real-code");
  await expect(page.getByTestId("toast")).toContainText("This link is damaged. Nothing was loaded.");
});
