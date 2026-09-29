import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "is-the-wheel-rigged",
  preset: "names-sample",
  open: { fairDraw: true },
  title: "Is the wheel rigged? How to check an online spin",
  description:
    "How online spin wheels pick a winner, what rigging would look like, and how to check a Whirlpick spin yourself with its commitment, seed and receipt.",
  h1: "Is the wheel rigged? How to check a spin",
  intro:
    "Fair draw is switched on for this wheel. Before you spin, look at the commitment and the list fingerprint on screen. Then spin, open the receipt, and follow the steps below to check it.",
  sections: [
    {
      h2: "How most online wheels pick a winner",
      body: [
        "Most spinners work the same way underneath. When you press spin, the page asks the browser for a random number, turns it into a winner, and plays an animation that ends on that slice. The animation is theatre. The decision was made the moment you clicked.",
        "That is fine as long as you trust the page. The trouble is that you can't see any of it. You can't tell which random source was used, whether every slice had the same odds, or whether the result came from somewhere else entirely.",
      ],
    },
    {
      h2: "What rigged could actually mean",
      body: [
        {
          list: [
            "Hidden weights. One slice is more likely than it looks.",
            "A chosen result. The host, or the site, decides the winner and the animation plays along.",
            "Re-spins off camera. The host spins until the result suits them and only shows that one.",
            "A changed list. A name is added, removed or duplicated between announcing the draw and running it.",
          ],
        },
        "None of these are visible in a video of the wheel. You need something you can check after the fact.",
      ],
    },
    {
      h2: "How Whirlpick makes a spin checkable",
      body: [
        "With fair draw on, a random 256-bit seed is created before the spin and kept hidden. The page shows a commitment, which is a SHA-256 hash of that seed, and a list fingerprint, which is a hash of every entry with its weight and position. You can screenshot or post both.",
        "The winner is computed from the seed and the list using a published algorithm. After the spin, the seed is revealed in a receipt. Anyone can hash the seed and see that it matches the commitment. Anyone can feed the same seed and list back into the algorithm and land on the same winner. The weights are all in the receipt, so hidden odds would be in plain sight.",
        "What this proves is narrow and useful. The seed was fixed before the spin and was not swapped afterwards, and the list is the one the fingerprint describes.",
        "It can't prove everything on its own. A host could generate thousands of seeds in private, test each one, and commit only to a seed that makes their friend win. The fix is the optional room word. After the commitment is shown, the audience types or calls out a word, and it is mixed into the draw. The host couldn't know it in advance, so testing seeds beforehand gets them nowhere. Use a room word whenever the host has something to gain.",
      ],
    },
    {
      h2: "Check a receipt, step by step",
      body: [
        {
          steps: [
            "Before the spin, note the commitment and list fingerprint the host shows. A screenshot is enough.",
            "After the spin, get the receipt from the host. It may be a file, a block of JSON text, or a verify link.",
            "Open the [verify page](/verify/) and paste the receipt, drop the file, or just open the link.",
            "Type the commitment you noted into the field for the commitment you saw.",
            "Read the result. Each check is a plain sentence, such as the list fingerprint matching. Valid means the seed matches the commitment and re-running the draw gives the recorded winner.",
            "Look for a warning that the list changed after the commitment. If you see one, ask the host why.",
          ],
        },
        "You don't have to trust our site to do this. The `whirlpick verify` command runs the same checks on your own computer, and the [algorithm spec](/about/#algorithm) is detailed enough to write your own checker with any SHA-256 tool.",
      ],
    },
  ],
  faq: [
    {
      q: "Can the host change the winner?",
      a: "Not without being caught, once the commitment is on screen. A different seed would not match the commitment, and a different list would not match the fingerprint. The one gap is trying seeds before committing, which the room word closes because the audience supplies it after the commitment is public.",
    },
    {
      q: "What is a commitment?",
      a: "It is a SHA-256 hash of the secret seed, shown before the spin. A hash can't be reversed to find the seed, but once the seed is revealed anyone can hash it and compare. If they match, the seed used is the one that existed before the wheel moved.",
    },
    {
      q: "Can I check a spin without trusting the Whirlpick site?",
      a: "Yes. Run `whirlpick verify` from the open-source command-line tool on your own machine, or follow the published algorithm with any SHA-256 tool. The receipt holds everything needed: the list, the seed, the room word if one was used, and the result. The [agent docs](/docs/agents/) cover the command-line tool.",
    },
    {
      q: "Has the wheel been independently approved as fair?",
      a: "No, and we don't claim it has. No outside body has audited it. What we offer is a draw that is reproducible and checkable: the seed was fixed before the spin, the algorithm is public, and anyone can re-run the draw from the receipt and get the same result.",
    },
  ],
  related: ["raffle-winner-picker", "random-name-picker", "list-randomizer"],
  navLabel: "Is the wheel rigged",
  updated: "2026-09-29",
};

export default page;
