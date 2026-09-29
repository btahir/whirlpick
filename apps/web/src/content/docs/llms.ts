// Builds /llms.txt (llmstxt.org format). Called by the prerender script with the site constants,
// so no host is hard-coded here.

export function llmsTxt(o: {
  siteUrl: string;
  repoUrl: string;
  landing: { slug: string; title: string }[];
}): string {
  const site = o.siteUrl.replace(/\/+$/, "");
  const repo = o.repoUrl.replace(/\/+$/, "");

  const lines: string[] = [
    "# Whirlpick",
    "",
    "> Free, MIT-licensed spin wheel, random name picker and team splitter that runs entirely on the user's device and gives every draw a receipt anyone can re-check.",
    "",
    "Whirlpick is a static web app with no server, no account, no ads and no analytics. Saved wheels live in the browser's IndexedDB. Share links carry the wheel in the URL fragment, which browsers don't send to servers. It works offline after the first load.",
    "",
    "Every draw uses the documented algorithm whirlpick-draw-v1: a SHA-256 counter-mode stream over the seed, the list fingerprint and the spin index, with rejection sampling for exact weights. The same seed and list give the same result in the browser, the CLI and the MCP server. In fair-draw mode the seed's SHA-256 commitment is shown before the spin and the seed is revealed after it. A commitment proves the seed wasn't swapped after it was published; an optional room word, given after the commitment, stops a host from trying seeds in advance. No third party audits or signs off on draws; the claim is that every draw is reproducible and checkable.",
    "",
    "Agents can use the `whirlpick` CLI (every command supports `--json`, with stable exit codes 0 to 6) or the `whirlpick-mcp` stdio server with seven tools: spin_wheel, split_teams, verify_receipt, create_commitment, make_share_link, validate_wheel, list_presets. The CLI is run from the repository; it is not on npm yet. No tool makes a network call or needs a key.",
    "",
    "## Docs",
    "",
    `- [Whirlpick for agents](${site}/docs/agents/): every CLI command and flag, exit codes, MCP tools with inputs and outputs, file formats, share links, deep-link parameters and the embed postMessage API`,
    `- [Project file schema, whirl-v1](${site}/schema/whirl-v1.json): JSON Schema for .whirl.json files`,
    `- [Receipt schema, receipt-v1](${site}/schema/receipt-v1.json): JSON Schema for draw receipts`,
    `- [Verify a receipt](${site}/verify/): paste a receipt or open /verify/#r=<code>; what each check means and how to check by hand`,
    `- [About, privacy and the algorithm](${site}/about/): privacy, the exact whirlpick-draw-v1 spec at /about/#algorithm, and what a receipt does and doesn't prove`,
    `- [Source code](${repo}): MIT; AGENTS.md in the repository root mirrors the agents page`,
    "",
    "## Pages",
    "",
    `- [Spin wheel and random name picker](${site}/): the app`,
    ...o.landing.map((p) => `- [${p.title}](${site}/${p.slug.replace(/^\/+|\/+$/g, "")}/)`),
    "",
    "## Quick recipes",
    "",
    "Run from a clone of the repository after `pnpm i && pnpm build:packages`; `whirlpick` below means `pnpm whirlpick`.",
    "",
    "```bash",
    "# pick one winner",
    'whirlpick spin --entries "Ada,Grace,Linus,Margaret" --json',
    "",
    "# three raffle winners from a CSV, with a receipt file and a replay link",
    "whirlpick spin entrants.csv --count 3 --receipt-out receipt.json --link --json",
    "",
    "# a random order for standup",
    'whirlpick spin --entries "Ada,Grace,Linus,Margaret" --count all --json',
    "",
    "# six balanced teams, keeping two people apart",
    'whirlpick teams class.csv --teams 6 --apart "Ada,Grace" --json',
    "",
    "# public draw: commit first, publish the commitment, then spin with the saved seed",
    "whirlpick commit --out seed.json --json",
    'whirlpick spin entrants.csv --seed-file seed.json --public-input "blue sky" --receipt-out receipt.json --json',
    "",
    "# check a receipt against the commitment you published",
    "whirlpick verify receipt.json --commitment <hex> --json",
    "",
    "# a link that opens the wheel ready to spin, or replays a recorded draw",
    'whirlpick link --entries "Ada,Grace,Linus" --json',
    "whirlpick link --replay receipt.json --json",
    "",
    "# validate a project file",
    "whirlpick validate class.whirl.json --json",
    "```",
    "",
    `Hand-made links: ${site}/#names=Ada%0AGrace%0ALinus opens a wheel from a newline-separated list. ${site}/#spin=<receipt code> replays a draw, and ${site}/verify/#r=<receipt code> verifies one.`,
    "",
    `MCP config: {"mcpServers":{"whirlpick":{"command":"node","args":["/abs/path/whirlpick/packages/cli/bin/whirlpick-mcp.js","--root","/abs/project"]}}}`,
    "",
  ];

  return lines.join("\n");
}
