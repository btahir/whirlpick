// Dev helper: screenshots of pages at desktop/phone in light/dark (installed Chrome, headless).
//   node scripts/dev/shoot.mjs <outDir> <base> <path>[,<path>…] [actions]
// Run it through research/heavy.sh.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [out = "shots", base = "http://127.0.0.1:4323", paths = "/", mode = ""] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const sizes = (process.env.SIZES ?? "desktop,phone").split(",");
const schemes = (process.env.SCHEMES ?? "light,dark").split(",");
const errors = [];
for (const p of paths.split(",")) {
  for (const size of sizes) {
    for (const scheme of schemes) {
      const ctx = await browser.newContext({
        viewport: size === "phone" ? { width: 390, height: 844 } : size === "tablet" ? { width: 820, height: 1180 } : { width: 1440, height: 900 },
        deviceScaleFactor: size === "phone" ? 2 : 1,
        colorScheme: scheme,
        isMobile: size === "phone",
        hasTouch: size === "phone",
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`${p} ${size} ${scheme}: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`${p} ${size} ${scheme} console: ${m.text()}`));
      await page.goto(base + p, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      if (mode.includes("spin")) {
        await page.getByTestId("spin").click();
        await page.waitForTimeout(Number(process.env.WAIT ?? 2600));
      }
      if (mode.includes("dialog:")) {
        const k = mode.split("dialog:")[1];
        await page.evaluate((k) => window.__whirlpick?.controller.openDialog(k), k);
        await page.waitForTimeout(500);
      }
      const name = `${p.replace(/[^a-z0-9]+/gi, "_") || "home"}-${size}-${scheme}${mode ? "-" + mode.replace(/[^a-z0-9]+/gi, "_") : ""}.png`;
      await page.screenshot({ path: `${out}/${name}`, fullPage: process.env.FULL === "1" });
      await ctx.close();
    }
  }
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no page errors");
