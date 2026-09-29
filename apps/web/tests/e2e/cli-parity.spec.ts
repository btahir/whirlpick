import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeWinner, openApp, setEntries } from "./helpers";

const CLI = resolve(import.meta.dirname, "../../../../packages/cli/bin/whirlpick.js");
const NAMES = ["Ada", "Grace", "Linus", "Margaret", "Priya", "Tomas", "Amara", "Kenji"];
const strip = (r: Record<string, unknown>) => {
  // The web's fair-draw receipts also record when and on which list the seed was committed;
  // `spin --seed` has no commit step, so those two informational fields differ by design.
  const { createdAt: _c, app: _a, committedAt: _t, committedWheelHash: _w, ...rest } = r;
  return rest;
};
const cli = (args: string[]) => JSON.parse(execFileSync("node", [CLI, ...args, "--json"], { encoding: "utf8", env: { ...process.env, WHIRLPICK_FIXED_NOW: "2026-01-01T00:00:00.000Z" } }));

test("browser receipts equal the CLI's for 10 seeds across single, multi 3 and teams (I9)", async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page, "/?duration=1");
  await setEntries(page, NAMES);
  await page.getByRole("switch", { name: /Fair draw/ }).click();
  const receiptFromDialog = async () => {
    await page.getByTestId("copy-receipt").click();
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    await page.keyboard.press("Escape");
    return JSON.parse(txt) as Record<string, unknown>;
  };
  for (let k = 0; k < 10; k++) {
    const seed = ((k * 37 + 11) % 256).toString(16).padStart(2, "0").repeat(32);
    const kind = k % 3 === 0 ? "single" : k % 3 === 1 ? "multi" : "teams";
    await page.evaluate((m) => (window as unknown as { __whirlpick: { controller: { setSettings(p: unknown): void } } }).__whirlpick.controller.setSettings(m === "single" ? { mode: "normal" } : m === "multi" ? { mode: "multi", multi: { count: 3, reveal: "instant" } } : { mode: "teams", teams: { by: "count", count: 3, balance: true } }), kind);
    await page.getByRole("button", { name: "Fair draw details" }).click();
    await page.getByText("Use my own seed").click();
    await page.getByTestId("custom-seed").fill(seed);
    await page.getByTestId("use-seed").click();
    await page.keyboard.press("Escape");
    let web: Record<string, unknown>;
    if (kind === "teams") {
      await page.getByTestId("split").click();
      await page.getByRole("button", { name: "Receipt" }).click();
      web = await receiptFromDialog();
    } else {
      await page.getByTestId("spin").click();
      await expect(page.locator("dialog.winner[open]")).toBeVisible({ timeout: 12_000 });
      await page.locator("dialog.winner").getByRole("button", { name: "Receipt" }).click();
      web = await receiptFromDialog();
      await closeWinner(page).catch(() => {});
    }
    const title = String(web.title);
    const args = kind === "teams" ? ["teams", "--entries", NAMES.join(","), "--teams", "3", "--balance", "--seed", seed, "--title", title] : ["spin", "--entries", NAMES.join(","), "--seed", seed, "--title", title, ...(kind === "multi" ? ["--count", "3"] : [])];
    const out = cli(args);
    const mine = kind === "teams" ? out.receipt : out.receipts[0];
    expect(strip(web), `seed ${k} ${kind}`).toEqual(strip(mine));
  }
});
