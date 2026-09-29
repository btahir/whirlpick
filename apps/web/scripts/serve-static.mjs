#!/usr/bin/env node
// Minimal zero-dependency static server for dist/ (e2e, Lighthouse, local preview).
//   node scripts/serve-static.mjs [dir=dist] [port=4324]
// Serves dir/index.html for directory paths and dist/404.html (status 404) for misses.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { createBrotliCompress, createGzip } from "node:zlib";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist");
const port = Number(process.env.PORT ?? process.argv[3] ?? 4324);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json",
};

function fileFor(urlPath) {
  let clean;
  try {
    clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  } catch {
    return null;
  }
  let p = join(root, clean);
  if (!p.startsWith(root)) return null;
  try {
    const st = statSync(p);
    if (st.isDirectory()) p = join(p, "index.html");
    statSync(p);
    return p;
  } catch {
    return null;
  }
}

createServer((req, res) => {
  const url = req.url ?? "/";
  // Directory without a trailing slash: redirect like a static host would.
  const bare = url.split("?")[0];
  if (!bare.endsWith("/") && !extname(bare)) {
    const dir = fileFor(bare + "/");
    if (dir) {
      res.writeHead(301, { location: bare + "/" + (url.includes("?") ? url.slice(url.indexOf("?")) : "") });
      res.end();
      return;
    }
  }
  const path = fileFor(url);
  if (!path) {
    const nf = join(root, "404.html");
    res.writeHead(404, { "content-type": TYPES[".html"] });
    try {
      statSync(nf);
      createReadStream(nf).pipe(res);
    } catch {
      res.end("Not found");
    }
    return;
  }
  const type = TYPES[extname(path)] ?? "application/octet-stream";
  const text = /^(text\/|application\/(json|manifest|xml)|image\/svg)/.test(type);
  const accept = String(req.headers["accept-encoding"] ?? "");
  const enc = !text ? null : /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
  const immutable = /\/assets\//.test(path);
  res.writeHead(200, {
    "content-type": type,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    ...(enc ? { "content-encoding": enc, vary: "accept-encoding" } : {}),
  });
  const stream = createReadStream(path);
  if (enc === "br") stream.pipe(createBrotliCompress()).pipe(res);
  else if (enc === "gzip") stream.pipe(createGzip()).pipe(res);
  else stream.pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
