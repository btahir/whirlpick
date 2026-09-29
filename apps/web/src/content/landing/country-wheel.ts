import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "country-wheel",
  preset: "countries",
  title: "Random country wheel of all 195 countries",
  description:
    "Spin a wheel of 195 countries for geography games, quizzes and travel ideas. Narrow it to one region, work through the list without repeats, and play offline.",
  h1: "Random country wheel",
  intro:
    "The wheel holds 195 countries: the 193 UN member states and the 2 observer states. Spin for a random country, or trim the list to the part of the world you want.",
  sections: [
    {
      h2: "About the list",
      body: [
        "We wrote the list ourselves, using short English names such as Czechia and North Macedonia. It covers every UN member state plus the Holy See and Palestine, which hold observer status. Other territories and regions are not included, but you can add any you want by typing them on new lines.",
        "With 195 entries the slices are too thin for labels, so the wheel shows colours while it spins and the winning country appears in large text when it stops. Screen readers hear the result announced. If you want names visible on the slices, cut the list below about 100 entries and the labels return.",
      ],
    },
    {
      h2: "Narrowing it to a region",
      body: [
        "For a lesson on one continent you don't want Fiji coming up every third spin. You have two options:",
        {
          list: [
            "Clear the wheel and paste your own list, for example the countries of South America, one per line. Twelve slices is a very readable wheel.",
            "Keep the full list and disable the countries you don't want. They stay in the editor, so you can switch them back on for a world round.",
          ],
        },
        "Save each version as its own wheel, such as Europe or Countries we've studied, so next lesson starts in one click.",
      ],
    },
    {
      h2: "Geography games that use a spin",
      body: [
        {
          list: [
            "Capital race. Spin a country and the first person to name its capital scores.",
            "Neighbours. Name as many bordering countries as you can in thirty seconds.",
            "Map pin. Everyone marks the spun country on a blank map, closest guess wins.",
            "Five facts. Each player adds one fact until someone runs dry.",
          ],
        },
        "Turn on elimination mode for a quiz round so no country repeats. The history panel keeps the order they came up, which doubles as an answer sheet you can export as CSV.",
      ],
    },
    {
      h2: "Picking a travel destination",
      body: [
        "Spinning the whole world is fun but rarely practical. For real trip planning, make a shortlist of places you could actually reach on your budget and dates, then spin. Weight the ones you're most excited about. If friends are coming, send them a share link so everyone sees the same shortlist before you commit to anything.",
        "For a bigger adventure, switch to pick N winners and draw three countries at once. Treat them as a shortlist to research rather than a booking. Read up on visas, seasons and flight times for each, drop any that don't work, and spin again between the survivors if you still can't choose.",
      ],
    },
  ],
  faq: [
    {
      q: "How many countries are on the wheel?",
      a: "195. That is the 193 member states of the United Nations plus the two observer states, the Holy See and Palestine. We wrote the names ourselves in short English form. You can add or remove entries freely, and your edited wheel saves on your device.",
    },
    {
      q: "Can I spin only countries in Europe?",
      a: "Yes. Either paste your own list of European countries in place of the full set, or keep the full set and disable every country outside Europe. Save the result as its own wheel so you don't have to set it up again next time.",
    },
    {
      q: "Does the wheel show flags?",
      a: "No flag images ship with the wheel. You can add your own image to any slice from the editor, and images stay on your device. They aren't included in share links, so export a .whirl.json file if you want to pass a wheel with images to someone else.",
    },
    {
      q: "Can I use the country wheel offline?",
      a: "Yes. After your first visit the browser keeps a copy of the whole app, including the country list, so it works with no connection. That suits a classroom with unreliable wifi or a long flight while you daydream about the next trip.",
    },
  ],
  related: ["letter-wheel", "random-number-wheel", "decision-wheel"],
  navLabel: "Country wheel",
  updated: "2026-09-29",
};

export default page;
