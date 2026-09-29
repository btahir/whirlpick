// Service worker registration (PLAN §6.9): production only, after load. The worker activates as
// soon as it has cached the new build; if this page was already controlled by an older worker,
// an "Update ready" toast offers a reload (the page itself keeps running on what it loaded).
import type { Controller } from "../app/controller";

export function registerServiceWorker(c: Controller): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  // A change of controller while one was already in charge means a new build took over.
  let current = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (current) c.toast("An update is ready.", { label: "Reload", type: "reload" }, 30000);
    current = navigator.serviceWorker.controller;
  });
  const go = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}
