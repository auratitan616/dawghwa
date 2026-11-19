import type { EventRecord } from "../store/db";
import { weekStart } from "./quests";

/**
 * Opt-in reading rhythm: "about N days a week". Not a streak. Nothing resets
 * and there is no failure state; the page only counts the weeks it happened
 * (lifetime, never "in a row") and labels the other days as rest days.
 */
export interface Rhythm {
  target: number;
  /** Mon..Sun for the current week: read that day? */
  week: { date: number; read: boolean; future: boolean }[];
  daysThisWeek: number;
  /** Weeks (ever) with at least `target` reading days. */
  weeksMet: number;
}

export function rhythm(events: EventRecord[], target: number, now = Date.now()): Rhythm {
  const days = new Set<number>();
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.kind !== "chapter_read") continue;
    const id = `${e.titleKey}|${e.value ?? "?"}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const d = new Date(e.at);
    d.setHours(0, 0, 0, 0);
    days.add(d.getTime());
  }
  const perWeek = new Map<number, number>();
  for (const d of days) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  const start = weekStart(now);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const t = d.getTime();
    return { date: t, read: days.has(t), future: t > today.getTime() };
  });
  return { target, week, daysThisWeek: week.filter((d) => d.read).length, weeksMet: target > 0 ? [...perWeek.values()].filter((n) => n >= target).length : 0 };
}
