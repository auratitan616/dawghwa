import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { clampSpeed, continuousStep, MAX_FRAME_MS, nudgeSpeed, reachedEnd, RESUME_MS, stepPlan, useAutoScroll, type AutoScrollOptions } from "./autoScroll";
import { migrateSettings } from "./settings";

describe("auto-scroll maths", () => {
  it("moves by elapsed time, not by frame count", () => {
    // 100 px/s for one second, at 60 fps or at 120 fps, is the same distance
    const run = (fps: number) => {
      let carry = 0;
      let moved = 0;
      for (let i = 0; i < fps; i++) {
        const s = continuousStep(100, 1000 / fps, carry);
        carry = s.carry;
        moved += s.dy;
      }
      return moved + carry;
    };
    expect(run(60)).toBeCloseTo(100, 5);
    expect(run(120)).toBeCloseTo(100, 5);
  });

  it("carries fractions so slow speeds never stall on rounding", () => {
    let carry = 0;
    let moved = 0;
    for (let i = 0; i < 60; i++) {
      const s = continuousStep(20, 1000 / 60, carry); // 0.33 px per frame
      carry = s.carry;
      moved += s.dy;
    }
    expect(moved).toBeGreaterThanOrEqual(19);
  });

  it("caps a long frame gap so a stalled tab does not jump", () => {
    expect(continuousStep(400, 5000, 0).dy).toBe(Math.floor((400 * MAX_FRAME_MS) / 1000));
  });

  it("clamps and nudges speed through presets", () => {
    expect(clampSpeed(5)).toBe(20);
    expect(clampSpeed(9999)).toBe(400);
    expect(clampSpeed(Number.NaN)).toBe(80);
    expect(nudgeSpeed(80, 1)).toBe(100);
    expect(nudgeSpeed(80, -1)).toBe(60);
    expect(nudgeSpeed(400, 1)).toBe(400);
    expect(nudgeSpeed(20, -1)).toBe(20);
    expect(nudgeSpeed(90, 1)).toBe(100);
  });

  it("step mode keeps the same average speed", () => {
    const p = stepPlan(100, 800);
    expect(p.distance).toBe(680);
    expect(p.intervalMs).toBe(6800);
  });

  it("detects the end marker or the bottom of the document", () => {
    expect(reachedEnd(2000, 800, 0, 5000)).toBe(false);
    expect(reachedEnd(700, 800, 0, 5000)).toBe(true);
    expect(reachedEnd(undefined, 800, 4200, 5000)).toBe(true);
  });

  it("drops invalid stored speed or mode", () => {
    expect(migrateSettings({ autoScrollSpeed: 5000 } as never)).toEqual({});
    expect(migrateSettings({ autoScrollSpeed: "fast" } as never)).toEqual({});
    expect(migrateSettings({ autoScrollMode: "warp" } as never)).toEqual({});
    expect(migrateSettings({ autoScrollSpeed: 120, autoScrollMode: "step" })).toEqual({ autoScrollSpeed: 120, autoScrollMode: "step" });
  });
});

describe("useAutoScroll", () => {
  let now = 0;
  let frames: FrameRequestCallback[] = [];
  let scrolled = 0;
  let hidden = false;
  const tick = (ms: number) => {
    now += ms;
    const f = frames;
    frames = [];
    act(() => f.forEach((cb) => cb(now)));
  };

  beforeEach(() => {
    now = 0;
    frames = [];
    scrolled = 0;
    hidden = false;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (frames.push(cb), frames.length));
    vi.stubGlobal("cancelAnimationFrame", () => (frames = []));
    vi.spyOn(window, "scrollBy").mockImplementation(((o: ScrollToOptions) => (scrolled += o.top ?? 0)) as typeof window.scrollBy);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 100_000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const base = (o: Partial<AutoScrollOptions> = {}): AutoScrollOptions => ({ enabled: true, blocked: false, speed: 100, mode: "continuous", endEl: () => null, resetKey: "c1", ...o });

  it("starts only when asked, scrolls by time, and pauses/resumes", () => {
    const { result } = renderHook((p: AutoScrollOptions) => useAutoScroll(p), { initialProps: base() });
    expect(result.current.state).toBe("off");
    tick(16);
    expect(scrolled).toBe(0);
    act(() => result.current.start());
    for (let i = 0; i < 10; i++) tick(100);
    expect(scrolled).toBeGreaterThanOrEqual(99);
    expect(scrolled).toBeLessThanOrEqual(101);
    act(() => result.current.toggle());
    expect(result.current.state).toBe("paused");
    const at = scrolled;
    tick(100);
    expect(scrolled).toBe(at);
    expect(frames).toHaveLength(0); // loop torn down while paused
  });

  it("holds in a background tab and while a layer is open", () => {
    const { result, rerender } = renderHook((p: AutoScrollOptions) => useAutoScroll(p), { initialProps: base() });
    act(() => result.current.start());
    tick(16);
    hidden = true;
    const at = scrolled;
    tick(100);
    tick(100);
    expect(scrolled).toBe(at);
    expect(result.current.hold).toBe("background");
    hidden = false;
    rerender(base({ blocked: true }));
    tick(100);
    expect(scrolled).toBe(at);
    expect(result.current.hold).toBe("layer");
    rerender(base());
    tick(100);
    tick(100);
    expect(scrolled).toBeGreaterThan(at);
    expect(result.current.state).toBe("running");
  });

  it("yields to the reader's own input and resumes after a pause", () => {
    const { result } = renderHook((p: AutoScrollOptions) => useAutoScroll(p), { initialProps: base() });
    act(() => result.current.start());
    tick(16);
    act(() => void window.dispatchEvent(new Event("wheel")));
    const at = scrolled;
    tick(RESUME_MS / 2);
    tick(RESUME_MS / 4);
    expect(scrolled).toBe(at);
    expect(result.current.hold).toBe("input");
    tick(RESUME_MS);
    tick(100);
    expect(scrolled).toBeGreaterThan(at);
  });

  it("stops at the chapter end without navigating, and turns off on a new chapter", () => {
    let endTop = 5000;
    const onEnd = vi.fn();
    const endEl = () => ({ getBoundingClientRect: () => ({ top: endTop }) }) as HTMLElement;
    const { result, rerender } = renderHook((p: AutoScrollOptions) => useAutoScroll(p), { initialProps: base({ endEl, onEnd }) });
    act(() => result.current.start());
    tick(100);
    endTop = 600;
    tick(100);
    expect(result.current.state).toBe("off");
    expect(onEnd).toHaveBeenCalledTimes(1);
    const at = scrolled;
    tick(100);
    expect(scrolled).toBe(at);

    endTop = 5000;
    act(() => result.current.start());
    rerender(base({ endEl, onEnd, resetKey: "c2" }));
    expect(result.current.state).toBe("off");
  });

  it("steps a screen at a time in step mode", () => {
    const { result } = renderHook((p: AutoScrollOptions) => useAutoScroll(p), { initialProps: base({ mode: "step", speed: 400 }) });
    act(() => result.current.start());
    // 680 px every 1700 ms at 400 px/s
    for (let i = 0; i < 16; i++) tick(100);
    expect(scrolled).toBe(0);
    tick(100);
    tick(100);
    expect(scrolled).toBe(680);
  });
});
