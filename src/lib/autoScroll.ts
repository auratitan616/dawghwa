import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reader auto-scroll.
 *
 * Time-based: the distance moved depends on elapsed time (px per second), not
 * on how many frames the browser managed to paint, so a slow phone and a
 * 120 Hz laptop scroll at the same speed. Fractions of a pixel are carried
 * between frames so slow speeds do not stall on rounding.
 *
 * It never navigates. At the end of the chapter it stops and reports why;
 * the existing end-of-chapter panel (and the reader's own opt-in "continue
 * automatically" countdown) take over from there.
 *
 * It holds (without forgetting that it is on) while:
 *  - the tab is in the background (document.hidden),
 *  - a reader layer is open (settings, chapter list, comments) or the page is zoomed,
 *  - the reader is touching, wheeling or using keys, and for RESUME_MS after.
 *
 * With reduced motion it moves in discrete steps (most of a screen at a time,
 * at the same average speed) instead of continuously gliding.
 */

export const AUTO_SCROLL_SPEEDS = [20, 40, 60, 80, 100, 130, 160, 200, 250, 320, 400] as const;
export const DEFAULT_AUTO_SCROLL_SPEED = 80;
/** Pause after the reader's own scrolling/touching before auto-scroll resumes. */
export const RESUME_MS = 1500;
/** Longest frame gap counted; a stalled or throttled tab does not jump ahead. */
export const MAX_FRAME_MS = 100;
/** Share of the viewport moved per step in step mode. */
export const STEP_FRACTION = 0.85;

export type AutoScrollMode = "continuous" | "step";
export type AutoScrollState = "off" | "running" | "paused";
export type HoldReason = "background" | "layer" | "input" | null;

export function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_AUTO_SCROLL_SPEED;
  return Math.min(AUTO_SCROLL_SPEEDS[AUTO_SCROLL_SPEEDS.length - 1]!, Math.max(AUTO_SCROLL_SPEEDS[0]!, Math.round(v)));
}

/** Next faster (dir 1) or slower (dir -1) preset. */
export function nudgeSpeed(speed: number, dir: 1 | -1): number {
  const s = clampSpeed(speed);
  if (dir > 0) return AUTO_SCROLL_SPEEDS.find((x) => x > s) ?? AUTO_SCROLL_SPEEDS[AUTO_SCROLL_SPEEDS.length - 1]!;
  return [...AUTO_SCROLL_SPEEDS].reverse().find((x) => x < s) ?? AUTO_SCROLL_SPEEDS[0]!;
}

/** Continuous mode: whole pixels to move this frame, and the fraction to carry. */
export function continuousStep(speed: number, dtMs: number, carry: number): { dy: number; carry: number } {
  const dt = Math.min(Math.max(0, dtMs), MAX_FRAME_MS);
  const total = carry + (clampSpeed(speed) * dt) / 1000;
  const dy = Math.floor(total);
  return { dy, carry: total - dy };
}

/** Step mode: distance per step and the delay that keeps the same average speed. */
export function stepPlan(speed: number, viewport: number): { distance: number; intervalMs: number } {
  const distance = Math.max(1, Math.round(viewport * STEP_FRACTION));
  return { distance, intervalMs: Math.round((distance / clampSpeed(speed)) * 1000) };
}

/** True once the end marker (or the bottom of the document) is on screen. */
export function reachedEnd(endTop: number | undefined, viewport: number, scrollY: number, docHeight: number): boolean {
  if (endTop !== undefined && endTop <= viewport * 0.9) return true;
  return scrollY + viewport >= docHeight - 2;
}

export interface AutoScrollOptions {
  /** Pages exist. When false, auto-scroll is off. */
  enabled: boolean;
  /** A layer is open or the page is zoomed: hold. */
  blocked: boolean;
  speed: number;
  mode: AutoScrollMode;
  /** The end-of-chapter element; reaching it stops auto-scroll. */
  endEl: () => HTMLElement | null;
  /** Changing this (a new chapter or version) turns auto-scroll off. */
  resetKey: string;
  /** Elements inside this selector (the control itself) are not "manual input". */
  ignoreSelector?: string;
  onEnd?: () => void;
}

export function useAutoScroll(o: AutoScrollOptions) {
  const [state, setState] = useState<AutoScrollState>("off");
  const [hold, setHold] = useState<HoldReason>(null);
  const opts = useRef(o);
  opts.current = o;

  const stop = useCallback(() => setState("off"), []);
  const start = useCallback(() => setState("running"), []);
  const toggle = useCallback(() => setState((s) => (s === "running" ? "paused" : "running")), []);

  // a new chapter/version, or no pages: off
  useEffect(() => setState("off"), [o.resetKey]);
  useEffect(() => {
    if (!o.enabled) setState("off");
  }, [o.enabled]);

  useEffect(() => {
    if (state !== "running") {
      setHold(null);
      return;
    }
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let sinceStep = 0;
    let holdUntil = 0;
    let pressed = false;
    let shownHold: HoldReason = null;
    const showHold = (h: HoldReason) => {
      if (h !== shownHold) setHold((shownHold = h));
    };

    const ignored = (e: Event) => {
      const sel = opts.current.ignoreSelector;
      return Boolean(sel && e.target instanceof Element && e.target.closest(sel));
    };
    const nudge = (e: Event) => {
      if (ignored(e)) return;
      holdUntil = performance.now() + RESUME_MS;
    };
    const onKey = (e: KeyboardEvent) => {
      // our own shortcuts are not "manual scrolling"
      if (["p", "P", "-", "_", "=", "+"].includes(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
      nudge(e);
    };
    const down = (e: Event) => {
      if (ignored(e)) return;
      pressed = true;
      nudge(e);
    };
    const up = (e: Event) => {
      if (!pressed) return;
      pressed = false;
      nudge(e);
    };
    const passive = { passive: true } as const;
    window.addEventListener("wheel", nudge, passive);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", down, passive);
    window.addEventListener("pointerdown", down, passive);
    window.addEventListener("touchend", up, passive);
    window.addEventListener("touchcancel", up, passive);
    window.addEventListener("pointerup", up, passive);
    window.addEventListener("pointercancel", up, passive);

    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      const c = opts.current;
      const reason: HoldReason = document.hidden ? "background" : c.blocked ? "layer" : pressed || now < holdUntil ? "input" : null;
      showHold(reason);
      if (reason) {
        carry = 0;
        sinceStep = 0;
      } else {
        const vh = window.innerHeight;
        const end = c.endEl();
        if (reachedEnd(end?.getBoundingClientRect().top, vh, window.scrollY, document.documentElement.scrollHeight)) {
          setState("off");
          c.onEnd?.();
          return;
        }
        if (c.mode === "step") {
          const plan = stepPlan(c.speed, vh);
          sinceStep += Math.min(dt, MAX_FRAME_MS);
          if (sinceStep >= plan.intervalMs) {
            sinceStep = 0;
            window.scrollBy({ top: plan.distance, behavior: "instant" as ScrollBehavior });
          }
        } else {
          const s = continuousStep(c.speed, dt, carry);
          carry = s.carry;
          if (s.dy > 0) window.scrollBy({ top: s.dy, behavior: "instant" as ScrollBehavior });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // rAF does not run in background tabs; resetting the clock on return
    // keeps the first visible frame from counting the hidden time.
    const onVis = () => {
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("wheel", nudge);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", down);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [state]);

  return { state, hold, start, stop, toggle };
}
