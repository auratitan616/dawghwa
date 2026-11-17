import { useSyncExternalStore } from "react";

export interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

let toasts: ToastMsg[] = [];
let n = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function toast(text: string, action?: ToastMsg["action"], ms = 4500) {
  const t = { id: ++n, text, action };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => dismiss(t.id), ms);
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toasts() {
  const list = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
