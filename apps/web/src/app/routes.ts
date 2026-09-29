// Client-safe route table (PLAN §6.1). No content modules here: the prerender embeds each landing
// page's small `LandingInfo` as JSON in the page, so the client bundle never carries page copy.
// Metadata and the full content live in routes-server.ts (prerender only).

export interface LandingOpen {
  mode?: "normal" | "elimination" | "multi" | "teams";
  count?: number | "all";
  reveal?: "sequential" | "instant";
  teamsBy?: "count" | "size";
  teams?: number;
  size?: number;
  fairDraw?: boolean;
}

export interface LandingInfo {
  slug: string;
  h1: string;
  intro: string;
  preset: string;
  presetParams?: Record<string, string>;
  open?: LandingOpen;
}

export type Route =
  | { kind: "home"; path: "/" }
  | { kind: "landing"; path: string; page: LandingInfo }
  | { kind: "verify"; path: "/verify/" }
  | { kind: "about"; path: "/about/" }
  | { kind: "support"; path: "/support/" }
  | { kind: "agents"; path: "/docs/agents/" }
  | { kind: "embed"; path: "/embed/" }
  | { kind: "notfound"; path: "/404.html" };

export function normalisePath(p: string): string {
  let path = p.split(/[?#]/)[0] || "/";
  if (path.endsWith("/index.html")) path = path.slice(0, -"index.html".length);
  if (path === "/404" || path === "/404/") return "/404.html";
  if (!path.endsWith("/") && !path.endsWith(".html")) path += "/";
  return path;
}

/** Match a path; landing pages need their info (from the page JSON or the server content). */
export function matchRoute(p: string, landing?: (slug: string) => LandingInfo | undefined): Route {
  const path = normalisePath(p);
  if (path === "/") return { kind: "home", path: "/" };
  if (path === "/verify/") return { kind: "verify", path };
  if (path === "/about/") return { kind: "about", path };
  if (path === "/support/") return { kind: "support", path };
  if (path === "/docs/agents/") return { kind: "agents", path };
  if (path === "/embed/") return { kind: "embed", path };
  const m = /^\/([a-z0-9-]+)\/$/.exec(path);
  if (m && landing) {
    const page = landing(m[1]!);
    if (page) return { kind: "landing", path, page };
  }
  return { kind: "notfound", path: "/404.html" };
}

export function isToolRoute(r: Route): boolean {
  return r.kind === "home" || r.kind === "landing" || r.kind === "embed";
}

/** Routes with a React root (the rest are static HTML plus the service worker). */
export function isInteractive(r: Route): boolean {
  return isToolRoute(r) || r.kind === "verify";
}
