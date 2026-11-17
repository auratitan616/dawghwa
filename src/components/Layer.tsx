import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { onBack } from "@/lib/platform";

/**
 * Modal layer (bottom sheet on phones, dialog on larger screens).
 * Back button / Escape close it, focus is trapped and restored.
 */
export function Sheet({ open, onClose, title, children, wide, hideTitle }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; hideTitle?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const off = onBack(() => {
      onClose();
      return true;
    });
    const el = ref.current;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((x) => !x.hasAttribute("disabled"));
    requestAnimationFrame(() => (focusables()[1] ?? focusables()[0] ?? el)?.focus());
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      off();
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="layer">
      <div className="backdrop" onClick={onClose} />
      <div ref={ref} className={`sheet ${wide ? "sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head" style={hideTitle ? { position: "absolute", right: 12, top: 8 } : undefined}>
          <h2 id={id} className={hideTitle ? "sr-only" : undefined}>
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
