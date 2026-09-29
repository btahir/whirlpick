# Credits

Whirlpick is MIT licensed (see `LICENSE`). It stands on these open-source packages. Every runtime dependency is listed here with its licence; `pnpm licenses:check --credits` fails if one is missing.

## Runtime dependencies

### `@whirlpick/core` (browser, CLI and MCP)

| Package | Version | Licence | Use |
|---|---|---|---|
| [@noble/hashes](https://github.com/paulmillr/noble-hashes) | 2.4.0 | MIT | SHA-256 for wheel fingerprints, commitments and the draw stream |

### `whirlpick` CLI and `whirlpick-mcp` server

| Package | Version | Licence | Use |
|---|---|---|---|
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | 1.30.1 | MIT | stdio MCP server (its HTTP transports are never started) |
| [zod](https://github.com/colinhacks/zod) | 4.6.5 | MIT | MCP tool input and output schemas |
| [qr](https://github.com/paulmillr/qr) | 0.7.0 | MIT OR Apache-2.0 (used under MIT) | QR codes for share links (terminal and SVG) |

### Web app (`apps/web`)

| Package | Version | Licence | Use |
|---|---|---|---|
| [react](https://github.com/facebook/react) | 19.3.0 | MIT | UI |
| [react-dom](https://github.com/facebook/react) | 19.3.0 | MIT | UI rendering and hydration (brings `scheduler`, MIT) |
| [qr](https://github.com/paulmillr/qr) | 0.7.0 | MIT OR Apache-2.0 (used under MIT) | QR code in the share dialog (a lazy chunk; encoder only) |
| [@fontsource-variable/bricolage-grotesque](https://github.com/fontsource/font-files) | 5.3.0 | OFL-1.1 | Self-hosted font files for Bricolage Grotesque |
| [@fontsource-variable/martian-mono](https://github.com/fontsource/font-files) | 5.3.0 | OFL-1.1 | Self-hosted font files for Martian Mono |

**Fonts** (SIL Open Font License 1.1; the licence text ships in each Fontsource package):

- **Bricolage Grotesque**, © 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage). UI, wheel labels and the wordmark.
- **Martian Mono**, © 2020 The Martian Mono Project Authors (https://github.com/evilmartians/mono). Hashes, seeds, times and counts.
- `apps/web/src/fonts/*-core.woff2` are subsets of those two files (basic Latin plus a few typographic marks, every variation axis kept), made with fontTools so the first paint preloads about 100 KB instead of 155 KB. Neither font declares a Reserved Font Name.

**Written by us for the web app:** the Canvas wheel renderer, the spin driver, the WebAudio synth (every sound is generated in code; there are no audio files), the confetti, the IndexedDB wrapper, the store, the service worker and the static server. The logo, favicon, app icons and icon set were drawn for Whirlpick (`docs/design/brand/` → `apps/web/public/`).

## Written by us, no dependency

- The draw algorithm, receipt verifier, team splitter, CSV parser, base64url codec and chi-square p-value code.
- The Python reference checker (`scripts/ref/draw_v1.py`, standard library only).
- The preset lists: invented first names, the country list (193 UN member states plus the two observer states, short English names written for Whirlpick), food, chores, and the family-friendly truth-or-dare prompts.
- All sounds are synthesised in code with WebAudio; there are no audio files.

## Development tools (not shipped)

TypeScript (Apache-2.0), vitest (MIT), tsx (MIT), oxlint (MIT), ajv and ajv-formats (MIT), fast-check (MIT), @types/node (MIT). The web app's dev tools (Vite, Playwright, axe-core, Lighthouse, canvas and pixel-diff tools) are listed in `apps/web/package.json`; axe-core is MPL-2.0 and used unmodified.
