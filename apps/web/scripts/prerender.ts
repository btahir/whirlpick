// Prerenders every static route to dist/<path>/index.html (PLAN §6.2), inlines the built CSS,
// preloads the core fonts, and writes sitemap.xml, robots.txt, llms.txt, manifest.webmanifest and
// schema/*.json. Fails the build on duplicate titles or descriptions, thin landing pages, short
// FAQs, banned claims or banned slop words. Run after `vite build`.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, process.env.OUT_DIR || "dist");

export const BANNED_CLAIMS = /\b(certified|certification|provably fair|guaranteed fair|tamper-proof|unhackable|100% random|truly random)\b/i;
export const BANNED_SLOP = /\b(elevate|seamless|supercharge|unleash|effortless|game-chang\w*)\b/i;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const jsonForScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/[\u2028]/g, "\\u2028").replace(/[\u2029]/g, "\\u2029");
const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");

let template = await readFile(resolve(OUT, "index.html"), "utf8");
for (const m of template.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)) {
  const css = await readFile(resolve(OUT, m[1]!.replace(/^\//, "")), "utf8");
  template = template.replace(m[0], () => `<style>${css}</style>`);
}
template = template.replace(/<title>.*?<\/title>/s, "");
const assets = await readdir(resolve(OUT, "assets"));
const preloads = assets
  .filter((f) => /^(bricolage|martian)-core-[\w-]+\.woff2$/.test(f))
  .map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin>`)
  .join("\n    ");
if (!preloads) throw new Error("Core font files are missing from dist/assets");

// The app chunk (and its static imports) for interactive pages, from the Vite manifest.
type ManifestChunk = { file: string; imports?: string[]; dynamicImports?: string[]; isEntry?: boolean; css?: string[] };
const manifest = JSON.parse(await readFile(resolve(OUT, ".vite/manifest.json"), "utf8")) as Record<string, ManifestChunk>;
const chunksFor = (suffix: string) => {
  const key = Object.keys(manifest).find((k) => k.endsWith(suffix));
  if (!key) throw new Error(`${suffix} missing from the manifest`);
  const files = new Set<string>();
  const walk = (k: string) => {
    const c = manifest[k];
    if (!c || files.has(c.file)) return;
    files.add(c.file);
    for (const i of c.imports ?? []) walk(i);
  };
  walk(key);
  return [...files].map((f) => `<link rel="modulepreload" href="/${f}">`).join("\n    ");
};
const toolPreloads = chunksFor("src/app/boot.tsx");
const verifyPreloads = chunksFor("src/app/boot-verify.tsx");

const server = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "warn" });
try {
  const ssr = await server.ssrLoadModule("/src/app/ssr.tsx");
  const site = await server.ssrLoadModule("/src/config/site.ts");
  const core = await server.ssrLoadModule("@whirlpick/core");
  const { llmsTxt } = await server.ssrLoadModule("/src/content/docs/llms.ts");
  const SITE_URL: string = site.SITE_URL;
  const paths: string[] = ssr.staticRoutes();
  const titles = new Map<string, string>();
  const descs = new Map<string, string>();
  const sitemap: { loc: string; lastmod: string }[] = [];
  const problems: string[] = [];

  for (const path of paths) {
    const r = ssr.renderRoute(path);
    const { meta } = r;
    if (!meta?.title || !meta?.description) problems.push(`${path}: no metadata`);
    if (titles.has(meta.title)) problems.push(`${path}: duplicate title (also ${titles.get(meta.title)})`);
    if (descs.has(meta.description)) problems.push(`${path}: duplicate description (also ${descs.get(meta.description)})`);
    titles.set(meta.title, path);
    descs.set(meta.description, path);
    if (meta.title.length > 60) problems.push(`${path}: title over 60 chars (${meta.title.length})`);
    if (!meta.noindex && (meta.description.length < 70 || meta.description.length > 160)) problems.push(`${path}: description ${meta.description.length} chars (70–160)`);
    const isLanding = /^\/[a-z0-9-]+\/$/.test(path) && !["/verify/", "/about/", "/support/", "/embed/"].includes(path) && path !== "/docs/agents/";
    if (isLanding && r.bodyWords < 300) problems.push(`${path}: body ${r.bodyWords} words (< 300)`);
    if (isLanding && r.faq.length < 3) problems.push(`${path}: FAQ has ${r.faq.length} items (< 3)`);
    const visible = textOf(r.body) + " " + meta.title + " " + meta.description;
    const claim = BANNED_CLAIMS.exec(visible);
    if (claim) problems.push(`${path}: banned claim "${claim[0]}"`);
    const slop = BANNED_SLOP.exec(visible);
    if (slop) problems.push(`${path}: banned word "${slop[0]}"`);

    const url = path === "/404.html" ? `${SITE_URL}/404.html` : `${SITE_URL}${path}`;
    const head = [
      `<title>${esc(meta.title)}</title>`,
      `<meta name="description" content="${esc(meta.description)}">`,
      meta.noindex ? `<meta name="robots" content="noindex">` : `<link rel="canonical" href="${esc(url)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="Whirlpick">`,
      `<meta property="og:title" content="${esc(meta.title)}">`,
      `<meta property="og:description" content="${esc(meta.description)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:image" content="${SITE_URL}/og.png">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="The Whirlpick wheel with its tomato pick">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(meta.title)}">`,
      `<meta name="twitter:description" content="${esc(meta.description)}">`,
      `<meta name="twitter:image" content="${SITE_URL}/og.png">`,
      preloads,
      r.interactive ? (path === "/verify/" ? verifyPreloads : toolPreloads) : "",
      r.landing ? `<script type="application/json" id="wp-page">${jsonForScript(r.landing)}</script>` : "",
      ...r.jsonLd.map((j: unknown) => `<script type="application/ld+json">${jsonForScript(j)}</script>`),
    ]
      .filter(Boolean)
      .join("\n    ");
    const html = template.replace("</head>", `    ${head}\n  </head>`).replace('<div id="root"></div>', r.body);
    const file = path === "/404.html" ? resolve(OUT, "404.html") : resolve(OUT, `.${path}index.html`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
    if (!meta.noindex) sitemap.push({ loc: url, lastmod: meta.lastmod });
  }

  if (problems.length) throw new Error(`Prerender checks failed:\n  ${problems.join("\n  ")}`);

  await writeFile(
    resolve(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
      .map((s) => `  <url><loc>${esc(s.loc)}</loc><lastmod>${s.lastmod}</lastmod></url>`)
      .join("\n")}\n</urlset>\n`,
  );
  await writeFile(resolve(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /embed/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  const landing = (ssr.LANDING_PAGES as { slug: string; title: string }[]).map((p) => ({ slug: p.slug, title: p.title }));
  const llms: string = llmsTxt({ siteUrl: SITE_URL, repoUrl: site.REPO_URL, landing });
  const hit = BANNED_CLAIMS.exec(llms) ?? BANNED_SLOP.exec(llms);
  if (hit) throw new Error(`llms.txt: banned word "${hit[0]}"`);
  await writeFile(resolve(OUT, "llms.txt"), llms.endsWith("\n") ? llms : llms + "\n");
  await mkdir(resolve(OUT, "schema"), { recursive: true });
  await writeFile(resolve(OUT, "schema/whirl-v1.json"), JSON.stringify(core.WHIRL_SCHEMA_V1, null, 2) + "\n");
  await writeFile(resolve(OUT, "schema/receipt-v1.json"), JSON.stringify(core.RECEIPT_SCHEMA_V1, null, 2) + "\n");
  await writeFile(
    resolve(OUT, "manifest.webmanifest"),
    JSON.stringify(
      {
        name: "Whirlpick: spin the wheel, fairly",
        short_name: "Whirlpick",
        description: site.SITE_DESCRIPTION,
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F4ECDF",
        theme_color: "#F4ECDF",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Prerendered ${paths.length} pages; sitemap has ${sitemap.length} URLs.`);
} finally {
  await server.close();
}
