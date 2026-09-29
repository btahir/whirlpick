// Verifier-owned adversarial checks (ACCEPTANCE pass 2). Not written by the builders.
// Runs against the production build on 127.0.0.1:4324 like the rest of tests/e2e.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildReceipt, encodeReceiptCode, normaliseEntries, verifyReceipt } from "@whirlpick/core";
import { closeWinner, openApp, snap, spinAndWait } from "../helpers";

const ROOT = resolve(import.meta.dirname, "../../../../..");
const CLI = resolve(ROOT, "packages/cli/bin/whirlpick.js");
const OUT = resolve(ROOT, "test-results/verifier");
const BASE = "http://127.0.0.1:4324";
mkdirSync(OUT, { recursive: true });
const cli = (args: string[]) => JSON.parse(execFileSync("node", [CLI, ...args, "--json"], { encoding: "utf8", env: { ...process.env, WHIRLPICK_FIXED_NOW: "2026-01-01T00:00:00.000Z" } }));
const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

const NAMES = ["Ada", "Grace", "Linus", "Margaret", "Priya", "Tomas", "Amara", "Kenji"];
const SEED = "3c".repeat(32);

async function useSeed(page: Page, seed: string) {
  await page.getByRole("switch", { name: /Fair draw/ }).click();
  await page.getByRole("button", { name: "Fair draw details" }).click();
  await page.getByText("Use my own seed").click();
  await page.getByTestId("custom-seed").fill(seed);
  await page.getByTestId("use-seed").click();
  await page.keyboard.press("Escape");
}

test.describe("CLI links open in the browser with the same result", () => {
  test("spin --link replay lands on the CLI winner; link + same seed gives a byte-equal receipt", async ({ page, context }, info) => {
    test.setTimeout(90_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const file = info.outputPath("names.txt");
    writeFileSync(file, NAMES.join("\n") + "\n");
    const spun = cli(["spin", file, "--seed", SEED, "--link", "--base", BASE]);
    const winner = spun.receipts[0].result.picks[0].label as string;
    expect(spun.link.startsWith(`${BASE}/#spin=`)).toBe(true);
    await openApp(page, spun.link.replace(`${BASE}/`, "/?duration=1"));
    await expect(page.getByText("Replaying a recorded draw")).toBeVisible();
    await page.getByTestId("spin").click();
    await expect(page.getByTestId("winner-name")).toHaveText(winner, { timeout: 10_000 });
    await expect(page.locator("dialog.winner .stamp")).toHaveText("Checks out");

    // Wheel link from the CLI, then the same seed in the browser's fair draw.
    const linked = cli(["link", file, "--base", BASE]);
    const page2 = await context.newPage();
    await openApp(page2, linked.url.replace(`${BASE}/`, "/?duration=1"));
    expect((await snap(page2)).entries.map((e) => e.label)).toEqual(NAMES);
    await useSeed(page2, SEED);
    await page2.getByTestId("spin").click();
    await expect(page2.getByTestId("winner-name")).toHaveText(winner, { timeout: 10_000 });
    await page2.locator("dialog.winner").getByRole("button", { name: "Receipt" }).click();
    await page2.getByTestId("copy-receipt").click();
    const web = JSON.parse(await page2.evaluate(() => navigator.clipboard.readText())) as Record<string, unknown>;
    const mine = cli(["spin", file, "--seed", SEED, "--title", String(web.title)]).receipts[0] as Record<string, unknown>;
    const strip = ({ createdAt: _c, app: _a, committedAt: _t, committedWheelHash: _w, ...rest }: Record<string, unknown>) => rest;
    writeFileSync(resolve(OUT, "parity-web.json"), JSON.stringify(web, null, 2));
    // Byte for byte (key order included), not just deep-equal.
    expect(JSON.stringify(strip(web))).toBe(JSON.stringify(strip(mine)));
    expect(web.committedWheelHash).toBe(web.wheelHash);
    expect(verifyReceipt(web).status).toBe("valid");
  });
});

test.describe("tampered links and receipts", () => {
  const entries = normaliseEntries(["Ada", "Grace", "Linus", "Margaret", "Priya"]).entries;
  const genuine = () => buildReceipt({ entries, seed: "0f".repeat(32), mode: "single", title: "Raffle", createdAt: "2026-01-01T00:00:00.000Z", app: "verifier/0" });

  test("a replay link whose recorded winner was changed is flagged, not presented as a fair result", async ({ page }) => {
    const r = genuine();
    const real = r.result.picks![0]!;
    const other = entries.findIndex((_, i) => i !== real.index);
    const forged = { ...r, result: { picks: [{ ...real, index: other, label: entries[other]!.label }] } };
    expect(verifyReceipt(forged).status).not.toBe("valid");
    const code = await encodeReceiptCode(forged);
    await openApp(page, `/?duration=1#spin=${code}`);
    await page.getByTestId("spin").click();
    await expect(page.locator("dialog.winner[open]")).toBeVisible({ timeout: 10_000 });
    const shown = (await page.getByTestId("winner-name").textContent())?.trim();
    const stamp = (await page.locator("dialog.winner .stamp").textContent())?.trim();
    info(`forged replay: claimed ${entries[other]!.label}, real ${real.label}, shown ${shown}, stamp ${stamp}`);
    expect(stamp).not.toBe("Checks out");
  });

  test("a replay link with edited entries (weight bumped) is flagged", async ({ page }) => {
    const r = genuine();
    const forged = { ...r, entries: r.entries.map((e, i) => (i === 0 ? { ...e, weight: 5 } : e)) };
    const code = await encodeReceiptCode(forged);
    await openApp(page, `/?duration=1#spin=${code}`);
    await page.getByTestId("spin").click();
    await expect(page.locator("dialog.winner[open]")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("dialog.winner .stamp")).not.toHaveText("Checks out");
  });

  test("/verify/ rejects a swapped seed, an edited label and a bad commitment", async ({ page }) => {
    const r = genuine();
    const cases: [string, unknown][] = [
      ["seed", { ...r, seed: "0e".repeat(32) }],
      ["label", { ...r, entries: r.entries.map((e, i) => (i === 1 ? { ...e, label: "Grace2" } : e)) }],
      ["commitment", { ...r, commitment: "ab".repeat(32) }],
      ["garbage", "{ not json"],
    ];
    for (const [name, bad] of cases) {
      await page.goto("/verify/");
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
      await page.getByTestId("verify-input").fill(typeof bad === "string" ? bad : JSON.stringify(bad));
      await page.getByTestId("verify-check").click();
      await expect(page.getByTestId("verify-result"), name).toBeVisible();
      await expect(page.getByTestId("stamp"), name).not.toHaveText("Checks out");
    }
  });
});

const info = (s: string) => {
  test.info().annotations.push({ type: "info", description: s });
  appendFileSync(resolve(OUT, "notes.txt"), `${test.info().title}: ${s}\n`);
};

test("1000-entry spin: frame times (report)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem("whirlpick:perf", "1"));
  await openApp(page, "/?duration=6");
  const text = Array.from({ length: 1000 }, (_, i) => `Entrant ${i + 1}`).join("\n");
  await page.getByTestId("entries").fill(text);
  await expect.poll(async () => (await snap(page)).entries.length).toBe(1000);
  await page.evaluate(() => {
    performance.clearMeasures("whirlpick:frame");
    const w = window as unknown as { __raf: number[]; __long: number[] };
    w.__raf = [];
    w.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: "longtask" });
    let last = performance.now();
    const loop = (t: number) => {
      w.__raf.push(t - last);
      last = t;
      if (w.__raf.length < 3000) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.getByTestId("spin").click();
  await expect(page.getByTestId("live")).toContainText("Winner", { timeout: 20_000 });
  const r = await page.evaluate(() => {
    const w = window as unknown as { __raf: number[]; __long: number[] };
    return { frames: performance.getEntriesByName("whirlpick:frame").map((e) => e.duration), raf: w.__raf.slice(2), long: w.__long };
  });
  const report = {
    draw: { n: r.frames.length, p50: pct(r.frames, 50), p95: pct(r.frames, 95), max: Math.max(...r.frames) },
    raf: { n: r.raf.length, p50: pct(r.raf, 50), p95: pct(r.raf, 95), max: Math.max(...r.raf), within20: r.raf.filter((x) => x <= 20).length / r.raf.length },
    longTasks: r.long,
  };
  writeFileSync(resolve(OUT, "perf-1000.json"), JSON.stringify(report, null, 2));
  info(JSON.stringify(report));
  expect(report.draw.p95).toBeLessThanOrEqual(8);
});

test("malformed .whirl.json imports fail cleanly and change nothing", async ({ page }, inf) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openApp(page);
  const before = await snap(page);
  const deep = "[".repeat(20000) + "]".repeat(20000);
  const files: [string, string][] = [
    ["not-json", "{ this is not json"],
    ["array", "[]"],
    ["empty-object", "{}"],
    ["version-99", JSON.stringify({ format: "whirlpick-project", version: 99, wheels: [] })],
    ["proto", `{"format":"whirlpick-project","version":1,"__proto__":{"polluted":1},"wheels":[{"entries":[{"label":"Ada"},{"label":"Grace"}],"__proto__":{"polluted":2}}]}`],
    ["deep", deep],
    ["label-object", JSON.stringify({ format: "whirlpick-project", version: 1, wheels: [{ entries: [{ label: { toString: 1 } }, { label: "B" }] }] })],
    ["binary", "\u0000\u0001\u0002PK\u0003\u0004"],
    ["huge-weights", JSON.stringify({ format: "whirlpick-project", version: 1, wheels: [{ entries: [{ label: "A", weight: 1e308 }, { label: "B", weight: -1 }] }] })],
  ];
  for (const [name, body] of files) {
    const f = inf.outputPath(`${name}.whirl.json`);
    writeFileSync(f, body);
    await page.getByTestId("saved").click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Open a file" }).click()]);
    await chooser.setFiles(f);
    await expect(page.getByTestId("import-errors").or(page.getByTestId("toast")), name).toBeVisible();
    expect((await snap(page)).entries, name).toEqual(before.entries);
    expect(await page.evaluate(() => (Object.prototype as Record<string, unknown>).polluted), name).toBeUndefined();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("no indexedDB at all: the app boots and saves via localStorage", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openApp(page);
  const s = await snap(page);
  info(`storage backend with indexedDB undefined: ${s.storage}`);
  expect(s.storage).not.toBe("idb");
  await spinAndWait(page);
  await closeWinner(page);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- XSS

const XSS = [`<img src=x onerror="window.__xss='img'">`, `"><svg onload="window.__xss='svg'"></svg>`, `</title><script>window.__xss='script'</script>`];
async function guard(page: Page) {
  const hits: string[] = [];
  page.on("dialog", (d) => {
    hits.push(`dialog:${d.message()}`);
    void d.dismiss();
  });
  page.on("pageerror", (e) => hits.push(`pageerror:${e}`));
  return hits;
}
async function assertInert(page: Page, where: string, hits: string[]) {
  const r = await page.evaluate(() => ({
    flag: (window as unknown as { __xss?: string }).__xss ?? null,
    imgs: document.querySelectorAll('img[src="x"], img[onerror], svg[onload], script:not([src]):not([type])').length,
    title: document.title,
  }));
  expect(r.flag, where).toBeNull();
  expect(r.imgs, where).toBe(0);
  expect(r.title.includes("<"), `${where} document.title ${r.title}`).toBe(false);
  expect(hits, where).toEqual([]);
}
// Inline scripts the build itself ships (theme-init is external; JSON-LD has a type) are excluded by the selector.

test.describe("XSS payloads render as text", () => {
  test("tool: entries, title, winner, receipt dialog, history, teams, share", async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const hits = await guard(page);
    await openApp(page);
    await page.getByTestId("entries").fill([...XSS, "Ada"].join("\n"));
    await expect.poll(async () => (await snap(page)).entries.length).toBe(4);
    await page.evaluate((t) => (window as unknown as { __whirlpick: { controller: { setSettings(p: unknown): void } } }).__whirlpick.controller.setSettings({ title: t }), XSS[0]);
    await assertInert(page, "editor", hits);
    for (let i = 0; i < 3; i++) {
      await spinAndWait(page);
      await assertInert(page, `winner ${i}`, hits);
      if (i === 0) {
        await page.locator("dialog.winner").getByRole("button", { name: "Receipt" }).click();
        await page.getByText("Receipt JSON").click();
        await expect(page.getByTestId("receipt-json")).toBeVisible();
        await assertInert(page, "receipt dialog", hits);
        await page.keyboard.press("Escape");
      }
      await closeWinner(page).catch(() => page.keyboard.press("Escape"));
    }
    await page.getByTestId("share").click();
    await expect(page.getByTestId("share-url")).toBeVisible();
    await assertInert(page, "share dialog", hits);
    const url = await page.getByTestId("share-url").inputValue();
    await page.keyboard.press("Escape");
    await page.evaluate(() => (window as unknown as { __whirlpick: { controller: { setSettings(p: unknown): void } } }).__whirlpick.controller.setSettings({ mode: "teams", teams: { by: "count", count: 2, balance: true } }));
    await page.getByTestId("split").click();
    await expect(page.getByTestId("teams-board")).toBeVisible();
    await assertInert(page, "teams", hits);
    // Open the shared link fresh.
    const p2 = await context.newPage();
    const hits2 = await guard(p2);
    await openApp(p2, url.replace(/^https?:\/\/[^/]+\//, "/"));
    await expect.poll(async () => (await snap(p2)).entries.map((e) => e.label)).toEqual([...XSS, "Ada"]);
    await assertInert(p2, "opened share link", hits2);
  });

  test("landing page with #names=, /verify/ with a hostile receipt, replay, embed", async ({ page }) => {
    test.setTimeout(90_000);
    const hits = await guard(page);
    const names = encodeURIComponent([...XSS, "Ada"].join("\n"));
    await openApp(page, `/random-name-picker/?duration=1#names=${names}`);
    await expect.poll(async () => (await snap(page)).entries.length).toBe(4);
    await spinAndWait(page);
    await assertInert(page, "landing", hits);

    const entries = normaliseEntries([...XSS, "Ada"]).entries;
    const r = buildReceipt({ entries, seed: "1a".repeat(32), mode: "single", title: XSS[2], publicInput: XSS[0], createdAt: "2026-01-01T00:00:00.000Z", app: XSS[1] });
    const code = await encodeReceiptCode(r);
    await page.goto(`/verify/#r=${code}`);
    await expect(page.getByTestId("stamp")).toHaveText("Checks out");
    await assertInert(page, "verify #r", hits);
    await page.goto("/verify/");
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
    await page.getByTestId("verify-input").fill(JSON.stringify({ ...r, title: XSS[1], app: XSS[0] }));
    await page.getByTestId("verify-check").click();
    await expect(page.getByTestId("verify-result")).toBeVisible();
    await assertInert(page, "verify pasted", hits);

    await openApp(page, `/?duration=1#spin=${code}`);
    await page.getByTestId("spin").click();
    await expect(page.locator("dialog.winner[open]")).toBeVisible({ timeout: 10_000 });
    await assertInert(page, "replay", hits);

    await page.goto(`/embed/?duration=1#names=${names}`);
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1" || !!(window as unknown as { __whirlpick?: unknown }).__whirlpick);
    await page.getByTestId("wheel").click();
    await expect(page.getByTestId("live")).toContainText(/Winner/, { timeout: 10_000 });
    await assertInert(page, "embed", hits);
  });
});

// ---------------------------------------------------------------- network on every route, phone width

const routes = (() => {
  const xml = readFileSync(resolve(ROOT, "apps/web/dist/sitemap.xml"), "utf8");
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  return [...paths, "/embed/", "/this-page-does-not-exist/"];
})();

test("no request leaves 127.0.0.1:4324 on any route (load, idle, and a spin on tool pages)", async ({ page }) => {
  test.setTimeout(180_000);
  const off: string[] = [];
  const afterLoad: string[] = [];
  let loaded = false;
  page.on("request", (req) => {
    const u = req.url();
    if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) off.push(u);
    else if (loaded && u.startsWith(BASE)) afterLoad.push(new URL(u).pathname);
  });
  for (const r of routes) {
    loaded = false;
    await page.goto(r + (r.includes("?") ? "&" : "?") + "duration=1", { waitUntil: "load" });
    loaded = true;
    await page.waitForTimeout(700);
    const hasSpin = await page.getByTestId("spin").count();
    if (hasSpin && r !== "/this-page-does-not-exist/") {
      await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready === true, null, { timeout: 8000 }).catch(() => {});
      const enabled = await page.getByTestId("spin").isEnabled().catch(() => false);
      if (enabled) {
        await page.getByTestId("spin").click();
        await page.waitForTimeout(1800);
        await page.keyboard.press("Escape");
      }
    }
  }
  const unexpected = [...new Set(afterLoad)].filter((p) => !/^\/(assets\/|sw\.js$|icons\/|favicon|manifest|og\.png|theme-init\.js)/.test(p) && !routes.includes(p));
  writeFileSync(resolve(OUT, "network.json"), JSON.stringify({ routes, off, afterLoad: [...new Set(afterLoad)], unexpected }, null, 2));
  expect(off).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("390 px phone: no sideways scroll on any route", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const bad: string[] = [];
  for (const r of routes) {
    await page.goto(r, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    if (m.sw > m.iw) bad.push(`${r} ${m.sw}>${m.iw}`);
  }
  await ctx.close();
  expect(bad).toEqual([]);
});

// ---------------------------------------------------------------- embed: messages from a sibling frame, support never

test.describe("embed hardening", () => {
  const PORT = 4326;
  const PARENT = `http://127.0.0.1:${PORT}`;
  let server: Server;
  let body = "";
  test.beforeAll(async () => {
    server = createServer((_q, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(body);
    });
    await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", () => r()));
  });
  test.afterAll(async () => new Promise<void>((r) => server.close(() => r())));
  test.describe.configure({ mode: "serial" });

  test("a sibling frame (not the parent) cannot drive an embed without ?origin; no support line after 4 spins", async ({ page }) => {
    test.setTimeout(60_000);
    body = `<!doctype html><html><body>
      <iframe id="f" src="${BASE}/embed/?duration=1#names=Ada%0AGrace%0ALinus" style="width:500px;height:500px;border:0"></iframe>
      <iframe id="g" srcdoc="<script>window.hit=()=>parent.frames[0].postMessage({source:'whirlpick',v:1,type:'spin',requestId:'evil'},'*')</script>"></iframe>
      <script>window.msgs=[];addEventListener("message",(e)=>{if(e.data&&e.data.source==="whirlpick")window.msgs.push(e.data)});
      window.send=(m)=>document.getElementById("f").contentWindow.postMessage(Object.assign({source:"whirlpick",v:1},m),"*");</script></body></html>`;
    await page.goto(`${PARENT}/p.html`);
    const msgs = () => page.evaluate(() => (window as unknown as { msgs: { type: string; requestId?: string }[] }).msgs);
    await expect.poll(async () => (await msgs()).some((m) => m.type === "ready"), { timeout: 10_000 }).toBe(true);
    await page.evaluate(() => ((document.getElementById("g") as HTMLIFrameElement).contentWindow as unknown as { hit(): void }).hit());
    await page.waitForTimeout(1500);
    expect((await msgs()).filter((m) => m.type !== "ready")).toEqual([]);
    for (let i = 0; i < 4; i++) {
      await page.evaluate((k) => (window as unknown as { send(m: unknown): void }).send({ type: "spin", requestId: `s${k}` }), i);
      await expect.poll(async () => (await msgs()).filter((m) => m.type === "result").length, { timeout: 10_000 }).toBe(i + 1);
      await page.waitForTimeout(400);
    }
    const frame = page.frameLocator("#f");
    await expect(frame.getByTestId("support-ask")).toHaveCount(0);
    await expect(frame.getByText(/Support it\?/)).toHaveCount(0);
  });
});

test("support ask: exactly once per tab session, also across a reload", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  const seen: number[] = [];
  for (let i = 1; i <= 6; i++) {
    if (i === 4) await openApp(page); // reload mid-session
    await spinAndWait(page);
    if (await page.getByTestId("support-ask").count()) seen.push(i);
    await closeWinner(page);
  }
  expect(seen).toEqual([3]);
});
