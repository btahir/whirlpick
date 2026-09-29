import type { Section } from "./types";

export const HOME_CONTENT: { sections: Section[] } = {
  sections: [
    {
      h2: "A spin wheel and name picker that stays on your device",
      body: [
        "Whirlpick is a free spin the wheel tool. Paste a list of names or options, one per line or straight from a spreadsheet, and spin. It can pick one winner, pick several without repeats, remove each winner until everyone has had a turn, or split the list into balanced teams.",
        "Your lists never leave this browser. There is no account, no ads and no analytics. Saved wheels live in your browser's storage, and share links carry the list after the # sign, which browsers don't send to any server. After the first visit it works offline, and you can install it like an app.",
      ],
    },
    {
      h2: "Spins you can check afterwards",
      body: [
        "Every spin comes with a receipt that records the list, the seed and the result. The winner is worked out from the seed with a published algorithm before the wheel moves, so the result can be checked by anyone later. Paste a receipt into the [verify page](/verify/) to see it recomputed.",
        "For raffles and giveaways, turn on fair draw. A commitment to the seed and a fingerprint of the list appear before the spin, so you can post them first. The seed is revealed afterwards. An optional room word from your audience stops a host from testing seeds in advance. [How the draw works](/about/#algorithm) explains the details and the limits.",
        "Whirlpick is open source under the MIT licence, and it can also be driven from the command line. See the [agent docs](/docs/agents/).",
      ],
    },
  ],
};
