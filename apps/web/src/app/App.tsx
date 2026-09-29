// The app root: one component for every route so the prerender and the client render the same
// tree (renderToString → hydrateRoot).
import { useEffect } from "react";
import { presetById, type Wheel } from "@whirlpick/core";
import { AboutPage, AgentsPage, NotFoundPage, SupportPage } from "../pages/DocPages";
import { ToolPage, useShortcuts } from "../pages/ToolPage";
import { VerifyPage } from "../pages/VerifyPage";
import { defaultSettings, wheelFromPreset } from "../state/defaults";
import { StoreContext, useSel, type Store } from "../state/store";
import { ControllerContext } from "../ui/primitives";
import { ConfettiLayer, LiveRegions } from "../ui/Shell";
import { Stage } from "../ui/Stage";
import type { Controller } from "./controller";
import type { Route } from "./routes";

/** The wheel a route opens with before storage and links are read (identical on server and client). */
export function routeWheel(route: Route): Wheel {
  if (route.kind === "landing") {
    const p = route.page;
    let preset = presetById(p.preset, p.presetParams) ?? presetById("names-sample")!;
    const w = wheelFromPreset(preset);
    const o = p.open ?? {};
    const s = { ...w.settings };
    if (o.mode) s.mode = o.mode;
    if (o.count !== undefined || o.reveal) s.multi = { count: o.count ?? s.multi.count, reveal: o.reveal ?? s.multi.reveal };
    if (o.teamsBy || o.teams || o.size) s.teams = { ...s.teams, by: o.teamsBy ?? s.teams.by, count: o.teams ?? s.teams.count, size: o.size ?? s.teams.size };
    if (o.fairDraw !== undefined) s.fairDraw = o.fairDraw;
    preset = preset;
    return { ...w, settings: s };
  }
  const p = presetById("names-sample");
  return p ? wheelFromPreset(p) : { id: "w_default0", name: "My wheel", entries: [], settings: defaultSettings() };
}

export function App({ route, store, controller }: { route: Route; store: Store; controller: Controller }) {
  return (
    <StoreContext.Provider value={store}>
      <ControllerContext.Provider value={controller}>
        <Page route={route} />
      </ControllerContext.Provider>
    </StoreContext.Provider>
  );
}

function Page({ route }: { route: Route }) {
  const surface = useSel((s) => s.surface);
  if (route.kind === "home" || route.kind === "landing" || route.kind === "embed") {
    if (surface !== "app" || route.kind === "embed") return <Chromeless />;
    return <ToolPage landing={route.kind === "landing" ? route.page : undefined} />;
  }
  if (route.kind === "verify") return <VerifyPage />;
  if (route.kind === "about") return <AboutPage />;
  if (route.kind === "support") return <SupportPage />;
  if (route.kind === "agents") return <AgentsPage />;
  return <NotFoundPage />;
}

/** Embed and stream mode: only the wheel, the caption and confetti (SPEC §9). */
function Chromeless() {
  useShortcuts();
  const surface = useSel((s) => s.surface);
  useEffect(() => {
    document.documentElement.classList.add("chromeless");
    return () => document.documentElement.classList.remove("chromeless");
  }, []);
  return (
    <>
      <main id="main" className={`chromeless-main ${surface}`}>
        <h1 className="sr-only">Whirlpick wheel</h1>
        <Stage />
      </main>
      <ConfettiLayer />
      <LiveRegions />
    </>
  );
}
