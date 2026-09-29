import { expect, type Page } from "@playwright/test";

export type Snapshot = {
  ready: boolean;
  phase: string;
  entries: { label: string; weight: number; enabled: boolean; tags?: string[] }[];
  excluded: number[];
  history: { id: string; receipt: Record<string, unknown> }[];
  mode: string;
  dialog: string | null;
  storage: string;
  last: { label: string; index: number }[];
};

/** Open a tool page and wait until the controller has booted. */
export async function openApp(page: Page, path = "/?duration=1") {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __whirlpick?: { store: { getState(): { ready: boolean } } } }).__whirlpick?.store.getState().ready === true);
}

export async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const w = (window as unknown as { __whirlpick: { store: { getState(): any } } }).__whirlpick;
    const s = w.store.getState();
    const wheel = s.wheels.find((x: { id: string }) => x.id === s.activeId);
    return {
      ready: s.ready,
      phase: s.spin.phase,
      entries: wheel.entries,
      excluded: (s.sessions[s.activeId]?.excluded ?? []) as number[],
      history: (s.history[s.activeId] ?? []) as { id: string; receipt: Record<string, unknown> }[],
      mode: wheel.settings.mode,
      dialog: s.ui.dialog?.kind ?? null,
      storage: s.storage,
      last: (s.last?.picks ?? []).map((p: { label: string; index: number }) => ({ label: p.label, index: p.index })),
    };
  });
}

/** Replace the entries by typing into the editor textarea (the real input path). */
export async function setEntries(page: Page, names: string[]) {
  const ta = page.getByTestId("entries");
  await ta.click();
  await ta.press("ControlOrMeta+a");
  await ta.press("Delete");
  await ta.fill(names.join("\n"));
  await expect.poll(async () => (await snap(page)).entries.map((e) => e.label).join("|")).toBe(names.join("|"));
}

export async function spinAndWait(page: Page, opts: { via?: "button" | "wheel" | "space" | "ctrl" } = {}) {
  const via = opts.via ?? "button";
  if (via === "button") await page.getByTestId("spin").click();
  else if (via === "wheel") await page.getByTestId("wheel").click();
  else if (via === "space") {
    await page.getByTestId("wheel").focus();
    await page.keyboard.press("Space");
  } else await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("live")).toContainText(/Winner/, { timeout: 12_000 });
  await expect(page.locator("dialog.winner[open]")).toBeVisible();
}

export async function closeWinner(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.winner[open]")).toHaveCount(0);
}

export const NAMES12 = ["Ada", "Grace", "Linus", "Margaret", "Priya", "Tomas", "Amara", "Kenji", "Sofia", "Mateo", "Zara", "Oskar"];
