// SEO, content and hygiene checks on the built site (ACCEPTANCE O1–O7, E6, N1 CSP, P1).
//   tsx apps/web/scripts/seo-check.ts apps/web/dist
// Exits 1 with a list of problems. Reads only files; starts no server.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WEB = resolve(import.meta.dirname, "..");
const REPO = resolve(WEB, "../..");
const DIST = resolve(process.cwd(), process.argv[2] ?? join(WEB, "dist"));
const problems: string[] = [];
const fail = (m: string) => problems.push(m);

const { SITE_URL } = await import("../../../packages/core/src/site.ts");
const { COMMANDS } = await import("../../../packages/cli/src/cli.ts");
const { LANDING_PAGES } = await import("../src/content/landing/index.ts");

const BANNED_CLAIMS = /\b(certified|certification|provably fair|guaranteed fair|tamper-proof|unhackable|100% random|truly random)\b/i;
const BANNED_SLOP = /\b(elevate|seamless|supercharge|unleash|effortless|game-chang\w*)\b/i;
const MCP_TOOLS = ["spin_wheel", "split_teams", "verify_receipt", "create_commitment", "make_share_link", "validate_wheel", "list_presets"];

const read = (p: string) => readFileSync(p, "utf8");
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
const textOf = (html: string) =>
  decode(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<svg[\s\S]*?<\/svg>/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const pageFile = (path: string) => (path === "/404.html" ? join(DIST, "404.html") : join(DIST, `.${path}index.html`));
const meta = (html: string, re: RegExp) => decode(re.exec(html)?.[1] ?? "");

/* ------------------------------------------------------- pages (O1, O3) */

const landing = LANDING_PAGES.map((p: { slug: string }) => `/${p.slug}/`);
const indexable = ["/", ...landing, "/verify/", "/about/", "/support/", "/docs/agents/"];
const titles = new Map<string, string>();
const descs = new Map<string, string>();
const bodies = new Map<string, string[]>();
for (const path of [...indexable, "/embed/", "/404.html"]) {
  const f = pageFile(path);
  if (!existsSync(f)) {
    fail(`${path}: missing ${relative(REPO, f)}`);
    continue;
  }
  const html = read(f);
  if (!html.includes('http-equiv="Content-Security-Policy"')) fail(`${path}: no CSP meta`);
  const noindex = /<meta name="robots" content="noindex">/.test(html);
  if (path === "/embed/" || path === "/404.html") {
    if (!noindex) fail(`${path}: should be noindex`);
    continue;
  }
  if (noindex) fail(`${path}: indexable page carries noindex`);
  const title = meta(html, /<title>([^<]*)<\/title>/);
  const desc = meta(html, /<meta name="description" content="([^"]*)"/);
  if (!/<h1[\s>]/.test(html)) fail(`${path}: no <h1>`);
  if (!title || title.length > 60) fail(`${path}: title "${title}" (${title.length} chars, max 60)`);
  if (desc.length < 70 || desc.length > 160) fail(`${path}: description ${desc.length} chars (70–160)`);
  if (titles.has(title)) fail(`${path}: title duplicates ${titles.get(title)}`);
  if (descs.has(desc)) fail(`${path}: description duplicates ${descs.get(desc)}`);
  titles.set(title, path);
  descs.set(desc, path);
  const canonical = meta(html, /<link rel="canonical" href="([^"]*)"/);
  if (canonical !== `${SITE_URL}${path}`) fail(`${path}: canonical is "${canonical}"`);
  for (const p of ["og:title", "og:description", "og:url", "og:image", "og:type"]) if (!html.includes(`property="${p}"`)) fail(`${path}: missing ${p}`);
  // JSON-LD parses; FAQPage matches the visible FAQ.
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try {
      return JSON.parse(m[1]!);
    } catch {
      fail(`${path}: JSON-LD does not parse`);
      return null;
    }
  });
  const faqHtml = /<section class="faq"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
  const visibleQs = [...faqHtml.matchAll(/<dt>([\s\S]*?)<\/dt>/g)].map((m) => textOf(m[1]!));
  const faqLd = lds.find((l) => l && l["@type"] === "FAQPage");
  if (faqLd) {
    const ldQs = (faqLd.mainEntity as { name: string }[]).map((q) => q.name);
    if (ldQs.join("|") !== visibleQs.join("|")) fail(`${path}: FAQPage JSON-LD does not match the visible FAQ`);
  }
  if (landing.includes(path)) {
    if (visibleQs.length < 3) fail(`${path}: ${visibleQs.length} FAQ items (< 3)`);
    if (!faqLd) fail(`${path}: no FAQPage JSON-LD`);
    const article = /<article class="prose">([\s\S]*?)<\/article>/.exec(html)?.[1] ?? "";
    const body = textOf(article.replace(/<section class="faq"[\s\S]*?<\/section>/, "").replace(/<p class="privacy-line">[\s\S]*?<\/p>/, "").replace(/<nav class="related"[\s\S]*?<\/nav>/, "").replace(/<h2[^>]*>[\s\S]*?<\/h2>/g, " "));
    const w = words(body);
    if (w.length < 300) fail(`${path}: body has ${w.length} words (< 300)`);
    bodies.set(path, w.map((x) => x.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")));
  }
  const text = textOf(html) + " " + title + " " + desc;
  const claim = BANNED_CLAIMS.exec(text);
  if (claim) fail(`${path}: banned claim "${claim[0]}"`);
  const slop = BANNED_SLOP.exec(text);
  if (slop) fail(`${path}: banned word "${slop[0]}"`);
}

// No 12-word run of body text shared between two landing pages.
const RUN = 12;
const runs = new Map<string, string>();
for (const [path, w] of bodies) {
  const mine = new Set<string>();
  for (let i = 0; i + RUN <= w.length; i++) mine.add(w.slice(i, i + RUN).join(" "));
  for (const r of mine) {
    const other = runs.get(r);
    if (other && other !== path) {
      fail(`${path} and ${other} share a ${RUN}-word run: "${r}"`);
      break;
    }
    runs.set(r, path);
  }
}

/* ------------------------------------------------------- sitemap, robots (O4) */

const sitemap = existsSync(join(DIST, "sitemap.xml")) ? read(join(DIST, "sitemap.xml")) : "";
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
const want = indexable.map((p) => `${SITE_URL}${p}`);
if (locs.length !== want.length || want.some((u) => !locs.includes(u))) fail(`sitemap.xml lists ${locs.length} URLs; expected exactly the ${want.length} indexable routes`);
if ((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length !== locs.length) fail("sitemap.xml: every URL needs a lastmod");
if (locs.some((u) => /\/embed\/|404/.test(u))) fail("sitemap.xml lists /embed/ or the 404 page");
const robots = existsSync(join(DIST, "robots.txt")) ? read(join(DIST, "robots.txt")) : "";
if (!/User-agent: \*/.test(robots) || !/Allow: \//.test(robots) || !robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) fail("robots.txt must allow all and link the sitemap");

/* ------------------------------------------------------- llms.txt, schemas (O5) */

const llms = existsSync(join(DIST, "llms.txt")) ? read(join(DIST, "llms.txt")) : "";
if (!llms) fail("dist/llms.txt missing");
for (const need of [`${SITE_URL}/docs/agents/`, `${SITE_URL}/schema/whirl-v1.json`, `${SITE_URL}/schema/receipt-v1.json`]) if (!llms.includes(need)) fail(`llms.txt does not link ${need}`);
if (!/github\.com\//.test(llms)) fail("llms.txt does not link the repo");
try {
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const ajv = new (Ajv2020 as unknown as new (o: object) => { compile(s: object): unknown })({ strict: false, allErrors: true });
  const core = await import("../../../packages/core/src/index.ts");
  for (const [file, schema] of [
    ["schema/whirl-v1.json", core.WHIRL_SCHEMA_V1],
    ["schema/receipt-v1.json", core.RECEIPT_SCHEMA_V1],
  ] as const) {
    const p = join(DIST, file);
    if (!existsSync(p)) {
      fail(`dist/${file} missing`);
      continue;
    }
    const txt = read(p);
    if (txt !== JSON.stringify(schema, null, 2) + "\n") fail(`dist/${file} differs from \`whirlpick schema\` output`);
    ajv.compile(JSON.parse(txt));
  }
} catch (e) {
  fail(`schema check failed: ${(e as Error).message}`);
}

/* ------------------------------------------------------- agent docs (O6) */

const agentsMd = existsSync(join(REPO, "AGENTS.md")) ? read(join(REPO, "AGENTS.md")) : "";
const agentsPage = existsSync(pageFile("/docs/agents/")) ? textOf(read(pageFile("/docs/agents/"))) : "";
const need: string[] = [];
for (const [name, cmd] of Object.entries(COMMANDS as Record<string, { flags: Record<string, unknown> }>)) {
  need.push(`whirlpick ${name}`);
  for (const f of Object.keys(cmd.flags)) need.push(`--${f}`);
}
need.push("--json", "--quiet", "--help", "--version", "--no-color", ...MCP_TOOLS);
for (const n of Array.from(new Set(need))) {
  if (!agentsMd.includes(n)) fail(`AGENTS.md does not mention ${n}`);
  if (!agentsPage.includes(n)) fail(`/docs/agents/ does not mention ${n}`);
}
for (const code of ["0", "1", "2", "3", "4", "5", "6"]) {
  const re = new RegExp(`(^|\\|)\\s*${code}\\s*\\|`, "m");
  if (!re.test(agentsMd)) fail(`AGENTS.md exit code table has no row for ${code}`);
}
if (!/Exit code/i.test(agentsPage)) fail("/docs/agents/ has no exit code table");

/* ------------------------------------------------------- copy guard in docs (E6) */

for (const f of ["README.md", "AGENTS.md"]) {
  const p = join(REPO, f);
  if (!existsSync(p)) continue;
  const txt = read(p);
  const hit = BANNED_CLAIMS.exec(txt) ?? BANNED_SLOP.exec(txt);
  if (hit) fail(`${f}: banned word "${hit[0]}"`);
}
{
  const hit = BANNED_CLAIMS.exec(llms) ?? BANNED_SLOP.exec(llms);
  if (hit) fail(`llms.txt: banned word "${hit[0]}"`);
}

/* ------------------------------------------------------- one SITE_URL (O7), Stripe (P1) */

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", "test-results", "playwright-report"].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|json|html|css|md|txt|webmanifest|svg)$/.test(n)) out.push(p);
  }
  return out;
}
const srcFiles = [...walk(join(WEB, "src")), ...walk(join(WEB, "scripts")), ...walk(join(WEB, "public")), join(WEB, "index.html")];
// O7 also covers the shared packages' sources: only core/src/site.ts may name the host.
const pkgFiles = [...walk(join(REPO, "packages/core/src")), ...walk(join(REPO, "packages/cli/src"))];
for (const f of pkgFiles) {
  const rel = relative(REPO, f);
  if (rel !== "packages/core/src/site.ts" && /whirlpick\.vercel\.app|getwhirlpick|whirlpickapp/.test(read(f))) fail(`${rel} hard-codes the site host (use SITE_URL)`);
}
for (const f of srcFiles) {
  const rel = relative(REPO, f);
  const txt = read(f);
  if (rel !== "apps/web/src/config/site.ts" && /whirlpick\.vercel\.app|getwhirlpick|whirlpickapp/.test(txt) && !rel.endsWith("seo-check.ts")) fail(`${rel} hard-codes the site host`);
  if (rel !== "apps/web/src/config/site.ts" && !rel.endsWith("seo-check.ts") && txt.includes("buy.stripe" + ".com")) fail(`${rel} contains a Stripe link (only config/site.ts may)`);
}

if (problems.length) {
  console.error(`seo:check found ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`seo:check passed: ${indexable.length} indexable pages, ${landing.length} landing pages, sitemap ${locs.length} URLs.`);
