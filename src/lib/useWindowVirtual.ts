import { useEffect, useState, type RefObject } from "react";

/**
 * Window-scrolled list virtualisation for fixed-height rows: only rows near
 * the viewport are rendered, so a 3,000-chapter list stays cheap.
 */
export function useWindowVirtual(ref: RefObject<HTMLElement | null>, count: number, rowH: number, overscan = 8) {
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 30) });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = el.getBoundingClientRect().top;
      const start = Math.max(0, Math.floor(-top / rowH) - overscan);
      const end = Math.min(count, Math.ceil((window.innerHeight - top) / rowH) + overscan);
      setRange((r) => (r.start === start && r.end === Math.max(start, end) ? r : { start, end: Math.max(start, end) }));
    };
    const on = () => (raf ||= requestAnimationFrame(update));
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, [ref, count, rowH, overscan]);
  return range;
}
