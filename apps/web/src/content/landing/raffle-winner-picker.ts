import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "raffle-winner-picker",
  preset: "raffle-sample",
  open: { mode: "multi", count: 3, fairDraw: true },
  title: "Fair raffle and giveaway winner picker",
  description:
    "Draw raffle and giveaway winners with a commitment shown before the spin and a receipt anyone can check after. Weighted tickets, several winners, no repeats.",
  h1: "Fair raffle and giveaway winner picker",
  intro:
    "Fair draw is switched on and set to pick three winners from thirty sample tickets. Before you spin, the page shows a commitment and a list fingerprint you can publish. After the spin, anyone can check the result.",
  sections: [
    {
      h2: "Run a giveaway people can check",
      body: [
        "Every online giveaway ends with the same question. How do we know you didn't just pick your friend? A screen recording doesn't answer it, because the host could have spun ten times and kept the one they liked. The fix is to fix the randomness in public before the draw and let people check it afterwards.",
        {
          steps: [
            "Close entries and paste the final list into the wheel.",
            "Copy the commitment and the list fingerprint that fair draw shows. Post both in the same place as the giveaway, before the draw, with the time.",
            "Optionally, open the room word field and ask your audience for a word in the live chat. Type the first one that comes in. It must come after the commitment is posted.",
            "Spin live on stream or on a call.",
            "Post the receipt or its verify link. The seed is revealed in it, and anyone can paste it into the [verify page](/verify/).",
          ],
        },
        "Anyone checking can confirm three things. The seed matches the commitment you posted. The list in the receipt has the fingerprint you posted. Re-running the published draw gives the same winners.",
      ],
    },
    {
      h2: "Tickets, entries and weights",
      body: [
        "There are two honest ways to give someone more than one chance. List each ticket as its own entry, which is what the sample does with numbered tickets. Or list each person once with a weight equal to the tickets they hold. A buyer with five tickets gets weight 5 and is five times as likely to win as a buyer with one.",
        "Both appear in the receipt, and the list fingerprint covers names, weights and order. If you change a weight after posting the fingerprint, the receipt flags that the list changed after the commitment.",
      ],
    },
    {
      h2: "Several winners, no repeats, and runner-ups",
      body: [
        "Pick N winners draws without replacement, so nobody can win twice in the same draw. With count set to 3, the first name drawn takes first prize, the second takes second, and so on. The order is part of the receipt.",
        "Plan for winners who never reply. Set the count higher than the number of prizes, say 5 for 3 prizes, and announce before the draw that places 4 and 5 are runner-ups in that order. Then an unclaimed prize goes to the next name without a second draw that people might question. Choose sequential reveal to spin once per winner on stream, or instant to show all names together.",
      ],
    },
    {
      h2: "What the receipt proves, and what it doesn't",
      body: [
        "The receipt proves the seed was fixed before the spin and wasn't swapped after the commitment went up. It shows the exact list and weights, and anyone can re-run the draw and get the same winners. It is reproducible and checkable, which is more than most giveaway tools offer.",
        "It can't stop a host from generating many seeds in private and committing only to one they like. That is what the room word is for. The host can't know a word the audience types after the commitment is posted, so they can't pre-select a winner. Read [how the draw works](/about/#algorithm) for the details.",
      ],
    },
  ],
  faq: [
    {
      q: "How do I prove my giveaway draw was fair?",
      a: "Turn on fair draw, post the commitment and list fingerprint before the draw, spin live, then post the receipt. Anyone can paste the receipt into the verify page to confirm the seed matches your commitment and the winners come from that list. Add a room word from your audience to close the last gap.",
    },
    {
      q: "Can one person have multiple entries?",
      a: "Yes. Either add them once per ticket, or add them once with a weight equal to their number of tickets. A weight of 4 gives four times the chance of a weight of 1. Weights are written into the receipt and covered by the list fingerprint.",
    },
    {
      q: "How do I pick 3 winners without repeats?",
      a: "Use pick N winners with a count of 3. The draw removes each winner before picking the next, so the same entry can't win twice. You can reveal the winners one at a time or all at once, and one receipt covers the whole draw.",
    },
    {
      q: "Can people verify the draw without trusting me?",
      a: "Yes. The receipt holds the full list, the seed and the result, and the algorithm is published. Anyone can check it on the verify page, with the command-line tool, or by writing their own checker from the [algorithm spec](/about/#algorithm). The room word covers the one thing a receipt alone can't.",
    },
    {
      q: "Is my list of entrants uploaded?",
      a: "No. The list stays in your browser. The receipt contains the entrant list because checkers need it, so remove anything private, such as email addresses, and use first names or ticket numbers before you post a receipt publicly.",
    },
  ],
  related: ["is-the-wheel-rigged", "random-number-wheel", "random-name-picker"],
  navLabel: "Raffle picker",
  updated: "2026-09-29",
};

export default page;
