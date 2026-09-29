import { expect, test } from "@playwright/test";
import { closeWinner, NAMES12, openApp, setEntries, snap, spinAndWait } from "./helpers";

test.describe("paste, spin, announce (I1)", () => {
  test("button spin announces a pasted name and focuses Spin again", async ({ page }) => {
    await openApp(page);
    await setEntries(page, NAMES12);
    const t0 = Date.now();
    await spinAndWait(page);
    expect(Date.now() - t0).toBeLessThan(1000 + 180 + 1500 + 1000);
    const live = await page.getByTestId("live").textContent();
    const name = live!.replace(/^Winner: /, "").trim();
    expect(NAMES12).toContain(name);
    await expect(page.getByTestId("spin-again")).toBeFocused();
    await expect(page.getByTestId("winner-name")).toHaveText(name);
  });

  test("Space on the focused wheel spins", async ({ page }) => {
    await openApp(page);
    await spinAndWait(page, { via: "space" });
  });

  test("Ctrl+Enter from inside the textarea spins", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("entries").click();
    await spinAndWait(page, { via: "ctrl" });
  });

  test("the spin button is disabled below two entries", async ({ page }) => {
    await openApp(page);
    await setEntries(page, ["Ada"]);
    await expect(page.getByTestId("spin")).toBeDisabled();
    await expect(page.getByTestId("spin")).toContainText("Add one more name");
  });
});

test.describe("support moment (I17)", () => {
  test("the quiet ask appears after the third spin only, and links to /support/", async ({ page }) => {
    await openApp(page);
    for (let i = 1; i <= 5; i++) {
      await spinAndWait(page);
      const ask = page.getByTestId("support-ask");
      if (i === 3) {
        await expect(ask).toBeVisible();
        await expect(ask).toContainText("Whirlpick is free and ad-free. Support it?");
        await expect(ask.locator("a")).toHaveAttribute("href", "/support/");
        // It is a line inside the winner plate, never a dialog of its own.
        await expect(page.locator("dialog[open]")).toHaveCount(1);
      } else await expect(ask).toHaveCount(0);
      await closeWinner(page);
    }
  });

  test("never in stream mode", async ({ page }) => {
    await openApp(page, "/?stream=1&duration=1");
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("wheel").click();
      await expect(page.getByTestId("live")).toContainText(/Winner/, { timeout: 12_000 });
      await page.waitForTimeout(300);
    }
    await expect(page.getByTestId("support-ask")).toHaveCount(0);
    await expect(page.locator("dialog.winner[open]")).toHaveCount(0);
  });
});

test.describe("synth (K1)", () => {
  test("tick, win and start render cleanly offline", async ({ page }) => {
    await openApp(page);
    const out = await page.evaluate(async () => {
      const w = (window as unknown as { __whirlpick: { renderVoiceOffline(n: string): Promise<{ samples: Float32Array; duration: number }> } }).__whirlpick;
      const res: Record<string, { peak: number; rms: number; nan: boolean; duration: number; tail: number }> = {};
      for (const n of ["tick", "win", "start"]) {
        const { samples, duration } = await w.renderVoiceOffline(n);
        let peak = 0;
        let sum = 0;
        let nan = false;
        for (const x of samples) {
          if (Number.isNaN(x)) nan = true;
          peak = Math.max(peak, Math.abs(x));
          sum += x * x;
        }
        // Energy after the scheduled end (should be near silence).
        const end = Math.ceil(duration * 48000) + 2400;
        let tail = 0;
        for (let i = end; i < samples.length; i++) tail = Math.max(tail, Math.abs(samples[i]!));
        res[n] = { peak, rms: Math.sqrt(sum / samples.length), nan, duration, tail };
      }
      return res;
    });
    for (const [n, r] of Object.entries(out)) {
      expect(r.nan, n).toBe(false);
      expect(r.peak, n).toBeLessThanOrEqual(0.9);
      expect(r.rms, n).toBeGreaterThan(0.001);
    }
    expect(out.tick!.duration).toBeLessThanOrEqual(0.03 + 0.02);
    expect(out.win!.duration).toBeGreaterThanOrEqual(0.7);
    expect(out.win!.duration).toBeLessThanOrEqual(1.1);
  });
});

test("a custom colour below 4.5:1 warns in the editor (J3)", async ({ page }) => {
  await openApp(page);
  await page.locator(".chip-hit").first().click();
  await page.getByLabel("Hex").fill("#767676");
  await expect(page.getByText("Labels get an outline on this colour.")).toBeVisible();
  expect((await snap(page)).entries[0]!).toMatchObject({ label: "Ada" });
});
