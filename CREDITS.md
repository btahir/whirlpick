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

<!-- Builder B: append the web runtime dependencies and fonts here (one row each, with licence). -->

## Written by us, no dependency

- The draw algorithm, receipt verifier, team splitter, CSV parser, base64url codec and chi-square p-value code.
- The Python reference checker (`scripts/ref/draw_v1.py`, standard library only).
- The preset lists: invented first names, the country list (193 UN member states plus the two observer states, short English names written for Whirlpick), food, chores, and the family-friendly truth-or-dare prompts.
- All sounds are synthesised in code with WebAudio; there are no audio files.

## Development tools (not shipped)

TypeScript (Apache-2.0), vitest (MIT), tsx (MIT), oxlint (MIT), ajv and ajv-formats (MIT), fast-check (MIT), @types/node (MIT). The web app's dev tools (Vite, Playwright, axe-core, Lighthouse, canvas and pixel-diff tools) are listed in `apps/web/package.json`; axe-core is MPL-2.0 and used unmodified.
