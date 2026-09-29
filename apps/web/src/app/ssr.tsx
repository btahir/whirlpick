// Server-side rendering for the prerender script. The body is static HTML (content, headers of
// content pages, footer) with a #root slot holding the interactive React tree, rendered with the
// same App component the client hydrates.
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { SITE_NAME, SITE_URL } from "../config/site";
import { ABOUT } from "../content/docs/about";
import { AGENTS_DOC } from "../content/docs/agents";
import { SUPPORT_DOC } from "../content/docs/support";
import { VERIFY_DOC } from "../content/docs/verify";
import type { FaqItem } from "../content/types";
import { ROOT_SLOT, StaticBody } from "../pages/static";
import { initialState } from "../state/defaults";
import { createStore } from "../state/store";
import { blocksText, plain } from "../ui/Content";
import { App, routeWheel } from "./App";
import { createController } from "./controller";
import { VerifyApp } from "./VerifyApp";
import { isInteractive, type LandingInfo } from "./routes";
import { LANDING_PAGES, landingContent, matchRoute, routeMeta, staticRoutes, type RouteMeta } from "./routes-server";

export { LANDING_PAGES, staticRoutes };

export interface Rendered {
  path: string;
  body: string;
  meta: RouteMeta;
  jsonLd: object[];
  /** Body words (landing pages: sections only; FAQ excluded). */
  bodyWords: number;
  faq: FaqItem[];
  bodyText: string;
  /** Embedded as JSON for the client (landing pages only). */
  landing: LandingInfo | null;
  interactive: boolean;
}

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

function faqLd(faq: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: plain(f.q), acceptedAnswer: { "@type": "Answer", text: plain(f.a) } })),
  };
}

export function renderRoute(path: string): Rendered {
  const route = matchRoute(path);
  const interactive = isInteractive(route);
  let rootHtml = "";
  if (interactive) {
    const store = createStore(initialState(routeWheel(route), route.kind === "embed" ? "embed" : "app"));
    const controller = createController(store, { surface: route.kind === "embed" ? "embed" : "app" });
    rootHtml = renderToString(route.kind === "verify" ? <VerifyApp store={store} controller={controller} /> : <App route={route} store={store} controller={controller} />);
  }
  const shell = renderToStaticMarkup(<StaticBody route={route} />);
  if (!shell.includes(ROOT_SLOT) && interactive) throw new Error(`${path}: static body has no root slot`);
  const body = shell.replace(ROOT_SLOT, `<div id="root">${rootHtml}</div>`);
  const meta = routeMeta(route);
  const url = `${SITE_URL}${route.path}`;
  const jsonLd: object[] = [];
  let faq: FaqItem[] = [];
  let bodyText = "";
  const landing = landingContent(route);
  if (route.kind === "home") {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any (runs in the browser)",
      browserRequirements: "Requires JavaScript",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: meta.description,
      isAccessibleForFree: true,
      license: "https://opensource.org/license/mit",
    });
  } else if (landing) {
    faq = landing.faq;
    bodyText = landing.sections.map((s) => blocksText(s.body)).join(" ");
    jsonLd.push(faqLd(faq));
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: landing.navLabel, item: url },
      ],
    });
  } else {
    const doc = route.kind === "verify" ? VERIFY_DOC : route.kind === "about" ? ABOUT : route.kind === "support" ? SUPPORT_DOC : route.kind === "agents" ? AGENTS_DOC : null;
    if (doc) {
      bodyText = doc.sections.map((s) => blocksText(s.body)).join(" ");
      if (doc.faq?.length) {
        faq = doc.faq;
        jsonLd.push(faqLd(doc.faq));
      }
    }
  }
  return {
    path: route.path,
    body,
    meta,
    jsonLd,
    bodyWords: words(bodyText),
    faq,
    bodyText,
    landing: route.kind === "landing" ? route.page : null,
    interactive,
  };
}
