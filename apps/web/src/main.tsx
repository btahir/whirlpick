// Entry: every page loads this tiny module. Interactive pages (the tool and /verify/) then load
// the app chunk (preloaded by the prerender); content pages only register the service worker.
// Styles are part of the entry so every page, static or interactive, gets them in the HTML.
import "@fontsource-variable/bricolage-grotesque/standard.css";
import "@fontsource-variable/martian-mono/index.css";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { isInteractive, matchRoute, type LandingInfo, type Route } from "./app/routes";

function pageLanding(): LandingInfo | undefined {
  const el = document.getElementById("wp-page");
  if (!el?.textContent) return undefined;
  try {
    return JSON.parse(el.textContent) as LandingInfo;
  } catch {
    return undefined;
  }
}

async function main() {
  const info = pageLanding();
  let route: Route = matchRoute(location.pathname, (slug) => (info && info.slug === slug ? info : undefined));
  if (import.meta.env.DEV) {
    // Dev server: no prerender, so resolve landing pages and draw static pages client-side.
    const dev = await import("./app/dev");
    route = await dev.devRoute(location.pathname);
    dev.devStatic(route);
  }
  if (route.kind === "verify") {
    const m = await import("./app/boot-verify");
    m.start(route);
  } else if (isInteractive(route)) {
    const m = await import("./app/boot");
    m.start(route);
  } else if ("serviceWorker" in navigator && import.meta.env.PROD) {
    const go = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") go();
    else addEventListener("load", go, { once: true });
  }
}
void main();
