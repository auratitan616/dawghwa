import type { ReactNode } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { isApiError } from "@/lib/api/errors";
import { Mascot, type Pose } from "./Mascot";

export function CardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="cover skeleton" />
      <div className="skeleton skeleton-line" style={{ width: "85%" }} />
      <div className="skeleton skeleton-line" style={{ width: "50%" }} />
    </div>
  );
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="row-track" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Placeholder for profile-shaped pages while the local store opens (no flash of empty states). */
export function ProfileSkeleton() {
  return (
    <div className="page page-narrow" aria-busy="true" aria-label="Loading">
      <div className="skeleton-head">
        <div className="skeleton skeleton-avatar" />
        <div style={{ flex: 1 }}>
          <div className="skeleton skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton skeleton-line" style={{ width: "70%" }} />
        </div>
      </div>
      <div className="skeleton skeleton-block" />
      <div className="skeleton skeleton-block" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-thumb" />
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-line" style={{ width: "60%" }} />
            <div className="skeleton skeleton-line" style={{ width: "35%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action, pose = "empty", center }: { title: string; children?: ReactNode; action?: ReactNode; pose?: Pose; center?: boolean }) {
  return (
    <div className={`state ${center ? "state-center" : ""}`}>
      <Mascot pose={pose} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function errorText(e: unknown): { title: string; body: string; offline: boolean } {
  if (isApiError(e)) {
    if (e.kind === "offline") return { title: "You're offline", body: "Reconnect to load this. Your library and history are still here.", offline: true };
    if (e.unsupported) return { title: "Not available from this source", body: e.userMessage, offline: false };
    return { title: "Couldn't load this", body: e.userMessage, offline: false };
  }
  return { title: "Something went wrong", body: e instanceof Error ? e.message : "Please try again.", offline: false };
}

export function ErrorState({ error, retry, center, compact }: { error: unknown; retry?: () => void; center?: boolean; compact?: boolean }) {
  const t = errorText(error);
  if (compact)
    return (
      <div className="inline-state" role="alert">
        {t.offline && <WifiOff size={18} />}
        <span style={{ flex: 1 }}>
          <strong style={{ color: "var(--ink-2)" }}>{t.title}.</strong> {t.body}
        </span>
        {retry && (
          <button className="btn btn-sm" onClick={retry}>
            <RefreshCw size={14} /> Retry
          </button>
        )}
      </div>
    );
  return (
    <div className={`state ${center ? "state-center" : ""}`} role="alert">
      <Mascot pose={t.offline ? "offline" : "error"} />
      <h2>{t.title}</h2>
      <p>{t.body}</p>
      {retry && (
        <button className="btn" onClick={retry}>
          <RefreshCw size={16} /> Try again
        </button>
      )}
    </div>
  );
}
