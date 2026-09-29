import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { verifyReceipt } from "@whirlpick/core";

// The parent is a real page on another local origin (a second port): Chrome's local network
// checks block public or synthetic origins from framing 127.0.0.1.
const PORT = 4325;
const PARENT = `http://127.0.0.1:${PORT}`;
const EMBED = "http://127.0.0.1:4324/embed/";
let server: Server;
let body = "";
test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", () => r()));
});
test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
test.describe.configure({ mode: "serial" });

async function parentWith(page: Page, origin: string) {
  body = `<!doctype html><html><body><iframe id="f" src="${EMBED}?duration=1#names=Ada%0AGrace%0ALinus&origin=${encodeURIComponent(origin)}" style="width:600px;height:600px;border:0"></iframe>
      <script>window.msgs=[];addEventListener("message",(e)=>{if(e.data&&e.data.source==="whirlpick")window.msgs.push(e.data)});
      window.send=(m)=>document.getElementById("f").contentWindow.postMessage(Object.assign({source:"whirlpick",v:1},m),"*");</script></body></html>`;
  await page.goto(`${PARENT}/embed-parent.html`);
}
const msgs = (page: Page) => page.evaluate(() => (window as unknown as { msgs: { type: string; [k: string]: unknown }[] }).msgs);
const send = (page: Page, m: Record<string, unknown>) => page.evaluate((x) => (window as unknown as { send(m: unknown): void }).send(x), m);

test("embed API: ready, setEntries, spin → spinStart + result, getState, BUSY (I15)", async ({ page }) => {
  await parentWith(page, PARENT);
  await expect.poll(async () => (await msgs(page)).some((m) => m.type === "ready"), { timeout: 10_000 }).toBe(true);
  const ready = (await msgs(page)).find((m) => m.type === "ready")!;
  expect(ready).toMatchObject({ version: "0.1.0", entries: 3 });
  await send(page, { type: "setEntries", entries: ["Red", "Green", { label: "Blue", weight: 2 }], requestId: "a" });
  await send(page, { type: "spin", requestId: "s1" });
  await send(page, { type: "spin", requestId: "s2" });
  await expect.poll(async () => (await msgs(page)).some((m) => m.type === "result"), { timeout: 10_000 }).toBe(true);
  const all = await msgs(page);
  const start = all.findIndex((m) => m.type === "spinStart");
  const result = all.findIndex((m) => m.type === "result");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(result).toBeGreaterThan(start);
  const r = all[result]!;
  expect(r.requestId).toBe("s1");
  expect(verifyReceipt(r.receipt).status).toBe("valid");
  expect(["Red", "Green", "Blue"]).toContain((r.winners as { label: string }[])[0]!.label);
  expect(all.some((m) => m.type === "error" && m.code === "BUSY" && m.requestId === "s2")).toBe(true);
  await send(page, { type: "getState", requestId: "g" });
  await expect.poll(async () => (await msgs(page)).some((m) => m.type === "state" && m.requestId === "g")).toBe(true);
  const st = (await msgs(page)).find((m) => m.type === "state" && m.requestId === "g")!;
  expect((st.entries as { label: string }[]).map((e) => e.label)).toEqual(["Red", "Green", "Blue"]);

  // No editor, header or support line; nothing stored.
  const frame = page.frameLocator("#f");
  await expect(frame.locator("textarea")).toHaveCount(0);
  await expect(frame.locator(".tool-hdr")).toHaveCount(0);
  await expect(frame.getByText("Support it?")).toHaveCount(0);
  const f = page.frames().find((x) => x.url().startsWith(EMBED))!;
  const dbs = await f.evaluate(async () => ((await indexedDB.databases?.()) ?? []).map((d) => d.name));
  expect(dbs).not.toContain("whirlpick");
  // A message from the frame itself (not its parent) is ignored.
  const before = (await msgs(page)).length;
  await f.evaluate(() => window.postMessage({ source: "whirlpick", v: 1, type: "spin" }, "*"));
  await page.waitForTimeout(600);
  expect((await msgs(page)).length).toBe(before);
});

test("with ?origin set to another site, the embed ignores this parent (I15)", async ({ page }) => {
  await parentWith(page, "http://other.test");
  await page.waitForTimeout(1500);
  await send(page, { type: "getState", requestId: "x" });
  await page.waitForTimeout(800);
  expect(await msgs(page)).toEqual([]);
});
