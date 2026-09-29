import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "what-should-i-eat-wheel",
  preset: "food",
  title: "What should I eat? Food wheel for dinner decisions",
  description:
    "Can't decide what to eat? Spin a food wheel of 20 dishes, or build your own from favourite meals and local takeaways. Save it and share it with friends.",
  h1: "What should I eat? Spin the food wheel",
  intro:
    "Twenty dishes are loaded to get you started. Spin now, or replace them with the meals and places you actually like.",
  sections: [
    {
      h2: "Why a wheel helps when you're hungry",
      body: [
        "Choosing dinner is hard for a boring reason. By evening you've made a hundred small decisions and you're out of patience for one more. Scrolling a delivery app makes it worse because it adds more choices. A wheel with ten options you already like cuts that down to one, fast.",
        "The trick is that the list is yours. A random dish you'd never order is no help. A random pick from your own shortlist almost always lands on something you're happy to eat.",
      ],
    },
    {
      h2: "Build a list you'll actually use",
      body: [
        {
          steps: [
            "Clear the sample dishes, or keep the ones you like.",
            "Add the meals you cook often, the takeaways near you, and one or two treats.",
            "Remove anything you'd veto on a normal night. If you'd never really pick it, it shouldn't be on the wheel.",
            "Save the wheel with a name like Weeknight dinners, and make a second one for weekends if your habits differ.",
          ],
        },
        "Ten to fifteen options is a good size. Fewer and you'll eat the same thing too often. More and the list fills with things you don't want. Review it every month or so, drop the dishes you keep vetoing, and add whatever new place opened down the road.",
      ],
    },
    {
      h2: "Cravings, budget and weights",
      body: [
        "Give a weight of 2 to the meals you'd happily have twice a week, and 0.5 to the expensive takeaway you only want now and then. The slices resize so you can see the odds. Cheap home-cooked meals can carry more weight on the wheel you use near the end of the month.",
        "A disabled entry is useful for things that are off the menu for now. The pizza place is closed on Mondays. You're out of rice. Switch them off and back on later without retyping.",
      ],
    },
    {
      h2: "Group dinners and the one-veto rule",
      body: [
        "Deciding for a group is harder than deciding alone. Ask everyone to add two options, then spin. Agree on one house rule before the first spin: the group gets a single veto, and the second result stands. That keeps the wheel in charge without forcing anyone to eat something they truly can't.",
        "To bring friends in, make a share link and drop it in your group chat. The dishes travel inside the link itself and open as a new wheel on their phone, without anyone signing up.",
      ],
    },
  ],
  faq: [
    {
      q: "Can I add my own restaurants?",
      a: "Yes. Type each restaurant or dish on its own line in the entries box, or paste a list you keep in your notes app. You can mix restaurants and home meals on the same wheel. Give each slice its own colour if you want takeaways and cooking to look different.",
    },
    {
      q: "Can I save my food wheel?",
      a: "Every wheel you make is kept in this browser, and you can keep as many as you like under My wheels. Nothing is stored on a server. To move a wheel to another phone, open a share link there or export and import a .whirl.json file.",
    },
    {
      q: "Can I make my favourite meals come up more often?",
      a: "Give them a higher weight. A dish with weight 3 is three times as likely as one with weight 1, and its slice on the wheel is three times as wide. Lower weights, down to 0.001, make a dish rare without removing it.",
    },
    {
      q: "Can I share the wheel with friends?",
      a: "Yes. Make a share link or show a QR code, and anyone who opens it gets a copy of your wheel. The dish list rides in the part of the link after the # sign, so it isn't sent to any server. Their changes don't affect your saved copy.",
    },
  ],
  related: ["decision-wheel", "yes-or-no-wheel", "chore-wheel"],
  navLabel: "Food wheel",
  updated: "2026-09-29",
};

export default page;
