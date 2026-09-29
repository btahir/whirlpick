// Server-side route data (prerender only): metadata and the content modules.
import { ABOUT } from "../content/docs/about";
import { AGENTS_DOC } from "../content/docs/agents";
import { SUPPORT_DOC } from "../content/docs/support";
import { VERIFY_DOC } from "../content/docs/verify";
import { LANDING_PAGES, landingBySlug } from "../content/landing/index";
import type { LandingContent } from "../content/types";
import { matchRoute as matchClient, type LandingInfo, type Route } from "./routes";

export interface RouteMeta {
  title: string;
  description: string;
  noindex: boolean;
  lastmod: string;
}

export const HOME_META: RouteMeta = {
  title: "Whirlpick: spin the wheel and random name picker, no ads",
  description:
    "A free spin wheel and random name picker with no ads, no account and no uploads. Split teams, run fair raffles, and check every spin with a receipt.",
  noindex: false,
  lastmod: "2026-09-29",
};

export function landingInfo(p: LandingContent): LandingInfo {
  const info: LandingInfo = { slug: p.slug, h1: p.h1, intro: p.intro, preset: p.preset };
  if (p.presetParams) info.presetParams = p.presetParams;
  if (p.open) info.open = p.open;
  return info;
}

export function matchRoute(path: string): Route {
  return matchClient(path, (slug) => {
    const p = landingBySlug(slug);
    return p ? landingInfo(p) : undefined;
  });
}

export function landingContent(r: Route): LandingContent | undefined {
  return r.kind === "landing" ? landingBySlug(r.page.slug) : undefined;
}

export function routeMeta(r: Route): RouteMeta {
  switch (r.kind) {
    case "home":
      return HOME_META;
    case "landing": {
      const p = landingBySlug(r.page.slug)!;
      return { title: p.title, description: p.description, noindex: false, lastmod: p.updated };
    }
    case "verify":
      return { title: VERIFY_DOC.title, description: VERIFY_DOC.description, noindex: false, lastmod: VERIFY_DOC.updated };
    case "about":
      return { title: ABOUT.title, description: ABOUT.description, noindex: false, lastmod: ABOUT.updated };
    case "support":
      return { title: SUPPORT_DOC.title, description: SUPPORT_DOC.description, noindex: false, lastmod: SUPPORT_DOC.updated };
    case "agents":
      return { title: AGENTS_DOC.title, description: AGENTS_DOC.description, noindex: false, lastmod: AGENTS_DOC.updated };
    case "embed":
      return {
        title: "Whirlpick embed",
        description: "A chrome-less Whirlpick wheel for iframes, controlled with a documented postMessage API. No editor, no storage.",
        noindex: true,
        lastmod: "2026-09-29",
      };
    case "notfound":
      return {
        title: "Page not found · Whirlpick",
        description: "This page doesn't exist. Go back to the wheel, or check a draw on the verify page. Nothing you entered left your device.",
        noindex: true,
        lastmod: "2026-09-29",
      };
  }
}

/** Every prerendered path (indexable ones first). */
export function staticRoutes(): string[] {
  return ["/", ...LANDING_PAGES.map((p) => `/${p.slug}/`), "/verify/", "/about/", "/support/", "/docs/agents/", "/embed/", "/404.html"];
}

export { LANDING_PAGES };
