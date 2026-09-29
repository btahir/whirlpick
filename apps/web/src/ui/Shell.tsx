// Page chrome: header, footer, toasts, live regions and the confetti overlay.
import { useEffect, useRef, useState } from "react";
import { SUPPORT_URL, REPO_URL } from "../config/site";
import { LANDING_PAGES } from "../content/landing/index";
import { t } from "../copy/en";
import { activeWheel } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
import { Icon, Menu, useController } from "./primitives";
import { useScheme } from "./WheelCanvas";

export function Mark({ size = 30 }: { size?: number }) {
  // The brand mark (brand/mark.svg); night variant swaps the rim and spokes via CSS variables.
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="27" cy="37" r="25" fill="var(--wp-rim)" />
      <path d="M27 37L27 17A20 20 0 0 1 47 37Z" fill="#F2A93B" />
      <path d="M27 37L47 37A20 20 0 0 1 27 57Z" fill="#17735D" />
      <path d="M27 37L27 57A20 20 0 0 1 7 37Z" fill="#F2B8A6" />
      <path d="M27 37L7 37A20 20 0 0 1 27 17Z" fill="#2A55A8" />
      <g stroke="var(--wp-sep)" strokeWidth="1.6">
        <line x1="27" y1="37" x2="47" y2="37" />
        <line x1="27" y1="37" x2="27" y2="57" />
        <line x1="27" y1="37" x2="7" y2="37" />
        <line x1="27" y1="37" x2="27" y2="17" />
      </g>
      <circle cx="27" cy="37" r="5.5" fill="var(--wp-hub)" stroke="var(--wp-rim)" strokeWidth="2.5" />
      <path transform="translate(51.5 12.5) rotate(135)" d="M22 0C16.5 -4.2 9 -10.5 1.5 -10.5C-4.8 -10.5 -8.5 -6 -8.5 0C-8.5 6 -4.8 10.5 1.5 10.5C9 10.5 16.5 4.2 22 0Z" fill="#C2361F" stroke="var(--wp-rim)" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="51.5" cy="12.5" r="2.6" fill="#C9A24A" />
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Whirlpick home">
      <Mark />
      <span className="wordmark">Whirlpick</span>
    </a>
  );
}

/** Header for the tool pages (SPEC §9 / mock). */
export function ToolHeader() {
  const c = useController();
  const scheme = useScheme();
  const v = useSel((s) => ({ name: activeWheel(s).name, muted: s.prefs.muted, presenter: s.ui.presenter, spinning: s.spin.phase !== "idle", editorHidden: s.ui.editorHidden }), shallowEq);
  const [editing, setEditing] = useState(false);
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
      <button type="button" className="hbtn hide-s" onClick={() => c.openDialog("share")} data-testid="share">
        <Icon name="share" />
        {t.share}
      </button>
      <div className="sepv hide-s" />
      <button type="button" className="ibtn" onClick={() => c.toggleMute()} aria-label={v.muted ? "Sound off. Turn sound on" : "Sound on. Turn sound off"} aria-pressed={!v.muted} data-testid="mute">
        <Icon name={v.muted ? "sound-off" : "sound"} />
      </button>
      <button type="button" className="ibtn hide-s" onClick={toggleScheme} aria-label={scheme === "dark" ? "Dark theme. Switch to light" : "Light theme. Switch to dark"}>
        <Icon name={scheme === "dark" ? "sun" : "moon"} />
      </button>
      <button type="button" className="ibtn hide-s" onClick={() => c.togglePresenter()} aria-label={v.presenter ? "Leave presenter mode" : "Presenter mode"} aria-pressed={v.presenter}>
        <Icon name={v.presenter ? "full-exit" : "full"} />
      </button>
      <a className="hbtn support hide-s" href={SUPPORT_URL}>
        {t.support}
      </a>
      <Menu
        label="Menu"
        className="show-s-inline"
        items={[
          { label: t.saved, icon: "saved", onSelect: () => c.openDialog("wheels") },
          { label: t.share, icon: "share", onSelect: () => c.openDialog("share") },
          { label: scheme === "dark" ? "Light theme" : "Dark theme", icon: scheme === "dark" ? "sun" : "moon", onSelect: toggleScheme },
          { label: "Presenter mode", icon: "full", onSelect: () => c.togglePresenter() },
          { label: "Customise", icon: "palette", onSelect: () => c.openDialog("customise") },
          "sep",
          { label: "Check a draw", icon: "seal", href: "/verify/", onSelect: () => {} },
          { label: "About and privacy", href: "/about/", onSelect: () => {} },
          { label: t.support, href: SUPPORT_URL, onSelect: () => {} },
        ]}
      />
      <Menu
        label="More"
        className="hide-s"
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

/** Header for content pages. */
export function PageHeader({ current }: { current?: string }) {
  const links: [string, string][] = [
    ["/", "Wheel"],
    ["/?mode=teams", "Teams"],
    ["/verify/", "Verify"],
    ["/about/", "About"],
  ];
  return (
    <header className="hdr page-hdr">
      <Brand />
      <div className="spacer" />
      <nav aria-label="Main" className="page-nav">
        {links.map(([href, label]) => (
          <a key={href} href={href} className="hbtn" aria-current={current === href ? "page" : undefined}>
            {label}
          </a>
        ))}
        <a className="hbtn support" href={SUPPORT_URL} aria-current={current === SUPPORT_URL ? "page" : undefined}>
          {t.support}
        </a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="ftr">
      <div className="ftr-in">
        <div className="ftr-brand">
          <Brand />
          <p className="small">Free, open source (MIT) and ad-free. Your lists stay on this device.</p>
        </div>
        <nav aria-label="Wheels for every job" className="ftr-links">
          <h2 className="eyebrow">Wheels</h2>
          <ul>
            {LANDING_PAGES.map((p) => (
              <li key={p.slug}>
                <a href={`/${p.slug}/`}>{p.navLabel}</a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Whirlpick" className="ftr-links ftr-small">
          <h2 className="eyebrow">Whirlpick</h2>
          <ul>
            <li>
              <a href="/verify/">Check a draw</a>
            </li>
            <li>
              <a href="/about/">About and privacy</a>
            </li>
            <li>
              <a href="/docs/agents/">For agents: CLI and MCP</a>
            </li>
            <li>
              <a href={REPO_URL} rel="noopener">
                Source on GitHub
              </a>
            </li>
            <li>
              <a href={SUPPORT_URL}>{t.support}</a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
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
