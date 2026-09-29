# Whirlpick for agents

Whirlpick is a spin wheel, name picker and team splitter whose draws are reproducible. Every spin produces a **receipt** that anyone can re-run to check the result. This file covers the command-line tool (`whirlpick`), the local MCP server (`whirlpick-mcp`), the file formats and the draw algorithm. The web app lives at https://whirlpick.vercel.app; the same core runs in the browser, the CLI and MCP, so the same seed and list give the same result everywhere, byte for byte.

Nothing here touches the network. There are no accounts and no API keys.

## Install and run (from the repo)

```bash
pnpm i && pnpm build:packages
pnpm whirlpick spin --entries "Ada,Grace,Linus"      # or: node packages/cli/bin/whirlpick.js …
```

Node 24+ and pnpm 11. The npm package is not published yet; run it from the repo.

## The agent recipe: commit → publish → spin → link → verify

This is how to run a draw that people can trust without trusting you.

1. **Commit.** Make a secret seed and publish only its commitment, before the entries are final.

   ```console
   $ whirlpick commit --out seed.json --json
   {
     "ok": true,
     "commitment": "012404c0f3d4e855216c59c93e220c43a88a740959875028a49a095496af938c",
     "createdAt": "2026-09-29T12:00:00.000Z",
     "savedTo": "seed.json",
     "note": "Publish the commitment to your audience now and keep the seed secret. …"
   }
   ```
   `seed.json` is created with mode 0600 and the seed is left out of stdout, so logs don't leak it.

2. **Publish** the commitment in chat or email. Optionally ask the room for a word (the *public input*) after they have seen the commitment; it stops anyone from trying many seeds in advance.

3. **Spin** with the saved seed.

   ```console
   $ whirlpick spin names.txt --seed-file seed.json --count 2 --public-input "blue sky" \
       --title "Friday raffle" --receipt-out receipt.json --link
   Winners:
     1. Grace
     2. Ada
   seed 5f1c2e0a…aabbccd  commitment 012404c0…96af938c
   list fingerprint c1cb0f82ab96a6e28be030e3ae95b61b2797dcf291be37a2165ef20ca30496ef
   replay https://whirlpick.vercel.app/#spin=1.jZPLbtswEEV_…
   receipt written to receipt.json
   ```

4. **Link.** The `replay` link opens the wheel in a browser and plays exactly this draw. `whirlpick link` makes a plain wheel link that opens ready to spin.

5. **Verify.** Anyone can check the receipt, here or on https://whirlpick.vercel.app/verify/.

   ```console
   $ whirlpick verify receipt.json --commitment 012404c0f3d4e855216c59c93e220c43a88a740959875028a49a095496af938c
   Valid: the draw checks out.
     ok   The receipt is readable JSON.
     ok   Receipt format version 1.
     ok   Algorithm whirlpick-draw-v1.
     ok   Every field is well formed.
     ok   No external beacon (v1).
     ok   The list wasn't changed: fingerprint matches. (c1cb0f82…a30496ef)
     ok   The seed has been revealed.
     ok   The seed matches the commitment shown before the spin. (012404c0…96af938c)
     ok   The commitment matches the one you saw.
     ok   The draw settings are valid for this list.
     ok   Re-running the draw gives the same result.
     ok   Winner names match the list.
   ```

What this shows, and what it doesn't: the seed was fixed when the commitment was published, the list is the one in the receipt, and the winners follow from the published algorithm. It does not stop a host from trying many seeds *before* committing; the public input word is what covers that.

## CLI reference

Global flags on every command: `--json` (exactly one JSON document on stdout, success or error), `--quiet`, `--help`, `--version`, `--no-color`. Warnings go into `warnings` (JSON) or stderr (human). `WHIRLPICK_FIXED_NOW=<ISO>` pins timestamps (for tests only).

**Entry sources** for `spin`, `teams`, `link` and `open` (exactly one): a file (`.txt` one per line, `.csv`/`.tsv` with optional `name,weight,tags,color,enabled` header, `.whirl.json`/`.json` project or JSON list of entries), `-` for stdin (`--format txt|csv|tsv|json`, default: detect), `--entries "Ada,Grace,Linus"` (`--entries-sep` changes the separator), or `--preset <id>` (`--min`/`--max` for `numbers`). With a project file, `--wheel <id|name>` picks the wheel (default: the active one). `--title <text>` sets the title recorded in the receipt.

**Seed options** for `spin` and `teams`: `--seed <hex64>`, `--seed-phrase <text>` (guessable; warns `SEED_PHRASE_GUESSABLE`), `--seed-file <path>` (from `commit --out`), `--public-input <text>`, `--spin-index <n>`. With none, a fresh 256-bit random seed is used.

| Command | What it does | Options |
|---|---|---|
| `whirlpick spin [source]` | Pick one winner, several without repeats, or run an elimination series. | `--count <n\|all>` (> 1 or `all` ⇒ multi), `--mode single\|multi\|elimination`, `--spins <n>` (elimination: n spins, spin index 0…n−1, winners excluded as they go), `--exclude <i,j,…>`, `--link`, `--base <url>`, `--receipt-out <path>`, `--force`, seed options |
| `whirlpick teams [source]` | Split into teams, tags spread evenly. | `--teams <n>` or `--size <k>`, `--balance` / `--no-balance`, `--apart "Ada,Grace"` and `--together "Linus,#4"` (repeatable; labels or `#index`), `--history <path>` (earlier team receipts: new split avoids repeat pairs), `--format json\|text\|csv`, `--receipt-out <path>`, `--force`, seed options |
| `whirlpick verify <receipt\|-\|code\|url>` | Check a receipt (file, stdin, receipt code, `/verify/#r=` or `/#spin=` URL). | `--commitment <hex>`, `--wheel-hash <hex>` (values you saw before the draw) |
| `whirlpick commit` | Make a seed and its commitment. | `--seed <hex64>`, `--out <path>` (mode 0600, seed left out of stdout), `--force` |
| `whirlpick link [source]` | Share link (`#w=`), or a replay link. | `--replay <receipt>`, `--base <url>`, `--preset <id>`, `--qr` (terminal QR), `--qr-svg <path>`, `--force` |
| `whirlpick open [source]` | Like `link`, prints only the URL (`{ok, url}` with `--json`). Does not launch a browser. | same as `link` |
| `whirlpick validate <file>` | Check a `.whirl.json` against whirl-v1. | — |
| `whirlpick presets [<id>]` | List presets, or print one as a `.whirl.json` project. | `--min`, `--max` |
| `whirlpick schema whirl\|receipt` | Print the JSON Schema. | — |

`spin --json` output:

```json
{ "ok": true, "mode": "multi", "winners": [{ "index": 1, "label": "Grace" }, { "index": 0, "label": "Ada" }],
  "receipts": [{ "…": "receipt-v1" }], "link": "https://whirlpick.vercel.app/#spin=1.…", "warnings": [] }
```

`teams --json` output: `{ ok, teams: [{ name: "Team 1", members: [{ index, label, tags }] }], sizes, balance: { byTag, withinOne }, repeatPairs, receipt, text, csv, warnings }`. `text` is `Team 1: Ada, Linus, Margaret` per line; `csv` is `team,name,tags` rows.

```console
$ whirlpick teams --entries "Ada,Grace,Linus,Margaret,Priya,Tomas" --teams 2 --apart "Ada,Grace" --seed-phrase demo
Team 1: Ada, Linus, Margaret
Team 2: Grace, Priya, Tomas
```

Errors (`--json`): `{"ok": false, "error": {"code": "COUNT_TOO_LARGE", "message": "Can't pick 3 from 2 eligible entries.", "details": {…}}, "exitCode": 6}`.

### Exit codes (stable)

| Code | Meaning |
|---|---|
| 0 | success (verify: valid) |
| 1 | internal error (a bug; please report it) |
| 2 | usage error (unknown command or flag, missing or conflicting arguments) |
| 3 | invalid input (file missing, unreadable or too big, parse or schema error, path rejected, invalid label or weight, entry limit, ambiguous label) |
| 4 | verification failed (receipt invalid) |
| 5 | receipt not revealed (seed missing) |
| 6 | infeasible draw (count > eligible, no eligible entries, team count invalid, team rules can't be met: `CONSTRAINTS_UNSATISFIED`, or `CONSTRAINTS_SEARCH_LIMIT` when a huge rule set is too big to search exhaustively) |

### Path safety

CLI paths resolve against the current directory. Inputs must be regular files (directories, FIFOs, sockets and devices are refused: `PATH_NOT_FILE`), at most 5 MB (projects 20 MB: `FILE_TOO_LARGE`) and UTF-8. Outputs are never written through a symlink (`OUTPUT_SYMLINK`), need an existing folder (`OUTPUT_DIR_MISSING`), never replace a file without `--force` (`OUTPUT_EXISTS`), and are written to a temp file then renamed, so an interrupted write leaves nothing behind.

## MCP server

`whirlpick-mcp` is a stdio MCP server (server name `whirlpick`). Configure it like this:

```json
{ "mcpServers": { "whirlpick": { "command": "node", "args": ["/abs/path/whirlpick/packages/cli/bin/whirlpick-mcp.js", "--root", "/abs/project"] } } }
```

File access is limited to the allowed roots: `--root <dir>` (repeatable), else `WHIRLPICK_MCP_ROOT` (path-delimiter-separated), else the directory it was started in (some MCP clients start servers in `/`, so pass `--root`). Every path is resolved with `realpath` and must stay inside a root, so `..` and symlinks can't escape (`PATH_OUTSIDE_ROOT`). Reads: `.txt .csv .tsv .json` only; writes: `.json .svg` only (`PATH_EXTENSION`), and an existing file is replaced only with `overwrite: true` (`OUTPUT_EXISTS`). Inline data is always an option; paths are optional in every tool.

Every tool returns `structuredContent` plus one `text` item with the same JSON. Failures return `isError: true` with `structuredContent: { error: { code, message, details } }` (so output schemas mark fields optional; on success every listed field is present). Arguments of the wrong JSON type (for example `count: "ALL"` or a weight given as a string) are rejected by the MCP SDK before the tool runs, as an `isError` result with the text `MCP error -32602: Input validation error …` and no `structuredContent`.

| Tool | Use it to | Input | Output |
|---|---|---|---|
| `spin_wheel` | pick winners with a receipt | `entries` \| `file` (+`wheel`) \| `preset`; `seed`, `seedPhrase`, `publicInput`, `spinIndex`; `count` (≥ 1 or `"all"`), `mode`, `spins`, `exclude`, `title`, `includeLink`, `base`, `receiptPath`, `overwrite` | `{ mode, winners, receipts, link?, receiptPath?, warnings }` |
| `split_teams` | balanced teams with rules | source + seed options; `teams` or `teamSize`, `balance`, `keepApart` / `keepTogether` (lists of labels or `"#<index>"`), `previousRounds` (teams of labels), `history` (team receipts), `title` | `{ teams, sizes, balance, repeatPairs, receipt, text, csv, warnings }` |
| `verify_receipt` | check a receipt | `receipt` (object, code or URL) \| `file`; `expectedCommitment`, `expectedWheelHash` | the verify report (below) |
| `create_commitment` | start a public draw | `seed?`, `savePath?`, `overwrite?` | `{ commitment, seed? (omitted with savePath), createdAt, savedTo?, instructions }` |
| `make_share_link` | hand a person a ready wheel | source; `title`, `settings` (partial wheel settings), `replayReceipt`, `base`, `qrSvg` | `{ url, length, qrAvailable, qrSvg?, warnings }` |
| `validate_wheel` | check a `.whirl.json` | `project` \| `file` | `{ valid, errors: [{ path, code, message }], warnings, summary }` |
| `list_presets` | find preset ids | `{}` | `{ presets: [{ id, title, slug, entries, mode }] }` |

Example call and result:

```json
{ "name": "spin_wheel", "arguments": { "entries": ["Ada", "Grace", { "label": "Linus", "weight": 2 }], "seed": "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" } }
```

```json
{ "mode": "single", "winners": [{ "index": 1, "label": "Grace" }], "receipts": [{ "format": "whirlpick-receipt", "…": "…" }], "warnings": [] }
```

The same inputs through MCP, the CLI and the core library give identical receipts except the `app` field (`whirlpick-mcp/0.1.0`, `whirlpick-cli/0.1.0`).

## File formats

### `.whirl.json` project (whirl-v1)

Schema: `whirlpick schema whirl` or https://whirlpick.vercel.app/schema/whirl-v1.json. The smallest valid file an agent can write (ids and settings are filled in on import):

```json
{"format":"whirlpick-project","version":1,"wheels":[{"entries":[{"label":"Ada"},{"label":"Grace"}]}]}
```

Entries: `label` (1–200 characters, no control characters), `weight` (0.001–1,000,000, at most 3 decimals; default 1), `enabled` (default true), `tags` (0–8 strings; the first tag is the one team balancing uses), `color` (`#RRGGBB`), `imageRef`. Up to 1,000 entries per wheel and 100 wheels per project. Unknown keys are rejected except inside `settings`, where they are dropped with a warning. Settings include `title`, `mode` (`normal`, `elimination`, `multi`, `teams`), `spinDuration` (1–30 s), `multi`, `teams` (`by`, `count`, `size`, `balance`, `keepApart`, `keepTogether` as entry ids), `theme`, `palette`, `fairDraw` and more; see the schema. One rule is checked by `validate` but can't be written in JSON Schema: every `imageRef` must exist in `images`.

### Receipt (receipt-v1)

Schema: `whirlpick schema receipt` or https://whirlpick.vercel.app/schema/receipt-v1.json.

```json
{
  "$schema": "https://whirlpick.vercel.app/schema/receipt-v1.json",
  "format": "whirlpick-receipt", "version": 1, "algorithm": "whirlpick-draw-v1",
  "title": "Friday raffle",
  "entries": [{ "label": "Ada", "weight": 1, "enabled": true }, { "label": "Grace", "weight": 1, "enabled": true }, "…"],
  "wheelHash": "c1cb0f82ab96a6e28be030e3ae95b61b2797dcf291be37a2165ef20ca30496ef",
  "committedWheelHash": null,
  "seed": "5f1c2e0a9b3d4c7e8f60718293a4b5c6d7e8f90112233445566778899aabbccd",
  "seedPhrase": null,
  "commitment": "012404c0f3d4e855216c59c93e220c43a88a740959875028a49a095496af938c",
  "publicInput": "blue sky", "spinIndex": 0, "mode": "multi",
  "params": { "count": 2, "excluded": [] },
  "result": { "picks": [{ "index": 1, "label": "Grace", "landingU32": 3948856233 }, { "index": 0, "label": "Ada", "landingU32": 2750612132 }] },
  "beacon": null,
  "createdAt": "2026-09-29T12:00:00.000Z", "committedAt": "2026-09-29T12:00:00.000Z", "app": "whirlpick-cli/0.1.0"
}
```

Teams receipts carry `params: { teamCount, teamSize, balance, keepApart, keepTogether, previousRounds, iterations: 5000 }` and `result: { teams, repeatPairs }`. A receipt with `seed: null` is committed but not yet revealed.

**Verify report:** `{ ok, status: "valid" | "invalid" | "unrevealed", checks: [{ id, ok, code?, detail }], warnings, recomputed }`. Failure codes, in check order: `BAD_JSON`, `UNSUPPORTED_VERSION`, `UNKNOWN_ALGORITHM`, `SCHEMA_INVALID`, `BEACON_UNSUPPORTED`, `WHEEL_HASH_MISMATCH`, `EXPECTED_WHEEL_MISMATCH`, (unrevealed stops here), `SEED_PHRASE_MISMATCH`, `COMMITMENT_MISMATCH`, `EXPECTED_COMMITMENT_MISMATCH`, `PARAMS_INVALID`, `RESULT_MISMATCH`, `LABEL_MISMATCH`. A list that changed after the commitment was shown is still valid but warns `WHEEL_CHANGED_AFTER_COMMIT`.

### Links

- Wheel: `https://whirlpick.vercel.app/#w=<code>`, where code = `1.` + base64url(deflate-raw(JSON of a one-wheel project)). Agents can hand-write `1j.` + base64url(JSON) without compression. Images are not included. Fragments never reach a server.
- Plain list: `https://whirlpick.vercel.app/#names=Ada%0AGrace%0ALinus`.
- Replay: `https://whirlpick.vercel.app/#spin=<receipt code>`; verify: `https://whirlpick.vercel.app/verify/#r=<receipt code>`.
- Query options: `?preset=<id>`, `?mode=`, `?count=`, `?teams=`, `?duration=`, `?fair=1` and more.

## The algorithm (whirlpick-draw-v1)

Full spec with test vectors: https://whirlpick.vercel.app/about/#algorithm. In short:

- `wheelHash` = SHA-256 of a canonical encoding of the entries in order (label, milli-weight, enabled flag, tags). Ids, colours, images and settings are not counted.
- `commitment` = SHA-256(`"whirlpick-commit-v1"` ‖ 0x00 ‖ seed). With a public input, the stream key is SHA-256(`"whirlpick-mix-v1"` ‖ 0x00 ‖ seed ‖ word), else the seed.
- The byte stream is SHA-256 in counter mode: block(c) = SHA-256(`"whirlpick-draw-v1"` ‖ 0x00 ‖ key ‖ wheelHash ‖ spinIndex ‖ c), 32-bit big-endian integers.
- A pick draws r uniformly below the total milli-weight with rejection sampling (no modulo bias) and takes the first entry whose running total passes r; the next 32 bits place the pointer inside the central 90 % of that slice. Several winners are drawn without replacement under one spin index.
- Teams: a seeded Fisher–Yates shuffle, tag groups dealt round-robin (snake order), deterministic repair for keep-apart / keep-together rules, then up to 5,000 seeded swaps that reduce repeat teammates from earlier rounds.

An independent Python reference (standard library only) reproduces the pick algorithm: `pnpm test:ref`, or `python3 scripts/ref/draw_v1.py --verify receipt.json`.

## Presets

`blank`, `names-sample`, `yes-no`, `yes-no-maybe`, `coin`, `numbers-1-10`, `numbers-1-100`, `numbers` (`--min`/`--max`, up to 1,000 values), `letters`, `food`, `truth-or-dare`, `decision`, `chores`, `countries` (195), `raffle-sample`, `class-sample`, `teams-sample`, `order-sample`. All names in presets are made up.

## For contributors

- `packages/core`: pure TypeScript (no DOM, no Node APIs; `pnpm check:pure`). Everything the browser, CLI and MCP share.
- `packages/cli`: `src/cli.ts` (commands), `src/mcp.ts` (tools), `src/ops.ts` (shared operations), `src/paths.ts` (path safety).
- Tests: `pnpm test` (builds packages, then vitest: core, CLI goldens, MCP over stdio). Update goldens after a reviewed change with `UPDATE_GOLDEN=1 pnpm --filter whirlpick test`.
