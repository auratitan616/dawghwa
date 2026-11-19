import { useMemo } from "react";
import { allCollections, useUser, type UserState } from "../store/user";
import { achievementSets, ledger, levelFor, passport, type AchievementSet, type Ledger, type Level, type Stamp, type XpEntry } from "./progression";

export * from "./progression";

export interface Progression {
  ledger: Ledger;
  level: Level;
  sets: AchievementSet[];
  stamps: Stamp[];
}

/** Hooks for later phases (quests, comments) to add derived inputs without new stores. */
type Extra = (s: UserState) => { xp?: XpEntry[]; quests?: number; comments?: number };
const extras = new Set<Extra>();
export function registerProgressionInput(fn: Extra) {
  extras.add(fn);
  return () => extras.delete(fn);
}

export function progressionFor(s: UserState, events = s.events): Progression {
  let xp: XpEntry[] = [];
  let quests = 0;
  let comments = 0;
  for (const f of extras) {
    const r = f({ ...s, events });
    if (r.xp) xp = xp.concat(r.xp);
    quests += r.quests ?? 0;
    comments += r.comments ?? 0;
  }
  const l = ledger(events, s.titles, xp);
  return { ledger: l, level: levelFor(l.total), sets: achievementSets({ ledger: l, library: s.library.values(), collections: allCollections(s).length, quests, comments }), stamps: passport(l) };
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
