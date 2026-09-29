import "@fontsource-variable/bricolage-grotesque/standard.css";
import "@fontsource-variable/martian-mono/index.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { hydrateRoot, createRoot } from "react-dom/client";
import { App, routeWheel } from "./app/App";
import { createController } from "./app/controller";
import { isToolRoute, matchRoute } from "./app/routes";
import { startEmbedBridge } from "./embed/bridge";
import { registerServiceWorker } from "./pwa/register";
import { renderVoiceOffline } from "./audio/synth";
import { parseLocation } from "./share/links";
import { initialState } from "./state/defaults";
import { createStore } from "./state/store";

const route = matchRoute(location.pathname);
const intent = parseLocation(location);
const embed = route.kind === "embed" || intent.query.embed;
const stream = !embed && (intent.query.stream || /[?&]stream=(green|magenta|transparent|#?[0-9a-fA-F]{6})\b/.test(location.search));
// Hydrate with the surface the prerender used, then switch (stream / ?embed=1 are client-only).
const store = createStore(initialState(routeWheel(route), route.kind === "embed" ? "embed" : "app"));
const controller = createController(store, { surface: embed ? "embed" : stream ? "stream" : "app" });
const root = document.getElementById("root")!;
const tree = <App route={route} store={store} controller={controller} />;
if (root.hasChildNodes()) hydrateRoot(root, tree);
else createRoot(root).render(tree);

if (embed || stream) store.dispatch({ type: "surface/set", surface: embed ? "embed" : "stream" });
if (isToolRoute(route)) {
  void controller.boot(route, location).then(() => {
    if (embed) startEmbedBridge(controller, intent.query.origin);
  });
} else {
  // Content pages still honour the saved theme and mute (for the verify page's announcements).
  void controller.bootPrefs();
}
if (!embed) registerServiceWorker(controller);

// Automation hooks for tests and agents driving the page (read-only use; no secrets here).
Object.assign(window, { __whirlpick: { controller, store, renderVoiceOffline } });
