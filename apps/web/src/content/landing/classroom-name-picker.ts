import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "classroom-name-picker",
  preset: "class-sample",
  open: { mode: "elimination" },
  title: "Classroom name picker where every student gets a turn",
  description:
    "Pick students at random with no repeats until the whole class has had a turn. Save each class, project it full screen, and keep student names on your device.",
  h1: "Classroom name picker: everyone gets a turn",
  intro:
    "This wheel opens in elimination mode with 24 made-up students. Each name drops out after it's picked, so nobody is chosen twice until everyone has been.",
  sections: [
    {
      h2: "Everyone gets a turn",
      body: [
        "Cold-calling works best when students believe it is random and that their turn is coming. Elimination mode does both. Each spin removes the chosen student from the wheel, the wheel shrinks, and the last few names know they're next. When the wheel is empty, press Put everyone back and the full class returns.",
        "Sometimes a student can't answer. Give them a minute and come back to them yourself after the next spin. The wheel decides who goes first, not who is allowed to speak.",
        "If a student is absent, disable their name for the day rather than deleting it. They stay in the class list and come back with one click tomorrow.",
      ],
    },
    {
      h2: "One saved wheel per class",
      body: [
        "Paste each class list once and save it as its own wheel, named 7B Science or Period 3. The My wheels drawer lets you open, rename or duplicate them, and deleting one can be undone. Lists are kept in your browser's own storage on this computer.",
        "Teaching from two computers? Export a .whirl.json file with all your classes and import it on the other one. There is no account to sync through, which is also why nothing about your students sits on anyone's server.",
      ],
    },
    {
      h2: "Projector tips",
      body: [
        {
          list: [
            "Press F for presenter mode. The editor and header disappear and the wheel fills the screen.",
            "Raise the font size in settings so names on thin slices are readable from the back row.",
            "Press M to mute the ticking if you're picking during quiet work.",
            "Set a short spin, 2 or 3 seconds, for quick questioning. Save long spins for moments that deserve suspense.",
            "Press Space or Enter with the wheel focused, or Ctrl+Enter from anywhere, so you never need to aim at a button.",
          ],
        },
      ],
    },
    {
      h2: "Beyond picking one name",
      body: [
        "The same class list can make groups. Switch the mode to teams, choose a group size, and you get random groups with optional rules to keep certain students apart. Press New round next week and it avoids repeating partners. See the [random group generator](/random-group-generator/) for the details.",
        "Pick N winners is handy for choosing three helpers at once or the order for presentations. The history panel keeps a timestamped list of who was picked, which you can export as CSV if you track participation. Over a few weeks that record shows quickly whether the same hands always go up while quieter students rarely get asked.",
      ],
    },
  ],
  faq: [
    {
      q: "Can each student be picked only once?",
      a: "Yes. The page opens in elimination mode, which removes each student after they're picked. Nobody can come up twice until you press Put everyone back. Every pick is logged in the history panel, so you can see who has already had a turn.",
    },
    {
      q: "Can I save wheels for different classes?",
      a: "Yes. Save one wheel per class and switch between them in My wheels. Each keeps its own list, settings and history. They're stored in your browser on this device, so export a .whirl.json file to move them to another computer or keep a backup.",
    },
    {
      q: "Is it big enough for a projector?",
      a: "Press F for presenter mode and the wheel fills the whole screen. You can raise the font size so names read clearly from the back row. A class of 30 fits comfortably on one wheel, and the picked name is always shown in large type when the wheel stops.",
    },
    {
      q: "What happens to my students' names?",
      a: "They stay on your computer. There's no sign-in, no server that stores lists, no analytics and no ads. If you share a wheel by link, the names travel inside the link's fragment, which browsers don't send to servers. The [no-ads classroom page](/classroom-wheel-no-ads/) covers privacy in more depth.",
    },
  ],
  related: ["classroom-wheel-no-ads", "random-group-generator", "random-name-picker"],
  navLabel: "Classroom name picker",
  updated: "2026-09-29",
};

export default page;
