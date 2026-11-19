import { describe, expect, it } from "vitest";
import type { ChapterVariant, UnifiedChapterRow } from "@/lib/api/types";
import { chapterAliases, chapterBadge, chapterLabel, fallbackPlan, findChapter, isChapterRead, mapPosition, pickVariant, toChapter, variantIdOf } from "./chapters";

const v = (sourceId: string, id: string, extra: Partial<ChapterVariant> = {}): ChapterVariant => ({
  sourceId,
  source: sourceId,
  providerChapterId: id,
  url: `https://example.test/${id}`,
  language: "en",
  edition: "scanlation",
  match: "exact",
  ...extra,
});

const row = (key: string, number: string | null, variants: ChapterVariant[], extra: Partial<UnifiedChapterRow> = {}): UnifiedChapterRow => ({
  key,
  canonicalTitleId: "t",
  kind: "regular",
  number,
  numberValue: number ? Number(number) : -1,
  display: number ? `Chapter ${number}` : "Prologue",
  language: "en",
  translations: variants.length,
  variants,
  order: 0,
  ...extra,
});

const ch1 = toChapter(row("t/en/ch:1", "1", [v("mangadex", "md-1", { group: { id: "g1", name: "G1" } }), v("dynasty-reader", "aiura_ch01", { group: { id: "g2", name: "G2" } })]));
const ch15 = toChapter(row("t/en/ch:1.5", "1.5", [v("mangadex", "md-15")]));
const ch110 = toChapter(row("t/en/ch:1.10", "1.10", [v("mangadex", "md-110")], { numberValue: 1.1 }));
const pro = toChapter(row("t/en/prologue", null, [v("webtoon", "ep1")], { kind: "prologue" }));

describe("toChapter", () => {
  it("keeps the exact number text and assigns variant ids", () => {
    expect(ch110.numberText).toBe("1.10");
    expect(ch110.id).toBe("t/en/ch:1.10");
    expect(ch1.variants?.map((x) => x.variantId)).toEqual(["mangadex:md-1", "dynasty-reader:aiura_ch01"]);
    expect(ch1.group?.name).toBe("G1");
  });
  it("keeps 1 and 1.5 as separate chapters", () => {
    expect(ch1.id).not.toBe(ch15.id);
  });
});

describe("findChapter", () => {
  const list = [pro, ch1, ch15, ch110];
  it("finds by canonical key", () => {
    expect(findChapter(list, "t/en/ch:1.5")).toMatchObject({ legacy: false, index: 2 });
  });
  it("resolves legacy provider chapter ids from old history", () => {
    const r = findChapter(list, "aiura_ch01");
    expect(r?.legacy).toBe(true);
    expect(r?.chapter.id).toBe("t/en/ch:1");
    expect(findChapter(list, "mangadex:md-15")?.chapter.id).toBe("t/en/ch:1.5");
  });
  it("returns undefined for unknown ids (never a different chapter)", () => {
    expect(findChapter(list, "nope")).toBeUndefined();
    expect(findChapter(list, undefined)).toBeUndefined();
  });
});

describe("isChapterRead / aliases", () => {
  it("counts progress saved under any alias", () => {
    expect(chapterAliases(ch1)).toContain("md-1");
    expect(isChapterRead({ "aiura_ch01": 1 }, ch1)).toBe(true);
    expect(isChapterRead({ "t/en/ch:1": 1 }, ch1)).toBe(true);
    expect(isChapterRead({ "md-15": 1 }, ch1)).toBe(false);
    expect(isChapterRead(undefined, ch1)).toBe(false);
  });
});

describe("pickVariant", () => {
  it("honours an explicit variant id", () => {
    expect(pickVariant(ch1, { variantId: "dynasty-reader:aiura_ch01" })?.sourceId).toBe("dynasty-reader");
  });
  it("prefers an explicit source", () => {
    expect(pickVariant(ch1, { sourceId: "dynasty-reader" })?.providerChapterId).toBe("aiura_ch01");
  });
  it("keeps the previous source and group", () => {
    expect(pickVariant(ch1, { previous: { sourceId: "dynasty-reader", group: { id: "g2", name: "G2" } } })?.sourceId).toBe("dynasty-reader");
  });
  it("skips failed variants when an alternative exists", () => {
    expect(pickVariant(ch1, { failed: new Set(["mangadex:md-1"]) })?.sourceId).toBe("dynasty-reader");
  });
  it("defaults to the first variant", () => {
    expect(pickVariant(ch1)?.sourceId).toBe("mangadex");
    expect(pickVariant(undefined)).toBeUndefined();
  });
});

describe("fallbackPlan", () => {
  const official = v("webtoon", "w1", { edition: "official" });
  const spanish = v("mangadex", "es-1", { language: "es-la" });
  const unknownLang = v("other", "x", { language: null });
  const sourceOnly = v("other2", "y", { match: "source-only" });
  const c = toChapter(row("t/en/ch:1", "1", [v("mangadex", "md-1"), v("dynasty-reader", "d1"), official, spanish, unknownLang, sourceOnly]));
  const failed = c.variants![0]!;

  it("only auto-switches to the same chapter, language and edition", () => {
    const p = fallbackPlan(c, failed);
    expect(p.automatic.map(variantIdOf)).toEqual(["dynasty-reader:d1"]);
  });
  it("puts other editions behind a manual choice", () => {
    expect(fallbackPlan(c, failed).manual.map(variantIdOf)).toEqual(["webtoon:w1"]);
  });
  it("never offers another language, unknown language or source-only matches", () => {
    const all = [...fallbackPlan(c, failed).automatic, ...fallbackPlan(c, failed).manual].map(variantIdOf);
    expect(all).not.toContain("mangadex:es-1");
    expect(all).not.toContain("other:x");
    expect(all).not.toContain("other2:y");
  });
  it("skips versions already tried", () => {
    expect(fallbackPlan(c, failed, new Set(["dynasty-reader:d1"])).automatic).toEqual([]);
  });
  it("refuses to fall back when the language is unknown", () => {
    const u = toChapter(row("t/und/ch:1", "1", [v("a", "1", { language: null }), v("b", "2", { language: null })], { language: null }));
    expect(fallbackPlan(u, u.variants![0]!)).toEqual({ automatic: [], manual: [] });
  });
  it("prefers a different provider over another upload on the failing one", () => {
    const d = toChapter(row("k", "1", [v("mangadex", "a"), v("mangadex", "b"), v("dynasty-reader", "c")]));
    expect(fallbackPlan(d, d.variants![0]!).automatic.map((x) => x.sourceId)).toEqual(["dynasty-reader", "mangadex"]);
  });
});

describe("mapPosition", () => {
  it("is exact with equal page counts", () => {
    expect(mapPosition(5, 14, 14)).toEqual({ page: 5, exact: true });
  });
  it("maps by fraction and marks approximations", () => {
    expect(mapPosition(13, 14, 28)).toEqual({ page: 27, exact: false });
    expect(mapPosition(7, 15, 29)).toEqual({ page: 14, exact: false });
  });
  it("page one stays page one", () => {
    expect(mapPosition(0, 14, 30)).toEqual({ page: 0, exact: true });
  });
  it("clamps into range", () => {
    expect(mapPosition(99, 14, 14).page).toBe(13);
    expect(mapPosition(3, 10, 0)).toEqual({ page: 0, exact: false });
  });
});

describe("labels", () => {
  it("shows exact numbers and kind markers", () => {
    expect(chapterBadge(ch110)).toBe("1.10");
    expect(chapterBadge(pro)).toBe("Pro");
    expect(chapterLabel(pro)).toBe("Prologue");
    expect(chapterLabel({ ...ch1, title: "Rain" })).toBe("Chapter 1: Rain");
    expect(chapterLabel({ ...ch1, title: "Chapter 1" })).toBe("Chapter 1");
  });
});
