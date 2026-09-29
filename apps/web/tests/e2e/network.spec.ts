import { expect, test } from "@playwright/test";
import { openApp, setEntries, spinAndWait, closeWinner } from "./helpers";

// Every request from navigation onward (ACCEPTANCE N1). Allowed: this origin only, and after the
// load event only build assets (lazy chunks, fonts, icons), the manifest, the worker and pages.
const ALLOWED_AFTER_LOAD = /^\/(assets\/|icons\/|brand\/|favicon\.svg|manifest\.webmanifest|sw\.js|theme-init\.js|$|[a-z0-9-]+\/$|verify\/|docs\/agents\/|404\.html)/;

test("no request leaves the origin, and nothing but build files after load (N1)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const bad: string[] = [];
  let loaded = false;
  context.on("request", (req) => {
    const u = new URL(req.url());
    if (u.protocol === "data:" || u.protocol === "blob:") return;
    if (u.host !== "127.0.0.1:4324") bad.push(`foreign: ${req.url()}`);
    else if (loaded && !ALLOWED_AFTER_LOAD.test(u.pathname)) bad.push(`after load: ${u.pathname}`);
  });
  page.on("load", () => (loaded = true));
  await openApp(page, "/?duration=1");
  await setEntries(page, ["Ada", "Grace", "Linus", "Margaret"]);
  await page.getByTestId("mute").click();
  await page.getByTestId("mute").click();
  await spinAndWait(page);
  await closeWinner(page);
  await page.getByTestId("share").click();
  await page.getByTestId("copy-link").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("tab-teams").click();
  await page.getByTestId("split").click();
  await page.getByTestId("tab-results").click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
  await dl.path();
  loaded = false;
  await page.goto("/random-name-picker/");
  await page.waitForLoadState("load");
  loaded = false;
  await page.goto("/verify/");
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
  await page.getByTestId("verify-input").fill("{}");
  await page.getByTestId("verify-check").click();
  await page.waitForTimeout(500);
  expect(bad).toEqual([]);
});
