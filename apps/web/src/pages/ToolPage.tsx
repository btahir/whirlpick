// Home and landing pages: the tool, then (for landing pages) the page's own content.
import { lazy, Suspense, useEffect, useState } from "react";
import type { LandingInfo } from "../app/routes";
import { activeWheel } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
// Plates load right after the page is interactive (not part of the initial JS).
const loadDialogs = () => import("../ui/Dialogs");
const Dialogs = lazy(() => loadDialogs().then((m) => ({ default: m.Dialogs })));
import { inline } from "../ui/Content";
import { Panel } from "../ui/Panel";
import { useController } from "../ui/primitives";
import { ConfettiLayer, LiveRegions, ToolHeader, Toasts } from "../ui/Shell";
import { Stage } from "../ui/Stage";

function isTyping(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e) return false;
  const tag = e.tagName;
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["checkbox", "radio", "range", "button"].includes((e as HTMLInputElement).type)) || e.isContentEditable;
}

export function useShortcuts() {
  const c = useController();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = c.store.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        c.spin();
        return;
      }
      if (e.defaultPrevented || e.altKey) return;
      const dialogOpen = !!document.querySelector("dialog[open]");
      if (e.key === "Escape" && st.ui.presenter && !dialogOpen) {
        c.togglePresenter(false);
        return;
      }
      if (isTyping(e.target) || dialogOpen) return;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) c.redo();
        else c.undo();
        return;
      }
      if (mod) return;
      const k = e.key.toLowerCase();
      if (k === "f") {
        e.preventDefault();
        c.togglePresenter();
      } else if (k === "m") {
        e.preventDefault();
        c.toggleMute();
      } else if (k === "h") {
        e.preventDefault();
        c.toggleEditor();
      } else if (e.key === "?") {
        e.preventDefault();
        c.openDialog("shortcuts");
      } else if (e.key === " " && st.spin.phase === "spinning" && (e.target as HTMLElement)?.tagName !== "BUTTON") {
        // SPEC §12: during a spin, Space skips to the end.
        e.preventDefault();
        c.spin();
      }
    };
    document.addEventListener("keydown", onKey);
    const onFs = () => {
      if (!document.fullscreenElement && c.store.getState().ui.presenter) c.store.dispatch({ type: "ui/presenter", value: false });
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [c]);
}

export function ToolPage({ landing }: { landing?: LandingInfo }) {
  useShortcuts();
  const v = useSel((s) => ({ hidden: s.ui.editorHidden, presenter: s.ui.presenter, surface: s.surface, spinning: s.spin.phase !== "idle", mode: activeWheel(s).settings.mode }), shallowEq);
  const layout = `app${v.hidden ? " no-panel" : ""}${v.presenter ? " presenter" : ""}${v.spinning ? " spinning" : ""}`;
  return (
    <>
      <a className="skip" href="#main">
        Skip to the wheel
      </a>
      <ToolHeader />
      <main id="main" className={layout} data-page={landing ? landing.slug : "home"}>
        {landing ? (
          <div className="landing-head">
            <h1>{landing.h1}</h1>
            <p className="lede">{inline(landing.intro)}</p>
          </div>
        ) : (
          <h1 className="sr-only">Whirlpick: spin the wheel, pick a name, split teams</h1>
        )}
        <div className="workspace">
          <Stage />
          {!v.hidden && !v.presenter ? <Panel /> : null}
        </div>
      </main>
      <LazyDialogs />
      <ConfettiLayer />
      <Toasts />
      <LiveRegions />
    </>
  );
}

function LazyDialogs() {
  const [on, setOn] = useState(false);
  const wanted = useSel((s) => !!s.ui.dialog || s.spin.phase !== "idle");
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: object) => number }).requestIdleCallback;
    const go = () => setOn(true);
    if (idle) idle(go, { timeout: 1200 });
    else setTimeout(go, 300);
  }, []);
  if (!on && !wanted) return null;
  return (
    <Suspense fallback={null}>
      <Dialogs />
    </Suspense>
  );
}
