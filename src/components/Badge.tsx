import type { ComponentType } from "react";
import { Lock } from "lucide-react";
import { ProgressRing } from "./ProgressRing";

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/**
 * Achievement medallion. `tier` is how many tiers are earned (0 = locked).
 * Locked badges read as goals, not disabled controls: full-contrast name and a
 * progress ring toward the next tier.
 */
export function Badge({ icon: Icon, name, tier, tiers, progress, hint, size = 64 }: { icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; name: string; tier: number; tiers: number; progress?: number; hint?: string; size?: number }) {
  const maxed = tier >= tiers;
  const state = tier === 0 ? "locked" : maxed ? "max" : "earned";
  return (
    <div className="badge" data-state={state} data-tier={Math.min(tier, 3)}>
      <span className="badge-medal" style={{ width: size, height: size }}>
        {!maxed && <ProgressRing value={progress ?? 0} size={size} stroke={3} tone={tier === 0 ? "ink" : "xp"} className="badge-ring" />}
        <span className="badge-face" aria-hidden="true">
          {tier === 0 ? <Lock size={Math.round(size * 0.26)} aria-hidden /> : <Icon size={Math.round(size * 0.36)} aria-hidden />}
        </span>
        {tier > 0 && <span className="badge-tier">{ROMAN[tier] ?? tier}</span>}
      </span>
      <span className="badge-name">{name}</span>
      {hint && <span className="badge-hint">{hint}</span>}
      <span className="sr-only">{tier === 0 ? "Locked." : `Tier ${tier} of ${tiers}.`}</span>
    </div>
  );
}
