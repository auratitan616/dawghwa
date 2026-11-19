import type { EventRecord } from "../store/db";
import type { Title } from "../titles";
import { GENRES, genreKey, genrePath } from "../genres";

/**
 * Weekly quests, generated on the device. Three per week, picked by a seed of
 * (profile id, ISO week), and chosen only from what happened *before* the week
 * started, so any past week can be recomputed exactly from the event log.
 * Completion is derived from events inside the week, with the same farm-proof
 * rule as XP (only the first completion of a chapter counts). Quests never
 * nag: unfinished ones simply go away on Monday, and nothing is lost.
 */

export const DAY = 86_400_000;

/** Local Monday 00:00 of the week containing t. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
export const nextWeek = (start: number) => {
  const d = new Date(start);
  d.setDate(d.getDate() + 7);
  return d.getTime();
};

/** ISO-8601 week label, e.g. 2026-W47. */
export function isoWeek(t: number): string {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const firstThu = new Date(d.getFullYear(), 0, 4);
  const w = 1 + Math.round(((d.getTime() - firstThu.getTime()) / DAY - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(w).padStart(2, "0")}`;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/**
 * Weekly quest seed for a profile. Derived from the profile id (not the id
 * itself, so exports don't carry it) and kept on import, so an imported
 * profile gets the same quests and the same progression.
 */
export function questSeedOf(p: { id: string; questSeed?: string } | null | undefined): string {
  if (!p) return "";
  return p.questSeed ?? `q${hash(p.id).toString(36)}`;
}
export function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type QuestKind = "read" | "genre" | "new_series" | "surprise" | "days" | "deep" | "finish" | "react" | "comment";

export interface Quest {
  id: string;
  kind: QuestKind;
  week: string;
  title: string;
  detail: string;
  goal: number;
  value: number;
  doneAt?: number;
  /** Where to go to make progress (linked to the recommender where it can be). */
  action: { label: string; to: string };
  genre?: string;
}

/** Cumulative reading state before a week starts. */
interface Before {
  chapters: Set<string>;
  series: Set<string>;
  genres: Set<string>;
  activeWeeks: number;
  chaptersTotal: number;
  completedSeries: number;
}

interface WeekInput {
  profileId: string;
  start: number;
  before: Before;
  titles: Map<string, Title>;
}

/**
 * Templates only ever get added, each with the first week it can appear, so a
 * new release never changes the quests (and rewards) of weeks already past.
 */
const SINCE_COMMENTS = new Date(2026, 10, 23).getTime();

interface Template {
  kind: QuestKind;
  slot: "discover" | "read" | "any";
  when?: (i: WeekInput) => boolean;
  make: (i: WeekInput, r: () => number) => Omit<Quest, "id" | "week" | "value" | "doneAt" | "kind">;
}

const pick = <T,>(xs: T[], r: () => number) => xs[Math.floor(r() * xs.length)]!;

const TEMPLATES: Template[] = [
  {
    kind: "genre",
    slot: "discover",
    make: (i, r) => {
      const untried = GENRES.filter((g) => !i.before.genres.has(genreKey(g)));
      const g = pick(untried.length ? untried : GENRES, r);
      return { title: `Try ${g}`, detail: untried.length ? `Read a chapter in a genre you haven't tried yet.` : `Read a chapter in ${g}.`, goal: 1, action: { label: `Browse ${g}`, to: genrePath(g) }, genre: g };
    },
  },
  { kind: "surprise", slot: "discover", make: () => ({ title: "Take a Surprise Me pick", detail: "Use Surprise me, then read a chapter of what it found.", goal: 1, action: { label: "Surprise me", to: "/?surprise=1" } }) },
  { kind: "new_series", slot: "discover", make: () => ({ title: "Start something new", detail: "Finish the first chapter of a series you've never read.", goal: 1, action: { label: "Find a series", to: "/discover" } }) },
  {
    kind: "read",
    slot: "read",
    make: (i) => {
      const avg = i.before.activeWeeks ? i.before.chaptersTotal / i.before.activeWeeks : 0;
      const n = avg < 4 ? 3 : avg < 10 ? 5 : 8;
      return { title: `Read ${n} chapters`, detail: "Any series. Only chapters read to the last page count.", goal: n, action: { label: "Continue reading", to: "/library" } };
    },
  },
  { kind: "days", slot: "read", make: () => ({ title: "Read on 3 different days", detail: "Any three days this week. Days off are part of it.", goal: 3, action: { label: "Continue reading", to: "/library" } }) },
  { kind: "deep", slot: "read", when: (i) => i.before.series.size > 0, make: () => ({ title: "Keep a story going", detail: "Read 3 chapters of one series you've already started.", goal: 3, action: { label: "Your library", to: "/library" } }) },
  { kind: "finish", slot: "any", when: (i) => i.before.series.size >= 3, make: () => ({ title: "Finish a series", detail: "Read a completed series to its final chapter.", goal: 1, action: { label: "Completed series", to: "/discover?status=completed&order=latest" } }) },
  { kind: "react", slot: "any", make: () => ({ title: "Tune your picks", detail: "Like or pass on 3 series. It teaches your recommendations.", goal: 3, action: { label: "Discover", to: "/discover" } }) },
  { kind: "comment", slot: "any", when: (i) => i.start >= SINCE_COMMENTS, make: () => ({ title: "Leave a margin note", detail: "Write a comment at the end of a chapter.", goal: 1, action: { label: "Continue reading", to: "/library" } }) },
];

/** The three quests for a week (without progress). Pure and reproducible. */
export function questsForWeek(i: WeekInput): Omit<Quest, "value" | "doneAt">[] {
  const week = isoWeek(i.start + 3 * DAY);
  const r = rng(`${i.profileId}|${week}`);
  const ok = TEMPLATES.filter((t) => !t.when || t.when(i));
  const chosen: Template[] = [];
  for (const slot of ["discover", "read"] as const) chosen.push(pick(ok.filter((t) => t.slot === slot), r));
  chosen.push(pick(ok.filter((t) => !chosen.includes(t)), r));
  return chosen.map((t) => ({ ...t.make(i, r), kind: t.kind, week, id: `${week}:${t.kind}` }));
}

// ------------------------------------------------------------------ progress

interface WeekEvents {
  /** First-ever chapter completions in the week: [titleKey, at]. */
  firsts: { titleKey: string; at: number }[];
  events: EventRecord[];
}

function progress(q: Omit<Quest, "value" | "doneAt">, w: WeekEvents, i: WeekInput): { value: number; doneAt?: number } {
  let value = 0;
  let doneAt: number | undefined;
  const hit = (at: number, v: number) => {
    value = Math.min(q.goal, v);
    if (value >= q.goal && doneAt === undefined) doneAt = at;
  };
  switch (q.kind) {
    case "read":
      w.firsts.forEach((f, n) => hit(f.at, n + 1));
      break;
    case "genre": {
      const g = genreKey(q.genre ?? "");
      const f = w.firsts.find((x) => (i.titles.get(x.titleKey)?.meta?.genres ?? []).some((n) => genreKey(n) === g));
      if (f) hit(f.at, 1);
      break;
    }
    case "new_series": {
      const f = w.firsts.find((x) => !i.before.series.has(x.titleKey));
      if (f) hit(f.at, 1);
      break;
    }
    case "surprise": {
      const picked = new Map<string, number>();
      for (const e of w.events) if (e.kind === "surprise_pick" && !picked.has(e.titleKey)) picked.set(e.titleKey, e.at);
      const f = w.firsts.find((x) => (picked.get(x.titleKey) ?? Infinity) <= x.at);
      if (f) hit(f.at, 1);
      break;
    }
    case "days": {
      const days = new Set<number>();
      for (const f of w.firsts) {
        const d = new Date(f.at);
        d.setHours(0, 0, 0, 0);
        days.add(d.getTime());
        hit(f.at, days.size);
      }
      break;
    }
    case "deep": {
      const per = new Map<string, number>();
      let best = 0;
      for (const f of w.firsts) {
        if (!i.before.series.has(f.titleKey)) continue;
        per.set(f.titleKey, (per.get(f.titleKey) ?? 0) + 1);
        best = Math.max(best, per.get(f.titleKey)!);
        hit(f.at, best);
      }
      break;
    }
    case "finish": {
      const e = w.events.find((x) => x.kind === "title_finished" && x.context === "reader");
      if (e) hit(e.at, 1);
      break;
    }
    case "react": {
      const seen = new Set<string>();
      for (const e of w.events)
        if (e.kind === "like" || e.kind === "dislike" || e.kind === "not_interested") {
          seen.add(e.titleKey);
          hit(e.at, seen.size);
        }
      break;
    }
    case "comment": {
      const e = w.events.find((x) => x.kind === "comment");
      if (e) hit(e.at, 1);
      break;
    }
  }
  return { value, doneAt };
}

export interface QuestBook {
  /** This week's three quests with progress. */
  current: Quest[];
  /** Every completed quest, all weeks, oldest first. */
  done: Quest[];
  weekStart: number;
}

/** Walk the log week by week, generating and scoring each week's quests. */
export function questBook(profileId: string, events: EventRecord[], titles: Map<string, Title>, now = Date.now()): QuestBook {
  const evs = [...events].sort((a, b) => a.at - b.at || a.seq - b.seq);
  const current = weekStart(now);
  const before: Before = { chapters: new Set(), series: new Set(), genres: new Set(), activeWeeks: 0, chaptersTotal: 0, completedSeries: 0 };
  const done: Quest[] = [];
  let k = 0;
  let start = evs.length ? weekStart(evs[0]!.at) : current;
  let result: Quest[] = [];
  while (start <= current) {
    const end = nextWeek(start);
    const inWeek: EventRecord[] = [];
    while (k < evs.length && evs[k]!.at < end) inWeek.push(evs[k++]!);
    const input: WeekInput = { profileId, start, before, titles };
    // Only weeks with activity can complete quests; quiet weeks are skipped cheaply.
    if (inWeek.length || start === current) {
      const firsts: WeekEvents["firsts"] = [];
      const seen = new Set(before.chapters);
      for (const e of inWeek)
        if (e.kind === "chapter_read") {
          const id = `${e.titleKey}|${e.value ?? "?"}`;
          if (!seen.has(id)) {
            seen.add(id);
            firsts.push({ titleKey: e.titleKey, at: e.at });
          }
        }
      const qs = questsForWeek(input).map((q) => ({ ...q, ...progress(q, { firsts, events: inWeek }, input) }));
      for (const q of qs) if (q.doneAt !== undefined) done.push(q);
      if (start === current) result = qs;
      // fold the week into the "before" state
      for (const f of firsts) {
        before.series.add(f.titleKey);
        for (const g of titles.get(f.titleKey)?.meta?.genres ?? []) before.genres.add(genreKey(g));
      }
      for (const id of seen) before.chapters.add(id);
      if (firsts.length) {
        before.activeWeeks++;
        before.chaptersTotal += firsts.length;
      }
    }
    start = end;
  }
  return { current: result, done, weekStart: current };
}
