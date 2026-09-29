// The entries editor (PLAN §6.3, SPEC §10): a real <textarea> (fast with 1,000 lines, native
// undo, paste) with transparent text, and a mirror layer drawn under it that shows the gutter
// (number + slice-colour chip), the names (struck through when disabled or removed), weight
// badges and the hover row. Only the rows in view are rendered.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "@whirlpick/core";
import { entriesToText, entryLine, parseLine, weightBadge } from "../state/entries";
import { EMPTY, activeWheel, sessionOf } from "../state/reducer";
import { shallowEq, useSel } from "../state/store";
import { buildScene } from "../wheel/scene";
import { PALETTES, wheelTheme } from "../wheel/theme";
import { t } from "../copy/en";
import { Icon, useController, useMedia } from "./primitives";
import { useScheme } from "./WheelCanvas";

interface RowModel {
  line: number;
  entry: Entry | null;
  index: number;
  text: string;
}

export function EntriesEditor() {
  const c = useController();
  const scheme = useScheme();
  // Row height comes from CSS (38 px, 44 px on touch) so the prerendered rows never move;
  // JS only needs it to work out which rows are in view.
  const touch = useMedia("(pointer: coarse)");
  const lh = touch ? 44 : 38;
  const { entries, excluded, spinning, mode, palette, theme, lastIndex } = useSel(
    (s) => {
      const w = activeWheel(s);
      return {
        entries: w.entries,
        excluded: w.settings.mode === "elimination" ? sessionOf(s).excluded : (EMPTY as never[]),
        spinning: s.spin.phase !== "idle",
        mode: w.settings.mode,
        palette: w.settings.palette,
        theme: w.settings.theme,
        lastIndex: s.last?.picks[0]?.index ?? -1,
      };
    },
    shallowEq,
  );
  const [text, setText] = useState(() => entriesToText(entries));
  const [scroll, setScroll] = useState({ top: 0, left: 0, height: 400 });
  const [hover, setHover] = useState(-1);
  const [colourFor, setColourFor] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const lastEntries = useRef(entries);

  // External changes (tools, undo, import, links) replace the text unless it already matches.
  useEffect(() => {
    if (entries === lastEntries.current) return;
    lastEntries.current = entries;
    const cur = text
      .split(/\r\n|\r|\n/)
      .map((l) => parseLine(l))
      .filter(Boolean)
      .map((it) => entryLine(it!))
      .join("\n");
    const want = entries.map(entryLine).join("\n");
    if (cur !== want) setText(entriesToText(entries));
  }, [entries, text]);

  const onInput = (v: string) => {
    setText(v);
    c.setText(v);
    lastEntries.current = activeWheel(c.store.getState()).entries;
  };

  // Line → entry mapping (blank lines have no entry).
  const rows: RowModel[] = useMemo(() => {
    const lines = text.split(/\r\n|\r|\n/);
    const out: RowModel[] = [];
    let k = 0;
    lines.forEach((l, i) => {
      const it = parseLine(l);
      if (it && k < entries.length) {
        out.push({ line: i, entry: entries[k]!, index: k, text: l });
        k++;
      } else out.push({ line: i, entry: null, index: -1, text: l });
    });
    return out;
  }, [text, entries]);

  // Chip colours: the slice colour each enabled entry gets on the wheel (SPEC §3.4).
  const chipColour = useMemo(() => {
    const th = wheelTheme(theme, scheme);
    const scene = buildScene({ entries, settings: { palette, mysteryMode: false, fontScale: 1, centre: { text: null, imageRef: null } }, theme: th, excluded: [], radiusPx: 300 });
    const m = new Map<number, string>();
    for (const s of scene.slices) m.set(s.index, s.fill);
    return m;
  }, [entries, palette, theme, scheme]);

  const onScroll = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    setScroll({ top: el.scrollTop, left: el.scrollLeft, height: el.clientHeight });
  }, []);
  useEffect(() => {
    onScroll();
    const el = ta.current;
    if (!el) return;
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onScroll]);

  const first = Math.max(0, Math.floor((scroll.top - 8) / lh) - 4);
  const last = Math.min(rows.length, Math.ceil((scroll.top + scroll.height) / lh) + 4);
  const ex = new Set(excluded);
  const onCount = entries.filter((e, i) => e.enabled && !ex.has(i)).length;

  const onMouseMove = (e: React.MouseEvent) => {
    const el = ta.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const y = e.clientY - r.top + el.scrollTop - 8;
    setHover(Math.floor(y / lh));
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const txt = e.clipboardData.getData("text/plain");
    const el = e.currentTarget;
    const before = el.value.slice(0, el.selectionStart);
    const after = el.value.slice(el.selectionEnd);
    if (c.pasteEntries(txt, { before, after })) {
      e.preventDefault();
      const next = activeWheel(c.store.getState()).entries;
      lastEntries.current = next;
      setText(entriesToText(next));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      c.spin();
    }
  };

  return (
    <div className={`editor${spinning ? " locked" : ""}`}>
      {spinning ? <p className="locked-note">{t.lockedWhileSpinning}</p> : null}
      <div className="editor-mirror" aria-hidden="true" style={{ transform: `translateY(${-scroll.top}px)` }}>
        {rows.slice(first, last).map((r) => {
          const e = r.entry;
          const off = !!e && (!e.enabled || ex.has(r.index));
          const chip = e ? (e.color ?? chipColour.get(r.index) ?? (PALETTES["enamel-day"]![0]!.fill)) : null;
          return (
            <div key={r.line} className={`erow${off ? " off" : ""}${r.line === hover ? " hover" : ""}${e && r.index === lastIndex && mode !== "teams" ? " last" : ""}`} style={{ top: `calc(8px + ${r.line} * var(--lh))` }}>
              <span className="g">
                {e ? String(r.index + 1).padStart(2, "0") : ""}
                {e ? <span className="chip" style={{ background: chip ?? undefined }} /> : <span className="chip empty" />}
              </span>
              <span className="nm" style={{ transform: `translateX(${-scroll.left}px)` }}>
                {e ? <Name line={r.text} /> : r.text}
              </span>
              <span className="w">{e && e.weight !== 1 ? weightBadge(e.weight) : e?.imageRef ? <Icon name="image" size={14} /> : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="chip-hits" style={{ transform: `translateY(${-scroll.top}px)` }}>
        {rows.slice(first, last).map((r) =>
          r.entry ? (
            <button
              key={r.line}
              type="button"
              className="chip-hit"
              style={{ top: `calc(8px + ${r.line} * var(--lh))`, height: "var(--lh)" }}
              aria-label={`Colour and options for ${r.entry.label}`}
              tabIndex={-1}
              onClick={() => setColourFor(r.entry!.id)}
            />
          ) : null,
        )}
      </div>
      <textarea
        ref={ta}
        className="editor-input"
        value={text}
        spellCheck={false}
        autoCapitalize="words"
        autoComplete="off"
        wrap="off"
        placeholder={t.pastePlaceholder}
        aria-label="Entries, one per line. Add #tag after a name to tag it."
        aria-describedby="entries-count"
        readOnly={spinning}
        onChange={(e) => onInput(e.target.value)}
        onScroll={onScroll}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(-1)}
        data-testid="entries"
      />
      <span id="entries-count" className="sr-only">
        {t.onTheWheel(onCount, entries.length)}
      </span>
      {colourFor ? <EntryPopover id={colourFor} onClose={() => setColourFor(null)} /> : null}
    </div>
  );
}

/** Label, with trailing #tags shown in mono (they are part of the line). */
function Name({ line }: { line: string }) {
  const it = parseLine(line);
  if (!it || !it.tags.length) return <>{line.trim()}</>;
  return (
    <>
      {it.label}
      {it.tags.map((tg) => (
        <span key={tg} className="tag">
          {" "}#{tg}
        </span>
      ))}
    </>
  );
}

/** The visually hidden model of the wheel: each entry and its chance (ACCEPTANCE L2). */
export function EntryList() {
  const { entries, excluded, mystery } = useSel(
    (s) => {
      const w = activeWheel(s);
      return { entries: w.entries, excluded: w.settings.mode === "elimination" ? sessionOf(s).excluded : (EMPTY as never[]), mystery: w.settings.mysteryMode };
    },
    shallowEq,
  );
  const ex = new Set(excluded);
  const on = entries.map((e, i) => ({ e, i })).filter(({ e, i }) => e.enabled && !ex.has(i));
  if (mystery) return <li>{on.length} hidden entries</li>;
  const total = on.reduce((a, { e }) => a + Math.round(e.weight * 1000), 0);
  const same = on.every(({ e }) => e.weight === on[0]?.e.weight);
  return (
    <>
      {on.slice(0, 1000).map(({ e }) => (
        <li key={e.id}>
          {e.label}, {same ? `1 in ${on.length}` : `${((Math.round(e.weight * 1000) / total) * 100).toFixed(1)}% chance`}
        </li>
      ))}
    </>
  );
}

const SWATCHES = PALETTES["enamel-day"]!;

function EntryPopover({ id, onClose }: { id: string; onClose: () => void }) {
  const c = useController();
  const entry = useSel((s) => activeWheel(s).entries.find((e) => e.id === id) ?? null);
  const [hex, setHex] = useState(entry?.color ?? "");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    const t0 = setTimeout(() => document.addEventListener("pointerdown", onDown), 0);
    return () => {
      clearTimeout(t0);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  if (!entry) return null;
  const low = entry.color ? lowContrast(entry.color) : false;
  return (
    <div
      ref={box}
      className="popover entry-pop"
      role="dialog"
      aria-label={`Options for ${entry.label}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="pop-title">{entry.label}</p>
      <div className="swatches" role="group" aria-label="Slice colour">
        <button type="button" className={`swatch auto${!entry.color ? " on" : ""}`} onClick={() => c.patchEntry(id, { color: undefined })}>
          Automatic
        </button>
        {SWATCHES.map((p) => (
          <button
            key={p.fill}
            type="button"
            className={`swatch${entry.color === p.fill ? " on" : ""}`}
            style={{ background: p.fill }}
            aria-label={p.name}
            aria-pressed={entry.color === p.fill}
            onClick={() => {
              setHex(p.fill);
              c.patchEntry(id, { color: p.fill });
            }}
          />
        ))}
      </div>
      <label className="field inline">
        <span>Hex</span>
        <input
          className="mono"
          value={hex}
          maxLength={7}
          placeholder="#C2361F"
          onChange={(e) => {
            const v = e.target.value.trim();
            setHex(v);
            if (/^#?[0-9a-fA-F]{6}$/.test(v)) c.patchEntry(id, { color: `#${v.replace("#", "").toUpperCase()}` });
          }}
        />
      </label>
      {low ? (
        <p className="warn" role="status">
          <Icon name="alert" size={16} /> Labels get an outline on this colour.
        </p>
      ) : null}
      <div className="pop-row">
        <label className="field inline">
          <span>Weight</span>
          <input
            type="number"
            min={0.001}
            max={1000000}
            step={0.5}
            defaultValue={entry.weight}
            onChange={(e) => {
              const w = Number(e.target.value);
              if (w >= 0.001 && w <= 1e6) c.patchEntry(id, { weight: Math.round(w * 1000) / 1000 });
            }}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={entry.enabled} onChange={(e) => c.patchEntry(id, { enabled: e.target.checked })} />
          <span>On the wheel</span>
        </label>
      </div>
      <div className="pop-row">
        <ImageButton id={id} has={!!entry.imageRef} />
        <button type="button" className="btn small" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function ImageButton({ id, has }: { id: string; has: boolean }) {
  const c = useController();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void c.setEntryImage(id, f);
          e.target.value = "";
        }}
      />
      <button type="button" className="btn small" onClick={() => input.current?.click()}>
        <Icon name="image" size={18} />
        {has ? "Change image" : "Add image"}
      </button>
      {has ? (
        <button type="button" className="btn small quiet" onClick={() => void c.setEntryImage(id, null)}>
          Remove image
        </button>
      ) : null}
    </>
  );
}

function lowContrast(hex: string): boolean {
  const lum = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const L = lum(hex);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.max(ratio(L, lum("#FFF8EC")), ratio(L, lum("#1F1915"))) < 4.5;
}
