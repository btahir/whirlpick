// Client boot for interactive pages (tool and verify): styles, store, controller, hydration.
import { hydrateRoot, createRoot } from "react-dom/client";
import { renderVoiceOffline } from "../audio/synth";
import { heightFor, pickTipPoint, renderWheel } from "../wheel/renderer";
import { buildScene } from "../wheel/scene";
import { wheelTheme } from "../wheel/theme";
import { startEmbedBridge } from "../embed/bridge";
import { registerServiceWorker } from "../pwa/register";
import { parseLocation } from "../share/links";
import { initialState } from "../state/defaults";
import { createStore } from "../state/store";
import { App, routeWheel } from "./App";
import { createController } from "./controller";
import { isToolRoute, type Route } from "./routes";

export function start(route: Route): void {
  const intent = parseLocation(location);
  const embed = route.kind === "embed" || intent.query.embed;
  const stream = !embed && (intent.query.stream || /[?&]stream=(green|magenta|transparent|#?[0-9a-fA-F]{6})\b/.test(location.search));
  // Hydrate with the surface the prerender used, then switch (stream and ?embed=1 are client-only).
  const store = createStore(initialState(routeWheel(route), route.kind === "embed" ? "embed" : "app"));
  const controller = createController(store, { surface: embed ? "embed" : stream ? "stream" : "app" });
  const root = document.getElementById("root")!;
  const onMounted = () => {
    if (embed || stream) store.dispatch({ type: "surface/set", surface: embed ? "embed" : "stream" });
    if (isToolRoute(route)) {
      void controller.boot(route, location).then(() => {
        if (embed) startEmbedBridge(controller, intent.query.origin);
      });
    } else void controller.bootPrefs();
  };
  const tree = <App route={route} store={store} controller={controller} onMounted={onMounted} />;
  if (root.hasChildNodes()) hydrateRoot(root, tree);
  else createRoot(root).render(tree);
  if (!embed) registerServiceWorker(controller);
  requestAnimationFrame(() => (document.documentElement.dataset.hydrated = "1"));
  // Automation hooks for tests and agents driving the page.
  Object.assign(window, { __whirlpick: { controller, store, renderVoiceOffline, render: { renderWheel, buildScene, wheelTheme, heightFor, pickTipPoint } } });
}
