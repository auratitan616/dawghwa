/**
 * Cosmetic rewards. Unlocks are derived (quests completed, level reached); only
 * the *equipped* choice is stored, on the profile record, so it travels with
 * export/import. Colours come from existing tokens only.
 */
export type CosmeticKind = "frame" | "emblem";

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  /** Unlock rule, in plain words for locked items. */
  needs: { quests?: number; level?: number };
}

export const FRAMES: Cosmetic[] = [
  { id: "none", kind: "frame", name: "No frame", needs: {} },
  { id: "lime", kind: "frame", name: "Lime ring", needs: { quests: 1 } },
  { id: "lavender", kind: "frame", name: "Lavender halo", needs: { quests: 3 } },
  { id: "dots", kind: "frame", name: "Ink dots", needs: { level: 5 } },
  { id: "stamp", kind: "frame", name: "Vermilion stamp", needs: { quests: 6 } },
  { id: "double", kind: "frame", name: "Double ring", needs: { quests: 10 } },
  { id: "sparkle", kind: "frame", name: "Sparkles", needs: { quests: 15 } },
];

/** Mascot accessories beyond the automatic tier emblem. */
export const EMBLEMS: Cosmetic[] = [
  { id: "tier", kind: "emblem", name: "Tier emblem", needs: {} },
  { id: "star", kind: "emblem", name: "Star pin", needs: { quests: 2 } },
  { id: "leaf", kind: "emblem", name: "Leaf pin", needs: { quests: 4 } },
  { id: "moon", kind: "emblem", name: "Night-owl moon", needs: { quests: 8 } },
  { id: "flame", kind: "emblem", name: "Ember pin", needs: { quests: 12 } },
  { id: "heart", kind: "emblem", name: "Heart pin", needs: { quests: 20 } },
];

export const unlocked = (c: Cosmetic, quests: number, level: number) => quests >= (c.needs.quests ?? 0) && level >= (c.needs.level ?? 0);
export const needsLabel = (c: Cosmetic) => (c.needs.quests ? `${c.needs.quests} ${c.needs.quests === 1 ? "quest" : "quests"}` : c.needs.level ? `Level ${c.needs.level}` : "Always");

/** Next cosmetic a quest count unlocks (for the "Unlocks ..." hint on quest cards). */
export function nextQuestUnlock(quests: number): Cosmetic | undefined {
  return [...FRAMES, ...EMBLEMS].filter((c) => (c.needs.quests ?? 0) > quests).sort((a, b) => a.needs.quests! - b.needs.quests!)[0];
}

export function newlyUnlocked(before: { quests: number; level: number }, after: { quests: number; level: number }): Cosmetic[] {
  return [...FRAMES, ...EMBLEMS].filter((c) => !unlocked(c, before.quests, before.level) && unlocked(c, after.quests, after.level));
}
