import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeWinner, openApp, snap, spinAndWait } from "./helpers";

const CLI = resolve(import.meta.dirname, "../../../../packages/cli/bin/whirlpick.js");

async function exportActive(page: import("@playwright/test").Page): Promise<string> {
  await page.getByRole("button", { name: "More entry options" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Export this wheel (.whirl.json)" }).click()]);
  return (await dl.path())!;
}

test("export → import in a fresh browser gives the same project; the CLI validates it (I8)", async ({ page, browser }, info) => {
  await openApp(page);
  await page.evaluate(async () => {
    const w = (window as unknown as { __whirlpick: { controller: { store: { getState(): { wheels: { id: string; entries: { id: string }[] }[]; activeId: string } }; setEntryImage(id: string, f: File): Promise<void> } } }).__whirlpick;
    const st = w.controller.store.getState();
    const id = st.wheels.find((x) => x.id === st.activeId)!.entries[0]!.id;
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    c.getContext("2d")!.fillRect(0, 0, 16, 16);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    await w.controller.setEntryImage(id, new File([blob], "a.png", { type: "image/png" }));
  });
  await spinAndWait(page);
  await closeWinner(page);
  const file = await exportActive(page);
  const exported = JSON.parse(readFileSync(file, "utf8"));
  expect(Object.keys(exported.images)).toHaveLength(1);
  expect(exported.history).toHaveLength(1);
  const copy = info.outputPath("wheel.whirl.json");
  writeFileSync(copy, readFileSync(file));
  const out = JSON.parse(execFileSync("node", [CLI, "validate", copy, "--json"], { encoding: "utf8" }));
  expect(out.valid).toBe(true);

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await openApp(p, "/");
  await p.getByTestId("saved").click();
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: "Open a file" }).click()]);
  await chooser.setFiles(copy);
  await expect.poll(async () => (await snap(p)).entries.length).toBe(exported.wheels[0].entries.length);
  const again = JSON.parse(readFileSync(await exportActive(p), "utf8"));
  expect(again.wheels).toEqual(exported.wheels);
  expect(again.images).toEqual(exported.images);
  expect(again.history).toEqual(exported.history);
  await ctx.close();
});

test("a bad file shows the error with the entry position and changes nothing (I8)", async ({ page }, info) => {
  await openApp(page);
  const before = await snap(page);
  const bad = info.outputPath("bad.whirl.json");
  writeFileSync(bad, JSON.stringify({ format: "whirlpick-project", version: 1, wheels: [{ entries: [{ label: "Ada" }, { label: "Grace", weight: 0 }] }] }));
  await page.getByTestId("saved").click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Open a file" }).click()]);
  await chooser.setFiles(bad);
  await expect(page.getByTestId("import-errors")).toContainText("Wheel 1, entry 2");
  expect((await snap(page)).entries).toEqual(before.entries);
});
