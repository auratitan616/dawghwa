import { BookMarked, Compass, Crown, Glasses, PawPrint, ScrollText } from "lucide-react";
import type { Level, Tier } from "@/lib/rewards/progression";
import { Mascot } from "./Mascot";
import { ProgressRing } from "./ProgressRing";

export const TIER_ICON: Record<Tier["id"], typeof Crown> = { pup: PawPrint, bookhound: BookMarked, scout: Compass, keeper: Glasses, archivist: ScrollText, legend: Crown };

/** The mascot inside the level ring, wearing the current tier's accessory as an emblem. */
export function LevelMascot({ level, size = 96 }: { level: Level; size?: number }) {
  const Icon = TIER_ICON[level.tier.id];
  return (
    <span className="level-mascot" style={{ width: size, height: size }}>
      <ProgressRing value={level.progress} size={size} stroke={Math.max(4, Math.round(size / 18))} label={`Level ${level.level}, ${level.into} of ${level.span} XP to the next level`}>
        <Mascot variant="head" size={Math.round(size * 0.74)} className="level-mascot-img" />
      </ProgressRing>
      <span className="level-emblem" data-tier={level.tier.id} title={level.tier.accessory} aria-hidden="true">
        <Icon size={Math.round(size * 0.17)} aria-hidden />
      </span>
    </span>
  );
}
