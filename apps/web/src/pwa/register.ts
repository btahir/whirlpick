// Service worker registration (PLAN §6.9): production only, after load. When a new worker is
// waiting, show an "Update ready" toast with Reload.
import type { Controller } from "../app/controller";

export function registerServiceWorker(c: Controller): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const go = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        const offer = () => c.toast("An update is ready.", { label: "Reload", type: "reload" }, 30000);
        if (reg.waiting && navigator.serviceWorker.controller) offer();
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) offer();
          });
        });
      })
      .catch(() => {});
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}
