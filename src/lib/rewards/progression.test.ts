import { describe, expect, it } from "vitest";
import type { EventRecord } from "../store/db";
import type { Title } from "../titles";
import { XP, achievementSets, gains, ledger, levelFor, levelStart, makeSet, passport, stepCost, tierFor } from "./progression";

let seq = 0;
const ev = (kind: string, titleKey: string, at: number, extra: Partial<EventRecord> = {}): EventRecord => ({ profileId: "p", seq: ++seq, kind, titleKey, at, ...extra });
const title = (key: string, genres: string[]) => ({ key, title: key, meta: { genres } }) as unknown as Title;
const titles = new Map([title("a", ["Action", "Fantasy"]), title("b", ["Fantasy"]), title("c", ["Romance", "Cooking"])].map((t) => [t.key, t]));
const DAY = 86_400_000;
const T0 = new Date(2026, 10, 2, 12).getTime();

describe("ledger (farm-proofing)", () => {
  it("awards a chapter once, however many times it is finished", () => {
    const l = ledger([ev("chapter_read", "a", T0, { value: 1 }), ev("chapter_read", "a", T0 + 1, { value: 1 }), ev("chapter_read", "a", T0 + 2, { value: 1 })], titles);
    expect(l.chapters).toBe(1);
    expect(l.total).toBe(XP.chapter + XP.series + 2 * XP.genre);
  });
  it("ignores opens, favourites, likes and other signals", () => {
    const l = ledger([ev("open", "a", T0), ev("favorite", "a", T0), ev("like", "a", T0), ev("library_add", "a", T0), ev("return", "a", T0)], titles);
    expect(l.total).toBe(0);
  });
  it("only counts reader-earned completions with at least half the chapters read", () => {
    const manual = ledger([ev("chapter_read", "b", T0, { value: 1 }), ev("title_finished", "b", T0 + 1)], titles);
    expect(manual.completed).toBe(0);
    const lastOnly = ledger([ev("chapter_read", "b", T0, { value: 10 }), ev("title_finished", "b", T0 + 1, { context: "reader", value: 10 })], titles);
    expect(lastOnly.completed).toBe(0);
    const reads = Array.from({ length: 5 }, (_, i) => ev("chapter_read", "b", T0 + i, { value: i + 6 }));
    const real = ledger([...reads, ev("title_finished", "b", T0 + 9, { context: "reader", value: 10 }), ev("title_finished", "b", T0 + 10, { context: "reader", value: 10 })], titles);
    expect(real.completed).toBe(1);
    expect(real.entries.filter((e) => e.reason === "complete")).toHaveLength(1);
  });
  it("stamps each genre once and counts the series once", () => {
    const l = ledger([ev("chapter_read", "a", T0, { value: 1 }), ev("chapter_read", "a", T0 + DAY, { value: 2 }), ev("chapter_read", "b", T0 + 2 * DAY, { value: 1 })], titles);
    expect(l.series).toBe(2);
    expect([...l.genres.values()].map((g) => [g.name, g.chapters])).toEqual([["Action", 2], ["Fantasy", 3]]);
    expect(l.activeDays).toBe(3);
    expect(l.entries.filter((e) => e.reason === "genre")).toHaveLength(2);
  });
  it("is independent of event order in storage", () => {
    const evs = [ev("chapter_read", "a", T0 + 5, { value: 2 }), ev("chapter_read", "a", T0, { value: 1 })];
    expect(ledger(evs, titles).total).toBe(ledger([...evs].reverse(), titles).total);
  });
});

describe("levels", () => {
  it("has a gentle, increasing curve", () => {
    expect(stepCost(1)).toBe(60);
    expect(levelStart(2)).toBe(60);
    expect(levelStart(3)).toBe(160);
    expect(levelFor(0)).toMatchObject({ level: 1, into: 0, span: 60 });
    expect(levelFor(59).level).toBe(1);
    expect(levelFor(60).level).toBe(2);
    expect(levelFor(170)).toMatchObject({ level: 3, into: 10 });
  });
  it("names tiers and the next one", () => {
    expect(tierFor(1).name).toBe("Pup");
    expect(tierFor(3).name).toBe("Bookhound");
    expect(tierFor(40).name).toBe("Legend");
    expect(levelFor(0).nextTier?.name).toBe("Bookhound");
    expect(levelFor(1e9).nextTier).toBeUndefined();
  });
});

describe("achievement sets", () => {
  it("reports tiers and a plain hint", () => {
    expect(makeSet("x", "X", "", 0, [1, 10], ["chapter", "chapters"])).toMatchObject({ tier: 0, hint: "1 more chapter for tier I", progress: 0 });
    expect(makeSet("x", "X", "", 4, [1, 10], ["chapter", "chapters"])).toMatchObject({ tier: 1, hint: "6 more chapters for tier II" });
    expect(makeSet("x", "X", "", 12, [1, 10], ["chapter", "chapters"])).toMatchObject({ tier: 2, progress: 1, hint: "All 2 tiers earned" });
  });
  it("derives every set from the ledger and library", () => {
    const l = ledger([ev("chapter_read", "a", T0, { value: 1 })], titles);
    const sets = achievementSets({ ledger: l, library: [{ profileId: "p", titleKey: "a", favorite: true, collections: [], addedAt: 0, updatedAt: 0 }], collections: 2 });
    const by = Object.fromEntries(sets.map((s) => [s.id, s.tier]));
    expect(by).toMatchObject({ chapters: 1, series: 1, complete: 0, favourites: 1, collections: 1, quests: 0 });
  });
});

describe("passport and gains", () => {
  it("lists headline genres then extra stamped ones", () => {
    const p = passport(ledger([ev("chapter_read", "c", T0, { value: 1 })], titles));
    expect(p.find((s) => s.name === "Romance")?.stamped).toBe(true);
    expect(p.find((s) => s.name === "Horror")?.stamped).toBe(false);
    expect(p.at(-1)?.name).toBe("Cooking");
  });
  it("detects level-ups, new tiers and new genres", () => {
    const before = ledger([], titles);
    const after = ledger(Array.from({ length: 5 }, (_, i) => ev("chapter_read", "a", T0 + i, { value: i + 1 })), titles);
    const s = (l: ReturnType<typeof ledger>) => ({ ledger: l, sets: achievementSets({ ledger: l, library: [], collections: 0 }) });
    const g = gains(s(before), s(after));
    expect(g.xp).toBe(after.total);
    expect(g.levelUp?.level).toBe(2);
    expect(g.genres).toEqual(["Action", "Fantasy"]);
    expect(g.tiers.map((t) => t.set.id)).toContain("chapters");
  });
});

describe("copy", () => {
  it("never mentions streaks as something to keep or lose", () => {
    const sets = achievementSets({ ledger: ledger([], titles), library: [], collections: 0 });
    for (const s of sets) expect(`${s.name} ${s.rule} ${s.hint}`).not.toMatch(/keep your streak|lose|lost|miss/i);
  });
});
