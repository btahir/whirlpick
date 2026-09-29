import type { DocPage } from "../types";

// Keep in step with AGENTS.md in the repo root. seo:check asserts that every CLI command, flag,
// exit code and MCP tool name from PLAN §5 appears in both.

export const AGENTS_DOC: DocPage = {
  path: "/docs/agents/",
  title: "Whirlpick for agents: CLI, MCP server and embed API",
  description:
    "Every whirlpick CLI command and flag, exit codes, the seven MCP tools, .whirl.json and receipt formats, share links and the embed postMessage API.",
  h1: "Whirlpick for agents and scripts",
  intro:
    "An agent can do everything the web app does from a shell or over MCP: pick winners, split teams, commit to a seed before a public draw, build a link that replays the draw on a screen, and check receipts. The same seed and the same list give the same result, byte for byte, in the browser, the CLI and the MCP server. None of these tools make a network call or need a key.",
  sections: [
    {
      h2: "Install and run",
      id: "install",
      body: [
        "The CLI isn't published to npm yet, so run it from a clone of the repository. It needs Node 24 or newer and pnpm.",
        {
          code: 'git clone {REPO_URL} whirlpick\ncd whirlpick\npnpm i && pnpm build:packages && pnpm whirlpick spin --entries "Ada,Grace"',
          lang: "bash",
        },
        "`pnpm whirlpick <command>` runs `node packages/cli/bin/whirlpick.js`, and `pnpm whirlpick-mcp` starts the MCP server from `packages/cli/bin/whirlpick-mcp.js`. The examples on this page write `whirlpick` for short.",
      ],
    },
    {
      h2: "Output, global flags and entry sources",
      id: "common",
      body: [
        "By default the CLI prints short text for people. With `--json` it prints exactly one JSON document on stdout, for success and for errors alike, and nothing else goes to stdout. Warnings go into the `warnings` array with `--json` and to stderr without it.",
        {
          table: {
            head: ["Global flag", "Effect"],
            rows: [
              ["`--json`", "Print one JSON document on stdout, success or error."],
              ["`--quiet`", "Print only the result, without notes."],
              ["`--help`", "Help for the CLI, or for one command: `whirlpick spin --help`."],
              ["`--version`", "Print the version."],
              ["`--no-color`", "Plain text with no ANSI colours."],
            ],
          },
        },
        "`spin`, `teams`, `link` and `open` read entries from exactly one source:",
        {
          table: {
            head: ["Source", "Example", "Notes"],
            rows: [
              ["A file", "`whirlpick spin names.txt`", "`.txt`, `.csv`, `.tsv`, `.whirl.json` or `.json`."],
              ["`-` for stdin", "`cat names.csv | whirlpick spin - --format csv`", "`--format txt|csv|tsv|json`. Default: JSON if the first non-space character is `{`, CSV or TSV if at least 80 % of the first 20 lines contain the detected delimiter, otherwise txt."],
              ["`--entries`", "`--entries \"Ada,Grace,Linus\"`", "Comma-separated labels."],
              ["`--entries-sep`", "`--entries \"Ada;Grace\" --entries-sep \";\"`", "Changes the separator for `--entries`."],
              ["`--preset <id>`", "`--preset yes-no`", "A built-in wheel. `whirlpick presets` lists them."],
              ["`--wheel <id|name>`", "`whirlpick spin class.whirl.json --wheel \"Class 4B\"`", "Picks a wheel inside a project file. Default: `activeWheelId`, else the first wheel."],
            ],
          },
        },
        "Text input rules are shared with the web editor. A `.txt` file is one entry per line; lines are trimmed, blank lines are skipped, and a leading `#` is part of the label. CSV and TSV follow RFC 4180 quoting, and the delimiter is detected from the first 5 lines. A header row is recognised when its first cell is `name`, `label`, `entry` or `names`, and then the columns `name`/`label`, `weight`, `tags`, `color`/`colour` and `enabled` map by header. Without a header, column 1 is the label, column 2 the weight if numeric and column 3 the tags. Tags are split on `|`. A bad weight becomes 1 with warning `WEIGHT_IGNORED`.",
        "For tests only, the environment variable `WHIRLPICK_FIXED_NOW=<ISO date>` pins `createdAt` in receipts.",
      ],
    },
    {
      h2: "whirlpick spin",
      id: "spin",
      body: [
        { code: "whirlpick spin [source] [options]", lang: "bash" },
        {
          table: {
            head: ["Flag", "Meaning"],
            rows: [
              ["`--count <n|all>`", "How many winners, drawn without repeats. Default 1. More than 1, or `all`, switches to multi mode; `all` gives a full random order."],
              ["`--mode single|multi|elimination`", "Draw mode. Elimination removes each winner before the next spin."],
              ["`--spins <n>`", "Elimination only: run `n` spins in one call under one seed, with spin indices 0 to n−1 and winners excluded as they go."],
              ["`--seed <hex64>`", "Use this 64-hex-character seed instead of a fresh random one."],
              ["`--seed-phrase <text>`", "Derive the seed from a phrase. Phrases are guessable, so this emits warning `SEED_PHRASE_GUESSABLE`."],
              ["`--seed-file <path>`", "Read the seed from the JSON file written by `whirlpick commit --out`."],
              ["`--public-input <text>`", "The room word, up to 64 characters, supplied after the commitment was published. It is mixed into the draw."],
              ["`--spin-index <n>`", "Spin index within a session. Default 0."],
              ["`--exclude <i,j,…>`", "Snapshot indices to leave out, for example earlier winners."],
              ["`--title <text>`", "Title stored in the receipt. Informational, not hashed."],
              ["`--receipt-out <path>`", "Write the receipt JSON to a file. With `--spins`, an array of receipts."],
              ["`--link`", "Add a replay link to the output."],
              ["`--force`", "Allow `--receipt-out` to overwrite an existing file."],
            ],
          },
        },
        {
          code: 'whirlpick spin --entries "Ada,Grace,Linus,Margaret" --json --link',
          lang: "bash",
        },
        {
          code: '{ "ok": true, "mode": "single", "winners": [{ "index": 2, "label": "Linus" }],\n  "receipts": [ { "format": "whirlpick-receipt", "version": 1, "algorithm": "whirlpick-draw-v1", "...": "..." } ],\n  "link": "{SITE_URL}/#spin=1.…",\n  "warnings": [] }',
          lang: "json",
        },
        "Human output is `Winner: Linus` (a numbered list for several winners), followed by the seed and the commitment.",
      ],
    },
    {
      h2: "whirlpick teams",
      id: "teams",
      body: [
        { code: "whirlpick teams [source] (--teams <n> | --size <k>) [options]", lang: "bash" },
        {
          table: {
            head: ["Flag", "Meaning"],
            rows: [
              ["`--teams <n>`", "Split into `n` teams. Give this or `--size`, not both."],
              ["`--size <k>`", "Teams of at most `k`; the team count is `ceil(members / k)`."],
              ["`--balance`", "Spread each tag evenly across teams, within 1 per team. On by default when any entry has a tag."],
              ["`--no-balance`", "Ignore tags."],
              ["`--apart \"Ada,Grace\"`", "Keep these people on different teams. Repeatable. Use labels, or `#index` for duplicates; an ambiguous duplicate label exits 3 with `LABEL_AMBIGUOUS`."],
              ["`--together \"Linus,Margaret\"`", "Keep these people on the same team. Repeatable."],
              ["`--history <path>`", "Earlier team receipts: one receipt, an array, or a `.whirl.json` whose history holds team receipts for this wheel. The split then avoids repeat teammates."],
              ["`--seed`, `--seed-phrase`, `--seed-file`, `--public-input`, `--spin-index`", "Same as for `spin`."],
              ["`--format json|text|csv`", "Output format for the team list."],
              ["`--receipt-out <path>`", "Write the receipt JSON to a file."],
            ],
          },
        },
        {
          code: "whirlpick teams students.csv --teams 6 --apart \"Ada,Grace\" --json",
          lang: "bash",
        },
        {
          code: '{ "ok": true,\n  "teams": [{ "name": "Team 1", "members": [{ "index": 0, "label": "Ada", "tags": ["3"] }] }],\n  "sizes": [4, 4, 4, 4, 4, 4],\n  "balance": { "byTag": { "3": [1, 1, 1, 1, 1, 1] }, "withinOne": true },\n  "repeatPairs": 0,\n  "receipt": { "...": "..." },\n  "text": "Team 1: Ada, Linus, Margaret, Grace\\n…",\n  "csv": "team,name,tags\\n…",\n  "warnings": [] }',
          lang: "json",
        },
        "If the rules can't all be met, the command exits 6 with `CONSTRAINTS_UNSATISFIED` and a message naming the rule, for example \"Couldn't satisfy: keep Ada and Grace apart. Try more teams or fewer rules.\" If tag balance had to relax to satisfy a rule, the output has `withinOne: false` and warning `BALANCE_RELAXED`.",
      ],
    },
    {
      h2: "whirlpick verify",
      id: "verify",
      body: [
        { code: "whirlpick verify <receipt|-> [--commitment <hex>] [--wheel-hash <hex>]", lang: "bash" },
        "The argument can be a receipt JSON file, `-` for stdin, a receipt share code, or a `/verify/#r=` or `/#spin=` URL.",
        {
          table: {
            head: ["Flag", "Meaning"],
            rows: [
              ["`--commitment <hex>`", "The commitment you saw before the spin. The check fails if the receipt's differs."],
              ["`--wheel-hash <hex>`", "The list fingerprint you saw before the spin. The check fails if the receipt's differs."],
            ],
          },
        },
        "Output is the verification report: `{ ok, status: \"valid\" | \"invalid\" | \"unrevealed\", checks: [{id, ok, code?, detail}], warnings, recomputed: {wheelHash, commitment?, picks? | teams?} }`. Exit code 0 means valid, 4 means invalid, and 5 means the seed hasn't been revealed yet. The [verify page](/verify/) explains each check.",
      ],
    },
    {
      h2: "whirlpick commit",
      id: "commit",
      body: [
        { code: "whirlpick commit [--seed <hex64>] [--out <path>]", lang: "bash" },
        "Generates a seed, or takes the one you give with `--seed`, and prints `{ ok, seed, commitment, createdAt, note }`. With `--out`, it writes `{seed, commitment, createdAt}` to a new file with mode `0600` and leaves `seed` out of stdout, which is safer for agents whose stdout gets logged. Use `--force` to overwrite an existing file. The `note` says what to do next: publish the commitment now, keep the seed secret, and spin later with `--seed-file`.",
      ],
    },
    {
      h2: "whirlpick link and whirlpick open",
      id: "link",
      body: [
        { code: "whirlpick link [source] [--replay <receipt>] [--base <url>] [--preset <id>] [--qr] [--qr-svg <path>]", lang: "bash" },
        {
          table: {
            head: ["Flag", "Meaning"],
            rows: [
              ["`--replay <receipt>`", "Build a `#spin=` replay link for this receipt instead of a wheel link."],
              ["`--base <url>`", "Base URL. Defaults to the public site; accepts `http://127.0.0.1:4324` for local testing."],
              ["`--preset <id>`", "Link to a built-in wheel."],
              ["`--qr`", "Also print a QR code in the terminal."],
              ["`--qr-svg <path>`", "Write the QR code as an SVG file."],
            ],
          },
        },
        "Prints `{ ok, url, length, qrAvailable, warnings }`. A QR code is only available when the full URL is at most 1,800 characters.",
        "`whirlpick open [source] [...link flags]` is an alias of `link` that prints only the URL line, or `{url}` with `--json`. It doesn't launch a browser.",
      ],
    },
    {
      h2: "whirlpick validate, presets and schema",
      id: "validate",
      body: [
        {
          table: {
            head: ["Command", "Output"],
            rows: [
              ["`whirlpick validate <file>`", "`{ ok, valid, errors: [{path, code, message}], warnings, summary: {wheels, entries, images, history} }`. Exit 0 if valid, 3 if not. `path` is a JSON pointer."],
              ["`whirlpick presets`", "`{ presets: [{id, title, slug, entries, mode}] }`."],
              ["`whirlpick presets <id>`", "That preset as a one-wheel `whirl-v1` project."],
              ["`whirlpick presets numbers --min 5 --max 15`", "The number wheel for any range, with `--min` and `--max` (at most 1,000 values). `--preset numbers` on `spin` takes the same two flags."],
              ["`whirlpick schema whirl`", "The JSON Schema for `.whirl.json` files."],
              ["`whirlpick schema receipt`", "The JSON Schema for receipts."],
            ],
          },
        },
        "Preset ids: `blank`, `names-sample`, `yes-no`, `yes-no-maybe`, `coin`, `numbers-1-10`, `numbers-1-100`, `numbers` (takes `min` and `max`, up to 1,000 values), `letters`, `food`, `truth-or-dare`, `decision`, `chores`, `countries`, `raffle-sample`, `class-sample`, `teams-sample`, `order-sample`.",
      ],
    },
    {
      h2: "Exit codes",
      id: "exit-codes",
      body: [
        "Exit codes are stable across versions.",
        {
          table: {
            head: ["Code", "Meaning"],
            rows: [
              ["0", "Success. For `verify`: the receipt is valid."],
              ["1", "Internal error, which is a bug. Please report it."],
              ["2", "Usage error: unknown command or flag, missing or conflicting arguments."],
              ["3", "Invalid input: file missing, unreadable or too big, parse or schema error, path rejected, label or weight invalid, entry limit."],
              ["4", "Verification failed: the receipt is invalid."],
              ["5", "Receipt not revealed: the seed is missing."],
              ["6", "Infeasible draw: count larger than the eligible entries, no eligible entries, team rules unsatisfiable (`CONSTRAINTS_UNSATISFIED`), a team-rule search too large to finish (`CONSTRAINTS_SEARCH_LIMIT`), or team count invalid."],
            ],
          },
        },
        "With `--json`, errors look like this:",
        {
          code: '{ "ok": false,\n  "error": { "code": "COUNT_TOO_LARGE", "message": "…", "details": { } },\n  "exitCode": 6 }',
          lang: "json",
        },
        "Error codes you are likely to meet: `LABEL_INVALID`, `WEIGHT_INVALID`, `ENTRY_LIMIT`, `NO_ELIGIBLE_ENTRIES`, `COUNT_TOO_LARGE`, `TEAM_COUNT_INVALID`, `CONSTRAINT_INVALID`, `CONSTRAINT_CONFLICT`, `APART_TOO_MANY`, `TOGETHER_TOO_LARGE`, `CONSTRAINT_UNKNOWN_ENTRY`, `CONSTRAINTS_UNSATISFIED`, `LABEL_AMBIGUOUS`, `SCHEMA_INVALID`, `FILE_TOO_LARGE`, `FILE_UNREADABLE`, `PATH_NOT_FILE`, `OUTPUT_DIR_MISSING`, `OUTPUT_EXISTS`, `OUTPUT_SYMLINK`.",
      ],
    },
    {
      h2: "Reading and writing files safely",
      id: "paths",
      body: [
        "**CLI.** Paths resolve against the current directory. Inputs must be regular UTF-8 files, at most 5 MB, or 20 MB for project files; a byte-order mark is stripped. Directories, FIFOs, sockets and devices are refused with `PATH_NOT_FILE`. For outputs (`--receipt-out`, `--out`, `--qr-svg`) the parent directory must exist, an existing file is never overwritten without `--force`, and a symlinked destination is refused. Files are written to a temporary name in the same directory and then renamed. All of these exit 3.",
        "**MCP.** Stricter, because an agent drives it. Allowed roots are the `--root <dir>` arguments to `whirlpick-mcp`, else the environment variable `WHIRLPICK_MCP_ROOT` (several paths separated by the platform path delimiter), else the directory the server was started in. Every path is resolved with `realpath`, or the real path of its parent for outputs, and must land inside a root, so `..` and symlinks can't escape. Reads are limited to `.txt`, `.csv`, `.tsv` and `.json`, which includes `.whirl.json`. Writes are limited to `.json` and `.svg`, and an existing file is replaced only with `overwrite: true`. Violations return `PATH_OUTSIDE_ROOT`, `PATH_EXTENSION` or `OUTPUT_EXISTS`. Every tool accepts inline data, and paths are always optional.",
      ],
    },
    {
      h2: "MCP server",
      id: "mcp",
      body: [
        "`whirlpick-mcp` is a stdio MCP server named `whirlpick`. Add it to your client's configuration with absolute paths:",
        {
          code: '{"mcpServers":{"whirlpick":{"command":"node","args":["/abs/path/whirlpick/packages/cli/bin/whirlpick-mcp.js","--root","/abs/project"]}}}',
          lang: "json",
        },
        "Every tool declares an input and an output JSON Schema. A result carries `structuredContent` plus one `text` item holding the same JSON. A failure returns `isError: true` with `structuredContent: {error: {code, message, details}}`, using the same codes as the CLI. Shared input shapes:",
        {
          code: "EntryIn  = string | { label: string, weight?: number, enabled?: boolean, tags?: string[] }\nSource   = { entries?: EntryIn[] (1 to 1000), file?: string, wheel?: string, preset?: string }\n           // exactly one of entries, file or preset\nSeedOpts = { seed?: hex64, seedPhrase?: string, publicInput?: string, spinIndex?: integer >= 0 }\nReceipt  = a receipt-v1 object",
          lang: "text",
        },
        {
          table: {
            head: ["Tool", "Input", "Output"],
            rows: [
              ["`spin_wheel`", "`Source` and `SeedOpts`, plus `count?: int ≥ 1 | \"all\"`, `mode?: \"single\" | \"multi\" | \"elimination\"`, `spins?: 1 to 1000`, `exclude?: int[]`, `title?`, `includeLink?: boolean`, `receiptPath?`, `overwrite?`", "`{ winners: [{index, label}], receipts: Receipt[], link?, warnings }`"],
              ["`split_teams`", "`Source` and `SeedOpts`, plus exactly one of `teams?: int ≥ 2` or `teamSize?: int ≥ 1`, and `balance?`, `keepApart?: string[][]`, `keepTogether?: string[][]` (labels or `\"#<index>\"`), `previousRounds?: string[][][]` (labels), `history?: Receipt[]`", "`{ teams: [{name, members: [{index, label, tags}]}], sizes, balance: {byTag, withinOne}, repeatPairs, receipt, text, csv, warnings }`"],
              ["`verify_receipt`", "`receipt?: Receipt | string` (a share code or URL), `file?`, `expectedCommitment?: hex64`, `expectedWheelHash?: hex64`", "The verification report, as for `whirlpick verify`."],
              ["`create_commitment`", "`seed?: hex64`, `savePath?`, `overwrite?`", "`{ commitment, seed?, savedTo?, instructions }`. `seed` is left out when `savePath` is given."],
              ["`make_share_link`", "`Source`, plus `title?`, `settings?` (partial wheel settings), `replayReceipt?: Receipt`, `base?`, `qrSvg?: boolean`", "`{ url, length, qrAvailable, qrSvg?, warnings }`"],
              ["`validate_wheel`", "`project?: object` or `file?`", "`{ valid, errors: [{path, code, message}], warnings, summary }`"],
              ["`list_presets`", "`{}`", "`{ presets: [{id, title, slug, entries, mode}] }`"],
            ],
          },
        },
        "`create_commitment` is the tool to call before a public draw: publish the commitment it returns to the audience first, keep the seed secret, then call `spin_wheel` with that seed. The same inputs through MCP and through the CLI give byte-identical receipts, apart from the `app` field.",
      ],
    },
    {
      h2: "Recipe: a public draw people can check",
      id: "recipe",
      body: [
        "Use this for raffles, giveaways or anything where people might later say the draw was fixed. The order matters: the commitment has to be public before the spin.",
        {
          steps: [
            "**Commit.** `whirlpick commit --out draw-seed.json --json` prints the commitment and keeps the seed in the file only.",
            "**Publish.** Post the commitment in the chat, email or stream before the draw, together with the entrant list. The commitment covers the seed; the published list lets anyone confirm later that the receipt's entries are the ones announced. In the web app, the fair-draw panel also shows the list fingerprint to publish alongside.",
            "**Spin.** Optionally ask the audience for a room word after the commitment is out. Then run `whirlpick spin entrants.csv --count 3 --seed-file draw-seed.json --public-input \"blue sky\" --receipt-out receipt.json --json`.",
            "**Link.** `whirlpick link --replay receipt.json` gives a `#spin=` link that replays the exact draw on a projector or stream, and a `/verify/#r=` link lets anyone check it.",
            "**Verify.** Anyone can run `whirlpick verify receipt.json --commitment <the published hex>` or paste the receipt into the [verify page](/verify/). Exit code 0 means the seed matches the commitment and the winners follow from it.",
          ],
        },
        "Over MCP the same flow is `create_commitment` with `savePath`, then `spin_wheel` with `seed`, `publicInput` and `includeLink: true`, then `verify_receipt`.",
      ],
    },
    {
      h2: "More one-liners",
      id: "recipes",
      body: [
        {
          code: '# standup order: a full random order of the team\nwhirlpick spin --entries "Ada,Grace,Linus,Margaret,Alan" --count all\n\n# three raffle winners from a CSV, with a receipt file\nwhirlpick spin entrants.csv --count 3 --receipt-out receipt.json\n\n# six balanced groups from a tagged class list, keeping two students apart\nwhirlpick teams class.csv --teams 6 --apart "Ada,Grace" --format text\n\n# a classroom elimination session: five turns, nobody picked twice\nwhirlpick spin class.whirl.json --mode elimination --spins 5 --seed-file seed.json\n\n# a link that opens a wheel ready to spin, with a QR code as SVG\nwhirlpick link --entries "Ada,Grace,Linus" --qr-svg wheel-qr.svg',
          lang: "bash",
        },
      ],
    },
    {
      h2: "The .whirl.json project file",
      id: "whirl-json",
      body: [
        "A project file holds one or more wheels with their entries, settings, images and history. The schema is published at `{SITE_URL}/schema/whirl-v1.json` and printed by `whirlpick schema whirl`. This is the smallest valid file, and missing ids and settings get defaults on import:",
        {
          code: '{"format":"whirlpick-project","version":1,"wheels":[{"entries":[{"label":"Ada"},{"label":"Grace"}]}]}',
          lang: "json",
        },
        {
          list: [
            "An entry is `{ label, weight?, enabled?, color?, imageRef?, tags? }`. Weights go from 0.001 to 1,000,000 with at most 3 decimals; to leave someone out without deleting them, set `enabled: false`.",
            "At most 1,000 entries per wheel, 100 wheels per project, 500 history records per wheel and 20 MB per file.",
            "Unknown keys are rejected, except inside `settings`, where they are dropped with a warning.",
            "`layout` is reserved and must be `null`.",
          ],
        },
      ],
    },
    {
      h2: "Receipts",
      id: "receipts",
      body: [
        "Every draw produces a `receipt-v1` JSON object. The schema is at `{SITE_URL}/schema/receipt-v1.json` and printed by `whirlpick schema receipt`. It holds the algorithm name `whirlpick-draw-v1`, the full entry list, `wheelHash`, `committedWheelHash`, `seed` (null until revealed), `seedPhrase`, `commitment`, `publicInput`, `spinIndex`, `mode`, `params`, `result`, `beacon` (reserved, always null in v1) and the informational fields `title`, `createdAt`, `committedAt` and `app`.",
        "A receipt share code is `1.` followed by the base64url of the deflate-raw compressed JSON. It is what goes after `#r=` and `#spin=`.",
      ],
    },
    {
      h2: "Links: share, replay and verify",
      id: "links",
      body: [
        "All wheel data in links sits in the URL fragment, which browsers never send to a server. Opening a link never overwrites a saved wheel; it opens as an unsaved copy with a Save button.",
        {
          table: {
            head: ["Link", "Opens"],
            rows: [
              ["`{SITE_URL}/#w=<code>`", "A full wheel with its settings. `code` is `1.` plus base64url of the deflate-raw compressed one-wheel project, or `1j.` plus base64url of the plain JSON. Landing pages accept it too."],
              ["`{SITE_URL}/#names=<list>`", "A wheel from a plain list: labels joined by newlines, then `encodeURIComponent`. The easiest link to type by hand."],
              ["`{SITE_URL}/#spin=<receipt code>`", "Replays a recorded draw: shows the commitment and list fingerprint, plays the exact animation on Spin, then shows the verify result. With `?autoplay=1` before the `#`, the replay starts by itself after one second."],
              ["`{SITE_URL}/verify/#r=<receipt code>`", "Runs verification on the receipt straight away."],
            ],
          },
        },
        {
          code: '{SITE_URL}/#names=Ada%0AGrace%0ALinus%0AMargaret\n\n# a hand-made 1j. wheel link, no compression needed\nprintf \'%s\' \'{"format":"whirlpick-project","version":1,"wheels":[{"entries":[{"label":"Ada"},{"label":"Grace"}]}]}\' \\\n  | base64 | tr \'+/\' \'-_\' | tr -d \'=\\n\'',
          lang: "bash",
        },
        "Base64url is RFC 4648 §5 without padding. An encoded fragment may be up to 64 KiB, but some chat apps cut links over 8 KiB. Images are never included in links.",
      ],
    },
    {
      h2: "Deep-link query parameters",
      id: "query",
      body: [
        "Query parameters set up the app for a session. They never carry names or other personal data, and they don't change a saved wheel.",
        {
          table: {
            head: ["Parameter", "Effect"],
            rows: [
              ["`?preset=<id>`", "Open a built-in wheel. `?preset=numbers&min=1&max=50` builds a number range, up to 1,000 values."],
              ["`?mode=normal|elimination|multi|teams`", "Start in this mode."],
              ["`?count=3`", "Winners per spin in multi mode."],
              ["`?teams=4` or `?size=3`", "Team split by count or by size."],
              ["`?duration=6`", "Spin length in seconds, 1 to 30."],
              ["`?theme=<id>`", "Colour theme."],
              ["`?fair=1`", "Turn on fair draw."],
              ["`?mystery=1`", "Hide labels until the result."],
              ["`?stream=1`", "Stream mode for OBS: no chrome, winner as a caption."],
              ["`?bg=transparent|RRGGBB`", "Background, for chroma key."],
              ["`?embed=1`", "Chrome-less embed layout, same as `/embed/`."],
              ["`?origin=<url>`", "Embed only: the parent origin allowed to send and receive messages."],
              ["`?presenter=1`", "Presenter mode: wheel fills the screen."],
              ["`?autoplay=1`", "Replay links only: start the replay automatically."],
            ],
          },
        },
        "When several sources compete, the order is: `#w=`, `#names=` or `#spin=`, then `?preset=`, then the last saved wheel opened, then the sample wheel.",
      ],
    },
    {
      h2: "Embed API",
      id: "embed",
      body: [
        "`/embed/`, or `?embed=1` on any wheel page, shows only the wheel, the Spin button and an optional title. It keeps nothing in storage. Wheel data comes from `#w=`, `#names=` or `?preset=`.",
        {
          code: '<iframe id="wheel"\n  src="{SITE_URL}/embed/?origin=https://example.com#names=Ada%0AGrace%0ALinus"\n  allow="autoplay; clipboard-write; fullscreen"\n  style="border:0;width:100%;aspect-ratio:1"></iframe>',
          lang: "html",
        },
        "Every message in either direction is an object `{ source: \"whirlpick\", v: 1, type, …, requestId? }`. A `requestId` you send comes back on the reply.",
        {
          table: {
            head: ["Parent to embed: type", "Fields", "Effect"],
            rows: [
              ["`spin`", "`requestId?`", "Starts a spin. While a spin is running it replies `error` with code `BUSY`."],
              ["`setEntries`", "`entries: EntryIn[]`, `requestId?`", "Replaces the entries, validated like any other input."],
              ["`setOptions`", "`options: {spinDuration?, sound?, confetti?, mode?, count?, theme?, background?, mysteryMode?}`", "Updates settings."],
              ["`reset`", "none", "Puts eliminated entries back."],
              ["`getState`", "`requestId?`", "Replies with `state`."],
            ],
          },
        },
        {
          table: {
            head: ["Embed to parent: type", "Fields"],
            rows: [
              ["`ready`", "`version: \"0.1.0\"`, `entries: int`. Sent once after load."],
              ["`spinStart`", "`requestId?`, `spinIndex`"],
              ["`result`", "`requestId?`, `winners: [{index, label}]`, `receipt`"],
              ["`state`", "`requestId?`, `entries: [{label, weight, enabled}]`, `settings`, `spinning: boolean`"],
              ["`error`", "`requestId?`, `code`, `message`"],
            ],
          },
        },
        "**Origin rule.** The embed only accepts messages whose `event.source` is its own parent window. With `?origin=https://example.com` it also requires `event.origin` to equal that origin and posts replies with it as `targetOrigin`. Without `?origin`, it accepts any parent origin and posts with `\"*\"`; results then contain only data the embedding page supplied. Set `?origin` whenever the page embedding the wheel can be framed by others.",
        "Sound needs a click inside the iframe unless the parent grants `allow=\"autoplay\"`.",
        {
          code: 'const frame = document.getElementById("wheel");\nwindow.addEventListener("message", (event) => {\n  if (event.source !== frame.contentWindow) return;\n  const msg = event.data;\n  if (!msg || msg.source !== "whirlpick") return;\n  if (msg.type === "result") console.log("Winner:", msg.winners[0].label);\n});\nframe.contentWindow.postMessage(\n  { source: "whirlpick", v: 1, type: "spin", requestId: "r1" },\n  "{SITE_URL}"\n);',
          lang: "js",
        },
      ],
    },
    {
      h2: "How the draw works",
      id: "algorithm",
      body: [
        "Draws use `whirlpick-draw-v1`: a SHA-256 counter-mode stream over the seed, the list fingerprint and the spin index, with rejection sampling so exact integer weights carry no modulo bias. The winner is decided first, and the landing spot inside the winner's slice comes from the same stream. The full specification, with every byte layout, is in [the algorithm section of the about page](/about/#algorithm).",
        "A commitment proves the seed wasn't swapped after it was published. It doesn't stop a host from trying seeds before committing; the room word (`--public-input`, `publicInput`) does. No third party audits or signs off on draws; the claim is that every draw is reproducible and checkable.",
      ],
    },
  ],
  updated: "2026-09-29",
};
