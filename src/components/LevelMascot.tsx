import { BookMarked, Compass, Crown, Flame, Glasses, Heart, Leaf, Moon, PawPrint, ScrollText, Star } from "lucide-react";
import type { Level, Tier } from "@/lib/rewards/progression";
import { Mascot } from "./Mascot";
import { ProgressRing } from "./ProgressRing";

export const EMBLEM_ICON: Record<string, typeof Crown> = { star: Star, leaf: Leaf, moon: Moon, flame: Flame, heart: Heart };

export const TIER_ICON: Record<Tier["id"], typeof Crown> = { pup: PawPrint, bookhound: BookMarked, scout: Compass, keeper: Glasses, archivist: ScrollText, legend: Crown };

/** The mascot inside the level ring, wearing the current tier's accessory as an emblem. */
export function LevelMascot({ level, size = 96, emblem }: { level: Level; size?: number; emblem?: string }) {
  const custom = emblem && emblem !== "tier" ? EMBLEM_ICON[emblem] : undefined;
  const Icon = custom ?? TIER_ICON[level.tier.id];
  return (
    <span className="level-mascot" style={{ width: size, height: size }}>
      <ProgressRing value={level.progress} size={size} stroke={Math.max(4, Math.round(size / 18))} label={`Level ${level.level}, ${level.into} of ${level.span} XP to the next level`}>
        <Mascot variant="head" size={Math.round(size * 0.74)} className="level-mascot-img" />
      </ProgressRing>
      <span className="level-emblem" data-tier={custom ? emblem : level.tier.id} title={custom ? undefined : level.tier.accessory} aria-hidden="true">
        <Icon size={Math.round(size * 0.17)} aria-hidden />
      </span>
    </span>
  );
}
