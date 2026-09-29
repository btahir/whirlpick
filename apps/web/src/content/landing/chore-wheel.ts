import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "chore-wheel",
  preset: "chores",
  open: { mode: "elimination" },
  title: "Chore wheel for fair weekly chores",
  description:
    "Share out household chores with a spin. Each chore goes once per week, heavy jobs spread evenly, and the wheel link goes straight into the house chat.",
  h1: "Chore wheel for fair weekly chores",
  intro:
    "Ten common chores are loaded in elimination mode, so each one is handed out once and then leaves the wheel. Edit the list to match your home.",
  sections: [
    {
      h2: "Two ways to run a chore wheel",
      body: [
        "**Take turns spinning.** Each person spins once and gets the chore it lands on. Because the page is in elimination mode, that chore drops off the wheel before the next person spins. Keep going round until the wheel is empty. This is the most fun version and works well for families, because children can see the draw happen and can't claim it was rigged against them.",
        "**Split all the chores at once.** Switch the mode to teams and set the number of teams to the number of people. Each team is one person's list of chores for the week. Rename the teams to your housemates' names. This is quicker for a flatshare, and it lets you balance the work, as the next section explains.",
      ],
    },
    {
      h2: "Spreading the heavy jobs fairly",
      body: [
        "Cleaning the bathroom is not the same as watering the plants. If one person gets all the heavy jobs, the wheel won't feel fair however random it is.",
        {
          steps: [
            "Tag each chore Heavy or Light. Paste a list with a header row like `name,weight,tags` and put the tag in the third column.",
            "Switch to teams mode with one team per person and turn on balance.",
            "Split. Every person gets the same number of heavy chores, give or take one, and the same for light ones.",
          ],
        },
        "Weights do something different. In the take-turns version, a higher weight makes a chore more likely to be picked early, not more work. Use tags for effort and leave weights at 1 unless you have a reason.",
      ],
    },
    {
      h2: "Keeping it fair week after week",
      body: [
        "The history panel keeps every week's draw with a timestamp, so you can scroll back and see who had the bins last time. In teams mode, New round makes a fresh split that avoids putting the same chores together in one person's list again. It does not track which person had which list, since team names are only labels, so glance at last week's history before you assign names to lists.",
        "Someone away this week? In teams mode, lower the number of teams by one for that split and their share goes to everyone else. In the take-turns version they simply skip their spin. If a chore doesn't apply this week, disable it and switch it back on next time.",
      ],
    },
    {
      h2: "Sharing the wheel with the house",
      body: [
        "Set the wheel up once, then make a share link and pin it in the house chat. Everyone opens the same chores on their own phone, with no app to install and no account to create. The chore list travels inside the link after the # sign, which browsers don't pass to servers. Each person's copy saves on their own device, so decide who keeps the official one.",
      ],
    },
  ],
  faq: [
    {
      q: "Can each person get a chore only once per week?",
      a: "In elimination mode each chore leaves the wheel after it's drawn, so no chore is given out twice. To make sure each person gets the same number, use teams mode with one team per person. Team sizes differ by one chore at most, even when the chores don't divide evenly.",
    },
    {
      q: "Can the wheel rotate chores weekly without repeats?",
      a: "New round in teams mode mixes the chore bundles so the same chores rarely end up together again. Which person takes which bundle is up to you, so check last week's result in the history panel first. Each week's split has its own receipt if anyone asks how it was done.",
    },
    {
      q: "Can I share the chore wheel with housemates?",
      a: "Yes. Make a share link or a QR code and post it in your group chat. Anyone who opens it gets the same list on their phone. There's no sign-up, and the list rides in the part of the link that is never sent to a server.",
    },
    {
      q: "How do I stop one person getting all the hard chores?",
      a: "Tag each chore by effort, for example Heavy or Light, then split in teams mode with balance on. Every person gets an even share of each tag, within one. This works much better than weights, which change how likely a chore is to be drawn rather than how much work it is.",
    },
  ],
  related: ["random-team-generator", "decision-wheel", "what-should-i-eat-wheel"],
  navLabel: "Chore wheel",
  updated: "2026-09-29",
};

export default page;
