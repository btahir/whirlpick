import type { LandingContent } from "../types";

export const page: LandingContent = {
  slug: "classroom-wheel-no-ads",
  preset: "class-sample",
  open: { mode: "normal" },
  title: "Classroom spinner with no ads and no uploads",
  description:
    "A spin wheel for school with no ads, no account and no data collected. Student names stay on your device, it works offline, and IT can host it themselves.",
  h1: "A classroom spinner with no ads and no uploads",
  intro:
    "No adverts, no sign-in, no tracking. The class list you type stays on the computer you typed it on. Try it with the 24 made-up names below.",
  sections: [
    {
      h2: "Why ads don't belong in a class tool",
      body: [
        "When you project a free spinner, you project its ads too. Teachers have complained about flashing banners, video ads that start with sound, and adverts that are plainly wrong for a room of eleven-year-olds. You can't vet an ad network's choices before the lesson, and closing a pop-up while thirty students watch wastes the moment.",
        "Whirlpick has no ads at all. It is free and open source under the MIT licence, and it relies on voluntary donations, not on showing anything to your class.",
      ],
    },
    {
      h2: "Where student names go",
      body: [
        "Nowhere beyond your own machine. The wheel runs entirely in your browser:",
        {
          list: [
            "No account, so there are no teacher or student profiles anywhere.",
            "No server that stores wheels. Saved lists sit in the browser's own storage on this device.",
            "No analytics, no cookies for tracking, and no third-party scripts.",
            "Share links put the list after the # sign in the address. Browsers never send that part to a server, including ours.",
          ],
        },
        "The practical upshot is that clearing the browser's site data also clears your lists. Export a .whirl.json file to keep a copy in your school drive.",
      ],
    },
    {
      h2: "Offline and school web filters",
      body: [
        "After the first visit, the whole app is cached by the browser and runs with no connection. It can also be installed as an app from the browser menu. A dropped school network mid-lesson doesn't stop the wheel.",
        "Web filters sometimes block class tools because they load ads, trackers or fonts from other domains. Whirlpick is a static site that makes no requests to any other domain, so there is only one address for IT to allow. We can't promise every filter will let it through, but there is nothing on the page that a filter would normally flag.",
      ],
    },
    {
      h2: "Hosting it on your school's own server",
      body: [
        "If your IT team prefers to run tools in-house, they can. The project is MIT licensed and builds to plain static files, with no database and no server code. Copy the build output to any web server or intranet host and it works the same way, including offline use and fair-draw receipts. The source and build steps are in the repository linked in the footer of every page. The [about page](/about/) explains the privacy design in more detail.",
        "Self-hosting also means the tool can't change under you mid-year. Your copy stays exactly as you deployed it until you choose to update.",
      ],
    },
  ],
  faq: [
    {
      q: "Does the classroom wheel collect any data?",
      a: "No. There is no account, no analytics and no server that receives your lists. Names you type are saved only in your browser's storage on that device. We have no way to see them, and nothing is sent anywhere when you spin, save or make a share link.",
    },
    {
      q: "Is it GDPR-friendly?",
      a: "We store nothing about you or your students on any server, because the app never sends that data anywhere. Names stay on the device where they were typed. Your school's own obligations still depend on how you use it, and this answer is not legal advice, so check with your data protection lead.",
    },
    {
      q: "Can our IT department host it?",
      a: "Yes. It is MIT licensed and builds to static files, so IT can serve it from any web server or intranet with no database or backend. A self-hosted copy works offline in the same way and never needs to contact our site.",
    },
    {
      q: "Why is it free, with no ads?",
      a: "It is an open-source project with almost no running costs, because there is no server doing any work. Everything happens in your browser. If it helps your class, there is a [support page](/support/) for voluntary donations, but nothing is locked behind payment.",
    },
  ],
  related: ["classroom-name-picker", "random-group-generator", "is-the-wheel-rigged"],
  navLabel: "Classroom wheel, no ads",
  updated: "2026-09-29",
};

export default page;
