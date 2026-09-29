// The stage: fair-draw ticket, the wheel, the Spin row, the teams board, banners and the stream
// caption. The wheel is the only loud thing (SPEC §1).
import { useEffect, useRef, useState } from "react";
import { wheelHash } from "@whirlpick/core";
import { activeWheel, sessionOf } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
import { groupHash, t, fmt } from "../copy/en";
import { EntryList } from "./Editor";
import { Icon, Keycap, Popover, useController } from "./primitives";
import { WheelCanvas } from "./WheelCanvas";
import { TeamsBoard } from "./Teams";

export function Stage() {
  const c = useController();
  const v = useSel(
    (s) => {
      const w = activeWheel(s);
      return {
        mode: w.settings.mode,
        teams: !!s.teams && w.settings.mode === "teams",
        surface: s.surface,
        presenter: s.ui.presenter,
        title: w.settings.title,
        caption: s.ui.streamCaption,
        captionColour: null as string | null,
        replay: !!s.replay,
        linkWheel: !s.meta[s.activeId]?.saved && s.meta[s.activeId]?.source === "link" && s.surface === "app",
        storage: s.storage,
        ready: s.ready,
      };
    },
    shallowEq,
  );
  const showBoard = v.teams && v.mode === "teams";
  const stageRef = useRef<HTMLElement>(null);
  useTicketClearsBanner(stageRef);
  return (
    <section ref={stageRef} className={`stage${showBoard ? " has-board" : ""}`} aria-label="Wheel">
      {v.ready && v.storage === "memory" && v.surface === "app" ? <p className="banner warn-banner">{t.notSaving}</p> : null}
      {v.replay ? <ReplayBanner /> : v.linkWheel && v.ready ? <LinkBanner /> : null}
      {v.presenter && v.title ? <h2 className="presenter-title">{v.title}</h2> : null}
      {v.surface === "app" ? <Ticket /> : null}
      {showBoard ? <TeamsBoard /> : null}
      <div className={`wheel-area${showBoard ? " collapsed" : ""}`}>
        <WheelCanvas onSpin={() => c.spin()} big={v.presenter} />
        <ul className="sr-only" aria-label="Entries on the wheel" data-testid="wheel-list">
          <EntryList />
        </ul>
      </div>
      {v.surface === "app" && !showBoard && v.mode !== "teams" ? <SpinRow /> : null}
      {v.mode === "teams" && !showBoard && v.surface === "app" ? <p className="teams-hint">Choose the teams in the Teams tab, then press Split.</p> : null}
      {v.surface === "embed" ? <EmbedSpin /> : null}
      {v.caption && v.surface !== "app" ? (
        <div className="stream-caption" role="status" style={{ ["--band" as string]: v.captionColour ?? "var(--wp-accent)" }}>
          <span className="eyebrow">{t.wheelPicked}</span>
          <span className="who">{v.caption}</span>
        </div>
      ) : null}
      {v.presenter ? <PresenterHint /> : null}
    </section>
  );
}

function SpinRow() {
  const c = useController();
  const v = useSel(
    (s) => {
      const w = activeWheel(s);
      const ses = sessionOf(s);
      const ex = new Set(w.settings.mode === "elimination" ? ses.excluded : []);
      const on = w.entries.filter((e, i) => e.enabled && !ex.has(i)).length;
      return {
        on,
        total: w.entries.length,
        spinning: s.spin.phase === "spinning",
        paused: s.spin.phase === "paused",
        mode: w.settings.mode,
        duration: w.settings.spinDuration,
        removed: ses.excluded.length,
        replay: !!s.replay,
      };
    },
    shallowEq,
  );
  const elimDone = v.mode === "elimination" && v.on === 0 && v.total > 0;
  const tooFew = !v.replay && (v.mode === "elimination" ? v.on < 1 : v.on < 2);
  const label = v.spinning ? t.spinning : elimDone ? t.everyoneHadTurn : tooFew ? (v.total === 0 ? "Add names to spin" : t.addOneMore) : v.paused ? t.nextSpin : v.replay ? "Replay the draw" : t.spin;
  return (
    <div className="spinrow">
      <button type="button" className="spin" onClick={() => c.spin()} disabled={tooFew && !v.spinning} aria-describedby={elimDone ? "elim-done" : undefined} data-testid="spin">
        <span>{label}</span>
        {!tooFew && !v.spinning ? <Keycap>Space</Keycap> : null}
      </button>
      {elimDone ? (
        <span id="elim-done" className="spin-note">
          <button type="button" className="linkish" onClick={() => c.putEveryoneBack()}>
            {t.putEveryoneBack}
          </button>
        </span>
      ) : null}
      {/* Hidden on phones by CSS (not by JS), so the prerendered layout never jumps. */}
      <DurationChip value={v.duration} />
    </div>
  );
}

export function DurationChip({ value }: { value: number }) {
  const c = useController();
  return (
    <Popover
      label="Spin length"
      trigger={({ toggle, open, ref }) => (
        <button ref={ref} type="button" className="dur" aria-expanded={open} aria-label={`Spin length: ${value} seconds`} onClick={toggle}>
          <Icon name="timer" />
          <span>{value} s</span>
        </button>
      )}
    >
      {() => (
        <div className="dur-pop">
          <label className="field">
            <span>
              Spin length <b className="num">{value} s</b>
            </span>
            <input type="range" min={1} max={30} step={0.5} value={value} onChange={(e) => c.setSettings({ spinDuration: Number(e.target.value) })} />
          </label>
          <div className="dur-presets">
            {[3, 6, 10, 15].map((n) => (
              <button key={n} type="button" className={`chipbtn${value === n ? " on" : ""}`} onClick={() => c.setSettings({ spinDuration: n })}>
                {n} s
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function EmbedSpin() {
  const c = useController();
  const spinning = useSel((s) => s.spin.phase === "spinning");
  return (
    <div className="spinrow embed-row">
      <button type="button" className="spin" onClick={() => c.spin()}>
        {spinning ? t.spinning : t.spin}
      </button>
    </div>
  );
}

/** The fair-draw ticket (SPEC §10): committed → flips to "seed revealed" after a spin. */
export function Ticket() {
  const c = useController();
  const v = useSel(
    (s) => {
      const w = activeWheel(s);
      const ses = sessionOf(s);
      const last = s.last?.receipt;
      const revealedNow = !!last && !!last.seed && w.settings.fairDraw && (s.ui.dialog?.kind === "winner" || s.spin.phase === "paused") && !s.replay;
      return {
        on: w.settings.fairDraw,
        commitment: ses.fair?.commitment ?? "",
        committedHash: ses.fair?.committedWheelHash ?? null,
        entries: w.entries,
        revealed: revealedNow ? last!.seed! : null,
        pending: ses.unrevealed.length,
        replay: s.replay?.receipt ?? null,
      };
    },
    shallowEq,
  );
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    if (!v.revealed) {
      setFlip(false);
      return;
    }
    const id = setTimeout(() => setFlip(true), 320);
    return () => clearTimeout(id);
  }, [v.revealed]);
  if (v.replay) return null;
  if (!v.on) return null;
  const changed = !!v.committedHash && !v.revealed && wheelHashSafe(v.entries) !== v.committedHash;
  const shown = flip && v.revealed ? v.revealed : v.commitment;
  return (
    <div className={`ticket${flip && v.revealed ? " revealed" : ""}`} data-testid="ticket">
      <div className="stub">
        <Icon name="seal" />
      </div>
      <div className="tbody">
        <div className="k">
          {flip && v.revealed ? (
            <>
              {t.seedRevealed} <span>· {t.seedRevealedSub}</span>
            </>
          ) : (
            <>
              {t.fairCommitted} <span>· {t.fairCommittedSub}</span>
            </>
          )}
        </div>
        <button type="button" className="v mono" title="Copy the full value" onClick={() => void c.copy(shown, flip && v.revealed ? "Seed copied." : t.toast.commitmentCopied)} data-testid="commitment" data-full={shown}>
          <span className="h-long">{groupHash(shown)}</span>
          <span className="h-short">{groupHash(shown, 2)}</span>
        </button>
        {changed ? <div className="tnote">The list changed after this commitment. Receipts will say so.</div> : null}
        {v.pending ? <div className="tnote">{fmt(v.pending)} spin{v.pending === 1 ? "" : "s"} waiting for the seed.</div> : null}
      </div>
      <button type="button" className="ibtn tmore" aria-label="Fair draw details" onClick={() => c.openDialog("fair")}>
        <Icon name="more" />
      </button>
    </div>
  );
}

function wheelHashSafe(entries: { label: string; weight: number; enabled: boolean; tags?: string[] }[]): string {
  try {
    return wheelHash(entries);
  } catch {
    return "";
  }
}

function ReplayBanner() {
  const c = useController();
  const r = useSel((s) => s.replay);
  if (!r) return null;
  const st = r.status;
  const ok = st?.status === "valid";
  return (
    <div className="banner replay-banner" role="status">
      <div>
        <strong>{t.replayBanner}</strong>
        <span className="mono small">
          commitment {groupHash(r.receipt.commitment, 2)} · list {groupHash(r.receipt.wheelHash, 2)}
        </span>
      </div>
      <div className="banner-actions">
        {st ? <span className={`stamp small ${ok ? "ok" : st.status === "unrevealed" ? "wait" : "bad"}`}>{ok ? t.checksOut : st.status === "unrevealed" ? t.notRevealed : t.doesntMatch}</span> : null}
        <button type="button" className="btn small" onClick={() => c.saveCurrent()}>
          {t.saveToMyWheels}
        </button>
      </div>
    </div>
  );
}

/**
 * On desktop the link/replay banner (top right) and the fair-draw ticket (top left) are both
 * absolutely placed; on narrower desktops they collide. When they would, drop the ticket below
 * the banner so both the banner and the ticket's hash stay visible.
 */
function useTicketClearsBanner(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const stage = ref.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const banner = stage.querySelector<HTMLElement>(":scope > .banner:not(.warn-banner)");
      const ticket = stage.querySelector<HTMLElement>(":scope > .ticket");
      let top = "";
      if (banner && ticket && getComputedStyle(banner).position === "absolute" && getComputedStyle(ticket).position === "absolute") {
        const b = banner.getBoundingClientRect();
        const tk = ticket.getBoundingClientRect();
        if (tk.right + 12 > b.left) top = `${Math.round(banner.offsetTop + banner.offsetHeight + 12)}px`;
      }
      if (stage.style.getPropertyValue("--ticket-top") !== top) {
        if (top) stage.style.setProperty("--ticket-top", top);
        else stage.style.removeProperty("--ticket-top");
      }
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    const mo = new MutationObserver(() => {
      fit();
      for (const el of stage.querySelectorAll(":scope > .banner, :scope > .ticket")) ro.observe(el);
    });
    mo.observe(stage, { childList: true });
    for (const el of stage.querySelectorAll(":scope > .banner, :scope > .ticket")) ro.observe(el);
    fit();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref]);
}

function LinkBanner() {
  const c = useController();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div className="banner" role="status">
      <span>{t.unsavedBanner}</span>
      <div className="banner-actions">
        <button type="button" className="btn small" onClick={() => c.saveCurrent()}>
          {t.saveToMyWheels}
        </button>
        <button type="button" className="ibtn" aria-label="Dismiss" onClick={() => setGone(true)}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}

function PresenterHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(id);
  }, []);
  return (
    <p className={`presenter-hint${show ? "" : " gone"}`} aria-hidden="true">
      <Keycap>Space</Keycap> to spin · <Keycap>Esc</Keycap> to leave
    </p>
  );
}
