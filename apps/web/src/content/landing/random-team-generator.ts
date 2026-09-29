import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "random-team-generator",
  preset: "teams-sample",
  open: { mode: "teams", teamsBy: "count", teams: 4 },
  title: "Random team generator with balanced teams",
  description:
    "Split names into random teams balanced by skill level, with keep-apart and keep-together rules and new rounds that avoid repeat teammates. No ads.",
  h1: "Random team generator with balanced teams",
  intro:
    "Paste your players and choose how many teams you need. The sample below splits sixteen made-up players with skill levels into four teams, so you can see how it works before adding your own names.",
  sections: [
    {
      h2: "Number of teams or team size",
      body: [
        "Pick the setting that matches how you think about the game. For a five-a-side tournament you know the team size, so set a size of 5 and Whirlpick works out how many teams that takes. For a quiz night with four tables, set 4 teams and let the size follow.",
        "When the numbers don't divide evenly, team sizes differ by one at most. Seventeen players in four teams gives one team of five and three of four. It never gives a team of seven and a team of three.",
      ],
    },
    {
      h2: "Balancing teams by skill",
      body: [
        "A purely random split sometimes puts all your strongest players together. To stop that, give each player a tag. The quickest way is a third column when you paste from a spreadsheet, with a header row like `name,weight,tags` and a skill number from 1 to 5 in the tags column.",
        "With balance on, the generator groups players by their first tag and deals each group across the teams in turn, like dealing cards, reversing direction for each group. The result is that every team gets the same number of level 5 players, give or take one, and the same for every other level. The order inside each level is random, so you still get different teams every time.",
        "Tags don't have to be numbers. Use Year 7 and Year 8, or Staff and Guest, and each team gets a fair share of each.",
      ],
    },
    {
      h2: "Keep apart, keep together",
      body: [
        {
          list: [
            "Keep apart puts two or more people on different teams, for example two players who argue, or two captains.",
            "Keep together puts people on the same team, for example a parent and a young child, or two friends who only came together.",
          ],
        },
        "Rules can clash. You can't keep six people apart with only four teams, and a keep-together group can't be bigger than a team. When the rules can't all be met, the generator tells you which one failed and suggests more teams or fewer rules. If a rule forces a swap that breaks the skill balance, you get a warning rather than a silent change.",
      ],
    },
    {
      h2: "New rounds, sharing and settling arguments",
      body: [
        "Press New round and the generator makes fresh teams while keeping repeat teammates to a minimum. It looks at every earlier round for this wheel and swaps players until as few pairs as possible have played together before. This is the easiest way to run a league night where everyone meets everyone.",
        "Copy the teams as text for a group chat, or as CSV for a spreadsheet. Fullscreen view puts the teams on a projector or a sports hall screen in large type. Team names are editable.",
        "Every split has a receipt with the seed and the full player list. If someone says the teams were fixed, send them the receipt and they can re-run the split on the [verify page](/verify/) and get identical teams.",
      ],
    },
  ],
  faq: [
    {
      q: "How are the teams balanced?",
      a: "Each player's first tag, such as a skill level from 1 to 5, puts them in a group. The generator shuffles each group with a seeded draw, then deals it across the teams so each team's count from that group differs by one at most. Team sizes also differ by one at most.",
    },
    {
      q: "Can I keep two people apart?",
      a: "Yes. Add a keep-apart rule and choose the names. They will land on different teams. You can also add keep-together rules. If a rule is impossible, for example five people kept apart with four teams, you get a clear message instead of teams that quietly break the rule.",
    },
    {
      q: "What happens with an uneven number of players?",
      a: "Teams end up at most one player apart in size. With 22 players in 4 teams you get two teams of 6 and two of 5. If you set a team size instead, no team is bigger than that size and the smaller teams are only one short.",
    },
    {
      q: "Can I make a second round with new teammates?",
      a: "Press New round. The generator remembers earlier rounds for this wheel and searches for a split with as few repeat pairings as it can find, while keeping your balance and rules. Each round gets its own receipt so you can show the history.",
    },
  ],
  related: ["random-group-generator", "classroom-name-picker", "list-randomizer"],
  navLabel: "Team generator",
  updated: "2026-09-29",
};

export default page;
