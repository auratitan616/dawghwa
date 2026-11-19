import { describe, expect, it } from "vitest";
import type { EventRecord } from "../store/db";
import type { Title } from "../titles";
import { isoWeek, questBook, questsForWeek, weekStart } from "./quests";
import { rhythm } from "./rhythm";
import { FRAMES, newlyUnlocked, nextQuestUnlock, unlocked } from "./cosmetics";

let seq = 0;
const ev = (kind: string, titleKey: string, at: number, extra: Partial<EventRecord> = {}): EventRecord => ({ profileId: "p", seq: ++seq, kind, titleKey, at, ...extra });
const title = (key: string, genres: string[]) => ({ key, title: key, meta: { genres } }) as unknown as Title;
const titles = new Map([title("a", ["Action"]), title("b", ["Romance"]), title("c", ["Horror"])].map((t) => [t.key, t]));
const DAY = 86_400_000;
// Wednesday 18 Nov 2026, noon local
const WED = new Date(2026, 10, 18, 12).getTime();
const MON = new Date(2026, 10, 16).getTime();

const empty = { chapters: new Set<string>(), series: new Set<string>(), genres: new Set<string>(), activeWeeks: 0, chaptersTotal: 0, completedSeries: 0 };

describe("weeks", () => {
  it("starts on local Monday and labels ISO weeks", () => {
    expect(weekStart(WED)).toBe(MON);
    expect(weekStart(MON)).toBe(MON);
    expect(isoWeek(WED)).toBe("2026-W47");
    expect(isoWeek(new Date(2027, 0, 1).getTime())).toBe("2026-W53");
  });
});

describe("quest generation", () => {
  it("gives three distinct quests, the same for the same profile and week", () => {
    const a = questsForWeek({ profileId: "p", start: MON, before: empty, titles });
    const b = questsForWeek({ profileId: "p", start: MON, before: empty, titles });
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.kind)).size).toBe(3);
    expect(a).toEqual(b);
  });
  it("always includes one discovery quest and one reading quest", () => {
    for (let w = 0; w < 30; w++) {
      const qs = questsForWeek({ profileId: `p${w}`, start: MON + w * 7 * DAY, before: empty, titles });
      expect(qs.some((q) => ["genre", "surprise", "new_series"].includes(q.kind))).toBe(true);
      expect(qs.some((q) => ["read", "days", "deep"].includes(q.kind))).toBe(true);
    }
  });
  it("suggests a genre the reader has not tried", () => {
    for (let w = 0; w < 40; w++) {
      const qs = questsForWeek({ profileId: `x${w}`, start: MON, before: { ...empty, genres: new Set(["action", "fantasy"]) }, titles });
      const g = qs.find((q) => q.kind === "genre");
      if (g) expect(["Action", "Fantasy"]).not.toContain(g.genre);
    }
  });
  it("varies between weeks", () => {
    const kinds = new Set<string>();
    for (let w = 0; w < 12; w++) questsForWeek({ profileId: "p", start: MON + w * 7 * DAY, before: empty, titles }).forEach((q) => kinds.add(q.kind));
    expect(kinds.size).toBeGreaterThan(4);
  });
});

describe("quest progress (farm-proof)", () => {
  const findWeekWith = (kind: string) => {
    for (let i = 0; i < 200; i++) {
      const id = `p${i}`;
      if (questsForWeek({ profileId: id, start: MON, before: empty, titles }).some((q) => q.kind === kind)) return id;
    }
    throw new Error(`no profile seed with ${kind}`);
  };
  it("counts only first completions of chapters for 'read N chapters'", () => {
    const id = findWeekWith("read");
    const repeat = Array.from({ length: 6 }, (_, i) => ev("chapter_read", "a", MON + DAY + i, { value: 1 }));
    const q = questBook(id, repeat, titles, WED).current.find((x) => x.kind === "read")!;
    expect(q.value).toBe(1);
    expect(q.doneAt).toBeUndefined();
    const real = Array.from({ length: 3 }, (_, i) => ev("chapter_read", "a", MON + DAY + i, { value: i + 1 }));
    expect(questBook(id, real, titles, WED).current.find((x) => x.kind === "read")!.doneAt).toBeDefined();
  });
  it("needs a chapter read after the Surprise Me pick", () => {
    const id = findWeekWith("surprise");
    const before = [ev("chapter_read", "b", MON + DAY, { value: 1 }), ev("surprise_pick", "b", MON + DAY + 5)];
    expect(questBook(id, before, titles, WED).current.find((x) => x.kind === "surprise")!.doneAt).toBeUndefined();
    const after = [ev("surprise_pick", "b", MON + DAY), ev("chapter_read", "b", MON + DAY + 5, { value: 1 })];
    expect(questBook(id, after, titles, WED).current.find((x) => x.kind === "surprise")!.doneAt).toBe(MON + DAY + 5);
  });
  it("counts completed quests across past weeks, reproducibly", () => {
    const evs = [0, 1, 2, 3].flatMap((w) => Array.from({ length: 9 }, (_, i) => ev("chapter_read", "abc"[i % 3]!, MON - w * 7 * DAY + (i % 4) * DAY + i, { value: w * 10 + i })));
    const a = questBook("p", evs, titles, WED);
    const b = questBook("p", [...evs].reverse(), titles, WED);
    expect(a.done.map((q) => q.id)).toEqual(b.done.map((q) => q.id));
    expect(a.done.length).toBeGreaterThan(0);
    expect(new Set(a.done.map((q) => q.id)).size).toBe(a.done.length);
  });
  it("offers the comment quest only from its launch week", () => {
    const old = Array.from({ length: 300 }, (_, i) => questsForWeek({ profileId: `c${i}`, start: MON, before: empty, titles })).flat();
    expect(old.some((q) => q.kind === "comment")).toBe(false);
    const next = Array.from({ length: 300 }, (_, i) => questsForWeek({ profileId: `c${i}`, start: MON + 7 * DAY, before: empty, titles })).flat();
    expect(next.some((q) => q.kind === "comment")).toBe(true);
  });
});

describe("rhythm", () => {
  it("counts reading days this week and weeks met, never a streak", () => {
    const evs = [ev("chapter_read", "a", MON + 1000, { value: 1 }), ev("chapter_read", "a", MON + 2000, { value: 2 }), ev("chapter_read", "a", MON + DAY, { value: 3 }), ev("chapter_read", "a", MON - 7 * DAY, { value: 4 }), ev("chapter_read", "a", MON - 6 * DAY, { value: 5 })];
    const r = rhythm(evs, 2, WED);
    expect(r.daysThisWeek).toBe(2);
    expect(r.week.map((d) => d.read)).toEqual([true, true, false, false, false, false, false]);
    expect(r.week[3]!.future).toBe(true);
    expect(r.weeksMet).toBe(2);
    expect(rhythm(evs, 0, WED).weeksMet).toBe(0);
  });
});

describe("cosmetics", () => {
  it("unlocks by quests or level and reports the next one", () => {
    expect(unlocked(FRAMES[1]!, 1, 1)).toBe(true);
    expect(unlocked(FRAMES[3]!, 50, 4)).toBe(false);
    expect(nextQuestUnlock(0)?.id).toBe("lime");
    expect(newlyUnlocked({ quests: 0, level: 1 }, { quests: 2, level: 1 }).map((c) => c.id)).toEqual(["lime", "star"]);
  });
});
