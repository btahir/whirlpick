// Home and landing pages: the tool, then (for landing pages) the page's own content.
import { useEffect } from "react";
import { HOME_CONTENT } from "../content/home";
import { LANDING_PAGES, landingBySlug } from "../content/landing/index";
import type { LandingContent } from "../content/types";
import { activeWheel } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
import { Dialogs } from "../ui/Dialogs";
import { Faq, inline, Sections } from "../ui/Content";
import { Panel } from "../ui/Panel";
import { useController } from "../ui/primitives";
import { ConfettiLayer, Footer, LiveRegions, ToolHeader, Toasts } from "../ui/Shell";
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

export function ToolPage({ landing }: { landing?: LandingContent }) {
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
      {!v.presenter ? <PageContent landing={landing} /> : null}
      {!v.presenter ? <Footer /> : null}
      <Dialogs />
      <ConfettiLayer />
      <Toasts />
      <LiveRegions />
    </>
  );
}

function PageContent({ landing }: { landing?: LandingContent }) {
  if (!landing) {
    return (
      <div className="content home-content">
        <div className="prose">
          <Sections sections={HOME_CONTENT.sections} />
          <section className="prose-section" aria-labelledby="jobs">
            <h2 id="jobs">A wheel for every job</h2>
            <ul className="jobs">
              {LANDING_PAGES.map((p) => (
                <li key={p.slug}>
                  <a href={`/${p.slug}/`}>{p.navLabel}</a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    );
  }
  const related = landing.related.map((r) => landingBySlug(r)).filter((x): x is LandingContent => !!x);
  return (
    <div className="content">
      <article className="prose">
        <Sections sections={landing.sections} />
        <Faq items={landing.faq} />
        <p className="privacy-line">
          Nothing leaves your device: no account, no upload, no ads. <a href="/about/">How Whirlpick handles your lists</a>
        </p>
        {related.length ? (
          <nav className="related" aria-label="Related wheels">
            <h2 className="eyebrow">Related</h2>
            <ul>
              {related.map((r) => (
                <li key={r.slug}>
                  <a href={`/${r.slug}/`}>{r.navLabel}</a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </article>
    </div>
  );
}
