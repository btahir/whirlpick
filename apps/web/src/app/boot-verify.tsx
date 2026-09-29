// Client boot for /verify/.
import { hydrateRoot, createRoot } from "react-dom/client";
import { registerServiceWorker } from "../pwa/register";
import { initialState } from "../state/defaults";
import { createStore } from "../state/store";
import { routeWheel } from "./App";
import { createController } from "./controller";
import type { Route } from "./routes";
import { VerifyApp } from "./VerifyApp";

export function start(route: Route): void {
  const store = createStore(initialState(routeWheel(route), "app"));
  const controller = createController(store, { surface: "app" });
  const root = document.getElementById("root")!;
  const tree = <VerifyApp store={store} controller={controller} />;
  if (root.hasChildNodes()) hydrateRoot(root, tree);
  else createRoot(root).render(tree);
  void controller.bootPrefs();
  requestAnimationFrame(() => (document.documentElement.dataset.hydrated = "1"));
  registerServiceWorker(controller);
}
