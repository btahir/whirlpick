import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "list-randomizer",
  preset: "order-sample",
  open: { mode: "multi", count: "all", reveal: "instant" },
  title: "List randomizer: shuffle a list into a fair order",
  description:
    "Paste any list and get it back in a random order, with a receipt that shows how. For presentation order, standups, seating and playlists. No sign-up.",
  h1: "List randomizer: shuffle any list into a fair order",
  intro:
    "Paste a list and draw. Every item comes back in a new random order, all at once. The sample has eight made-up names so you can see the result before pasting your own.",
  sections: [
    {
      h2: "What people shuffle",
      body: [
        {
          list: [
            "Presentation order for a class or a conference session.",
            "Speaking order for a daily standup, so the same person isn't always first.",
            "Seat numbers or desk assignments for an exam room.",
            "Songs for a party playlist, or the running order of a quiz.",
            "Which order a panel of judges scores the entries in.",
          ],
        },
        "In every case the order matters to somebody, and a visible, random draw stops the first person from feeling singled out.",
      ],
    },
    {
      h2: "Why a receipt helps with \"why am I first?\"",
      body: [
        "Shuffle buttons in spreadsheets and chat bots give you an order and nothing else. If someone doubts it, you can only say trust me. Whirlpick draws the order from a seed and records it in a receipt with the full list. Anyone can paste that receipt into the [verify page](/verify/) and see the exact same order come out.",
        "For something with stakes, such as the order bands play at a showcase, turn on fair draw before the draw. The page shows a commitment first. Post it in the group chat, then draw. Afterwards, the revealed seed proves the order wasn't reshuffled until it looked right.",
      ],
    },
    {
      h2: "Getting the list in and out",
      body: [
        "Paste straight from a spreadsheet column, one item per line. Extra columns are read as weights and tags, so if you only want the names, copy just that column. You can also import a .txt or .csv file.",
        "When the draw finishes, the result is saved in the history panel with a timestamp. Copy it from there, or export the history as CSV to open in a spreadsheet, or as JSON if a script needs it. The list randomizer takes up to 1,000 items. For a standup that repeats every morning, save the team as its own wheel. Tomorrow you open it, draw, and read the order out in under ten seconds.",
      ],
    },
    {
      h2: "Ordering only part of a list",
      body: [
        "Sometimes you only need the first few places. Five people present today and the rest present next week. Set the count to 5 instead of all and the draw picks five, in order, without repeats. The rest stay unpicked for next time.",
        "To watch the order build up, switch the reveal from instant to sequential. The wheel spins once per place, which is slower but much more exciting for an audience. The order is the same either way, because the reveal style is only presentation.",
      ],
    },
  ],
  faq: [
    {
      q: "Is every order equally likely?",
      a: "Yes, when all items have the same weight. The draw picks the first place from all items, the second from those left, and so on, using exact integer maths with no rounding bias. That gives every possible order the same chance. If you set weights, heavier items tend to come earlier.",
    },
    {
      q: "Can I copy the shuffled list?",
      a: "Yes. The finished order is kept in the history panel, where you can copy it or export it as CSV or JSON. The receipt for the draw holds the same order, and a replay link lets someone else watch the draw play out on their own screen.",
    },
    {
      q: "How long can the list be?",
      a: "Up to 1,000 items. Instant reveal is the better choice for long lists because it shows the whole order at once. Sequential reveal spins once per place, which suits short lists that an audience is watching, such as eight speakers.",
    },
    {
      q: "Is my list uploaded to shuffle it?",
      a: "No. The shuffle runs in your browser and the list is kept in this browser's storage only. There is no server, account or analytics. If you share the result, the share link or receipt carries the list itself, so only share it with people who may see the names.",
    },
  ],
  related: ["random-name-picker", "random-team-generator", "raffle-winner-picker"],
  navLabel: "List randomizer",
  updated: "2026-09-29",
};

export default page;
