// Teams (SPEC §10): controls in the Teams tab, results as team cards on the stage, dealt one by
// one (60 ms apart) unless reduced motion is on.
import { useEffect, useMemo, useState } from "react";
import { activeWheel } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
import { buildScene } from "../wheel/scene";
import { wheelTheme } from "../wheel/theme";
import { Icon, Modal, PlateHead, Segmented, Stepper, Switch, useController } from "./primitives";
import { useScheme } from "./WheelCanvas";

export function TeamsControls() {
  const c = useController();
  const v = useSel(
    (s) => {
      const w = activeWheel(s);
      const on = w.entries.filter((e) => e.enabled);
      return {
        teams: w.settings.teams,
        n: on.length,
        tagged: on.some((e) => e.tags && e.tags.length),
        entries: w.entries,
        rounds: s.sessions[s.activeId]?.teamRounds.length ?? 0,
        error: s.teams?.error ?? null,
        has: !!s.teams && !s.teams.error,
        mode: w.settings.mode,
      };
    },
    shallowEq,
  );
  const ts = v.teams;
  const maxTeams = Math.max(2, v.n);
  const [ruleKind, setRuleKind] = useState<"apart" | "together">("apart");
  const [pick, setPick] = useState<string[]>([]);
  const labelOf = (id: string) => v.entries.find((e) => e.id === id)?.label ?? "?";
  const addRule = () => {
    if (pick.length < 2) return;
    const key = ruleKind === "apart" ? "keepApart" : "keepTogether";
    c.setSettings({ teams: { [key]: [...ts[key], pick] } }, "Add rule");
    setPick([]);
  };
  const removeRule = (kind: "keepApart" | "keepTogether", i: number) => {
    c.setSettings({ teams: { [kind]: ts[kind].filter((_, j) => j !== i) } }, "Remove rule");
  };
  return (
    <div className="teams-controls">
      <Segmented
        label="Split by"
        value={ts.by}
        options={[
          { value: "count", label: "Number of teams" },
          { value: "size", label: "People per team" },
        ]}
        onChange={(by) => c.setSettings({ teams: { by }, mode: "teams" })}
      />
      {ts.by === "count" ? (
        <Stepper label="Teams" value={Math.min(ts.count, maxTeams)} min={2} max={maxTeams} onChange={(n) => c.setSettings({ teams: { count: n } })} />
      ) : (
        <Stepper label="People per team" value={ts.size} min={1} max={Math.max(1, v.n)} onChange={(n) => c.setSettings({ teams: { size: n } })} />
      )}
      <Switch checked={ts.balance} onChange={(b) => c.setSettings({ teams: { balance: b } })} label="Keep tags balanced" sub={v.tagged ? "Each tag spreads evenly, within one per team" : "Add #tag after a name, e.g. Ada #3"} />
      <details className="rules">
        <summary>
          Rules <span className="n">{ts.keepApart.length + ts.keepTogether.length || ""}</span>
        </summary>
        <div className="rules-body">
          <Segmented
            label="Rule type"
            value={ruleKind}
            options={[
              { value: "apart", label: "Keep apart" },
              { value: "together", label: "Keep together" },
            ]}
            onChange={setRuleKind}
          />
          <div className="rule-picker" role="group" aria-label="Choose people for the rule">
            {v.entries
              .filter((e) => e.enabled)
              .slice(0, 200)
              .map((e) => (
                <label key={e.id} className={`pickchip${pick.includes(e.id) ? " on" : ""}`}>
                  <input type="checkbox" checked={pick.includes(e.id)} onChange={(ev) => setPick((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                  {e.label}
                </label>
              ))}
          </div>
          <button type="button" className="btn small" disabled={pick.length < 2} onClick={addRule}>
            <Icon name="plus" size={18} /> Add rule{pick.length >= 2 ? ` for ${pick.length}` : ""}
          </button>
          {(["keepApart", "keepTogether"] as const).map((k) =>
            ts[k].map((set, i) => (
              <div key={`${k}${i}`} className="rule-row">
                <span className="rule-kind">{k === "keepApart" ? "Apart" : "Together"}</span>
                <span className="rule-names">{set.map(labelOf).join(", ")}</span>
                <button type="button" className="ibtn" aria-label={`Remove rule: ${set.map(labelOf).join(", ")}`} onClick={() => removeRule(k, i)}>
                  <Icon name="x" />
                </button>
              </div>
            )),
          )}
        </div>
      </details>
      {v.error ? (
        <p className="error" role="alert" data-testid="teams-error">
          <Icon name="alert" size={18} /> {v.error}
        </p>
      ) : null}
      <div className="teams-actions">
        <button type="button" className="btn primary" onClick={() => c.splitTeams(false)} disabled={v.n < 2} data-testid="split">
          <Icon name="team" /> Split
        </button>
        {v.has ? (
          <button type="button" className="btn" onClick={() => c.splitTeams(true)} data-testid="new-round">
            <Icon name="again" /> New round
          </button>
        ) : null}
      </div>
      {v.rounds > 1 ? <p className="small muted">Round {v.rounds}. New rounds avoid repeat teammates from earlier rounds.</p> : null}
    </div>
  );
}

function useTeamColours(count: number): string[] {
  const scheme = useScheme();
  const theme = useSel((s) => activeWheel(s).settings.theme);
  return useMemo(() => {
    const th = wheelTheme(theme, scheme);
    return Array.from({ length: count }, (_, i) => th.palette[(i * 2) % th.palette.length]!.fill);
  }, [count, scheme, theme]);
}

export function TeamsBoard({ fullscreen = false }: { fullscreen?: boolean }) {
  const c = useController();
  const v = useSel((s) => ({ view: s.teams, entries: activeWheel(s).entries, reduced: s.prefs.reducedMotion }), shallowEq);
  const view = v.view;
  const colours = useTeamColours(view?.result.teams.length ?? 0);
  const [dealt, setDealt] = useState(1e9);
  const total = view?.result.teams.reduce((a, t) => a + t.length, 0) ?? 0;
  useEffect(() => {
    if (!view || c.reducedMotion() || fullscreen) {
      setDealt(1e9);
      return;
    }
    setDealt(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDealt(i);
      if (i >= total) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, [view?.historyId, view?.receipt, total, c, fullscreen, view]);
  if (!view || view.error) return null;
  const label = (i: number) => view.receipt.entries[i]?.label ?? v.entries[i]?.label ?? "";
  const tags = (i: number) => view.receipt.entries[i]?.tags ?? [];
  // Deal order: round-robin across teams so every card fills at the same pace.
  const order = new Map<number, number>();
  let k = 0;
  const maxLen = Math.max(0, ...view.result.teams.map((t) => t.length));
  for (let r = 0; r < maxLen; r++) view.result.teams.forEach((t) => t[r] !== undefined && order.set(t[r]!, k++));
  return (
    <div className={`teams-board${fullscreen ? " full" : ""}`} data-testid="teams-board">
      {!fullscreen ? (
        <div className="board-bar">
          <p className="board-count">
            {view.result.teams.length} teams{view.result.repeatPairs ? ` · ${view.result.repeatPairs} repeat pair${view.result.repeatPairs === 1 ? "" : "s"}` : ""}
          </p>
          <div className="board-actions">
            <button type="button" className="btn small" onClick={() => void c.copy(c.teamsText(), "Teams copied.")}>
              <Icon name="copy" size={18} /> Copy as text
            </button>
            <button type="button" className="btn small" onClick={() => void c.copy(c.teamsCsv(), "CSV copied.")} data-testid="copy-csv">
              <Icon name="copy" size={18} /> CSV
            </button>
            <button type="button" className="btn small" onClick={() => c.openDialog("teamsFull")}>
              <Icon name="full" size={18} /> Fullscreen
            </button>
            {view.historyId ? (
              <button type="button" className="btn small" onClick={() => c.openDialog("receipt", view.historyId)}>
                <Icon name="receipt" size={18} /> Receipt
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="team-grid">
        {view.result.teams.map((team, ti) => (
          <section key={ti} className="team" style={{ ["--team" as string]: colours[ti] }} aria-label={view.names[ti]}>
            <h3>
              <input className="team-name" value={view.names[ti] ?? ""} aria-label={`Name of team ${ti + 1}`} onChange={(e) => c.renameTeam(ti, e.target.value)} readOnly={fullscreen} />
              <span className="n">{team.length}</span>
            </h3>
            <ul>
              {team.map((m) => (
                <li key={m} className={(order.get(m) ?? 0) < dealt ? "dealt" : "pending"}>
                  <span>{label(m)}</span>
                  {tags(m)[0] ? <i className="mono">{tags(m)[0]}</i> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function TeamsFullDialog() {
  const c = useController();
  const open = useSel((s) => s.ui.dialog?.kind === "teamsFull");
  return (
    <Modal open={open} onClose={() => c.closeDialog()} className="plate teams-full" labelledBy="teams-full-title">
      <PlateHead id="teams-full-title" title="Teams" onClose={() => c.closeDialog()} />
      <TeamsBoard fullscreen />
    </Modal>
  );
}
