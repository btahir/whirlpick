// The wheel: a real <button> holding the canvas (the click and focus target), the pointer
// readout for dense wheels, and the wiring from store state to the WheelDriver.
import { useEffect, useMemo, useRef, useState } from "react";
import { heightFor, pickTipPoint } from "../wheel/renderer";
import { WheelDriver } from "../wheel/driver";
import { buildScene, type WheelScene } from "../wheel/scene";
import { wheelTheme } from "../wheel/theme";
import { ImageCache } from "../app/images";
import { EMPTY, activeWheel, sessionOf } from "../state/reducer";
import { useSel, shallowEq } from "../state/store";
import { t } from "../copy/en";
import { useController, useMedia } from "./primitives";

export function useScheme(): "light" | "dark" {
  const pref = useSel((s) => s.prefs.scheme);
  const sysDark = useMedia("(prefers-color-scheme: dark)");
  return pref === "system" ? (sysDark ? "dark" : "light") : pref;
}

let fontsReady: Promise<void> | null = null;
/**
 * Wait for the label font before the first cached render (SPEC §4). FontFaceSet.load() would
 * also fetch every other face whose unicode-range overlaps the test text (the full Latin file),
 * so load just the preloaded core subset face directly.
 */
function waitFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  const set = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!set) return (fontsReady = Promise.resolve());
  const core = [...set].filter((f) => /Bricolage/.test(f.family) && /U\+20-7E/i.test(f.unicodeRange));
  fontsReady = Promise.all(core.map((f) => f.load()))
    .then(() => undefined)
    .catch(() => undefined);
  return fontsReady;
}

export function WheelCanvas({ onSpin, big = false }: { onSpin: () => void; big?: boolean }) {
  const c = useController();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const driverRef = useRef<WheelDriver | null>(null);
  const imagesRef = useRef<ImageCache | null>(null);
  const [width, setWidth] = useState(0);
  const [fontEpoch, setFontEpoch] = useState(0);
  const [imgEpoch, setImgEpoch] = useState(0);
  const scheme = useScheme();

  const view = useSel(
    (s) => {
      const w = activeWheel(s);
      const ses = sessionOf(s);
      let excluded: number[] = w.settings.mode === "elimination" ? ses.excluded : (EMPTY as never[]);
      if (s.spin.phase !== "idle") {
        const seg = s.spin.plan.segments[s.spin.phase === "paused" ? s.spin.segment + 0 : s.spin.segment];
        if (seg) excluded = seg.excluded;
      }
      const revealed = s.spin.phase === "paused" || (s.spin.phase === "idle" && !!s.last && (s.ui.dialog?.kind === "winner" || !!s.ui.streamCaption));
      return {
        entries: w.entries,
        palette: w.settings.palette,
        mystery: w.settings.mysteryMode,
        fontScale: w.settings.fontScale,
        centre: w.settings.centre,
        theme: w.settings.theme,
        background: w.settings.background,
        excluded: excluded.join(","),
        revealed,
        surface: s.surface,
        images: s.images,
        spinning: s.spin.phase === "spinning",
      };
    },
    shallowEq,
  );

  const R = width / 2.24;
  const flat = view.surface === "stream";
  const green = flat && (view.background === "#00B140" || (typeof document !== "undefined" && document.documentElement.getAttribute("data-stream") === "green"));
  const scene: WheelScene = useMemo(() => {
    const theme = wheelTheme(view.theme, scheme, { flat, forcePalette: green && view.theme === "enamel" ? "broadcast" : undefined });
    return buildScene({
      entries: view.entries,
      settings: { palette: view.palette, mysteryMode: view.mystery, fontScale: view.fontScale, centre: view.centre },
      theme,
      excluded: view.excluded ? view.excluded.split(",").map(Number) : [],
      radiusPx: R || 300,
      revealed: view.revealed,
    });
    // fontEpoch/imgEpoch force a rebuild (new object → cache miss) once fonts or images arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.entries, view.palette, view.mystery, view.fontScale, view.centre, view.theme, view.excluded, view.revealed, scheme, flat, green, Math.round(R), fontEpoch, imgEpoch]);

  // Driver lifecycle.
  useEffect(() => {
    const el = canvas.current!;
    imagesRef.current = new ImageCache(() => setImgEpoch((n) => n + 1));
    const perf = (() => {
      try {
        return localStorage.getItem("whirlpick:perf") === "1";
      } catch {
        return false;
      }
    })();
    const d = new WheelDriver(
      el,
      { createCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }), images: imagesRef.current.map },
      {
        perf,
        onTick: (gain) => {
          const w = activeWheel(c.store.getState());
          if (w.settings.sound) c.synth.tick(gain);
        },
        onSpeed: (ratio) => {
          const w = activeWheel(c.store.getState());
          if (w.settings.sound) c.synth.whoosh(ratio);
        },
        onPointer: (pos) => {
          const r = readout.current;
          const sc = d.currentScene;
          if (!r || !sc) return;
          const s = sc.slices[pos];
          r.textContent = s ? s.label : "";
        },
      },
    );
    driverRef.current = d;
    c.attachDriver(d);
    c.attachPickTip(() => {
      const box = canvas.current?.getBoundingClientRect();
      if (!box || !box.width) return null;
      const p = pickTipPoint(box.width, -0.02);
      return { x: box.left + p.x, y: box.top + p.y };
    });
    void waitFonts().then(() => setFontEpoch((n) => n + 1));
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const onFonts = () => setFontEpoch((n) => n + 1);
    fonts?.addEventListener("loadingdone", onFonts);
    const onVis = () => {
      if (document.hidden) return;
      d.draw();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      fonts?.removeEventListener("loadingdone", onFonts);
      c.attachDriver(null);
      c.attachPickTip(null);
      d.destroy();
    };
  }, [c]);

  // Size with a ResizeObserver, debounced to one animation frame.
  useEffect(() => {
    const el = wrap.current!;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const w = el.getBoundingClientRect().width;
      setWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    };
    const ro = new ResizeObserver(() => {
      if (!raf) raf = requestAnimationFrame(measure);
    });
    ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const d = driverRef.current;
    if (!d || width <= 0) return;
    d.resize(width, heightFor(width), window.devicePixelRatio || 1);
  }, [width]);

  // Scene updates; a removal (elimination or "Remove") tweens over 420 ms (SPEC §7.4).
  const prevScene = useRef<WheelScene | null>(null);
  useEffect(() => {
    const d = driverRef.current;
    if (!d) return;
    const prev = prevScene.current;
    const removal = !!prev && !view.spinning && prev.slices.length - scene.slices.length === 1 && prev.slices.length <= 200 && !c.reducedMotion();
    d.setScene(scene, removal ? 420 : 0);
    prevScene.current = scene;
    d.setMysteryAlpha(1);
  }, [scene, c, view.spinning]);

  useEffect(() => {
    imagesRef.current?.sync(view.images);
  }, [view.images]);

  const n = scene.slices.length;
  const hiddenLabels = !scene.mystery && n > 1 && (n > 200 || (width > 0 && scene.labels === false));
  const [anyHidden, setAnyHidden] = useState(false);
  useEffect(() => {
    // The renderer reports which labels didn't fit; show the readout if any are missing.
    const d = driverRef.current;
    if (!d) return;
    const rep = d.draw();
    setAnyHidden(!!rep && !scene.mystery && n > 1 && (rep.labels.length === 0 ? n > 0 && scene.labels === false : rep.labels.some((l) => l.hidden)));
  }, [scene, width, n]);
  const showReadout = hiddenLabels || anyHidden;

  // Desktop: the full name of the slice under the mouse as a tooltip (SPEC §6.4), so truncated
  // or hidden labels can always be read.
  const [tip, setTip] = useState("");
  const onHover = (e: React.MouseEvent) => {
    const d = driverRef.current;
    const sc = d?.currentScene;
    const box = canvas.current?.getBoundingClientRect();
    if (!d || !sc || !box || sc.mystery) return;
    const R = box.width / 2.24;
    const x = e.clientX - box.left - 1.04 * R;
    const y = e.clientY - box.top - 1.04 * R;
    const dist = Math.hypot(x, y);
    if (dist > R * 0.95 || dist < R * 0.17) {
      if (tip) setTip("");
      return;
    }
    // Canvas angle (0 = 3 o'clock, clockwise) → wheel-frame turn (renderer adds a 0.25 offset).
    const turn = Math.atan2(y, x) / (2 * Math.PI) - d.angle;
    const local = turn - Math.floor(turn);
    const hit = sc.slices.find((sl) => local >= sl.start && local < sl.end);
    const label = hit?.label ?? "";
    if (label !== tip) setTip(label);
  };

  return (
    <div className={`wheelwrap${big ? " big" : ""}`} ref={wrap}>
      <button type="button" className="wheelbtn" onClick={onSpin} onMouseMove={onHover} onMouseLeave={() => setTip("")} title={tip || undefined} aria-label={n < 2 && view.entries.length < 2 ? t.addOneMore : t.spinLabel(n)} data-testid="wheel">
        <canvas ref={canvas} className="wheel-canvas" aria-hidden="true" />
        <span className="wheel-focus" aria-hidden="true" />
      </button>
      <div className="readout" ref={readout} aria-hidden="true" hidden={!showReadout} />
    </div>
  );
}
