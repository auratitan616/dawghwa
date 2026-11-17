import type { LibraryRecord, ProgressRecord } from "../store/db";
import type { Title } from "../titles";

const DAY = 86_400_000;

export interface ReadingStats {
  chaptersRead: number;
  seriesStarted: number;
  completed: number;
  favourites: number;
  /** Genres across series the reader has read or saved, most frequent first. */
  genres: [string, number][];
  /** Chapters finished per day, oldest first, ending today (local time). */
  days: { date: number; count: number }[];
  thisMonth: number;
  lastMonth: number;
  activeDays: number;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Profile statistics derived only from data already stored on the device:
 * finished-chapter timestamps (progress.read), library records and cached titles.
 */
export function readingStats(progress: Iterable<ProgressRecord>, library: Iterable<LibraryRecord>, titles: Map<string, Title>, now = Date.now(), dayCount = 84): ReadingStats {
  const prog = [...progress];
  const lib = [...library];
  const today = startOfDay(now);
  const first = today - (dayCount - 1) * DAY;
  const perDay = new Map<number, number>();
  const n = new Date(now);
  const monthStart = new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  const lastMonthStart = new Date(n.getFullYear(), n.getMonth() - 1, 1).getTime();
  let chaptersRead = 0;
  let thisMonth = 0;
  let lastMonth = 0;
  for (const p of prog) {
    for (const at of Object.values(p.read)) {
      chaptersRead++;
      if (at >= monthStart) thisMonth++;
      else if (at >= lastMonthStart) lastMonth++;
      const d = startOfDay(at);
      if (d >= first) perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
  }
  const days = Array.from({ length: dayCount }, (_, i) => {
    const date = first + i * DAY;
    return { date, count: perDay.get(startOfDay(date + DAY / 2)) ?? 0 };
  });
  const keys = new Set([...prog.filter((p) => Object.keys(p.read).length).map((p) => p.titleKey), ...lib.filter((r) => r.status || r.favorite).map((r) => r.titleKey)]);
  const g = new Map<string, number>();
  for (const k of keys) for (const name of titles.get(k)?.meta?.genres ?? []) g.set(name, (g.get(name) ?? 0) + 1);
  return {
    chaptersRead,
    seriesStarted: prog.filter((p) => Object.keys(p.read).length || p.page > 0).length,
    completed: lib.filter((r) => r.status === "completed").length,
    favourites: lib.filter((r) => r.favorite).length,
    genres: [...g.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    days,
    thisMonth,
    lastMonth,
    activeDays: days.filter((d) => d.count > 0).length,
  };
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
  /** Current value and goal, for a quiet progress hint on locked ones. */
  value: number;
  goal: number;
}

/** Optional, milestone-only achievements. No streaks, no daily targets, nothing that can be "lost". */
export function achievements(s: ReadingStats, collections = 0): Achievement[] {
  const a = (id: string, title: string, detail: string, value: number, goal: number): Achievement => ({ id, title, detail, value: Math.min(value, goal), goal, earned: value >= goal });
  return [
    a("first-chapter", "First page turned", "Finish your first chapter", s.chaptersRead, 1),
    a("ten-chapters", "Hooked", "Finish 10 chapters", s.chaptersRead, 10),
    a("hundred-chapters", "One more chapter", "Finish 100 chapters", s.chaptersRead, 100),
    a("five-series", "Story hopper", "Start 5 different series", s.seriesStarted, 5),
    a("first-complete", "The end", "Mark a series completed", s.completed, 1),
    a("genres", "Wide reader", "Read or save series across 8 genres", s.genres.length, 8),
    a("collection", "Curator", "Create a collection", collections, 1),
  ];
}
