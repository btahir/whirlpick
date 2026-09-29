// Dev-server only (never in a production build): resolves landing pages from the content
// modules and renders the static page bodies that the prerender would normally write.
import { renderToStaticMarkup } from "react-dom/server";
import { ROOT_SLOT, StaticBody } from "../pages/static";
import type { Route } from "./routes";
import { matchRoute } from "./routes-server";

export async function devRoute(path: string): Promise<Route> {
  return matchRoute(path);
}

export function devStatic(route: Route): void {
  const root = document.getElementById("root");
  if (!root || root.hasChildNodes()) return;
  const html = renderToStaticMarkup(<StaticBody route={route} />).replace(ROOT_SLOT, '<div id="root-dev"></div>');
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const slot = tmp.querySelector("#root-dev");
  root.replaceWith(...Array.from(tmp.childNodes));
  if (slot) slot.id = "root";
}
