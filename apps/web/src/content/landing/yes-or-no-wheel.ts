import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "yes-or-no-wheel",
  preset: "yes-no",
  title: "Yes or no wheel: spin for a quick answer",
  description:
    "A fast yes or no wheel with no ads. Add Maybe, weight the odds if you want, and use it offline on your phone. Every spin comes with a checkable receipt.",
  h1: "Yes or no wheel",
  intro:
    "Two slices, one spin. Press Spin or tap the wheel and it lands on Yes or No with equal odds. You can add Maybe or change the odds in the editor.",
  sections: [
    {
      h2: "When a yes or no spin helps",
      body: [
        "A spin is good at breaking a tie you don't care much about. Order pizza or cook. Walk or take the bus. Watch one more episode. If both answers are fine, letting the wheel choose saves you ten minutes of going back and forth.",
        "There is a second use that people rarely admit to. Spin, and notice how you feel when it lands. If your stomach drops at No, you wanted Yes. The wheel has done its job even if you ignore it.",
        "It is a bad tool for anything that deserves thought. Money, health, other people's feelings. Decide those yourself, and use the wheel for the small stuff that eats your evening.",
      ],
    },
    {
      h2: "Adding Maybe",
      body: [
        "Switch the preset to Yes, No, Maybe, or type Maybe as a third line in the editor. With three equal slices each answer has a one in three chance. Maybe is handy for a group that wants a way out, for example when deciding whether to go out tonight. You can also type your own answers, such as Not yet or Ask again tomorrow. Each new line becomes a new slice, and the slices share the wheel equally until you change a weight.",
      ],
    },
    {
      h2: "Weighting the odds, honestly",
      body: [
        "Give Yes a weight of 2 and No a weight of 1 and the wheel draws the Yes slice twice as wide. It will land there about two times in three. This is useful when you are leaning one way and want the wheel to respect that while still leaving room for surprise.",
        "If other people are watching, tell them about the weight before you spin. The receipt records every weight, so anyone who checks it later will see the odds you used. A secretly weighted wheel is exactly what people mean when they ask whether a wheel is rigged.",
      ],
    },
    {
      h2: "Best of three, and using it on your phone",
      body: [
        "One spin can feel arbitrary. A best of three settles it more firmly:",
        {
          steps: [
            "Agree before you start that the first answer to reach two wins.",
            "Spin up to three times without changing the wheel.",
            "Accept the result. No fourth spin.",
          ],
        },
        "The page works on a phone and keeps working with no signal once it has loaded once. Add it to your home screen and it opens like an app. Press M to mute the tick sound, or turn it off in settings, and the choice is remembered.",
      ],
    },
  ],
  faq: [
    {
      q: "Is the yes or no wheel 50/50?",
      a: "Yes, as long as both slices have the same weight, which is the default. The winner is chosen from a fresh random seed with exact weights and no rounding bias, and the animation then lands on that slice. The receipt shows the weights, so you can confirm the odds after any spin.",
    },
    {
      q: "Can I add a Maybe option?",
      a: "Yes. Pick the Yes, No, Maybe preset, or type Maybe on a new line in the entries box. You can add any other answer the same way. Every slice gets an equal share of the wheel unless you give it a different weight.",
    },
    {
      q: "Can I make Yes more likely?",
      a: "Give Yes a bigger weight than No in the editor. A weight of 3 against 1 makes Yes three times as likely, and the slice grows to match, so the wheel shows the real odds. The weights are written into the receipt for anyone who checks it.",
    },
    {
      q: "Does the yes or no wheel work offline?",
      a: "Yes. After your first visit the whole app is stored by your browser, so it opens and spins without a connection. You can also install it to your home screen. There are no ads or tracking scripts that need the network.",
    },
  ],
  related: ["decision-wheel", "what-should-i-eat-wheel", "random-number-wheel"],
  navLabel: "Yes or no wheel",
  updated: "2026-09-29",
};

export default page;
