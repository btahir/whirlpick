import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "decision-wheel",
  preset: "decision",
  title: "Decision wheel with weighted options",
  description:
    "Type your options, weight the ones you lean towards, and spin to break the tie. Share the wheel with a group and use fair draw when others need to trust it.",
  h1: "Decision wheel",
  intro:
    "Four placeholder options are on the wheel. Replace them with your real choices, one per line, and spin when you're ready to let go of the decision.",
  sections: [
    {
      h2: "When to spin and when to decide yourself",
      body: [
        "A decision wheel is for ties. You've narrowed a choice to options that are all acceptable, and you've spent longer choosing than the choice deserves. Which film. Which of three birthday presents. Which weekend to visit. A spin ends the loop.",
        "If one option is clearly better and you're scared to commit, the wheel is dodging the issue. If an option would be a real mistake, it shouldn't be on the wheel. Before you spin, look at each slice and ask whether you'd accept it. Remove any you wouldn't. What's left is a list where every result is fine, and that is what makes it safe to hand the choice to chance.",
      ],
    },
    {
      h2: "Using weights to reflect what you want",
      body: [
        "Options are rarely equal. Weights let the wheel respect your leaning without making the result certain. Give the option you prefer a weight of 3, a reasonable second choice 2, and a long shot 1. The slices resize so the wheel shows the real odds, which is useful when you're spinning in front of people.",
        {
          list: [
            "Weights can be decimals, from 0.001 up to a million.",
            "Paste options with weights from a spreadsheet as two columns, option then weight.",
            "Disable an option to test how the wheel looks without it, without deleting it.",
          ],
        },
      ],
    },
    {
      h2: "Best of three, and gut checks",
      body: [
        "For choices that matter a bit more, agree on best of three before the first spin. The first option to win twice is the answer. It feels less arbitrary than a single spin, and it stops the temptation to keep spinning until the wheel agrees with you.",
        "Watch your reaction as the wheel slows down. If you catch yourself hoping it misses one slice, remove that slice and spin again. You've learned something the list didn't tell you.",
      ],
    },
    {
      h2: "Deciding as a group",
      body: [
        "Build the wheel together, then make a share link or QR code so everyone opens the same options on their own phone. The list is carried in the link itself and never stored on a server.",
        "When the group needs to trust the result, for example who gets the bigger room on a trip, turn on fair draw. A commitment appears before the spin, and a receipt afterwards lets anyone confirm the result came from the seed that was fixed in advance. The [verify page](/verify/) does the check in the browser.",
      ],
    },
  ],
  faq: [
    {
      q: "Can I give some options more weight?",
      a: "Yes. Every option has a weight, 1 by default. Set a higher number for options you prefer and the wheel draws those slices wider and picks them more often in exact proportion. A weight of 2 is twice as likely as a weight of 1.",
    },
    {
      q: "Can I share my decision wheel?",
      a: "Make a share link or a QR code from the share menu. Anyone who opens it sees the same options and weights as a new, unsaved wheel on their device. The options live in the fragment after the # sign, which is not sent to any server.",
    },
    {
      q: "How many options can a decision wheel have?",
      a: "From 2 up to 1,000. In practice, two to eight options make the best decision wheel, because each slice stays easy to read and you can honestly say you'd accept every one of them. Above about 100 the labels hide, but the result is still shown.",
    },
    {
      q: "Is the decision wheel random?",
      a: "Yes. Each spin draws from a fresh 256-bit seed made by your browser's secure random generator, using a published algorithm with exact weights. The result is picked before the animation starts, and the receipt lets anyone re-run the same draw.",
    },
  ],
  related: ["yes-or-no-wheel", "what-should-i-eat-wheel", "chore-wheel"],
  navLabel: "Decision wheel",
  updated: "2026-09-29",
};

export default page;
