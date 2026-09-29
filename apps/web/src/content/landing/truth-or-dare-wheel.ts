import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "truth-or-dare-wheel",
  preset: "truth-or-dare",
  title: "Truth or dare wheel with family-friendly prompts",
  description:
    "Spin for truth or dare and get a prompt from our own family-friendly list. Add your own dares, pick players with a names wheel, and play offline.",
  h1: "Truth or dare wheel",
  intro:
    "Spin to land on Truth or Dare, then read the prompt that appears. The prompts are our own family-friendly list, so the wheel is fine for mixed groups.",
  sections: [
    {
      h2: "Running a round",
      body: [
        {
          steps: [
            "Sit in a circle and put the phone or laptop where everyone can see it.",
            "The first player spins. The wheel lands on Truth or Dare and a prompt appears.",
            "The player answers or does the dare, then passes the device to their left.",
            "Keep going until everyone has had a few turns, or until the snacks run out.",
          ],
        },
        "If you'd rather not pass a phone around, use a second wheel for the players. Put everyone's name on a wheel in another tab and spin it first to choose who goes next. Turn on elimination on that wheel and nobody gets picked twice before everyone has had a go.",
      ],
    },
    {
      h2: "House rules that keep it fun",
      body: [
        "Agree on these before the first spin, out loud:",
        {
          list: [
            "Anyone can skip any prompt, no reason needed and no penalty that makes skipping hard.",
            "Dares stay safe. Nothing involving roads, heights, fire, food allergies or strangers.",
            "Nothing gets filmed or posted without the person's clear yes.",
            "Truths don't have to be answered in full. It's a game, not a confession.",
          ],
        },
        "A group where people feel free to skip plays longer and laughs more. The awkward rounds come from pressure, not from the prompts.",
      ],
    },
    {
      h2: "Our prompts and your own",
      body: [
        "The built-in prompts are written by us and kept suitable for a family party or a class social. Truths stick to light topics that nobody minds answering in front of a grandparent. Dares are silly rather than risky, the kind you can do without leaving the room.",
        "Want your own? Change the wheel itself. Replace the Truth and Dare slices with your own prompts, one per line, and every slice becomes a specific challenge. This works well for themed nights, for example a holiday party where every dare involves a song.",
      ],
    },
    {
      h2: "Phone-on-the-table tips",
      body: [
        "Press F for presenter mode, which hides the editor so only the wheel shows. That stops anyone peeking at the list. Mystery mode hides the labels until the wheel stops, which adds a little suspense if you've written your own prompts.",
        "The tick sound is made in the browser. Press M to mute it and the setting is remembered. Once the page has loaded one time, it plays without a connection, which helps at a campsite or on a train. Keep the screen brightness low at night and nobody gets dazzled when it's their turn.",
      ],
    },
  ],
  faq: [
    {
      q: "Are truth or dare prompts included?",
      a: "Yes. When the wheel lands on Truth or Dare, a prompt from our own list appears. We wrote the list ourselves and kept it family-friendly. If you prefer your own prompts, type them as entries on the wheel and each slice becomes one prompt.",
    },
    {
      q: "Is it suitable for kids?",
      a: "The built-in prompts are written for mixed ages, with nothing rude or risky. You know your group best, so read a few before you start. There are no ads on the page, so children won't see anything you didn't put there yourself.",
    },
    {
      q: "Can I write custom dares?",
      a: "Yes. Clear the Truth and Dare slices and type your own dares, one per line. You can colour slices by difficulty and give easy ones a higher weight so they come up more often. Save the wheel on your device to reuse it next time.",
    },
    {
      q: "Can I play offline?",
      a: "Yes. After the first visit the app and the prompt list are stored in your browser, so it runs with no signal. Add it to your home screen to open it like an app. Nothing about the game is sent anywhere.",
    },
  ],
  related: ["random-name-picker", "yes-or-no-wheel", "what-should-i-eat-wheel"],
  navLabel: "Truth or dare",
  updated: "2026-09-29",
};

export default page;
