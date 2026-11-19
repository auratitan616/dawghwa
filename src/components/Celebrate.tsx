import { useEffect, useSyncExternalStore, type ComponentType } from "react";
import { Award, BookOpenCheck, Compass, Crown, Flag, Sparkles, Stamp } from "lucide-react";
import { getSettings, reducedMotion } from "@/lib/settings";
import { haptic } from "@/lib/platform";
import { Mascot } from "./Mascot";

/**
 * Reward primitive. One quiet card at the top of the screen with an optional
 * mascot reaction and a success haptic. It never blocks input, never stacks more
 * than two, and does nothing when Profile > Rewards is off. Under reduced motion
 * it appears and leaves instantly (motion tokens are zeroed) and haptics are skipped.
 *
 * Callers decide *when*: reward beats are only raised between chapters or after
 * an explicit action, never while a chapter is being read.
 */
export type RewardKind = "chapter" | "level" | "badge" | "quest" | "series" | "genre" | "cosmetic";

export interface Reward {
  id: number;
  kind: RewardKind;
  title: string;
  detail?: string;
  /** Show the mascot reacting (level-ups, series complete). */
  mascot?: boolean;
}

const ICON: Record<RewardKind, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  chapter: BookOpenCheck,
  level: Crown,
  badge: Award,
  quest: Flag,
  series: Sparkles,
  genre: Stamp,
  cosmetic: Compass,
};

let queue: Reward[] = [];
let n = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function celebrate(r: Omit<Reward, "id">, opts: { haptics?: boolean } = {}) {
  if (!getSettings().rewards) return;
  const item = { ...r, id: ++n };
  queue = [...queue.slice(-1), item];
  emit();
  if (opts.haptics !== false && !reducedMotion()) void haptic(r.kind === "level" || r.kind === "series" ? "success" : "light");
}

export function dismissReward(id: number) {
  queue = queue.filter((q) => q.id !== id);
  emit();
}

/** Test helper. */
export function pendingRewards() {
  return queue;
}

function RewardCard({ r }: { r: Reward }) {
  const Icon = ICON[r.kind];
  useEffect(() => {
    const ms = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--dur-celebrate")) || 3200;
    const tm = window.setTimeout(() => dismissReward(r.id), ms);
    return () => window.clearTimeout(tm);
  }, [r.id]);
  return (
    <div className="reward-card" data-kind={r.kind}>
      {r.mascot ? (
        <span className="reward-mascot" aria-hidden="true">
          <Mascot variant="face" size={40} className="reward-mascot-img" />
        </span>
      ) : (
        <span className="reward-ico" aria-hidden="true">
          <Icon size={18} aria-hidden />
        </span>
      )}
      <span className="reward-body">
        <b>{r.title}</b>
        {r.detail && <span>{r.detail}</span>}
      </span>
      <button className="reward-close" aria-label="Dismiss" onClick={() => dismissReward(r.id)}>
        ×
      </button>
    </div>
  );
}

/** Mount once per full-screen layout (Shell, Reader). */
export function Celebrations() {
  const list = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => queue,
    () => queue,
  );
  return (
    <div className="rewards-host" role="status" aria-live="polite">
      {list.map((r) => (
        <RewardCard key={r.id} r={r} />
      ))}
    </div>
  );
}
