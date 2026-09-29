import type { DocPage } from "../types";

export const ABOUT: DocPage = {
  path: "/about/",
  title: "About Whirlpick: privacy and how the fair draw works",
  description:
    "Whirlpick keeps your lists on your device, with no account, ads or analytics. Read how each draw is made and checked, the exact algorithm, and its limits.",
  h1: "About Whirlpick",
  intro:
    "Whirlpick is a free spin wheel, random name picker and team splitter. It is MIT-licensed, it runs entirely in your browser, and every spin comes with a receipt that anyone can re-check. This page covers what happens to your data (nothing leaves your device), how a draw is made, the exact algorithm, and what a receipt can and can't prove.",
  sections: [
    {
      h2: "Your lists stay on this device",
      id: "privacy",
      body: [
        "Whirlpick has no server behind it. The site is a set of static files, and once they have loaded, the app makes no network requests. There is no account, no sign-in, no analytics, no ads and no third-party script of any kind. We can't see your names because they never reach us.",
        {
          list: [
            "**Saved wheels** live in your browser's IndexedDB, on this device only. If IndexedDB is blocked, the app falls back to localStorage, and if both are blocked it keeps the wheel in memory and tells you to export a file.",
            "**Share links** carry the wheel inside the URL fragment, the part after `#`. Browsers don't send the fragment to the server when they load a page, so a link can travel through chat or email without the list ever being uploaded. Once a link has opened, the app removes the fragment from the address bar.",
            "**Images** you add to slices stay in IndexedDB. They are left out of share links, and the share dialog says so.",
            "**Fonts** are self-hosted with the site. Loading a page doesn't call a font service.",
            "**Exported `.whirl.json` files** go from your browser straight to your disk.",
          ],
        },
        "Teachers can paste a class list without handing student names to anyone. Deleting the site's data in your browser settings, or deleting a wheel in the app, removes it for good, because no other copy exists.",
      ],
    },
    {
      h2: "How a fair draw works, in plain words",
      body: [
        "Most online wheels spin an animation and pick a winner in a way you can't see. Whirlpick does it the other way round. It decides the winner first, from a secret random number called the seed, and only then animates the wheel so it lands on that winner's slice.",
        "The seed is 256 bits from your browser's `crypto.getRandomValues`. Whirlpick feeds the seed, a fingerprint of the list and the spin number through SHA-256, and reads the winner out of the result. The same seed and the same list always give the same winner, on any device, in the web app, the command-line tool and the MCP server.",
        "In **Fair draw** mode the host commits before the spin. The app shows a commitment, which is the SHA-256 hash of the seed, together with the list fingerprint. Anyone watching can write both down or screenshot them. After the spin the app reveals the seed. Hashing that seed has to give back the commitment people saw, and re-running the draw with it has to give the same winner. If either one doesn't match, the [verify page](/verify/) says so.",
        "Every spin, fair draw or not, produces a receipt: the algorithm version, the full list, the list fingerprint, the seed, the commitment, the spin number and the result. You can paste it into [/verify/](/verify/), run it through the CLI, or check it with any SHA-256 tool and the spec below.",
      ],
    },
    {
      h2: "The exact algorithm: whirlpick-draw-v1",
      id: "algorithm",
      body: [
        "This is the full specification, detailed enough to write an independent checker. The repository holds golden test vectors in `packages/core/test/vectors.json` and a Python reference in `scripts/ref/draw_v1.py` that uses only the standard library.",
        "**Notation.** `‖` is byte concatenation. `u8(x)` and `u32be(x)` are 1-byte and 4-byte big-endian unsigned integers. `utf8(s)` is the UTF-8 encoding of `s`. `H(x)` is SHA-256. `tag(s)` is `utf8(s) ‖ 0x00`, a domain-separation prefix so no two uses of SHA-256 can collide. Hex is lowercase and every hash is 32 bytes.",
        "**Inputs.** Each entry has a label, a weight, an enabled flag and up to 8 tags.",
        {
          list: [
            "Label: `s.normalize(\"NFC\").trim()`, 1 to 200 code points, no C0 or C1 control characters and no lone surrogates. Duplicate labels are allowed and count as separate entries.",
            "Tags: 0 to 8 strings, each NFC and trimmed, 1 to 32 code points, same character rules. Order matters. A repeated tag within one entry is dropped.",
            "Weight: a number from 0.001 to 1,000,000 with at most 3 decimal places, stored as the integer milli-weight `m = round(w × 1000)`. Default weight 1. Weight 0 isn't allowed; disable the entry instead.",
            "At most 1,000 entries per wheel.",
          ],
        },
        "**List fingerprint.** The hash covers every entry in order, including disabled ones, with its label, milli-weight, enabled flag and tags. It ignores ids, colours, images, title, theme and all settings.",
        {
          code: 'wheelBytes = tag("whirlpick-wheel-v1")\n           ‖ u32be(entryCount)\n           ‖ for each entry, in order:\n                 u32be(byteLength(utf8(label))) ‖ utf8(label)\n               ‖ u32be(milliWeight)\n               ‖ u8(enabled ? 1 : 0)\n               ‖ u32be(tagCount)\n               ‖ for each tag: u32be(byteLength(utf8(tag))) ‖ utf8(tag)\nwheelHash  = hex(H(wheelBytes))',
          lang: "text",
        },
        "**Seed and commitment.** The seed is 32 bytes, written as 64 hex characters. A user may supply those 64 characters, or a free-text seed phrase, which becomes `seed = H(tag(\"whirlpick-seed-v1\") ‖ utf8(NFC(phrase)))`. Phrases are guessable, so the app warns about them and fair-draw mode doesn't offer them.",
        {
          code: 'commitment = hex(H(tag("whirlpick-commit-v1") ‖ seed))\n\n// optional room word, given after the commitment is shown (≤ 64 code points, NFC, trimmed)\nkey = publicInput == null\n    ? seed\n    : H(tag("whirlpick-mix-v1") ‖ seed ‖ utf8(publicInput))',
          lang: "text",
        },
        "**Byte stream.** The draw reads bytes from a SHA-256 counter-mode stream. `wheelHashRaw` is the 32 raw bytes of the fingerprint, not the hex. `spinIndex` is the spin number within a session, starting at 0. Bytes are read strictly in order, straight across block boundaries.",
        {
          code: 'block(c) = H( tag("whirlpick-draw-v1") ‖ key ‖ wheelHashRaw ‖ u32be(spinIndex) ‖ u32be(c) )   for c = 0, 1, 2, …\nstream   = block(0) ‖ block(1) ‖ block(2) ‖ …\n\nu32()  = next 4 bytes, big-endian unsigned\nu64()  = next 8 bytes, big-endian unsigned\n\nrandBelow(n):                        // 1 ≤ n ≤ 2^64\n  if n == 1: return 0                // reads nothing\n  limit = 2^64 − (2^64 mod n)\n  loop: x = u64(); if x < limit: return x mod n   // otherwise reject and read again',
          lang: "text",
        },
        "Rejection sampling means every value below `n` is exactly equally likely. There is no modulo bias.",
        "**One pick.** Eligible entries are the enabled entries whose index isn't in `excluded`, in list order. Receipts always report the entry's index in the full list.",
        {
          code: "T = sum of milliWeight over eligible entries\nr = randBelow(T)\nwinner = first eligible entry whose running milliWeight total is greater than r\nlandingU32 = u32()",
          lang: "text",
        },
        {
          list: [
            "**Single:** one pick.",
            "**Pick N (multi):** `count` picks in a row under one spin index, each over the entries still left, so nobody wins twice. `count: \"all\"` gives a full random order.",
            "**Elimination:** a session of single picks over the same list. Spin `s` uses `spinIndex = s` under the committed seed and excludes the winners of spins 0 to s−1. The fingerprint stays that of the full list.",
          ],
        },
        "**Landing spot.** The animation stops at a fraction `f = 0.05 + 0.90 × landingU32 / 2^32` of the way across the winner's slice, so it lands somewhere in the middle 90 %, between 5 % and 95 % of the slice and never on a boundary. In turns from the wheel's zero mark, `landingTurn = (cumBefore + f × w) / T`. How many extra rotations the wheel makes depends only on the spin duration and isn't part of the receipt.",
        "**Teams.** A team split uses one spin index and reads the stream in two places only: the shuffle and, when there are earlier rounds, the repeat-pair search. Weights are ignored; tags are used.",
        {
          steps: [
            "Validate before any randomness. Team count `N` comes from `--teams`, or from `ceil(M / K)` for team size `K`, and must be between 2 and the member count `M`. Keep-together sets merge into blocks. A block larger than `ceil(M / N)`, a keep-apart set holding two members of one block, or a keep-apart set larger than `N` is rejected.",
            "Shuffle with Fisher–Yates: `P` = eligible indices in order; for `i` from `M−1` down to 1, `j = randBelow(i + 1)`, swap `P[i]` and `P[j]`. A member's position in `P` is its rank, used for every later tie-break.",
            "When balance is on, group members by their first tag; when it is off, everyone is one group. If every tag is a number, groups go highest first; otherwise largest group first, ties by tag in code-point order. Untagged members come last.",
            "Assign group by group with a snake: each member goes to the team with the fewest members of that group, then the fewest members overall, then the lowest snake position, which is the team number on even groups and reversed on odd groups. Team sizes end up within 1 of each other, and so does each group's count per team.",
            "Repair keep-together and keep-apart rules with deterministic swaps in rank order, for up to 20 passes. Swaps never change team sizes. If rules still conflict, the split fails and says which rule couldn't be met.",
            "New round only. The cost is the number of teammate pairs who already shared a team in earlier rounds, counted once per earlier round. Run exactly 5,000 iterations, stopping early when the cost reaches 0. Each iteration picks `a` and `b` as `eligible[randBelow(M)]` twice, and both reads happen even when the pair is then skipped. Skip the pair if `a` and `b` are the same member or already teammates, if either is in a keep-together block, if the swap would break a keep-apart rule, or, with balance on, if their first tags differ. Otherwise swap them when the cost change is zero or negative.",
          ],
        },
        "Team output lists each team's members as indices sorted ascending. Team names are presentation only and aren't hashed.",
      ],
    },
    {
      h2: "What this does and doesn't prove",
      body: [
        "Commit and reveal proves one specific thing: the seed that produced the winner is the one that was fixed before the spin. The host couldn't swap it after seeing the result, because any other seed hashes to a different commitment. The list fingerprint does the same for the entries, so names added or removed after the commitment show up as a mismatch or a warning.",
        "It doesn't stop a host from trying many seeds in private before committing, keeping one that happens to pick a friend, and only then publishing its commitment. The optional room word closes that gap. After the commitment is on screen, someone in the audience calls out a word, and it is mixed into the draw. The host couldn't know the word when choosing the seed, so grinding seeds in advance gets them nothing.",
        "No third party audits or signs off on draws. The claim is that every draw is reproducible and checkable: anyone can re-run it from the receipt, with our tools or their own.",
      ],
    },
    {
      h2: "Works offline, and can be installed",
      body: [
        "After the first visit, a service worker keeps a copy of the app, so Whirlpick opens and spins with no connection at all. That helps in classrooms with patchy Wi-Fi or behind strict school filters. Installing it gives you an app icon and a window without browser controls.",
        {
          list: [
            "Chrome and Edge on a computer: the install icon at the right of the address bar, or the menu, then Install.",
            "Chrome on Android: the menu, then Add to Home screen or Install app.",
            "Safari on iPhone and iPad: the Share button, then Add to Home Screen.",
            "Safari on a Mac: File, then Add to Dock.",
            "Firefox on a computer has no install option. The site still works offline in a normal tab after the first visit, though not in a private window.",
          ],
        },
      ],
    },
    {
      h2: "Safari may clear saved wheels",
      body: [
        "Safari can delete a site's stored data when you haven't visited it for 7 days of browser use, unless you've added the site to your Home Screen. If you keep a wheel you care about, such as a class list, use Export file to save a `.whirl.json` copy. Importing that file brings everything back, including images and history.",
      ],
    },
    {
      h2: "Open source, and easy to host yourself",
      body: [
        "Whirlpick is MIT-licensed. The source is at {REPO_URL}. The build produces plain static files: HTML, JavaScript, CSS, fonts and icons, with no server code. A school IT team can copy them onto any web server or intranet host and run their own copy. Receipts made on one copy verify on any other, because the algorithm lives in the receipt, not on a server.",
        "Developers and agents can use the same draw engine from the command line or over MCP. See [Whirlpick for agents](/docs/agents/).",
      ],
    },
    {
      h2: "Credits",
      body: [
        "The fonts are self-hosted and released under the SIL Open Font License. All sounds are synthesised in code with the Web Audio API; the app ships no audio files. The confetti and the wheel renderer were written for Whirlpick. CREDITS.md in the repository lists every dependency and its licence.",
      ],
    },
    {
      h2: "Support",
      id: "support",
      body: [
        "Whirlpick is free, with no ads and no locked features, and it will stay that way. If it saved you a class period or settled a raffle, you can [Support Whirlpick](/support/).",
      ],
    },
  ],
  updated: "2026-09-29",
};
