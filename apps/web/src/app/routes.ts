// Hand-written route table (PLAN §6.1). Links are real <a href>s to prerendered pages.
import { ABOUT } from "../content/docs/about";
import { AGENTS_DOC } from "../content/docs/agents";
import { SUPPORT_DOC } from "../content/docs/support";
import { VERIFY_DOC } from "../content/docs/verify";
import { LANDING_PAGES, landingBySlug } from "../content/landing/index";
import type { LandingContent } from "../content/types";

export type Route =
  | { kind: "home"; path: "/" }
  | { kind: "landing"; path: string; page: LandingContent }
  | { kind: "verify"; path: "/verify/" }
  | { kind: "about"; path: "/about/" }
  | { kind: "support"; path: "/support/" }
  | { kind: "agents"; path: "/docs/agents/" }
  | { kind: "embed"; path: "/embed/" }
  | { kind: "notfound"; path: "/404.html" };

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

export function normalisePath(p: string): string {
  let path = p.split(/[?#]/)[0] || "/";
  if (path.endsWith("/index.html")) path = path.slice(0, -"index.html".length);
  if (path === "/404" || path === "/404/") return "/404.html";
  if (!path.endsWith("/") && !path.endsWith(".html")) path += "/";
  return path;
}

export function matchRoute(p: string): Route {
  const path = normalisePath(p);
  if (path === "/") return { kind: "home", path: "/" };
  if (path === "/verify/") return { kind: "verify", path };
  if (path === "/about/") return { kind: "about", path };
  if (path === "/support/") return { kind: "support", path };
  if (path === "/docs/agents/") return { kind: "agents", path };
  if (path === "/embed/") return { kind: "embed", path };
  const m = /^\/([a-z0-9-]+)\/$/.exec(path);
  if (m) {
    const page = landingBySlug(m[1]!);
    if (page) return { kind: "landing", path, page };
  }
  return { kind: "notfound", path: "/404.html" };
}

export function routeMeta(r: Route): RouteMeta {
  switch (r.kind) {
    case "home":
      return HOME_META;
    case "landing":
      return { title: r.page.title, description: r.page.description, noindex: false, lastmod: r.page.updated };
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

export function isToolRoute(r: Route): boolean {
  return r.kind === "home" || r.kind === "landing" || r.kind === "embed";
}
