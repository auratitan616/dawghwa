import type { ReactNode } from "react";

/**
 * Circular progress. `value` is 0..1 and is only shown when both sides are known
 * (callers pass undefined otherwise, and the ring is not rendered). The fill animates
 * with --dur-ring, which reduced motion sets to 0.
 */
export function ProgressRing({ value, size = 40, stroke = 4, label, children, tone = "xp", className = "" }: { value: number; size?: number; stroke?: number; label?: string; children?: ReactNode; tone?: "xp" | "quest" | "ink"; className?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`ring ring-${tone} ${className}`} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {children !== undefined && <span className="ring-inner">{children}</span>}
    </span>
  );
}
