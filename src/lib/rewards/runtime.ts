import { celebrate } from "@/components/Celebrate";
import { getSettings } from "../settings";
import { getUser, onSignal } from "../store/user";
import { gains, progressionFor, type Gains } from "./index";

/**
 * Turns new events into reward moments. Only events that can change progression
 * are considered (a finished chapter or series). A screen that wants to present
 * gains itself (the Reader's chapter-end panel) registers a sink; otherwise a
 * reward card is shown. Nothing here ever fires mid-chapter: `chapter_read` is
 * emitted only when the last page is reached.
 */
type Sink = (g: Gains) => void;
let sink: Sink | null = null;
export function setRewardSink(fn: Sink | null) {
  sink = fn;
}

const RELEVANT = new Set(["chapter_read", "title_finished", "favorite", "quest_done"]);

export function describe(g: Gains): { kind: "level" | "badge" | "genre" | "series" | "chapter"; title: string; detail?: string; mascot?: boolean } | null {
  if (g.levelUp) return { kind: "level", title: `Level ${g.levelUp.level} · ${g.levelUp.tier.name}`, detail: g.levelUp.tier.from === g.levelUp.level ? `New mascot accessory: ${g.levelUp.tier.accessory}` : `+${g.xp} XP`, mascot: true };
  if (g.completed) return { kind: "series", title: "Series complete", detail: `+${g.xp} XP`, mascot: true };
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
    const g = gains(before, after);
    if (!g.xp && !g.tiers.length) return;
    if (sink) return sink(g);
    const d = describe(g);
    if (d) celebrate(d);
  });
}
