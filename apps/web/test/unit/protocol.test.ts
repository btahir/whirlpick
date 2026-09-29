import { describe, expect, it } from "vitest";
import { acceptEvent, outbound, parseInbound } from "../../src/embed/protocol";

describe("embed protocol v1 (PLAN §6.12)", () => {
  it("ignores messages that aren't ours", () => {
    expect(parseInbound(null)).toEqual({ ok: "ignore" });
    expect(parseInbound("spin")).toEqual({ ok: "ignore" });
    expect(parseInbound({ type: "spin" })).toEqual({ ok: "ignore" });
  });
  it("parses every inbound type", () => {
    expect(parseInbound({ source: "whirlpick", v: 1, type: "spin", requestId: "r1" })).toEqual({ ok: true, msg: { type: "spin", requestId: "r1" } });
    expect(parseInbound({ source: "whirlpick", v: 1, type: "getState" })).toMatchObject({ ok: true, msg: { type: "getState" } });
    expect(parseInbound({ source: "whirlpick", v: 1, type: "reset" })).toMatchObject({ ok: true, msg: { type: "reset" } });
    expect(parseInbound({ source: "whirlpick", v: 1, type: "setEntries", entries: ["Ada", { label: "Grace", weight: 2 }] })).toMatchObject({ ok: true, msg: { type: "setEntries" } });
  });
  it("validates and clamps options", () => {
    const r = parseInbound({ source: "whirlpick", v: 1, type: "setOptions", options: { spinDuration: 99, sound: false, mode: "teams", background: "00b140", theme: "<x>" } });
    expect(r).toEqual({ ok: true, msg: { type: "setOptions", options: { spinDuration: 30, sound: false, background: "#00B140" }, requestId: undefined } });
  });
  it("reports bad messages with their request id", () => {
    expect(parseInbound({ source: "whirlpick", v: 2, type: "spin", requestId: "x" })).toMatchObject({ ok: false, code: "UNSUPPORTED_VERSION", requestId: "x" });
    expect(parseInbound({ source: "whirlpick", v: 1, type: "setEntries", entries: [{}] })).toMatchObject({ ok: false, code: "BAD_MESSAGE" });
    expect(parseInbound({ source: "whirlpick", v: 1, type: "nope" })).toMatchObject({ ok: false, code: "UNKNOWN_TYPE" });
  });
  it("accepts events only from the parent window and the given origin", () => {
    const parent = {};
    expect(acceptEvent({ source: parent, origin: "https://a.example" }, parent, null)).toBe(true);
    expect(acceptEvent({ source: {}, origin: "https://a.example" }, parent, null)).toBe(false);
    expect(acceptEvent({ source: parent, origin: "https://b.example" }, parent, "https://a.example")).toBe(false);
    expect(acceptEvent({ source: parent, origin: "https://a.example" }, parent, "https://a.example")).toBe(true);
  });
  it("wraps outbound messages", () => {
    expect(outbound("ready", { version: "0.1.0" })).toEqual({ source: "whirlpick", v: 1, type: "ready", version: "0.1.0" });
  });
});
