import { celebrate } from "@/components/Celebrate";
import { getSettings } from "../settings";
import { getUser, onSignal } from "../store/user";
import { gains, progressionFor, type Gains, type Progression, type Quest } from "./index";
import { newlyUnlocked, type Cosmetic } from "./cosmetics";

/**
 * Turns new events into reward moments. Only events that can change progression
 * are considered (a finished chapter or series). A screen that wants to present
 * gains itself (the Reader's chapter-end panel) registers a sink; otherwise a
 * reward card is shown. Nothing here ever fires mid-chapter: `chapter_read` is
 * emitted only when the last page is reached.
 */
export interface Moment extends Gains {
  quests: Quest[];
  unlocks: Cosmetic[];
  after: Progression;
}
type Sink = (g: Moment) => void;
let sink: Sink | null = null;
export function setRewardSink(fn: Sink | null) {
  sink = fn;
}

const RELEVANT = new Set(["chapter_read", "title_finished", "favorite", "like", "dislike", "not_interested", "surprise_pick", "comment"]);

export function describe(g: Moment): { kind: "level" | "badge" | "genre" | "series" | "quest" | "cosmetic"; title: string; detail?: string; mascot?: boolean } | null {
  if (g.levelUp) return { kind: "level", title: `Level ${g.levelUp.level} · ${g.levelUp.tier.name}`, detail: g.levelUp.tier.from === g.levelUp.level ? `New mascot accessory: ${g.levelUp.tier.accessory}` : `+${g.xp} XP`, mascot: true };
  if (g.completed) return { kind: "series", title: "Series complete", detail: `+${g.xp} XP`, mascot: true };
  if (g.quests[0]) return { kind: "quest", title: `Quest done: ${g.quests[0].title}`, detail: g.unlocks[0] ? `Unlocked ${g.unlocks[0].name}` : "+50 XP" };
  if (g.unlocks[0]) return { kind: "cosmetic", title: `Unlocked ${g.unlocks[0].name}`, detail: "Wear it from Achievements" };
  const t = g.tiers[0];
  if (t) return { kind: "badge", title: `${t.set.name} ${["", "I", "II", "III", "IV", "V"][t.tier]}`, detail: t.set.rule };
  if (g.genres.length) return { kind: "genre", title: `New passport stamp: ${g.genres.join(", ")}`, detail: `+${g.xp} XP` };
  return null;
}

let started = false;
export function startRewards() {
  if (started) return;
  started = true;
  onSignal((e) => {
    if (!RELEVANT.has(e.kind) || !getSettings().rewards) return;
    const s = getUser();
    const before = progressionFor(s, s.events.filter((x) => x.seq !== e.seq));
    const after = progressionFor(s);
    const prevDone = new Set(before.quests.done.map((q) => q.id));
    const g: Moment = {
      ...gains(before, after),
      quests: after.quests.done.filter((q) => !prevDone.has(q.id)),
      unlocks: newlyUnlocked({ quests: before.quests.done.length, level: before.level.level }, { quests: after.quests.done.length, level: after.level.level }),
      after,
    };
    if (!g.xp && !g.tiers.length && !g.unlocks.length) return;
    if (sink) return sink(g);
    const d = describe(g);
    if (d) celebrate(d);
  });
}
