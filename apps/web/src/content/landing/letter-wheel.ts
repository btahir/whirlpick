import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "letter-wheel",
  preset: "letters",
  title: "Random letter wheel A to Z for word games",
  description:
    "Spin a random letter from A to Z for word games, category games and phonics. Remove hard letters, spin vowels only, or work through the alphabet.",
  h1: "Random letter wheel A–Z",
  intro:
    "All 26 letters, each with the same chance. Spin once for a letter, or turn on elimination to work through the whole alphabet without repeats.",
  sections: [
    {
      h2: "Games that need a random letter",
      body: [
        "Category games are the classic use. Spin a letter, start a two-minute timer, and everyone writes an animal, a city, a food and a name that start with it. Score one point for every answer nobody else wrote down.",
        {
          list: [
            "Word chains, where each player must say a word beginning with the spun letter.",
            "Twenty questions, where the hidden thing must start with the letter.",
            "Handwriting or letter formation warm-ups for younger children.",
            "Picking an initial for a team name, a character or a pet.",
          ],
        },
      ],
    },
    {
      h2: "Taking out the hard letters",
      body: [
        "Most groups quickly agree that Q, X and Z are no fun in a category game. Rather than deleting them, disable them in the editor. They stay in the list with a switch, so you can put them back for a harder round. Some groups also drop Y and U. Try a round and see where your players groan. Disabled letters are left out of the draw completely, so a switched-off Q can never win.",
        "If you want hard letters to appear only sometimes, give them a weight below 1 instead. A weight of 0.5 makes a letter half as likely as the others, and its slice shrinks so everyone can see the odds.",
      ],
    },
    {
      h2: "Vowels, consonants and phonics practice",
      body: [
        "For phonics, clear the wheel and paste only the sounds you're teaching this week. It doesn't have to be single letters. Type sh, ch, th and ee on separate lines and the wheel spins those instead. Save each set as its own wheel so next week's lesson is one click away.",
        "A vowels-only wheel has five entries, or six if you count Y. A consonants wheel is the alphabet with the vowels disabled. Both work well projected in presenter mode, which you open with the F key. Big slices and big labels are easy to read from the back of a classroom.",
      ],
    },
    {
      h2: "Working through the whole alphabet",
      body: [
        "Elimination mode removes each letter after it's spun. Use it for a round of games where every letter must come up once, or for an alphabet quiz where each child gets a different letter. The history panel keeps a timed list of every letter drawn, and Put everyone back returns all 26 when you're finished. Everything runs on your device, so it keeps working even if the school network drops.",
      ],
    },
  ],
  faq: [
    {
      q: "Can I remove letters like Q, X and Z?",
      a: "Yes. Disable them in the editor and they leave the wheel but stay in your list. Switch them back on at any time. You can also delete them outright, or lower their weight so they come up rarely instead of never.",
    },
    {
      q: "Can I spin only vowels?",
      a: "Yes. Clear the entries and type A, E, I, O and U on separate lines, or disable every consonant in the A to Z preset. Save it as its own wheel and it will be there next time you open the site on this device.",
    },
    {
      q: "Does every letter have an equal chance?",
      a: "Yes, by default all 26 letters have the same weight, so each has a one in 26 chance on every spin. The result is drawn from a random seed before the wheel moves, and the receipt lets anyone check the draw and the weights afterwards.",
    },
    {
      q: "Can I use the letter wheel offline in class?",
      a: "Yes. After one visit the app is stored in your browser and runs without a connection. It has no ads and loads nothing from other sites, so there is nothing for a flaky school network to break halfway through a lesson.",
    },
  ],
  related: ["random-number-wheel", "classroom-name-picker", "country-wheel"],
  navLabel: "Letter wheel",
  updated: "2026-09-29",
};

export default page;
