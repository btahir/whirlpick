import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "random-group-generator",
  preset: "class-sample",
  open: { mode: "teams", teamsBy: "size", size: 4 },
  title: "Random group generator for classes and workshops",
  description:
    "Make random groups of 2, 3 or 4 from a class list, rotate partners each week without repeats, and keep the list on your own device. Free and ad-free.",
  h1: "Random group generator",
  intro:
    "Set a group size, paste your class or workshop list, and split. The sample list of 24 made-up students is already set to groups of four.",
  sections: [
    {
      h2: "Choosing a group size",
      body: [
        "Pairs suit quick think-pair-share tasks. Threes work well for discussion because nobody can hide and nobody is left out of a conversation. Fours suit projects with distinct roles, such as reader, scribe, timekeeper and reporter. Beyond five, one or two people usually stop talking.",
        "Set the size and the generator works out the number of groups. If the class doesn't divide exactly, some groups are one person smaller, never larger. Twenty-two students in groups of four gives four groups of four and two groups of three, not five fours and a lonely pair.",
      ],
    },
    {
      h2: "New partners every week",
      body: [
        "The biggest win over drawing names from a hat is rotation. Press New round next lesson and Whirlpick looks at every earlier split saved for that class. It then shuffles people until as few pairs as possible have worked together before. Over a term, most students end up working with most of the class.",
        "Keep the class as its own saved wheel so the history stays with it. The rounds live on your device alongside the list, and each round has a receipt you can export. If a student joins mid-term, add their name to the wheel. They have no history yet, so the next round places them wherever keeps the old pairs apart.",
      ],
    },
    {
      h2: "Rules for friends, support pairs and mixed ability",
      body: [
        "You know your room better than any random draw. Add rules for what matters:",
        {
          list: [
            "Keep apart two friends who chat all lesson, or two students who shouldn't sit together.",
            "Keep together a student and their language buddy or teaching assistant pairing.",
            "Tag students by reading level or set, and turn on balance so every group gets a mix.",
          ],
        },
        "Tags go in the third column when you paste from a spreadsheet. A student can have more than one tag, but balancing uses the first. If your rules can't all fit, you'll see which one to relax.",
      ],
    },
    {
      h2: "Showing and printing the groups",
      body: [
        "Fullscreen view puts every group on the board in large type, so students can find their names from the back of the room. Group names are editable, so call them Table 1 to Table 6 or after planets if that helps.",
        "To print, copy the groups as text into a document, or copy as CSV and paste into a spreadsheet to add columns for roles or marks.",
        "Student names never leave your computer. There is no sign-in and no server that stores lists, which also means you should export a .whirl.json file if you want a backup.",
      ],
    },
  ],
  faq: [
    {
      q: "How do I make groups of 3 with 20 students?",
      a: "Set the group size to 3. The generator makes seven groups: six groups of three and one group of two. If you would rather have no pair, set the size to 4 instead, which gives five groups of four, or set the number of groups directly.",
    },
    {
      q: "Can it avoid putting the same students together again?",
      a: "Yes. Press New round and the generator uses the earlier rounds saved for that class to minimise repeat pairings. It keeps your keep-apart, keep-together and balance rules while it does this. The earlier rounds come from the wheel's own history on your device.",
    },
    {
      q: "Can I save my class list?",
      a: "Your wheels save in your browser on this device. Keep one wheel per class and switch between them from My wheels. Nothing is stored online, so export a .whirl.json file if you want a copy on another computer or a backup before clearing your browser.",
    },
    {
      q: "Can I print the groups?",
      a: "Copy the groups as text and paste them into any document, or copy as CSV for a spreadsheet, then print from there. The fullscreen view is also readable when projected, which saves printing for most lessons.",
    },
  ],
  related: ["random-team-generator", "classroom-name-picker", "classroom-wheel-no-ads"],
  navLabel: "Group generator",
  updated: "2026-09-29",
};

export default page;
