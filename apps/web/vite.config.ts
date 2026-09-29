import { defineConfig, defaultClientConditions, defaultServerConditions } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Workspace packages export `source: ./src/index.ts`, so the web app never needs a core build.
const harness = process.env.PIXEL_HARNESS === "1";

// The CSP meta (script-src 'self') would block Vite's inline dev preamble; keep it for builds only.
const devCsp = {
  name: "whirlpick-dev-csp",
  apply: "serve" as const,
  transformIndexHtml: (html: string) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""),
};

export default defineConfig({
  plugins: [react(), devCsp],
  resolve: { conditions: ["source", ...defaultClientConditions] },
  ssr: { resolve: { conditions: ["source", ...defaultServerConditions], externalConditions: ["source"] }, noExternal: ["@whirlpick/core"] },
  server: { host: "127.0.0.1", port: 4323, strictPort: true },
  build: {
    manifest: true,
    target: "baseline-widely-available",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: harness
        ? { main: resolve(import.meta.dirname, "index.html"), harness: resolve(import.meta.dirname, "src/testing/renderer.html") }
        : { main: resolve(import.meta.dirname, "index.html") },
    },
  },
});
