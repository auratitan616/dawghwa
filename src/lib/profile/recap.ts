import type { EventRecord } from "../store/db";
import type { Title } from "../titles";
import { ledger, type XpEntry } from "../rewards/progression";

export interface MonthRecap {
  /** First day of the month, local time. */
  start: number;
  end: number;
  label: string;
  chapters: number;
  newSeries: number;
  completed: number;
  /** Genres first stamped this month. */
  newGenres: string[];
  /** Genres read this month, most chapters first. */
  genres: [string, number][];
  /** Series with the most chapters this month. */
  top: { titleKey: string; chapters: number }[];
  activeDays: number;
  xp: number;
  /** Chapters in the month before, for a neutral comparison line. */
  previous: number;
}

const monthStart = (y: number, m: number) => new Date(y, m, 1).getTime();
const dayKey = (t: number) => new Date(t).toDateString();

/**
 * Monthly recap, derived from the same farm-proof ledger as XP (D14, D32): only the first
 * completion of each chapter counts, so re-reading never inflates a month.
 * `offset` 0 = this month, 1 = last month, and so on.
 */
export function monthRecap(events: Iterable<EventRecord>, titles: Map<string, Title>, offset = 0, now = Date.now(), entries?: XpEntry[]): MonthRecap {
  const n = new Date(now);
  const start = monthStart(n.getFullYear(), n.getMonth() - offset);
  const end = monthStart(n.getFullYear(), n.getMonth() - offset + 1);
  const prevStart = monthStart(n.getFullYear(), n.getMonth() - offset - 1);
  const all = entries ?? ledger(events, titles).entries;
  const inMonth = all.filter((e) => e.at >= start && e.at < end);
  const chapters = inMonth.filter((e) => e.reason === "chapter");
  const perSeries = new Map<string, number>();
  const genres = new Map<string, number>();
  const days = new Set<string>();
  for (const c of chapters) {
    if (c.titleKey) perSeries.set(c.titleKey, (perSeries.get(c.titleKey) ?? 0) + 1);
    days.add(dayKey(c.at));
    for (const g of (c.titleKey && titles.get(c.titleKey)?.meta?.genres) || []) genres.set(g, (genres.get(g) ?? 0) + 1);
  }
  return {
    start,
    end,
    label: new Date(start).toLocaleDateString(undefined, { month: "long", year: n.getFullYear() === new Date(start).getFullYear() ? undefined : "numeric" }),
    chapters: chapters.length,
    newSeries: inMonth.filter((e) => e.reason === "series").length,
    completed: inMonth.filter((e) => e.reason === "complete").length,
    newGenres: inMonth.filter((e) => e.reason === "genre").map((e) => String(e.ref)),
    genres: [...genres.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    top: [...perSeries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([titleKey, c]) => ({ titleKey, chapters: c })),
    activeDays: days.size,
    xp: inMonth.reduce((s, e) => s + e.xp, 0),
    previous: all.filter((e) => e.reason === "chapter" && e.at >= prevStart && e.at < start).length,
  };
}

/** A neutral one-liner. Never guilt: a quieter month is just "a calmer month". */
export function recapLine(r: MonthRecap): string {
  if (!r.chapters) return r.previous ? "A resting month so far. Your shelf is waiting whenever you are." : "Nothing finished this month yet. One chapter starts the recap.";
  if (!r.previous) return `${r.chapters} ${r.chapters === 1 ? "chapter" : "chapters"} across ${r.activeDays} ${r.activeDays === 1 ? "day" : "days"}.`;
  if (r.chapters > r.previous) return `${r.chapters - r.previous} more chapters than the month before.`;
  if (r.chapters === r.previous) return "Same pace as the month before.";
  return "A calmer month than the one before. That counts too.";
}
