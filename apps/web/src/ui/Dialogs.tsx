// Plates (SPEC §10): winner, receipt, share with QR, saved wheels drawer, fair draw, customise,
// entry details, shortcuts, import errors. All are <dialog>.showModal() plates (Modal).
import { useEffect, useMemo, useRef, useState } from "react";
import { TRUTH_OR_DARE_PROMPTS, verifyReceipt, type Receipt } from "@whirlpick/core";
import { SUPPORT_URL } from "../config/site";
import { fmt, groupHash, shortHex, t } from "../copy/en";
import { EMPTY, activeWheel, sessionOf } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
import { buildScene } from "../wheel/scene";
import { THEMES, wheelTheme } from "../wheel/theme";
import { renderWheel } from "../wheel/renderer";
import { Icon, Menu, Modal, PlateHead, Segmented, Switch, useController, useFilePicker } from "./primitives";
import { useScheme } from "./WheelCanvas";
import { TeamsFullDialog } from "./Teams";

export function Dialogs() {
  return (
    <>
      <WinnerPlate />
      <ReceiptDialog />
      <ShareDialog />
      <SavedDrawer />
      <FairDialog />
      <CustomiseDialog />
      <DetailsDialog />
      <ShortcutsDialog />
      <ImportErrorDialog />
      <NumbersDialog />
      <TeamsFullDialog />
    </>
  );
}

/* ------------------------------------------------------------------ winner */

function WinnerPlate() {
  const c = useController();
  const scheme = useScheme();
  const v = useSel(
    (s) => {
      const w = activeWheel(s);
      return {
        open: s.ui.dialog?.kind === "winner",
        last: s.last,
        paused: s.spin.phase === "paused",
        plan: s.spin.phase !== "idle" ? s.spin.plan : null,
        mode: w.settings.mode,
        entries: w.entries,
        theme: w.settings.theme,
        palette: w.settings.palette,
        spinNo: (s.history[s.activeId] ?? (EMPTY as never[])).length,
        removed: w.settings.mode === "elimination" && !!s.last && !s.last.replay && sessionOf(s).excluded.includes(s.last.picks[0]?.index ?? -1),
        ask: s.surface === "app" && !s.replay && (s.sessionSpins === 3 || (s.supportShownThisSession && s.sessionSpins === 3)),
        askShown: s.supportShownThisSession,
        replay: s.replay,
        presenter: s.ui.presenter,
        prompts: w.entries.length === 2 && w.entries.some((e) => e.label === "Truth") && w.entries.some((e) => e.label === "Dare"),
      };
    },
    shallowEq,
  );
  // The quiet ask shows after the third spin of the session, once (SPEC §7.3, PLAN §6.13).
  const [askNow, setAskNow] = useState(false);
  useEffect(() => {
    if (v.open && v.ask && !v.askShown) {
      setAskNow(true);
      c.store.dispatch({ type: "support/shown" });
      try {
        sessionStorage.setItem("whirlpick:asked", "1");
      } catch {
        /* ignore */
      }
    } else if (!v.open) setAskNow(false);
  }, [v.open, v.ask, v.askShown, c]);
  const colours = useMemo(() => {
    const scene = buildScene({ entries: v.entries, settings: { palette: v.palette, mysteryMode: false, fontScale: 1, centre: { text: null, imageRef: null } }, theme: wheelTheme(v.theme, scheme), radiusPx: 300 });
    return new Map(scene.slices.map((x) => [x.index, x.fill]));
  }, [v.entries, v.palette, v.theme, scheme]);
  const last = v.last;
  const picks = last?.picks ?? [];
  const main = picks[picks.length - 1];
  const total = v.plan?.segments.length ?? picks.length;
  const sequential = v.paused || (v.mode === "multi" && picks.length > 1);
  const instantMany = picks.length > 1 && !v.paused;
  const receipt = last?.receipt;
  const band = main ? colours.get(main.index) ?? "var(--wp-accent)" : "var(--wp-accent)";
  const whoSize = !main ? 96 : fitHero(main.label, v.presenter);
  const verify = v.replay?.status ?? null;
  const place = useMemo(() => (v.open ? placePlate(v.presenter) : { cls: "", top: 0 }), [v.open, v.presenter]);
  return (
    <Modal
      open={v.open && !!main}
      onClose={() => c.closeWinner()}
      className={`plate winner${v.presenter ? " presenter" : ""}${place.cls ? ` ${place.cls}` : ""}`}
      style={place.top ? ({ ["--plate-top" as string]: `${Math.round(place.top)}px` } as React.CSSProperties) : undefined} labelledBy="winner-eyebrow" initialFocus="[data-primary]" focusDelay={280} returnFocus={spinButton}>
      <div className="band" style={{ background: band }} />
      <div className="in">
        <p className="eyebrow" id="winner-eyebrow">
          {t.wheelPicked}
          {v.paused ? ` · ${picks.length} of ${total}` : instantMany ? ` · ${picks.length} winners` : ""}
        </p>
        {instantMany && !v.paused ? (
          <ol className="winners">
            {picks.map((p, i) => (
              <li key={i}>
                <span className="ord mono">{i + 1}</span>
                <span className="chip" style={{ background: colours.get(p.index) }} />
                <span className="nm">{p.label}</span>
              </li>
            ))}
          </ol>
        ) : main ? (
          <p className="who" style={{ fontSize: `${whoSize}px` }} data-testid="winner-name">
            {main.label}
          </p>
        ) : null}
        {v.paused && picks.length > 1 ? (
          <ul className="sofar" aria-label="Winners so far">
            {picks.slice(0, -1).map((p, i) => (
              <li key={i}>
                <span className="chip" style={{ background: colours.get(p.index) }} />
                {p.label}
              </li>
            ))}
          </ul>
        ) : null}
        <TruthOrDare label={main?.label} show={v.prompts} />
        {v.removed && main ? (
          <p className="removed-line" role="status">
            {main.label} is off the wheel.{" "}
            <button type="button" className="linkish" onClick={() => c.undo()} data-testid="undo-removal">
              Undo
            </button>
          </p>
        ) : null}
        <div className="acts">
          {v.paused ? (
            <button type="button" className="btn primary" data-primary data-autofocus onClick={() => c.nextSpin()}>
              <Icon name="play" /> {t.nextSpin}
            </button>
          ) : (
            <button type="button" className="btn primary" data-primary data-autofocus onClick={() => (c.closeWinner(), c.spin())} data-testid="spin-again">
              <Icon name="again" /> {v.replay ? "Replay again" : t.spinAgain}
            </button>
          )}
          {!v.replay && !sequential && v.mode === "normal" && main ? (
            <button type="button" className="btn" onClick={() => c.removeWinner()}>
              <Icon name="remove" /> {t.remove(main.label)}
            </button>
          ) : null}
          {v.paused ? (
            <button type="button" className="btn" onClick={() => c.finishSequence()}>
              Show all
            </button>
          ) : null}
        </div>
      </div>
      <div className="foot">
        {receipt && !v.paused ? (
          <button type="button" className="rlink" onClick={() => c.openDialog("receipt", last!.historyId)}>
            <Icon name="receipt" /> {t.receipt}
          </button>
        ) : (
          <span />
        )}
        {verify ? (
          <span className={`stamp small ${verify.status === "valid" ? "ok" : verify.status === "unrevealed" ? "wait" : "bad"}`}>{verify.status === "valid" ? t.checksOut : verify.status === "unrevealed" ? t.notRevealed : t.doesntMatch}</span>
        ) : receipt ? (
          <span className="mono meta">
            Spin {v.spinNo || 1} · {receipt.seed ? `seed ${shortHex(receipt.seed)}` : "seed not revealed yet"}
          </span>
        ) : null}
      </div>
      {askNow ? (
        <p className="ask" data-testid="support-ask">
          {t.supportAsk} <a href={SUPPORT_URL}>{t.supportAskLink}</a>
        </p>
      ) : null}
    </Modal>
  );
}

/**
 * Where the winner plate goes (REVIEW P1-6, P1-7): on phones a sheet that starts just under the
 * wheel (no dead band); on tablets a plate centred under the wheel, or the sheet when that would
 * run off screen; on desktop the side plate from the pointer.
 */
function placePlate(presenter: boolean): { cls: string; top: number } {
  if (typeof window === "undefined") return { cls: "", top: 0 };
  const w = innerWidth;
  const wrap = document.querySelector(".wheelwrap");
  if (!wrap || w >= 1024) return { cls: "", top: 0 };
  const bottom = wrap.getBoundingClientRect().bottom;
  if (w >= 760 && !presenter) {
    const top = bottom + 16;
    if (top + 340 <= innerHeight) return { cls: "place-below", top };
  }
  const top = Math.max(0, bottom + 12);
  if (innerHeight - top >= 280) return { cls: "place-sheet-top", top };
  return { cls: "place-sheet", top: 0 };
}

/** After the plate closes, focus goes back to the Spin button (or the wheel when it's hidden). */
function spinButton(): HTMLElement | null {
  const b = document.querySelector<HTMLElement>('[data-testid="spin"]');
  return b && b.offsetParent !== null ? b : document.querySelector<HTMLElement>('[data-testid="wheel"]');
}

function fitHero(label: string, presenter: boolean): number {
  const base = presenter ? 160 : typeof window !== "undefined" && window.innerWidth < 760 ? 72 : 96;
  const len = Array.from(label).length;
  // The name shrinks to fit two lines at most (SPEC §10), then wraps.
  const perLine = presenter ? 9 : 8;
  if (len <= perLine) return base;
  return Math.max(Math.round(base * 0.36), Math.round((base * perLine * 1.7) / Math.max(len, perLine * 1.7)));
}

function TruthOrDare({ label, show }: { label?: string; show: boolean }) {
  const [prompt, setPrompt] = useState<string | null>(null);
  useEffect(() => {
    if (!show || !label) {
      setPrompt(null);
      return;
    }
    const list = TRUTH_OR_DARE_PROMPTS[label];
    if (!list?.length) return;
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    setPrompt(list[b[0]! % list.length]!);
  }, [label, show]);
  if (!prompt) return null;
  return <p className="prompt">{prompt}</p>;
}

/* ----------------------------------------------------------------- receipt */

function ReceiptDialog() {
  const c = useController();
  const dlg = useSel((s) => s.ui.dialog);
  const open = dlg?.kind === "receipt";
  const rec = open && dlg?.arg ? c.receiptOf(dlg.arg) : undefined;
  const history = useSel((s) => s.history[s.activeId] ?? (EMPTY as never[]));
  const index = rec ? history.length - history.findIndex((h) => h.id === rec.id) : 0;
  const r = rec?.receipt;
  const json = r ? JSON.stringify(r, null, 2) : "";
  const report = useMemo(() => (r ? verifyReceipt(r) : null), [r]);
  const winners = r ? (r.mode === "teams" ? `${(r.result.teams ?? []).length} teams` : (r.result.picks ?? []).map((p) => p.label).join(", ")) : "";
  return (
    <Modal open={open && !!r} onClose={() => c.closeDialog()} className="plate receipt" labelledBy="receipt-title">
      <PlateHead id="receipt-title" title={`${t.receipt} · spin ${index > 0 && index <= history.length ? index : 1}`} onClose={() => c.closeDialog()} />
      {r ? (
        <>
          <dl className="kv">
            <div>
              <dt>Result</dt>
              <dd className="strong">{winners}</dd>
            </div>
            <div>
              <dt>Algorithm</dt>
              <dd className="mono">{r.algorithm}</dd>
            </div>
            <div>
              <dt>Wheel hash</dt>
              <dd className="mono">{groupHash(r.wheelHash)}</dd>
            </div>
            <div>
              <dt>Commitment</dt>
              <dd className="mono">{groupHash(r.commitment)}</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd className="mono">{r.seed ? groupHash(r.seed) : t.notRevealed}</dd>
            </div>
            {r.publicInput ? (
              <div>
                <dt>Room word</dt>
                <dd className="mono">{r.publicInput}</dd>
              </div>
            ) : null}
            <div>
              <dt>Spin index</dt>
              <dd className="mono">{r.spinIndex}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd className="mono">{new Date(r.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
          {report ? (
            <p className={`receipt-status ${report.status}`}>
              <span className={`stamp small ${report.status === "valid" ? "ok" : report.status === "unrevealed" ? "wait" : "bad"}`}>{report.status === "valid" ? t.checksOut : report.status === "unrevealed" ? t.notRevealed : t.doesntMatch}</span>
              {report.warnings.length ? <span className="small">The list changed after the commitment was shown.</span> : null}
            </p>
          ) : null}
          <details className="json">
            <summary>Receipt JSON</summary>
            <pre className="code" tabIndex={0} data-testid="receipt-json">
              {json}
            </pre>
          </details>
          <div className="acts">
            <button type="button" className="btn primary" data-autofocus onClick={() => void c.copy(json, "Receipt copied.")} data-testid="copy-receipt">
              <Icon name="copy" /> Copy receipt
            </button>
            <button type="button" className="btn" onClick={() => void c.replayUrl(rec!.id).then((u) => c.copy(u, "Replay link copied."))}>
              <Icon name="link" /> Replay link
            </button>
            <Menu
              label="More receipt actions"
              items={[
                { label: "Download .json", icon: "import", onSelect: () => c.download(`receipt-${r.commitment.slice(0, 8)}.json`, json + "\n") },
                { label: "Copy verify link", icon: "link", onSelect: () => void c.verifyUrl(rec!.id).then((u) => c.copy(u, "Verify link copied.")) },
              ]}
            />
          </div>
          <p className="plate-foot">
            <a href="/verify/" onClick={(e) => (e.preventDefault(), void c.verifyUrl(rec!.id).then((u) => (location.href = u)))}>
              Check it on /verify
            </a>
          </p>
        </>
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------- share */

function ShareDialog() {
  const c = useController();
  const open = useSel((s) => s.ui.dialog?.kind === "share");
  const lastId = useSel((s) => s.last?.historyId ?? (s.history[s.activeId] ?? (EMPTY as never[]))[0]?.id ?? null);
  const hasImages = useSel((s) => activeWheel(s).entries.some((e) => e.imageRef) || !!activeWheel(s).settings.centre.imageRef);
  const spinNo = useSel((s) => (s.history[s.activeId] ?? (EMPTY as never[])).length);
  const [kind, setKind] = useState<"wheel" | "replay">("wheel");
  const [link, setLink] = useState<{ url: string; qr: boolean; warning: string | null; error: string | null; length: number } | null>(null);
  const [qr, setQr] = useState<boolean[][] | null>(null);
  const [bigQr, setBigQr] = useState(false);
  useEffect(() => {
    if (!open) {
      setLink(null);
      setQr(null);
      setKind("wheel");
      return;
    }
    let live = true;
    void c.shareLink(kind, kind === "replay" ? lastId ?? undefined : undefined).then(async (l) => {
      if (!live) return;
      setLink(l);
      if (l.qr && l.url) {
        const { default: encodeQR } = await import("qr");
        if (live) setQr(encodeQR(l.url, "raw", { ecc: "medium" }));
      } else setQr(null);
    });
    return () => {
      live = false;
    };
  }, [open, kind, lastId, c]);
  const svg = qr ? qrSvg(qr) : null;
  return (
    <Modal open={open} onClose={() => c.closeDialog()} className="plate share" labelledBy="share-title">
      <PlateHead id="share-title" title="Share this wheel" onClose={() => c.closeDialog()} />
      {lastId ? (
        <Segmented
          label="What to share"
          value={kind}
          options={[
            { value: "wheel", label: "Wheel" },
            { value: "replay", label: `Replay spin ${spinNo || 1}` },
          ]}
          onChange={setKind}
        />
      ) : null}
      <div className="share-body">
        <div className={`qr${bigQr ? " big" : ""}`} data-testid="qr">
          {svg ? (
            <button type="button" className="qr-btn" onClick={() => setBigQr((b) => !b)} aria-label={bigQr ? "Show the QR code smaller" : "Show the QR code larger"}>
              <span dangerouslySetInnerHTML={{ __html: svg }} />
            </button>
          ) : (
            <div className="qr-empty">{link && !link.qr ? "Too long for a QR code. The link still works." : ""}</div>
          )}
        </div>
        <div className="share-side">
          <label className="field">
            <span>Link</span>
            <input className="mono linkfield" readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} data-testid="share-url" />
          </label>
          {link?.error ? <p className="error">{link.error}</p> : null}
          {link?.warning ? <p className="small muted">{link.warning}</p> : null}
          <button
            type="button"
            className="btn primary"
            data-autofocus
            aria-disabled={!!link?.error || undefined}
            onClick={() => {
              if (link?.url) void c.copy(link.url, t.toast.linkCopied);
              else if (!link)
                void c.shareLink(kind, kind === "replay" ? lastId ?? undefined : undefined).then((l) => {
                  if (l.url) void c.copy(l.url, t.toast.linkCopied);
                });
            }}
            data-testid="copy-link"
          >
            <Icon name="copy" /> Copy link
          </button>
          <p className="small muted">The wheel lives in the link itself. Images stay on this device.</p>
          {hasImages ? (
            <p className="small note" data-testid="images-note">
              <Icon name="image" size={16} /> {t.toast.noImagesInLinks} Use Export to keep them.
            </p>
          ) : null}
          <div className="share-more">
            {svg ? (
              <button type="button" className="btn small" onClick={() => c.download("whirlpick-qr.svg", svg, "image/svg+xml")}>
                <Icon name="qr" size={18} /> Download QR
              </button>
            ) : null}
            <button
              type="button"
              className="btn small"
              onClick={() => {
                const f = c.exportProject("active");
                c.download(f.name, f.json);
              }}
            >
              <Icon name="export" size={18} /> Export .whirl.json
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function qrSvg(m: boolean[][]): string {
  const n = m.length;
  const q = 4;
  const size = n + q * 2;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!m[y]![x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < n && m[y]![x + w]) w++;
      d += `M${x + q} ${y + q}h${w}v1h-${w}z`;
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for the share link"><rect width="${size}" height="${size}" fill="#FBF7F0"/><path fill="#1F1915" d="${d}"/></svg>`;
}

/* ------------------------------------------------------------ saved wheels */

function SavedDrawer() {
  const c = useController();
  const v = useSel((s) => ({ open: s.ui.dialog?.kind === "wheels", wheels: s.wheels, meta: s.meta, active: s.activeId, history: s.history }), shallowEq);
  const [editing, setEditing] = useState<string | null>(null);
  const file = useFilePicker("application/json,.json", (f) => void c.importProject(f));
  const list = v.wheels.filter((w) => v.meta[w.id]?.saved || w.id === v.active);
  return (
    <Modal open={v.open} onClose={() => c.closeDialog()} className="plate drawer" labelledBy="drawer-title">
      <div className="plate-head">
        <h2 id="drawer-title" className="plate-title">
          Saved wheels
        </h2>
        <button type="button" className="btn small" onClick={() => (c.newWheel(), c.closeDialog())} data-testid="new-wheel">
          <Icon name="plus" size={18} /> New
        </button>
        <button type="button" className="ibtn" onClick={() => c.closeDialog()} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <ul className="wheels" data-testid="wheels">
        {list.map((w) => {
          const m = v.meta[w.id];
          const hist = v.history[w.id]?.length ?? 0;
          return (
            <li key={w.id} className={`wrow${w.id === v.active ? " on" : ""}`}>
              <Thumb wheelId={w.id} />
              {editing === w.id ? (
                <input
                  className="rename"
                  defaultValue={w.name}
                  autoFocus
                  aria-label="Wheel name"
                  onBlur={(e) => {
                    c.renameWheel(w.id, e.target.value.trim() || w.name);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <button type="button" className="wopen" onClick={() => (c.openWheel(w.id), c.closeDialog())} aria-current={w.id === v.active ? "true" : undefined}>
                  <span className="n">{w.name}</span>
                  <span className="m">
                    {t.entriesCount(w.entries.length)} · {m?.saved ? relDay(m.updatedAt) : "unsaved"}
                    {hist ? ` · ${hist} spin${hist === 1 ? "" : "s"}` : ""}
                    {w.settings.fairDraw ? " · fair draw" : ""}
                  </span>
                </button>
              )}
              <Menu
                label={`Actions for ${w.name}`}
                items={[
                  { label: "Rename", icon: "pencil", onSelect: () => setEditing(w.id) },
                  { label: "Duplicate", icon: "copy", onSelect: () => c.duplicateWheel(w.id) },
                  {
                    label: "Export .whirl.json",
                    icon: "export",
                    onSelect: () => {
                      const f = c.exportProject(w.id);
                      c.download(f.name, f.json);
                    },
                  },
                  "sep",
                  { label: "Delete", icon: "remove", danger: true, onSelect: () => c.deleteWheel(w.id) },
                ]}
              />
            </li>
          );
        })}
      </ul>
      <div className="drawer-foot">
        <button type="button" className="btn small" onClick={file.open}>
          <Icon name="import" size={18} /> Open a file
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const f = c.exportProject("all");
            c.download(f.name, f.json);
          }}
        >
          <Icon name="export" size={18} /> Export all
        </button>
        {file.el}
      </div>
    </Modal>
  );
}

function relDay(isoStr: string): string {
  const d = new Date(isoStr);
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Thumb({ wheelId }: { wheelId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scheme = useScheme();
  const w = useSel((s) => s.wheels.find((x) => x.id === wheelId));
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !w) return;
    const width = 46;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(width * dpr);
    const scene = buildScene({ entries: w.entries, settings: { ...w.settings, mysteryMode: true, centre: { text: null, imageRef: null } }, theme: wheelTheme(w.settings.theme, scheme, { flat: true }), radiusPx: width / 2.24 });
    const ctx = cv.getContext("2d");
    if (ctx) renderWheel(ctx, { ...scene, labels: false, mystery: false }, 0, { width, dpr, pick: 0 }, { createCanvas: (a, b) => Object.assign(document.createElement("canvas"), { width: a, height: b }), images: new Map() });
  }, [w, scheme]);
  return <canvas ref={ref} className="thumb" aria-hidden="true" />;
}

/* --------------------------------------------------------------- fair draw */

function FairDialog() {
  const c = useController();
  const v = useSel(
    (s) => {
      const w = activeWheel(s);
      const ses = sessionOf(s);
      return { open: s.ui.dialog?.kind === "fair", fair: ses.fair, every: w.settings.commitEverySpin, on: w.settings.fairDraw, unrevealed: ses.unrevealed.length, locked: ses.unrevealed.length > 0 };
    },
    shallowEq,
  );
  const [seed, setSeed] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [word, setWord] = useState(v.fair?.publicInput ?? "");
  useEffect(() => {
    setWord(v.fair?.publicInput ?? "");
  }, [v.fair?.commitment, v.fair?.publicInput]);
  const f = v.fair;
  return (
    <Modal open={v.open} onClose={() => c.closeDialog()} className="plate fair" labelledBy="fair-title">
      <PlateHead id="fair-title" title="Fair draw" onClose={() => c.closeDialog()} />
      <p className="lede">The seed is fixed and its fingerprint shown before the wheel moves. After the spin the seed is revealed, and anyone can re-run the draw.</p>
      {f ? (
        <dl className="kv">
          <div>
            <dt>Commitment</dt>
            <dd className="mono breakall" data-testid="fair-commitment">
              {f.commitment}
            </dd>
          </div>
          <div>
            <dt>List fingerprint</dt>
            <dd className="mono breakall" data-testid="fair-fingerprint">
              {f.committedWheelHash}
            </dd>
          </div>
          <div>
            <dt>Committed</dt>
            <dd className="mono">{f.committedAt ? new Date(f.committedAt).toLocaleString() : ""}</dd>
          </div>
        </dl>
      ) : null}
      <div className="acts">
        <button type="button" className="btn primary" data-autofocus disabled={!f} onClick={() => f && void c.copy(`Whirlpick commitment: ${f.commitment}\nList fingerprint: ${f.committedWheelHash}`, "Commitment copied.")}>
          <Icon name="copy" /> Copy to publish
        </button>
        {v.unrevealed ? (
          <button type="button" className="btn" onClick={() => c.revealSeeds()} data-testid="reveal-seed">
            <Icon name="seal" /> Reveal seed ({v.unrevealed})
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => setErr(c.newCommitment())}>
            <Icon name="again" /> New commitment
          </button>
        )}
      </div>
      <details className="room" open={!!v.fair?.publicInput}>
        <summary>Ask the room for a word (optional)</summary>
        <p className="small muted">Type a word your audience chooses after they have seen the commitment. It is mixed into the draw, so nobody could have picked a seed in advance to force a result.</p>
        <label className="field">
          <span>Room word</span>
          <input
            value={word}
            maxLength={64}
            disabled={v.locked}
            onChange={(e) => setWord(e.target.value)}
            onBlur={() => c.setPublicInput(word)}
            data-testid="room-word"
          />
        </label>
      </details>
      <Switch checked={v.every} onChange={(on) => c.setSettings({ commitEverySpin: on })} label="New commitment after every spin" sub={v.every ? "Each spin reveals its seed right away" : "Several spins share one seed; reveal it at the end"} disabled={v.locked} />
      <details className="custom-seed">
        <summary>Use my own seed</summary>
        <p className="small muted">64 hex characters. Anyone with the seed can re-run the draw, so keep it private until after the spin.</p>
        <div className="row-inline">
          <input className="mono" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="64 hex characters" aria-label="Custom seed" maxLength={64} data-testid="custom-seed" />
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const e = c.newCommitment(seed);
              setErr(e);
              if (!e) setSeed("");
            }}
            data-testid="use-seed"
          >
            Commit
          </button>
        </div>
        {err ? (
          <p className="error" role="alert">
            {err}
          </p>
        ) : null}
      </details>
      <p className="plate-foot">
        <a href="/is-the-wheel-rigged/">What this proves, and what it doesn't</a>
      </p>
    </Modal>
  );
}

/* --------------------------------------------------------------- customise */

function CustomiseDialog() {
  const c = useController();
  const scheme = useScheme();
  const v = useSel((s) => ({ open: s.ui.dialog?.kind === "customise", w: activeWheel(s), prefs: s.prefs }), shallowEq);
  const img = useFilePicker("image/*", (f) => void c.setCentreImage(f));
  const st = v.w.settings;
  return (
    <Modal open={v.open} onClose={() => c.closeDialog()} className="plate customise" labelledBy="custom-title">
      <PlateHead id="custom-title" title="Customise" onClose={() => c.closeDialog()} />
      <div className="form">
        <label className="field">
          <span>Wheel name</span>
          <input data-autofocus value={v.w.name} maxLength={80} onChange={(e) => c.rename(e.target.value)} />
        </label>
        <label className="field">
          <span>Title shown in presenter mode</span>
          <input value={st.title} maxLength={80} onChange={(e) => c.setSettings({ title: e.target.value })} placeholder="Who's next?" />
        </label>
        <fieldset className="field">
          <legend>Colours</legend>
          <div className="themes">
            {THEMES.map((th) => {
              const pal = wheelTheme(th.id, scheme).palette;
              return (
                <button key={th.id} type="button" className={`theme${st.theme === th.id && !st.palette ? " on" : ""}`} aria-pressed={st.theme === th.id && !st.palette} onClick={() => c.setSettings({ theme: th.id, palette: null }, "Theme")} title={th.note}>
                  <span className="swatchrow">
                    {pal.slice(0, 6).map((p) => (
                      <i key={p.fill} style={{ background: p.fill }} />
                    ))}
                  </span>
                  <span>{th.name}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="field">
          <span>Centre text</span>
          <input value={st.centre.text ?? ""} maxLength={40} onChange={(e) => c.setSettings({ centre: { text: e.target.value || null } })} placeholder="Optional" />
        </label>
        <div className="row-inline">
          <button type="button" className="btn small" onClick={img.open}>
            <Icon name="image" size={18} /> {st.centre.imageRef ? "Change centre image" : "Centre image"}
          </button>
          {st.centre.imageRef ? (
            <button type="button" className="btn small quiet" onClick={() => void c.setCentreImage(null)}>
              Remove
            </button>
          ) : null}
          {img.el}
        </div>
        <label className="field">
          <span>
            Spin length <b className="num">{st.spinDuration} s</b>
          </span>
          <input type="range" min={1} max={30} step={0.5} value={st.spinDuration} onChange={(e) => c.setSettings({ spinDuration: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>
            Label size <b className="num">{Math.round(st.fontScale * 100)}%</b>
          </span>
          <input type="range" min={0.75} max={1.5} step={0.05} value={st.fontScale} onChange={(e) => c.setSettings({ fontScale: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>
            Volume <b className="num">{Math.round(st.volume * 100)}%</b>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={st.volume} onChange={(e) => c.setSettings({ volume: Number(e.target.value) })} />
        </label>
        <Switch checked={st.sound} onChange={(on) => c.setSettings({ sound: on })} label="Sounds" />
        <Switch checked={st.confetti} onChange={(on) => c.setSettings({ confetti: on })} label="Confetti" />
        <Switch checked={st.mysteryMode} onChange={(on) => c.setSettings({ mysteryMode: on })} label="Mystery mode" sub="Labels stay hidden until the result" />
        <fieldset className="field">
          <legend>Motion</legend>
          <Segmented
            label="Motion"
            value={v.prefs.reducedMotion}
            options={[
              { value: "system", label: "System" },
              { value: "on", label: "Calm" },
              { value: "off", label: "Full" },
            ]}
            onChange={(m) => c.setReducedMotion(m)}
          />
        </fieldset>
        <fieldset className="field">
          <legend>Stream background</legend>
          <p className="small muted">For OBS: open the stream link as a browser source. Transparent works in OBS; green and magenta suit a chroma key.</p>
          <div className="row-inline wrap">
            {[
              ["transparent", "Transparent"],
              ["00B140", "Green"],
              ["FF00FF", "Magenta"],
            ].map(([k, label]) => (
              <a key={k} className="btn small" href={`/?stream=1&bg=${k}`} target="_blank" rel="noopener">
                {label}
              </a>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ entry details */

const PAGE = 100;

function DetailsDialog() {
  const c = useController();
  const scheme = useScheme();
  const v = useSel((s) => ({ open: s.ui.dialog?.kind === "details", entries: activeWheel(s).entries, storage: s.storage, theme: activeWheel(s).settings.theme, palette: activeWheel(s).settings.palette }), shallowEq);
  const auto = useMemo(() => {
    const scene = buildScene({ entries: v.entries.map((e) => ({ ...e, color: undefined, enabled: true })), settings: { palette: v.palette, mysteryMode: false, fontScale: 1, centre: { text: null, imageRef: null } }, theme: wheelTheme(v.theme, scheme), radiusPx: 300 });
    return new Map(scene.slices.map((x) => [x.index, x.fill]));
  }, [v.entries, v.palette, v.theme, scheme]);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(v.entries.length / PAGE));
  const rows = v.entries.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <Modal open={v.open} onClose={() => c.closeDialog()} className="plate details" labelledBy="details-title">
      <PlateHead id="details-title" title="Weights, colours and images" onClose={() => c.closeDialog()} />
      {v.storage === "local" ? <p className="small note">{t.imagesNeedIdb}</p> : null}
      <div className="table-wrap" role="region" aria-label="Entries" tabIndex={0}>
        <table className="details-table">
          <thead>
            <tr>
              <th scope="col">On</th>
              <th scope="col">Name</th>
              <th scope="col">Weight</th>
              <th scope="col">Colour</th>
              <th scope="col">Tags</th>
              <th scope="col">Image</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={e.id}>
                <td>
                  <input type="checkbox" checked={e.enabled} aria-label={`${e.label} is on the wheel`} onChange={(ev) => c.patchEntry(e.id, { enabled: ev.target.checked })} />
                </td>
                <td>
                  <input className="cell" value={e.label} aria-label={`Name of entry ${page * PAGE + i + 1}`} onChange={(ev) => ev.target.value.trim() && c.patchEntry(e.id, { label: ev.target.value.slice(0, 200) })} />
                </td>
                <td>
                  <input
                    className="cell num"
                    type="number"
                    min={0.001}
                    max={1000000}
                    step={0.5}
                    defaultValue={e.weight}
                    aria-label={`Weight of ${e.label}`}
                    onChange={(ev) => {
                      const w = Number(ev.target.value);
                      if (w >= 0.001 && w <= 1e6) c.patchEntry(e.id, { weight: Math.round(w * 1000) / 1000 });
                    }}
                  />
                </td>
                <td>
                  <input type="color" value={(e.color ?? auto.get(page * PAGE + i) ?? "#C2361F").toLowerCase()} aria-label={`Colour of ${e.label}${e.color ? "" : " (automatic)"}`} onChange={(ev) => c.patchEntry(e.id, { color: ev.target.value.toUpperCase() })} />
                  {e.color ? (
                    <button type="button" className="linkish small" onClick={() => c.patchEntry(e.id, { color: undefined })}>
                      Auto
                    </button>
                  ) : (
                    <span className="small muted"> auto</span>
                  )}
                </td>
                <td>
                  <input
                    className="cell"
                    defaultValue={(e.tags ?? []).join(", ")}
                    aria-label={`Tags of ${e.label}`}
                    placeholder={page === 0 && i === 0 ? "e.g. 3" : undefined}
                    onBlur={(ev) => {
                      const tags = [...new Set(ev.target.value.split(/[,|]/).map((x) => x.trim()).filter(Boolean))].slice(0, 8);
                      c.patchEntry(e.id, { tags: tags.length ? tags : undefined });
                    }}
                  />
                </td>
                <td>
                  <ImageCell id={e.id} has={!!e.imageRef} label={e.label} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="pager">
          <button type="button" className="btn small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="mono small">
            {page + 1} / {pages}
          </span>
          <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      ) : null}
      <p className="small muted">Images stay on this device. They aren't included in share links; use Export to keep them.</p>
    </Modal>
  );
}

function ImageCell({ id, has, label }: { id: string; has: boolean; label: string }) {
  const c = useController();
  const f = useFilePicker("image/*", (file) => void c.setEntryImage(id, file));
  return (
    <>
      <button type="button" className="ibtn" aria-label={has ? `Change image for ${label}` : `Add image for ${label}`} onClick={f.open}>
        <Icon name="image" />
      </button>
      {has ? (
        <button type="button" className="ibtn" aria-label={`Remove image for ${label}`} onClick={() => void c.setEntryImage(id, null)}>
          <Icon name="x" />
        </button>
      ) : null}
      {f.el}
    </>
  );
}

/* --------------------------------------------------------------- shortcuts */

function ShortcutsDialog() {
  const c = useController();
  const open = useSel((s) => s.ui.dialog?.kind === "shortcuts");
  const rows: [string, string][] = [
    ["Space / Enter", "Spin (when the wheel is focused); skip to the end while spinning"],
    ["Ctrl + Enter", "Spin from anywhere, even while typing"],
    ["Esc", "Close a dialog, leave presenter mode"],
    ["F", "Presenter mode"],
    ["M", "Sound on or off"],
    ["H", "Hide or show the editor"],
    ["Ctrl + Z", "Undo (outside the entries box)"],
    ["Ctrl + Shift + Z", "Redo"],
    ["?", "This list"],
  ];
  return (
    <Modal open={open} onClose={() => c.closeDialog()} className="plate shortcuts" labelledBy="keys-title">
      <PlateHead id="keys-title" title="Keyboard shortcuts" onClose={() => c.closeDialog()} />
      <table className="keys">
        <tbody>
          {rows.map(([k, d]) => (
            <tr key={k}>
              <th scope="row">
                {k.split(" / ").map((x, i) => (
                  <span key={x}>
                    {i ? " / " : ""}
                    <kbd>{x}</kbd>
                  </span>
                ))}
              </th>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="acts">
        <button type="button" className="btn" data-autofocus onClick={() => c.closeDialog()}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function ImportErrorDialog() {
  const c = useController();
  const dlg = useSel((s) => s.ui.dialog);
  const open = dlg?.kind === "import";
  return (
    <Modal open={open} onClose={() => c.closeDialog()} className="plate import-error" labelledBy="import-title">
      <PlateHead id="import-title" title={t.toast.notWhirl} onClose={() => c.closeDialog()} />
      <p>Nothing was changed. The file has these problems:</p>
      <pre className="code" data-testid="import-errors">
        {dlg?.arg}
      </pre>
      <div className="acts">
        <button type="button" className="btn" data-autofocus onClick={() => c.closeDialog()}>
          OK
        </button>
      </div>
    </Modal>
  );
}

function NumbersDialog() {
  const c = useController();
  const open = useSel((s) => s.ui.dialog?.kind === "numbers");
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("20");
  const lo = Number(min);
  const hi = Number(max);
  const count = Number.isInteger(lo) && Number.isInteger(hi) && hi >= lo ? hi - lo + 1 : 0;
  const ok = count >= 2 && count <= 1000;
  return (
    <Modal open={open} onClose={() => c.closeDialog()} className="plate numbers" labelledBy="numbers-title">
      <PlateHead id="numbers-title" title="Number range" onClose={() => c.closeDialog()} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          c.closeDialog();
          c.loadPreset("numbers", { min: String(lo), max: String(hi) });
        }}
      >
        <div className="row-inline">
          <label className="field">
            <span>From</span>
            <input data-autofocus type="number" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="number" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
        <p className="small muted" role="status">
          {ok ? `${fmt(count)} numbers on a new wheel.` : "Pick 2 to 1,000 whole numbers."}
        </p>
        <div className="acts">
          <button type="submit" className="btn primary" disabled={!ok}>
            Make the wheel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export type { Receipt };
export { fmt };
