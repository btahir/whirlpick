// Bundle budget (PLAN §6.14, ACCEPTANCE M1). Reads dist/.vite/manifest.json and prints every
// figure. Initial JS = the entry chunk plus everything the home page loads before it is
// interactive: the tool's boot chunk and all of its static imports (they are modulepreloaded).
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = resolve(import.meta.dirname, "..", process.argv[2] ?? "dist");
type Chunk = { file: string; imports?: string[]; dynamicImports?: string[]; isEntry?: boolean; css?: string[]; src?: string; name?: string };
const manifest = JSON.parse(readFileSync(resolve(DIST, ".vite/manifest.json"), "utf8")) as Record<string, Chunk>;
const gz = (f: string) => gzipSync(readFileSync(resolve(DIST, f)), { level: 9 }).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

const LIMITS = { js: 150 * 1024, css: 25 * 1024, fonts: 120 * 1024 };
const entryKey = Object.keys(manifest).find((k) => manifest[k]!.isEntry)!;
const bootKey = Object.keys(manifest).find((k) => k.endsWith("src/app/boot.tsx"))!;
const seen = new Set<string>();
const walk = (k: string) => {
  const c = manifest[k];
  if (!c || seen.has(c.file)) return;
  seen.add(c.file);
  for (const i of c.imports ?? []) walk(i);
};
walk(entryKey);
walk(bootKey);
const initial = [...seen];
const jsTotal = initial.reduce((a, f) => a + gz(f), 0);
const cssFiles = new Set<string>();
for (const k of Object.keys(manifest)) if (seen.has(manifest[k]!.file)) for (const c of manifest[k]!.css ?? []) cssFiles.add(c);
const cssTotal = [...cssFiles].reduce((a, f) => a + gz(f), 0);
const html = readFileSync(resolve(DIST, "index.html"), "utf8");
const fontFiles = [...html.matchAll(/<link rel="preload" href="\/([^"]+\.woff2)"/g)].map((m) => m[1]!);
const fontsTotal = fontFiles.reduce((a, f) => a + statSync(resolve(DIST, f)).size, 0);
const lazy = Object.values(manifest).filter((c) => !seen.has(c.file) && c.file.endsWith(".js"));
const qr = lazy.find((c) => /(^|\/)qr-/.test(c.file) || c.src?.includes("/qr/"));

console.log("Initial JS (gzip):");
for (const f of initial) console.log(`  ${f.padEnd(44)} ${kb(gz(f))}`);
console.log(`  total ${kb(jsTotal)} / ${kb(LIMITS.js)}`);
console.log(`Initial CSS (gzip, inlined into each page): ${kb(cssTotal)} / ${kb(LIMITS.css)}`);
console.log(`Preloaded fonts: ${fontFiles.join(", ")} = ${kb(fontsTotal)} / ${kb(LIMITS.fonts)}`);
console.log("Lazy chunks (gzip):");
for (const c of lazy) console.log(`  ${c.file.padEnd(44)} ${kb(gz(c.file))}`);

const fails: string[] = [];
if (jsTotal > LIMITS.js) fails.push(`initial JS ${kb(jsTotal)} > ${kb(LIMITS.js)}`);
if (cssTotal > LIMITS.css) fails.push(`initial CSS ${kb(cssTotal)} > ${kb(LIMITS.css)}`);
if (fontsTotal > LIMITS.fonts) fails.push(`preloaded fonts ${kb(fontsTotal)} > ${kb(LIMITS.fonts)}`);
if (!fontFiles.length) fails.push("no preloaded fonts found in dist/index.html");
if (!qr) fails.push("the QR encoder is not in its own lazy chunk");
if (fails.length) {
  console.error(`Budget failed:\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log("Budget OK.");
