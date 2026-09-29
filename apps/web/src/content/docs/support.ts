import type { DocPage } from "../types";

// The page renders the payment buttons from DONATION_LINKS in apps/web/src/config/site.ts.
// Keep URLs and prices out of this copy.

export const SUPPORT_DOC: DocPage = {
  path: "/support/",
  title: "Support Whirlpick",
  description:
    "Whirlpick is free, ad-free and doesn't track you. If it helped your class, stream or raffle, a one-time or monthly contribution keeps it maintained.",
  h1: "Support Whirlpick",
  intro:
    "Whirlpick is free. There are no ads, no account, no tracking and no paid tier, and every feature is open to everyone. It costs time to keep it that way, and that is what support pays for.",
  sections: [
    {
      h2: "What you already get",
      body: [
        "Every part of the app is free: fair-draw receipts, teams with balance rules, saved wheels, share links, offline use, the CLI and the MCP server. Nothing is locked, nothing carries a watermark, and nothing will be moved behind a paywall later. The code is MIT-licensed, so you could run your own copy tomorrow.",
      ],
    },
    {
      h2: "What support pays for",
      body: [
        {
          list: [
            "Fixing bugs and keeping up with browser changes, especially in Safari and on school Chromebooks.",
            "Keeping the draw algorithm, the receipts and the verifier stable, so old receipts still check years from now.",
            "Features people ask for, such as several wheels on one screen.",
            "Hosting, which costs little because the site is static files with no server.",
          ],
        },
        "A contribution doesn't unlock anything, and the app doesn't know who gave. With no tracking there is no supporter list and no badge. It simply means more hours go into Whirlpick.",
      ],
    },
    {
      h2: "How paying works",
      body: [
        "The buttons on this page open a Stripe checkout. Stripe handles the payment, and Whirlpick never sees your card details.",
      ],
    },
    {
      h2: "Other ways to help",
      body: [
        {
          list: [
            "Tell a teacher, streamer or club organiser who still uses a wheel full of ads.",
            "Report a bug or a confusing screen in the repository's issue tracker at {REPO_URL}.",
            "Run a public draw with a receipt and point people to the [verify page](/verify/). Every checked draw makes the case for checkable draws.",
          ],
        },
      ],
    },
  ],
  updated: "2026-09-29",
};
