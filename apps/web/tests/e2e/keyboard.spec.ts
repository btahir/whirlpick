import { expect, test, type Page } from "@playwright/test";
import { openApp, snap } from "./helpers";

/** Press Tab until `pred` holds for the focused element (checking each has a visible focus ring). */
async function tabTo(page: Page, pred: (el: Element) => boolean, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const ok = await page.evaluate(`(${pred.toString()})(document.activeElement)`);
    await expectFocusRing(page);
    if (ok) return;
  }
  throw new Error("focus target not reached");
}

function lum(rgb: number[]) {
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

async function expectFocusRing(page: Page) {
  const info = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const inner = el.querySelector(".wheel-focus");
    const ring = inner ? getComputedStyle(inner) : cs;
    const parse = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    let bgEl: HTMLElement | null = el.parentElement;
    let bg = "rgb(255,255,255)";
    while (bgEl) {
      const b = getComputedStyle(bgEl).backgroundColor;
      if (b && !b.startsWith("rgba(0, 0, 0, 0)") && b !== "transparent") {
        bg = b;
        break;
      }
      bgEl = bgEl.parentElement;
    }
    return { tag: el.tagName, cls: el.className, outline: ring.outlineStyle, width: parseFloat(ring.outlineWidth), color: parse(ring.outlineColor), shadow: cs.boxShadow, bg: parse(bg) };
  });
  if (!info) return;
  const has = (info.outline !== "none" && info.width > 0) || (info.shadow && info.shadow !== "none");
  expect(has, `focus ring on ${info.tag}.${info.cls}`).toBeTruthy();
  if (info.outline !== "none" && info.color.length === 3) {
    const a = lum(info.color);
    const b = lum(info.bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    expect(ratio, `focus ring contrast on ${info.tag}`).toBeGreaterThanOrEqual(3);
  }
}

const focusedIs = (page: Page, id: string) => expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")), { timeout: 8000 }).toBe(id);

test("keyboard only: entries, spin, dialogs, share, teams, history, shortcuts (I12)", async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page, "/?duration=1");
  // 1–2. Tab to the entries and type four names.
  await tabTo(page, (el) => el.getAttribute("data-testid") === "entries");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Ada\nGrace\nLinus\nMargaret");
  await expect.poll(async () => (await snap(page)).entries.length).toBe(4);
  // 3–5. Ctrl+Enter spins; focus lands on "Spin again"; Esc returns it to the Spin button.
  await page.keyboard.press("ControlOrMeta+Enter");
  await focusedIs(page, "spin-again");
  await expectFocusRing(page);
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("spin");
  // 6. Open share with Enter and copy the link.
  await page.getByTestId("share").focus();
  await page.keyboard.press("Enter");
  await focusedIs(page, "copy-link");
  await expect(page.getByTestId("copy-link")).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("toast")).toContainText("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#w=/);
  await page.keyboard.press("Escape");
  // 7. Teams tab and split.
  await tabTo(page, (el) => el.getAttribute("data-testid")?.startsWith("tab-") ?? false);
  for (let i = 0; i < 3; i++) {
    if ((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "tab-teams") break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(80);
  }
  await focusedIs(page, "tab-teams");
  await tabTo(page, (el) => el.getAttribute("data-testid") === "split");
  await page.keyboard.press("Enter");
  await expect(page.locator(".team")).toHaveCount(2);
  // 8. History and a receipt.
  await page.getByTestId("tab-teams").focus();
  await page.keyboard.press("ArrowLeft");
  await focusedIs(page, "tab-results");
  await tabTo(page, (el) => el.closest('[data-testid="history"]') !== null);
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog.receipt[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  // 9. M, H, F and ? outside text fields.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("whirlpick:muted"))).toBe("1");
  await page.keyboard.press("h");
  await expect(page.locator(".panel")).toHaveCount(0);
  await page.keyboard.press("h");
  await expect(page.locator(".panel")).toHaveCount(1);
  await page.keyboard.press("f");
  await expect(page.locator("main.app.presenter")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("main.app.presenter")).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(page.locator("dialog.shortcuts[open]")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("mute persists and a muted page never creates an AudioContext (K3)", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __acCount: number; AudioContext: typeof AudioContext };
    w.__acCount = 0;
    const Orig = window.AudioContext;
    w.AudioContext = class extends Orig {
      constructor(o?: AudioContextOptions) {
        super(o);
        (window as unknown as { __acCount: number }).__acCount++;
      }
    } as typeof AudioContext;
  });
  await openApp(page, "/?duration=1");
  await page.locator("body").press("m");
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready);
  await expect(page.getByTestId("mute")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("spin").click();
  await expect(page.getByTestId("live")).toContainText("Winner", { timeout: 8000 });
  expect(await page.evaluate(() => (window as unknown as { __acCount: number }).__acCount)).toBe(0);
});
