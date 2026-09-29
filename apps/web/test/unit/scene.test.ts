import { describe, expect, it } from "vitest";
import { contrastRatio, sliceUnderPointer, type Entry } from "@whirlpick/core";
import { bandFor, buildScene, labelFor, paletteIndices, posUnderPointer, POINTER_TURN } from "../../src/wheel/scene";
import { PALETTES, THEMES, wheelTheme } from "../../src/wheel/theme";

const entries = (n: number, w = (i: number) => 1): Entry[] => Array.from({ length: n }, (_, i) => ({ id: `e_${String(i).padStart(8, "0")}`, label: `Name ${i + 1}`, weight: w(i), enabled: true }));
const settings = { palette: null, mysteryMode: false, fontScale: 1, centre: { text: null, imageRef: null } };

describe("label contrast (ACCEPTANCE J3)", () => {
  it("every curated palette colour has a label at 4.5:1 or better", () => {
    let worst = Infinity;
    for (const [id, pal] of Object.entries(PALETTES)) {
      for (const c of pal) {
        const r = contrastRatio(c.label, c.fill);
        worst = Math.min(worst, r);
        expect(r, `${id} ${c.name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(worst).toBeGreaterThanOrEqual(5.18 - 0.01);
  });
  it("every theme × scheme scene reaches 4.5:1 on every slice", () => {
    for (const th of THEMES) {
      for (const scheme of ["light", "dark"] as const) {
        const scene = buildScene({ entries: entries(30), settings, theme: wheelTheme(th.id, scheme), radiusPx: 300 });
        for (const s of scene.slices) expect(s.contrast, `${th.id}/${scheme}/${s.fill}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("mid-tone custom colours get a halo", () => {
    const t = wheelTheme("enamel", "light");
    expect(labelFor("#808080", t).halo).not.toBeNull();
    expect(labelFor("#1F1915", t).halo).toBeNull();
    const scene = buildScene({ entries: [{ ...entries(1)[0]!, color: "#767676" }, ...entries(3).slice(1)], settings, theme: t, radiusPx: 300 });
    expect(scene.slices[0]!.halo).not.toBeNull();
  });
});

describe("colour assignment (SPEC §3.4)", () => {
  it("assigns by position with the wrap fix", () => {
    // 15 entries on a 14-colour palette: the last would repeat the first, so it takes pal[7].
    const idx = paletteIndices(15, 1, 14);
    expect(idx[14]).toBe(7);
    expect(idx.slice(0, 14)).toEqual([...Array(14).keys()]);
    expect(paletteIndices(14, 1, 14)[13]).toBe(13);
  });
  it("bands dense wheels so every band is at least 4 px at the rim", () => {
    const geom = Array.from({ length: 1000 }, (_, i) => ({ index: i, pos: i, label: "", milliWeight: 1000, start: i / 1000, end: (i + 1) / 1000 }));
    const band = bandFor(geom, 150);
    expect(band).toBeGreaterThan(1);
    const arc = (1 / 1000) * Math.PI * 2 * 150 * (1 - 0.052);
    expect(arc * band).toBeGreaterThanOrEqual(4);
    expect(bandFor(geom.slice(0, 12).map((g, i) => ({ ...g, start: i / 12, end: (i + 1) / 12 })), 300)).toBe(1);
  });
  it("colours follow position among eligible slices", () => {
    const t = wheelTheme("enamel", "light");
    const a = buildScene({ entries: entries(5), settings, theme: t, radiusPx: 300 });
    const b = buildScene({ entries: entries(5), settings, theme: t, radiusPx: 300, excluded: [0] });
    expect(b.slices).toHaveLength(4);
    expect(b.slices[0]!.fill).toBe(a.slices[0]!.fill);
    expect(b.slices[0]!.index).toBe(1);
  });
});

describe("scene flags", () => {
  const t = wheelTheme("enamel", "dark");
  it("hides labels above 200 entries and in mystery mode", () => {
    expect(buildScene({ entries: entries(200), settings, theme: t, radiusPx: 300 }).labels).toBe(true);
    expect(buildScene({ entries: entries(201), settings, theme: t, radiusPx: 300 }).labels).toBe(false);
    const m = buildScene({ entries: entries(10), settings: { ...settings, mysteryMode: true }, theme: t, radiusPx: 300 });
    expect(m.labels).toBe(false);
    expect(m.mystery).toBe(true);
    expect(buildScene({ entries: entries(10), settings: { ...settings, mysteryMode: true }, theme: t, radiusPx: 300, revealed: true }).mystery).toBe(false);
  });
  it("marks an empty wheel and skips disabled entries", () => {
    expect(buildScene({ entries: [], settings, theme: t, radiusPx: 300 }).empty).toBe(true);
    const list = entries(4).map((e, i) => (i === 2 ? { ...e, enabled: false } : e));
    expect(buildScene({ entries: list, settings, theme: t, radiusPx: 300 }).slices.map((s) => s.index)).toEqual([0, 1, 3]);
  });
  it("keys change with the content, not with identity", () => {
    const a = buildScene({ entries: entries(6), settings, theme: t, radiusPx: 300 });
    const b = buildScene({ entries: entries(6), settings, theme: t, radiusPx: 300 });
    const c = buildScene({ entries: entries(7), settings, theme: t, radiusPx: 300 });
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });
});

describe("pointer maths agrees with core", () => {
  it("posUnderPointer equals core sliceUnderPointer for many rotations", () => {
    const t = wheelTheme("enamel", "light");
    const scene = buildScene({ entries: entries(9, (i) => (i % 3) + 0.5), settings, theme: t, radiusPx: 300 });
    for (let k = 0; k < 2000; k++) {
      const r = k * 0.0137 - 7.3;
      expect(posUnderPointer(scene, r)).toBe(sliceUnderPointer(r, scene.geometry, POINTER_TURN));
    }
  });
});
