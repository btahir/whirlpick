import { expect, test } from "@playwright/test";
import { openApp, snap } from "./helpers";

type TeamsView = { result: { teams: number[][]; repeatPairs: number }; error: string | null; receipt: { result: { repeatPairs?: number } } };
const view = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __whirlpick: { store: { getState(): { teams: unknown } } } }).__whirlpick.store.getState().teams as TeamsView | null);

test.describe("teams (I4)", () => {
  test("16 tagged entries split into 4 balanced teams", async ({ page }) => {
    await openApp(page, "/random-team-generator/");
    await page.getByTestId("split").click();
    await expect(page.locator(".team")).toHaveCount(4);
    const v = (await view(page))!;
    expect(v.result.teams.map((t) => t.length)).toEqual([4, 4, 4, 4]);
    const entries = (await snap(page)).entries;
    const tags = [...new Set(entries.map((e) => e.tags![0]!))];
    for (const tag of tags) {
      const counts = v.result.teams.map((t) => t.filter((i) => entries[i]!.tags![0] === tag).length);
      expect(Math.max(...counts) - Math.min(...counts), `tag ${tag}`).toBeLessThanOrEqual(1);
    }
    await expect(page.getByTestId("live")).toContainText("4 teams made");
  });

  test("keep apart and keep together are honoured; an impossible rule explains itself", async ({ page }) => {
    await openApp(page, "/random-team-generator/");
    const e = (await snap(page)).entries;
    await page.locator("details.rules > summary").click();
    const pick = async (names: string[]) => {
      for (const n of names) await page.locator(".rule-picker label", { hasText: new RegExp(`^${n}$`) }).click();
    };
    await pick([e[0]!.label, e[1]!.label]);
    await page.getByRole("button", { name: /Add rule/ }).click();
    await page.getByRole("radio", { name: "Keep together" }).click();
    await pick([e[2]!.label, e[3]!.label]);
    await page.getByRole("button", { name: /Add rule/ }).click();
    await page.getByTestId("split").click();
    await expect(page.locator(".team")).toHaveCount(4);
    const v = (await view(page))!;
    const teamOf = (i: number) => v.result.teams.findIndex((t) => t.includes(i));
    expect(teamOf(0)).not.toBe(teamOf(1));
    expect(teamOf(2)).toBe(teamOf(3));
    // Five people kept apart with only four teams can't work.
    await page.getByRole("radio", { name: "Keep apart" }).click();
    await pick(e.slice(4, 9).map((x) => x.label));
    await page.getByRole("button", { name: /Add rule/ }).click();
    await page.getByTestId("split").click();
    await expect(page.getByTestId("teams-error")).toContainText(/keep-apart rule names more people than there are teams/i);
  });

  test("new round avoids repeat teammates; copy as CSV; fullscreen opens and closes", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openApp(page, "/random-team-generator/");
    await page.getByTestId("split").click();
    await expect(page.locator(".team")).toHaveCount(4);
    await page.getByTestId("new-round").click();
    await expect.poll(async () => (await view(page))!.result.repeatPairs).toBe(0);
    expect((await view(page))!.receipt.result.repeatPairs).toBe(0);
    await page.getByTestId("copy-csv").click();
    const csv = await page.evaluate(() => navigator.clipboard.readText());
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("team,name,tags");
    expect(lines).toHaveLength(17);
    expect(lines[1]).toMatch(/^Team \d,[^,]+,\d$/);
    await page.getByRole("button", { name: "Fullscreen" }).click();
    await expect(page.locator("dialog.teams-full[open]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.teams-full[open]")).toHaveCount(0);
  });
});
