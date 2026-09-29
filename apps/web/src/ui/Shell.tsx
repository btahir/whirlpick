// Page chrome: header, footer, toasts, live regions and the confetti overlay.
import { useEffect, useRef, useState } from "react";
import { SUPPORT_URL } from "../config/site";
import { Brand } from "./Brand";
import { t } from "../copy/en";
import { activeWheel } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
import { Icon, Menu, useController, useMedia } from "./primitives";
import { useScheme } from "./WheelCanvas";

/** Header for the tool pages (SPEC §9 / mock). */
export function ToolHeader() {
  const c = useController();
  const scheme = useScheme();
  const v = useSel((s) => ({ name: activeWheel(s).name, muted: s.prefs.muted, presenter: s.ui.presenter, spinning: s.spin.phase !== "idle", editorHidden: s.ui.editorHidden }), shallowEq);
  const [editing, setEditing] = useState(false);
  const phone = useMedia("(max-width: 759px)");
  const toggleScheme = () => c.setScheme(scheme === "dark" ? "light" : "dark");
  return (
    <header className="hdr tool-hdr">
      <Brand />
      <div className="sepv hide-s" />
      {editing ? (
        <input
          className="title-edit"
          defaultValue={v.name}
          autoFocus
          maxLength={80}
          aria-label="Wheel name"
          onBlur={(e) => {
            c.rename(e.target.value.trim() || v.name);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
            }
          }}
        />
      ) : (
        <button type="button" className="title" onClick={() => setEditing(true)} aria-label={`Wheel name: ${v.name}. Rename`} disabled={v.spinning}>
          <span className="title-text">{v.name}</span>
          <Icon name="pencil" />
        </button>
      )}
      <div className="spacer" />
      <button type="button" className="hbtn hide-s" onClick={() => c.openDialog("wheels")} disabled={v.spinning} data-testid="saved">
        <Icon name="saved" />
        {t.saved}
      </button>
      <button type="button" className="hbtn hide-s hide-t" onClick={() => c.openDialog("share")} data-testid="share">
        <Icon name="share" />
        {t.share}
      </button>
      <button type="button" className="ibtn show-s-only" onClick={() => c.openDialog("share")} aria-label={t.share} data-testid="share-phone">
        <Icon name="share" />
      </button>
      <div className="sepv hide-s hide-t" />
      <button type="button" className="ibtn" onClick={() => c.toggleMute()} aria-label={v.muted ? "Sound off. Turn sound on" : "Sound on. Turn sound off"} aria-pressed={!v.muted} data-testid="mute">
        <Icon name={v.muted ? "sound-off" : "sound"} />
      </button>
      <button type="button" className="ibtn hide-s hide-t" onClick={toggleScheme} aria-label={scheme === "dark" ? "Dark theme. Switch to light" : "Light theme. Switch to dark"}>
        <Icon name={scheme === "dark" ? "sun" : "moon"} />
      </button>
      <button type="button" className="ibtn hide-s hide-t" onClick={() => c.togglePresenter()} aria-label={v.presenter ? "Leave presenter mode" : "Presenter mode"} aria-pressed={v.presenter}>
        <Icon name={v.presenter ? "full-exit" : "full"} />
      </button>
      <a className="hbtn support hide-s" href={SUPPORT_URL}>
        {t.support}
      </a>
      <Menu
        label="Menu"
        className="show-s-inline show-t"
        items={[
          { label: t.saved, icon: "saved", onSelect: () => c.openDialog("wheels") },
          // Phones have a Share button in the header (REVIEW P1-8); tablets keep it here.
          ...(phone ? [] : [{ label: t.share, icon: "share" as const, onSelect: () => c.openDialog("share") }]),
          { label: scheme === "dark" ? "Light theme" : "Dark theme", icon: scheme === "dark" ? "sun" : "moon", onSelect: toggleScheme },
          { label: "Presenter mode", icon: "full", onSelect: () => c.togglePresenter() },
          { label: "Customise", icon: "palette", onSelect: () => c.openDialog("customise") },
          ...(phone ? [] : [{ label: "Keyboard shortcuts", hint: "?", onSelect: () => c.openDialog("shortcuts") }]),
          "sep",
          { label: "Check a draw", icon: "seal", href: "/verify/", onSelect: () => {} },
          { label: "About and privacy", href: "/about/", onSelect: () => {} },
          { label: t.support, href: SUPPORT_URL, onSelect: () => {} },
        ]}
      />
      <Menu
        label="More"
        className="hide-s hide-t"
        items={[
          { label: v.editorHidden ? "Show the editor" : "Hide the editor", icon: "drawer", hint: "H", onSelect: () => c.toggleEditor() },
          { label: "Customise", icon: "palette", onSelect: () => c.openDialog("customise") },
          { label: "Keyboard shortcuts", hint: "?", onSelect: () => c.openDialog("shortcuts") },
          "sep",
          { label: "Check a draw", icon: "seal", href: "/verify/", onSelect: () => {} },
          { label: "About and privacy", href: "/about/", onSelect: () => {} },
          { label: "For agents: CLI and MCP", href: "/docs/agents/", onSelect: () => {} },
        ]}
      />
    </header>
  );
}

export function Toasts() {
  const c = useController();
  const toasts = useSel((s) => s.ui.toasts);
  const tt = toasts[toasts.length - 1];
  return (
    <div className="toasts" aria-live="polite" role="status">
      {tt ? (
        <div className="toast" key={tt.id} data-testid="toast">
          <span className={`dot ${tt.action ? "act" : "info"}`} aria-hidden="true" />
          <span className="msg">{tt.message}</span>
          {tt.action ? (
            <button type="button" className="toast-act" onClick={() => c.toastAction(tt.id)}>
              {tt.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Live regions: "Spinning…" is polite; the winner is assertive (SPEC §12). */
export function LiveRegions() {
  const { text, seq } = useSel((s) => ({ text: s.ui.announce, seq: s.ui.announceSeq }), shallowEq);
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const lastSeq = useRef(-1);
  useEffect(() => {
    if (seq === lastSeq.current) return;
    lastSeq.current = seq;
    if (!text) return;
    if (/^Winner|^Winners|teams made$/.test(text)) {
      setAssertive("");
      requestAnimationFrame(() => setAssertive(text));
    } else {
      setPolite("");
      requestAnimationFrame(() => setPolite(text));
    }
  }, [text, seq]);
  return (
    <>
      <div className="sr-only" aria-live="polite" role="status" data-testid="live-polite">
        {polite}
      </div>
      <div className="sr-only" aria-live="assertive" role="alert" data-testid="live">
        {assertive}
      </div>
    </>
  );
}

export function ConfettiLayer() {
  const c = useController();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    c.attachConfetti(ref.current);
    return () => c.attachConfetti(null);
  }, [c]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" data-testid="confetti" />;
}
