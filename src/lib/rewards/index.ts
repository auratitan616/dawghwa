import { useMemo } from "react";
import { allCollections, useUser, type UserState } from "../store/user";
import { XP, achievementSets, ledger, levelFor, passport, type AchievementSet, type Ledger, type Level, type Stamp, type XpEntry } from "./progression";
import { questBook, questSeedOf, type QuestBook } from "./quests";

export * from "./progression";
export { questBook, weekStart, isoWeek, type Quest, type QuestBook } from "./quests";

export interface Progression {
  ledger: Ledger;
  level: Level;
  sets: AchievementSet[];
  stamps: Stamp[];
  quests: QuestBook;
}

/** Hooks for later phases (quests, comments) to add derived inputs without new stores. */
type Extra = (s: UserState) => { xp?: XpEntry[]; comments?: number };

const extras = new Set<Extra>();
export function registerProgressionInput(fn: Extra) {
  extras.add(fn);
  return () => extras.delete(fn);
}

export function progressionFor(s: UserState, events = s.events, now = Date.now()): Progression {
  let xp: XpEntry[] = [];
  let comments = 0;
  for (const f of extras) {
    const r = f({ ...s, events });
    if (r.xp) xp = xp.concat(r.xp);
    comments += r.comments ?? 0;
  }
  const book = questBook(questSeedOf(s.profile), events, s.titles, now);
  xp = xp.concat(book.done.map((q) => ({ at: q.doneAt!, xp: XP.quest, reason: "quest" as const, ref: q.title })));
  const l = ledger(events, s.titles, xp);
  return { ledger: l, level: levelFor(l.total), sets: achievementSets({ ledger: l, library: s.library.values(), collections: allCollections(s).length, quests: book.done.length, comments }), stamps: passport(l), quests: book };
}

export function useProgression(): Progression {
  const events = useUser((s) => s.events);
  const titles = useUser((s) => s.titles);
  const library = useUser((s) => s.library);
  const version = useUser((s) => s.signalVersion);
  const state = useUser((s) => s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => progressionFor(state), [events, titles, library, version]);
}
