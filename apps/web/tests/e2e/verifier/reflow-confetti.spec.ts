// Verifier-owned (pass 2): ACCEPTANCE L4 (zoom and reflow) and the K4 parts the builder suite
// doesn't cover in the browser (confetti off by setting, nothing drawn after 2.8 s; K4 as amended:
// 2.6 s lifetime, <= 180 particles, the count bound is held by confetti.test.ts).
import { expect, test, type Page } from "@playwright/test";
import { openApp, spinAndWait } from "../helpers";

async function reflowProblems(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const de = document.documentElement;
    // Content inside its own horizontal scroller (code blocks, wide tables in a wrapper) is fine.
    const inScroller = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowX)) return true;
      return false;
    };
    if (de.scrollWidth > window.innerWidth + 1) out.push(`page scrolls sideways: ${de.scrollWidth} > ${window.innerWidth}`);
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // Text that is cut off: an overflow-hidden box whose content is wider, without an intended ellipsis.
      const clips = /hidden|clip/.test(cs.overflowX);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (clips && hasText && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis" && !el.closest("[aria-hidden=true], .sr-only, .visually-hidden, canvas"))
        out.push(`clipped text: <${el.tagName.toLowerCase()} class="${el.className}"> "${el.textContent!.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
      if (r.right > window.innerWidth + 1 && hasText && !inScroller(el) && !el.closest("[aria-hidden=true], .sr-only, .visually-hidden, dialog:not([open])"))
        out.push(`off-screen text: <${el.tagName.toLowerCase()} class="${el.className}"> "${el.textContent!.trim().slice(0, 40)}" right ${Math.round(r.right)}`);
    }
    return [...new Set(out)].slice(0, 15);
  });
}

for (const path of ["/", "/verify/"]) {
  test(`L4: ${path} reflows at 320 px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(path);
    await page.waitForTimeout(800);
    expect(await reflowProblems(page)).toEqual([]);
    await ctx.close();
  });
  test(`L4: ${path} at 1280 px and 200 % zoom`, async ({ browser }) => {
    // 200 % browser zoom at 1280 px = a 640 CSS px layout viewport at dpr 2; also try CSS zoom on the root.
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(path);
    await page.waitForTimeout(800);
    expect(await reflowProblems(page), "dpr-2 640 px").toEqual([]);
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p2 = await ctx2.newPage();
    await p2.goto(path);
    await p2.waitForTimeout(500);
    await p2.addStyleTag({ content: "html{zoom:2}" });
    await p2.waitForTimeout(500);
    // CSS zoom doesn't re-run media queries (real browser zoom does, which the 640 px case covers),
    // so this variant is recorded, not asserted.
    test.info().annotations.push({ type: "css-zoom-2", description: JSON.stringify(await reflowProblems(p2)) });
    await ctx2.close();
  });
}

const painted = (page: Page) =>
  page.getByTestId("confetti").evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d");
    if (!ctx || !c.width) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 31) if (d[i]! > 0) n++;
    return n;
  });

test("K4 in Chrome: confetti draws, is gone by 2.8 s, and stays off when the setting is off", async ({ page }) => {
  test.setTimeout(60_000);
  await openApp(page, "/?duration=1");
  await page.getByTestId("spin").click();
  await expect(page.getByTestId("live")).toContainText(/Winner/, { timeout: 8000 });
  await page.waitForTimeout(250);
  const during = await painted(page);
  // 250 + 2650 ms = 2.9 s after the win is announced (confetti starts no later than that).
  await page.waitForTimeout(2650);
  const after = await painted(page);
  expect(during, "confetti visible just after the win").toBeGreaterThan(0);
  expect(after, "nothing drawn after 2.8 s").toBe(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as unknown as { __whirlpick: { controller: { setSettings(p: unknown): void } } }).__whirlpick.controller.setSettings({ confetti: false }));
  await spinAndWait(page);
  await page.waitForTimeout(250);
  expect(await painted(page), "confetti off").toBe(0);
});
