import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "random-number-wheel",
  preset: "numbers-1-10",
  title: "Random number wheel: 1 to 10, 1 to 100 or any range",
  description:
    "Spin for a random number from 1 to 10, 1 to 100 or a custom range of up to 1,000 values. Call numbers without repeats and keep a receipt for each spin.",
  h1: "Random number wheel (1–10, 1–100 or any range)",
  intro:
    "The wheel starts with the numbers 1 to 10. Switch to 1 to 100, or set your own lowest and highest number, and spin.",
  sections: [
    {
      h2: "Picking a range",
      body: [
        "The 1 to 10 wheel is easy to read from across a room, so it suits dice-style games and picking a question number. The 1 to 100 wheel suits bigger games and percentages. For anything else, set a custom range such as 5 to 25 or 100 to 350. A range can hold up to 1,000 values.",
        "Above about 100 slices the numbers are too thin to print on the wheel, so the labels hide. The number that wins is still shown large when the wheel stops, and it is read out to screen readers.",
      ],
    },
    {
      h2: "Numbers without repeats",
      body: [
        "Sometimes each number should only come up once. There are two ways to do it:",
        {
          list: [
            "Elimination mode removes each number after it is drawn. Keep spinning until you're done, then press Put everyone back to reset.",
            "Pick N winners draws several numbers in one go, all different. Choose sequential reveal to show them one spin at a time, or instant to list them together.",
          ],
        },
        "To leave a number out from the start, disable it in the editor. It stays in the list but never lands. This is useful when ticket 13 was never sold or when a question has already been answered.",
      ],
    },
    {
      h2: "Calling numbers for a room",
      body: [
        "A wheel beats a hidden number generator when people need to see the draw. For bingo-style games, set the range to your card numbers, turn on elimination, and press F for presenter mode so the wheel fills the screen. Each drawn number is logged in the history panel with a time, so you can read back every call if someone claims a line.",
        "Spin length runs from 1 to 30 seconds. Short spins keep a fast game moving. Long spins build tension for the last number of a prize draw. Mute the ticks with M if the room is already loud.",
      ],
    },
    {
      h2: "Raffles by ticket number",
      body: [
        "If your raffle tickets are numbered, you don't need to type anyone's name. Set the range to the tickets you sold and draw from that. Turn on fair draw first and Whirlpick shows a commitment and a list fingerprint before the spin, then reveals the seed afterwards. Paste that receipt into the [verify page](/verify/) later and the same ticket comes out, which is what you want when a buyer asks how ticket 212 won. For the full routine, see the [raffle winner picker](/raffle-winner-picker/).",
      ],
    },
  ],
  faq: [
    {
      q: "Can I exclude some numbers?",
      a: "Yes. Every number is an entry in the editor, and each entry can be disabled. A disabled number stays in the list but is left off the wheel and can't win. Enable it again later with one click, or delete it if it should never come back.",
    },
    {
      q: "How do I draw numbers without repeats?",
      a: "Turn on elimination mode and each drawn number drops out before the next spin. Or use pick N winners to draw several different numbers at once. Both modes record each draw in the history, and each spin or multi-pick has a receipt.",
    },
    {
      q: "Is there a limit on the range?",
      a: "A custom range can hold up to 1,000 values, for example 1 to 1,000 or 2,000 to 2,999. That is the wheel's entry limit. If you need a bigger pool, split it into two wheels or draw by ticket blocks instead.",
    },
    {
      q: "Is every number equally likely?",
      a: "Yes, unless you change a weight. The draw uses exact integer weights and rejects out-of-range random values instead of using a plain remainder, which avoids the small bias some generators have. Each number on a 1 to 100 wheel has a chance of exactly one in a hundred.",
    },
  ],
  related: ["raffle-winner-picker", "letter-wheel", "yes-or-no-wheel"],
  navLabel: "Number wheel",
  updated: "2026-09-29",
};

export default page;
