import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "random-name-picker",
  preset: "names-sample",
  open: { mode: "normal" },
  title: "Random name picker wheel, no ads · Whirlpick",
  description:
    "Paste a list of names and spin to pick one at random. Weights, remove-after-pick, up to 1,000 names, and a receipt for every spin. Free, no ads, no sign-up.",
  h1: "Random name picker wheel",
  intro:
    "Paste your names, one per line, and press Spin. The wheel below already holds twelve made-up names so you can try it straight away. Nothing you type is uploaded.",
  sections: [
    {
      h2: "When a name picker earns its place",
      body: [
        "A picker is worth using when the choice itself could cause an argument. Who answers the next question, who goes first in a game, who wins the spare concert ticket. If you pick by hand, somebody will say you always choose the same people. A wheel on a shared screen takes you out of the decision, and everyone watches it happen.",
        "It is less useful when a choice needs judgement. Don't spin to decide who leads a project. Spin to decide who presents first.",
      ],
    },
    {
      h2: "Getting your list in",
      body: [
        "Most lists already live in a spreadsheet. Select the column, copy it, and paste it into the entries box. Whirlpick reads tab and comma separated columns, so you can paste two columns at once. The first column is the name and the second, if it is a number, becomes a weight.",
        {
          list: [
            "A plain list works: one name per line, blank lines are skipped.",
            "A header row like `name,weight,tags` maps the columns by name.",
            "Import a .txt or .csv file instead of pasting if the list is long.",
            "De-duplicate removes repeated names, ignoring case. Undo brings them back.",
          ],
        },
        "A weight of 2 makes a name twice as likely as a weight of 1. Use it openly, for example to give someone who bought two tickets two chances, and say so before you spin.",
      ],
    },
    {
      h2: "Remove the winner or keep them in",
      body: [
        "After each spin the winner dialog asks whether to remove that name or keep it. Keep it when every spin should be independent, such as picking a random helper each round. Remove it when each person should be picked once, such as working through a turn order. Switch to elimination mode and names drop out automatically. When the list runs dry, press Put everyone back.",
        "If someone is absent, disable their entry instead of deleting it. The name stays in your list for next time but never lands on the wheel.",
      ],
    },
    {
      h2: "Big lists, saving and sharing",
      body: [
        "The wheel takes from 2 to 1,000 names. Past about 100 the slices get too thin to read, so the labels hide. The winner is still announced in large text, and the full list stays visible in the editor.",
        "Your lists save on this device only, in your browser's own storage. You can keep several wheels and switch between them. To give a list to someone else, make a share link. The names travel inside the part of the link after the # sign, which browsers never send to a server. For a permanent copy, export a .whirl.json file.",
      ],
    },
  ],
  faq: [
    {
      q: "Is the name picker really random?",
      a: "Each spin uses a fresh 256-bit seed from your browser's secure random generator, and the winner is worked out from that seed with a published algorithm before the wheel starts moving. Every spin gets a receipt, so anyone can re-run the draw on the [verify page](/verify/) and get the same name.",
    },
    {
      q: "Can I pick more than one name at once?",
      a: "Yes. Switch the mode to pick N winners and choose how many. You can reveal them one spin at a time or all at once. No name is picked twice in the same draw, and the whole draw shares one receipt.",
    },
    {
      q: "Do my names get uploaded anywhere?",
      a: "No. There is no account and no server storing anything. Names stay in your browser's storage on this device. A share link carries the list in the fragment after the # sign, and browsers don't send that part to any server when the link is opened.",
    },
    {
      q: "How many names can I add?",
      a: "Up to 1,000 per wheel, and you need at least 2. Above roughly 100 names the labels on the slices are hidden because they would be too small to read, but the winner still appears in full when the wheel stops.",
    },
  ],
  related: ["classroom-name-picker", "list-randomizer", "raffle-winner-picker"],
  navLabel: "Random name picker",
  updated: "2026-09-29",
};

export default page;
