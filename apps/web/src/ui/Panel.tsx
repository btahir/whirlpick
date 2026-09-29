// The side panel (SPEC §9/§10): tabs Entries · Results · Teams. Panels are areas, not cards.
import { useId } from "react";
import { PRESETS } from "@whirlpick/core";
import { EMPTY, activeWheel, sessionOf } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
import { buildScene } from "../wheel/scene";
import { wheelTheme } from "../wheel/theme";
import { fmt, shortHex, t } from "../copy/en";
import { EntriesEditor } from "./Editor";
import { Icon, Menu, Segmented, Stepper, Switch, useController, useFilePicker } from "./primitives";
import { TeamsControls } from "./Teams";
import { useScheme } from "./WheelCanvas";

export function Panel() {
  const c = useController();
  const v = useSel(
    (s) => ({
      panel: s.ui.panel,
      count: activeWheel(s).entries.length,
      results: (s.history[s.activeId] ?? (EMPTY as never[])).length,
    }),
    shallowEq,
  );
  const tabs = [
    { id: "entries", label: "Entries", n: v.count },
    { id: "results", label: "Results", n: v.results },
    { id: "teams", label: "Teams", n: null },
  ] as const;
  const base = useId();
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((x) => x.id === v.panel);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
    select(next.id);
    requestAnimationFrame(() => document.getElementById(`${base}-tab-${next.id}`)?.focus());
  };
  const select = (id: (typeof tabs)[number]["id"]) => {
    c.store.dispatch({ type: "ui/panel", panel: id });
    if (id === "teams") c.setSettings({ mode: "teams" });
  };
  return (
    <aside className="panel" aria-label="Wheel editor">
      <div className="tabs" role="tablist" aria-label="Editor sections" onKeyDown={onKey}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            id={`${base}-tab-${tb.id}`}
            type="button"
            role="tab"
            aria-selected={v.panel === tb.id}
            aria-controls={`${base}-panel-${tb.id}`}
            tabIndex={v.panel === tb.id ? 0 : -1}
            className={`tab${v.panel === tb.id ? " on" : ""}`}
            onClick={() => select(tb.id)}
            data-testid={`tab-${tb.id}`}
          >
            {tb.label}
            {tb.n !== null ? <span className="n">{fmt(tb.n)}</span> : null}
          </button>
        ))}
      </div>
      <div id={`${base}-panel-${v.panel}`} role="tabpanel" aria-labelledby={`${base}-tab-${v.panel}`} className="tabpanel">
        {v.panel === "entries" ? <EntriesTab /> : v.panel === "results" ? <ResultsTab /> : <TeamsControls />}
      </div>
    </aside>
  );
}

function EntriesTab() {
  const c = useController();
  const v = useSel(
    (s) => {
      const w = activeWheel(s);
      const ses = sessionOf(s);
      const ex = new Set(w.settings.mode === "elimination" ? ses.excluded : []);
      return {
        on: w.entries.filter((e, i) => e.enabled && !ex.has(i)).length,
        total: w.entries.length,
        canUndo: s.undo.past.length > 0,
        spinning: s.spin.phase !== "idle",
      };
    },
    shallowEq,
  );
  const txt = useFilePicker("text/plain,text/csv,text/tab-separated-values,application/json,.txt,.csv,.tsv,.json", (f) => void c.importTextFile(f));
  const proj = useFilePicker("application/json,.json", (f) => void c.importProject(f));
  const presets = PRESETS.filter((p) => ["yes-no", "yes-no-maybe", "coin", "numbers-1-10", "numbers-1-100", "letters", "food", "truth-or-dare", "countries"].includes(p.id));
  return (
    <>
      <div className="tools" role="toolbar" aria-label="Entry tools">
        <button type="button" className="ibtn" aria-label="Shuffle" title="Shuffle" disabled={v.spinning} onClick={() => c.tool("shuffle")}>
          <Icon name="shuffle" />
        </button>
        <button type="button" className="ibtn" aria-label="Sort A to Z" title="Sort A to Z" disabled={v.spinning} onClick={() => c.tool("sort")}>
          <Icon name="sort" />
        </button>
        <button type="button" className="ibtn" aria-label="Remove duplicates" title="Remove duplicates" disabled={v.spinning} onClick={() => c.tool("dedupe")}>
          <Icon name="dedupe" />
        </button>
        <button type="button" className="ibtn" aria-label="Import a .txt or .csv file" title="Import" disabled={v.spinning} onClick={txt.open}>
          <Icon name="import" />
        </button>
        <button type="button" className="ibtn" aria-label="Undo" title="Undo" disabled={!v.canUndo || v.spinning} onClick={() => c.undo()}>
          <Icon name="undo" />
        </button>
        <Menu
          label="More entry options"
          items={[
            { label: "Weights, colours and images", icon: "weight", onSelect: () => c.openDialog("details") },
            { label: "Customise the wheel", icon: "palette", onSelect: () => c.openDialog("customise") },
            "sep",
            ...presets.map((p) => ({ label: p.title, onSelect: () => c.loadPreset(p.id) })),
            "sep",
            { label: "Open a .whirl.json file", icon: "import", onSelect: proj.open },
            {
              label: "Export this wheel (.whirl.json)",
              icon: "export",
              onSelect: () => {
                const f = c.exportProject("active");
                c.download(f.name, f.json);
              },
            },
            "sep",
            { label: "Clear all entries", icon: "remove", danger: true, onSelect: () => c.tool("clear"), disabled: v.total === 0 },
          ]}
        />
        <span className="count" id="on-wheel-count" data-testid="on-wheel">
          {v.total === 0 ? "" : t.onTheWheel(v.on, v.total)}
        </span>
        {txt.el}
        {proj.el}
      </div>
      <EntriesEditor />
      {v.total === 0 ? (
        <div className="empty-actions">
          <button type="button" className="linkish" onClick={() => c.loadExample()}>
            Try an example
          </button>
        </div>
      ) : null}
      <ModesBox />
    </>
  );
}

function ModesBox() {
  const c = useController();
  const v = useSel(
    (s) => {
      const w = activeWheel(s);
      const ses = sessionOf(s);
      return {
        mode: w.settings.mode,
        multi: w.settings.multi,
        fair: w.settings.fairDraw,
        removed: ses.excluded.length,
        on: w.entries.filter((e) => e.enabled).length,
      };
    },
    shallowEq,
  );
  const value = v.mode === "normal" ? "normal" : v.mode === "elimination" ? "elimination" : v.mode === "multi" ? "multi" : null;
  return (
    <div className="modes">
      <Segmented
        label="Mode"
        value={value}
        options={[
          { value: "normal", label: "Normal" },
          { value: "elimination", label: "Remove winner" },
          { value: "multi", label: "Pick several" },
        ]}
        onChange={(m) => c.setSettings({ mode: m })}
      />
      {v.mode === "teams" ? <p className="small muted">Teams mode. Pick a mode above to spin the wheel again.</p> : null}
      {v.mode === "elimination" && v.removed ? (
        <p className="mode-line">
          <span>{fmt(v.removed)} removed</span> ·{" "}
          <button type="button" className="linkish" onClick={() => c.putEveryoneBack()} data-testid="put-back">
            {t.putEveryoneBack}
          </button>
        </p>
      ) : null}
      {v.mode === "multi" ? (
        <div className="multi-row">
          <Stepper
            label="Winners"
            value={v.multi.count === "all" ? v.on : Math.min(v.multi.count, Math.max(1, v.on))}
            min={1}
            max={Math.max(1, v.on)}
            onChange={(n) => c.setSettings({ multi: { count: n } })}
          />
          <Segmented
            label="Reveal"
            className="small"
            value={v.multi.reveal}
            options={[
              { value: "sequential", label: "One by one" },
              { value: "instant", label: "All at once" },
            ]}
            onChange={(r) => c.setSettings({ multi: { reveal: r } })}
          />
        </div>
      ) : null}
      <Switch checked={v.fair} onChange={(on) => c.setFair(on)} label="Fair draw" sub="Commit the seed before each spin" />
    </div>
  );
}

function ResultsTab() {
  const c = useController();
  const scheme = useScheme();
  const v = useSel((s) => ({ history: s.history[s.activeId] ?? (EMPTY as never[]), wheel: activeWheel(s) }), shallowEq);
  const scene = buildScene({
    entries: v.wheel.entries,
    settings: { palette: v.wheel.settings.palette, mysteryMode: false, fontScale: 1, centre: { text: null, imageRef: null } },
    theme: wheelTheme(v.wheel.settings.theme, scheme),
    radiusPx: 300,
  });
  const colourOf = new Map(scene.slices.map((s) => [s.index, s.fill]));
  const n = v.history.length;
  if (!n)
    return (
      <div className="results-empty">
        <p>No spins yet. Every spin lands here with a receipt you can check.</p>
      </div>
    );
  return (
    <div className="results">
      <div className="tools">
        <button
          type="button"
          className="btn small"
          onClick={() => c.download(`${slug(v.wheel.name)}-history.csv`, c.historyCsv(), "text/csv")}
          data-testid="export-csv"
        >
          <Icon name="import" size={18} /> CSV
        </button>
        <button type="button" className="btn small" onClick={() => c.download(`${slug(v.wheel.name)}-receipts.json`, c.historyJson())} data-testid="export-json">
          <Icon name="import" size={18} /> JSON
        </button>
        <button type="button" className="btn small quiet" onClick={() => c.clearHistory()}>
          Clear history
        </button>
      </div>
      <ol className="history" aria-label="Spin history, newest first" data-testid="history">
        {v.history.map((h, i) => {
          const r = h.receipt;
          const names = r.mode === "teams" ? `${(r.result.teams ?? []).length} teams` : (r.result.picks ?? []).map((p) => p.label).join(", ");
          const first = r.result.picks?.[0]?.index;
          return (
            <li key={h.id}>
              <button type="button" className="li" onClick={() => c.openDialog("receipt", h.id)} aria-label={`Spin ${n - i}: ${names}. Open the receipt.`}>
                <span className="t">#{String(n - i).padStart(2, "0")}</span>
                <span className="chip" style={{ background: first !== undefined ? colourOf.get(first) ?? "var(--wp-rule)" : "var(--wp-rule)" }} />
                <span className="nm">{names}</span>
                <span className="t">
                  {new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {r.seed ? `seed ${shortHex(r.seed)}` : "unrevealed"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function slug(s: string): string {
  return (s || "wheel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wheel";
}
