// Dev helper: screenshots of every major state (light/dark × desktop/phone) for visual review.
//   node scripts/dev/tour.mjs <outDir> [base=http://127.0.0.1:4324] [only=name,name]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [out = "tour", base = "http://127.0.0.1:4324", onlyArg = ""] = process.argv.slice(2);
const only = onlyArg ? new Set(onlyArg.split(",")) : null;
mkdirSync(out, { recursive: true });
const ready = (p) => p.waitForFunction(() => window.__whirlpick?.store.getState().ready === true);
const c = (p, fn, arg) => p.evaluate(fn, arg);

const STATES = {
  home: async (p) => { await p.goto(base + "/"); await ready(p); },
  winner: async (p) => { await p.goto(base + "/?duration=1"); await ready(p); await p.getByTestId("spin").click(); await p.waitForTimeout(2400); },
  teams: async (p) => { await p.goto(base + "/random-team-generator/"); await ready(p); await p.getByTestId("split").click(); await p.waitForTimeout(1500); },
  share: async (p) => { await p.goto(base + "/"); await ready(p); await c(p, () => window.__whirlpick.controller.openDialog("share")); await p.waitForTimeout(600); },
  receipt: async (p) => { await p.goto(base + "/?duration=1"); await ready(p); await p.getByTestId("spin").click(); await p.waitForTimeout(2300); await p.keyboard.press("Escape"); await c(p, () => { const s = window.__whirlpick.store.getState(); window.__whirlpick.controller.openDialog("receipt", s.history[s.activeId][0].id); }); await p.waitForTimeout(500); },
  drawer: async (p) => { await p.goto(base + "/"); await ready(p); await c(p, () => window.__whirlpick.controller.openDialog("wheels")); await p.waitForTimeout(500); },
  fair: async (p) => { await p.goto(base + "/raffle-winner-picker/"); await ready(p); await p.waitForTimeout(300); },
  fairdialog: async (p) => { await p.goto(base + "/raffle-winner-picker/"); await ready(p); await c(p, () => window.__whirlpick.controller.openDialog("fair")); await p.waitForTimeout(500); },
  customise: async (p) => { await p.goto(base + "/"); await ready(p); await c(p, () => window.__whirlpick.controller.openDialog("customise")); await p.waitForTimeout(500); },
  details: async (p) => { await p.goto(base + "/"); await ready(p); await c(p, () => window.__whirlpick.controller.openDialog("details")); await p.waitForTimeout(500); },
  presenter: async (p) => { await p.goto(base + "/?presenter=1"); await ready(p); await p.waitForTimeout(400); },
  stream: async (p) => { await p.goto(base + "/?stream=1&bg=00B140&duration=1"); await ready(p); await p.getByTestId("wheel").click(); await p.waitForTimeout(2400); },
  embed: async (p) => { await p.goto(base + "/embed/#names=Ada%0AGrace%0ALinus%0AMargaret"); await ready(p); await p.waitForTimeout(300); },
  dense: async (p) => { await p.goto(base + "/?preset=numbers&min=1&max=1000"); await ready(p); await p.waitForTimeout(400); },
  mystery: async (p) => { await p.goto(base + "/?mystery=1"); await ready(p); await p.waitForTimeout(300); },
  empty: async (p) => { await p.goto(base + "/?preset=blank"); await ready(p); await p.waitForTimeout(300); },
  verifyok: async (p) => { await p.goto(base + "/?duration=1"); await ready(p); await p.getByTestId("spin").click(); await p.waitForTimeout(2300); const url = await c(p, () => { const s = window.__whirlpick.store.getState(); return window.__whirlpick.controller.verifyUrl(s.history[s.activeId][0].id); }); await p.goto(url); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector(".verify-out")?.scrollIntoView()); await p.waitForTimeout(200); },
  landing: async (p) => { await p.goto(base + "/yes-or-no-wheel/"); await ready(p); await p.waitForTimeout(300); },
  support: async (p) => { await p.goto(base + "/support/"); await p.waitForTimeout(300); },
  elim: async (p) => { await p.goto(base + "/classroom-name-picker/?duration=1"); await ready(p); await p.getByTestId("spin").click(); await p.waitForTimeout(3800); },
  multi: async (p) => { await p.goto(base + "/raffle-winner-picker/?duration=1"); await ready(p); await p.getByTestId("spin").click(); await p.waitForTimeout(2600); },
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const sizes = (process.env.SIZES ?? "desktop,phone").split(",");
const schemes = (process.env.SCHEMES ?? "light,dark").split(",");
const errors = [];
for (const [name, fn] of Object.entries(STATES)) {
  if (only && !only.has(name)) continue;
  for (const size of sizes)
    for (const scheme of schemes) {
      const ctx = await browser.newContext({ viewport: size === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: size === "phone" ? 2 : 1, colorScheme: scheme, isMobile: size === "phone", hasTouch: size === "phone" });
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(`${name} ${size} ${scheme}: ${e.message}`));
      try {
        await fn(p);
        await p.screenshot({ path: `${out}/${name}-${size}-${scheme}.png` });
      } catch (e) {
        errors.push(`${name} ${size} ${scheme}: ${e.message.split("\n")[0]}`);
      }
      await ctx.close();
    }
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "tour ok");
