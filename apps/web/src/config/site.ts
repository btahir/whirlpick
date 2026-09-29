/**
 * Site-wide constants. SITE_URL and REPO_URL are defined once in @whirlpick/core (site.ts) and
 * re-exported here. DONATION_LINKS below is the only place in the repo where a Stripe URL may
 * appear (RULES §5); every "Support" link goes to our own /support/ page, which reads them from here.
 */
import { APP_NAME, APP_VERSION, REPO_URL, SCHEMA_URLS, SITE_URL } from "@whirlpick/core";

export { APP_NAME, APP_VERSION, REPO_URL, SCHEMA_URLS, SITE_URL };
export const SITE_NAME = APP_NAME;
export const SUPPORT_URL = "/support/";
export const SITE_TAGLINE = "Spin the wheel. Check the draw.";
export const SITE_DESCRIPTION =
  "A free spin wheel and random name picker with no ads and no uploads. Every spin comes with a receipt anyone can check. Works offline.";
export const APP_ID = `whirlpick-web/${APP_VERSION}`;

export const DONATION_LINKS = {
  once: "https://buy.stripe.com/fZu14m0FO3v050PfqP3ks00",
  monthly: [
    { label: "$5", note: "Supporter", href: "https://buy.stripe.com/9B68wOewEaXsgJxdiH3ks01" },
    { label: "$15", note: "Backer", href: "https://buy.stripe.com/7sYbJ088g3v0gJx4Mb3ks02" },
    { label: "$50", note: "Sponsor", href: "https://buy.stripe.com/28EeVc88g5D80Kz2E33ks03" },
    { label: "$100", note: "Company sponsor", href: "https://buy.stripe.com/00w14m6088PkbpdceD3ks04" },
  ],
} as const;
