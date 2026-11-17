import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Horizontal shelf: native scroll + snap on touch, arrow buttons on desktop. */
export function Row({ id, title, subtitle, more, children, ranked, className = "", action }: { id: string; title: string; subtitle?: string; more?: string; children: ReactNode; ranked?: boolean; className?: string; action?: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  const by = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: "smooth" });
  const hid = `row-${id}`;
  return (
    <section className={`section row ${ranked ? "row-ranked" : ""} ${className}`} aria-labelledby={hid}>
      <div className="section-head">
        <div>
          <h2 id={hid}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
        {more && (
          <Link to={more} aria-label={`See all: ${title}`}>
            See all <ChevronRight size={16} />
          </Link>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <div className="row-nav" data-side="prev">
          <button onClick={() => by(-1)} disabled={edges.start} aria-label="Scroll left" tabIndex={-1}>
            <ChevronLeft size={18} />
          </button>
        </div>
        <div className="row-track" ref={track}>
          {children}
        </div>
        <div className="row-nav" data-side="next">
          <button onClick={() => by(1)} disabled={edges.end} aria-label="Scroll right" tabIndex={-1}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
