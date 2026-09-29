// /verify/: paste a receipt, a replay link or a verify link, or drop a receipt file; the page
// re-runs whirlpick-draw-v1 in the browser and says, check by check, whether it holds.
import { useEffect, useRef, useState } from "react";
import { finalRotation, landingTurn, receiptFromText, slicesFor, verifyReceipt, type Receipt, type VerifyReport } from "@whirlpick/core";
import { groupHash, t } from "../copy/en";
import { Icon, useController } from "../ui/primitives";
import { LiveRegions, Toasts } from "../ui/Shell";
import { buildScene, POINTER_TURN } from "../wheel/scene";
import { wheelTheme } from "../wheel/theme";
import { renderWheel } from "../wheel/renderer";
import { useScheme } from "../ui/WheelCanvas";

interface Result {
  report: VerifyReport;
  receipt: Receipt | null;
}

/** The interactive part of /verify/ (the heading, explainer and footer are static HTML). */
export function VerifyWidget() {
  const c = useController();
  const [text, setText] = useState("");
  const [commitment, setCommitment] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);
  const out = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const run = async (input = text) => {
    // Text typed before the page finished loading lives only in the DOM; use it too.
    const src = (input || inputRef.current?.value || "").trim();
    if (!src) return;
    let raw: unknown;
    try {
      raw = await receiptFromText(src);
    } catch {
      raw = src;
    }
    const expect: { commitment?: string; wheelHash?: string } = {};
    const cm = commitment.trim().toLowerCase().replace(/\s+/g, "");
    const fp = fingerprint.trim().toLowerCase().replace(/\s+/g, "");
    if (cm) expect.commitment = cm;
    if (fp) expect.wheelHash = fp;
    const report = verifyReceipt(typeof raw === "string" ? raw : raw, expect);
    let receipt: Receipt | null = null;
    try {
      const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (obj && typeof obj === "object" && Array.isArray((obj as Receipt).entries)) receipt = obj as Receipt;
    } catch {
      /* not JSON */
    }
    setRes({ report, receipt });
    c.store.dispatch({ type: "ui/announce", text: report.status === "valid" ? `Winner: checks out` : report.status === "unrevealed" ? t.notRevealed : t.doesntMatch });
    requestAnimationFrame(() => out.current?.focus());
  };

  // /verify/#r=<code> auto-verifies.
  useEffect(() => {
    const m = /[#&]r=([^&]+)/.exec(location.hash);
    if (m) {
      const v = location.href;
      setText(v);
      void run(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) return;
    const txt = await f.text();
    setText(txt);
    void run(txt);
  };

  return (
    <>
      <form
        className={`verify-form${drag ? " drag" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void onFile(f);
        }}
      >
        <label className="field">
          <span>Paste a receipt or a replay link</span>
          <textarea ref={inputRef} className="mono receipt-input" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"format":"whirlpick-receipt", …}  or  …/#spin=1.…' data-testid="verify-input" spellCheck={false} />
        </label>
        <details className="expect">
          <summary>Compare with what you saw before the draw (optional)</summary>
          <label className="field">
            <span>Commitment you saw</span>
            <input className="mono" value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder="64 hex characters" data-testid="verify-commitment" />
          </label>
          <label className="field">
            <span>List fingerprint you saw</span>
            <input className="mono" value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} placeholder="64 hex characters" />
          </label>
        </details>
        <div className="acts">
          <button type="submit" className="btn primary" data-testid="verify-check">
            <Icon name="seal" /> Check
          </button>
          <label className="btn file-btn">
            <Icon name="import" /> Open a receipt file
            <input
              type="file"
              accept="application/json,.json"
              className="visually-hidden-input"
              data-testid="verify-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <span className="small muted">or drop a .json file here</span>
        </div>
      </form>
      <div className="verify-out" ref={out} tabIndex={-1} aria-live="polite" data-testid="verify-result">
        {res ? <Outcome res={res} /> : null}
      </div>
      <Toasts />
      <LiveRegions />
    </>
  );
}

function Outcome({ res }: { res: Result }) {
  const { report, receipt } = res;
  const failed = report.checks.find((x) => !x.ok);
  const winners = receipt?.result?.picks?.map((p) => p.label) ?? [];
  const teams = receipt?.result?.teams;
  if (report.status === "unrevealed") {
    return (
      <div className="outcome wait">
        <span className="stamp wait">{t.notRevealed}</span>
        <p>The seed hasn't been revealed yet, so the result can't be checked. Keep this commitment and check again once the host reveals the seed:</p>
        <p className="mono breakall">{receipt?.commitment ? groupHash(receipt.commitment, 16) : ""}</p>
        <CheckList report={report} />
      </div>
    );
  }
  if (report.status === "valid") {
    return (
      <div className="outcome ok">
        <span className="stamp ok" data-testid="stamp">
          {t.checksOut}
        </span>
        <p className="big">
          {teams ? (
            <>
              These <strong>{teams.length} teams</strong> are the result of this seed on this list.
            </>
          ) : (
            <>
              <strong>{winners.join(", ")}</strong> {winners.length === 1 ? "is" : "are"} the result of this seed on this wheel.
            </>
          )}
        </p>
        {report.warnings.length ? (
          <p className="warn">
            <Icon name="alert" size={18} /> The list changed after the commitment was shown. The draw is reproducible, but ask the host why the list changed.
          </p>
        ) : null}
        <p className="mono small checked">{report.checks.filter((x) => x.ok).map((x) => x.id).join(" · ")}</p>
        {receipt && !teams ? <MiniWheel receipt={receipt} /> : null}
        <CheckList report={report} />
      </div>
    );
  }
  const exp = failed?.code === "RESULT_MISMATCH" && report.recomputed.picks ? `expected ${report.recomputed.picks.map((p) => p.label).join(", ")} · got ${winners.join(", ")}` : failed?.code === "COMMITMENT_MISMATCH" && report.recomputed.commitment ? `expected ${groupHash(report.recomputed.commitment)} · got ${groupHash(receipt?.commitment ?? "")}` : failed?.code === "WHEEL_HASH_MISMATCH" && report.recomputed.wheelHash ? `expected ${groupHash(report.recomputed.wheelHash)} · got ${groupHash(receipt?.wheelHash ?? "")}` : failed?.code ?? "";
  return (
    <div className="outcome bad">
      <span className="stamp bad" data-testid="stamp">
        {t.doesntMatch}
      </span>
      <p className="big" data-testid="failed-check">
        {failed?.detail ?? "This isn't a receipt."}
      </p>
      {exp ? <p className="mono small">{exp}</p> : null}
      <CheckList report={report} />
    </div>
  );
}

function CheckList({ report }: { report: VerifyReport }) {
  return (
    <ul className="checks" aria-label="Checks">
      {report.checks.map((x) => (
        <li key={x.id} className={x.ok ? "ok" : "bad"}>
          <Icon name={x.ok ? "check" : "x"} size={18} />
          <span>{x.detail}</span>
        </li>
      ))}
      {report.warnings.map((w) => (
        <li key={w} className="warn">
          <Icon name="alert" size={18} />
          <span>{w === "WHEEL_CHANGED_AFTER_COMMIT" ? "The list changed after the commitment was shown." : w}</span>
        </li>
      ))}
    </ul>
  );
}

/** A small replay of the landing: the wheel at rest on the first winner, lights down. */
function MiniWheel({ receipt }: { receipt: Receipt }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scheme = useScheme();
  useEffect(() => {
    const cv = ref.current;
    const pick = receipt.result.picks?.[0];
    if (!cv || !pick) return;
    const entries = receipt.entries.map((e, i) => ({ id: `e_${i}`, label: e.label, weight: e.weight, enabled: e.enabled, ...(e.tags ? { tags: e.tags } : {}) }));
    const excluded = receipt.params.excluded ?? [];
    const width = Math.min(360, cv.parentElement?.clientWidth ?? 360);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${width}px`;
    cv.style.height = `${width}px`;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(width * dpr);
    const scene = buildScene({ entries, settings: { palette: null, mysteryMode: false, fontScale: 1, centre: { text: null, imageRef: null } }, theme: wheelTheme("enamel", scheme), excluded, radiusPx: width / 2.24 });
    const slices = slicesFor(entries, excluded);
    const pos = slices.findIndex((s) => s.index === pick.index);
    const s = slices[pos];
    if (!s) return;
    const rotation = finalRotation(0, landingTurn(slices, pos, pick.landingU32), 0, POINTER_TURN);
    const ctx = cv.getContext("2d");
    if (ctx) renderWheel(ctx, scene, rotation, { width, dpr, pick: 0, veilPos: pos, veil: 1, outline: 1 }, { createCanvas: (a, b) => Object.assign(document.createElement("canvas"), { width: a, height: b }), images: new Map() });
  }, [receipt, scheme]);
  return (
    <div className="mini-wheel">
      <canvas ref={ref} aria-hidden="true" />
    </div>
  );
}
