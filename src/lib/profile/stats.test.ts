import { describe, expect, it } from "vitest";
import { readingStats } from "./stats";
import type { LibraryRecord, ProgressRecord } from "../store/db";
import type { Title } from "../titles";

const now = new Date(2026, 10, 17, 12).getTime();
const DAY = 86_400_000;
const prog = (titleKey: string, read: number[]): ProgressRecord => ({ profileId: "p", titleKey, chapterId: "c", chapterNumber: 1, page: 0, pageCount: 10, fraction: 0, read: Object.fromEntries(read.map((t, i) => [`ch${i}`, t])), maxReadNumber: read.length, startedAt: 0, updatedAt: 0 });
const lib = (titleKey: string, x: Partial<LibraryRecord>): LibraryRecord => ({ profileId: "p", titleKey, favorite: false, collections: [], addedAt: 0, updatedAt: 0, ...x });
const title = (key: string, genres: string[]) => ({ key, title: key, meta: { genres } }) as unknown as Title;

describe("readingStats", () => {
  const titles = new Map([title("a", ["Action", "Fantasy"]), title("b", ["Fantasy"]), title("c", ["Romance"])].map((t) => [t.key, t]));
  const s = readingStats([prog("a", [now, now - DAY, now - 40 * DAY]), prog("b", [])], [lib("a", { status: "reading" }), lib("c", { status: "completed", favorite: true })], titles, now);

  it("counts chapters, series and library state from stored data only", () => {
    expect(s.chaptersRead).toBe(3);
    expect(s.seriesStarted).toBe(1);
    expect(s.completed).toBe(1);
    expect(s.favourites).toBe(1);
  });
  it("buckets finished chapters per day and month", () => {
    expect(s.days).toHaveLength(84);
    expect(s.days.at(-1)!.count).toBe(1);
    expect(s.days.at(-2)!.count).toBe(1);
    expect(s.activeDays).toBe(3);
    expect(s.thisMonth).toBe(2);
  });
  it("ranks genres from read or saved series", () => {
    expect(s.genres[0]).toEqual(["Action", 1]);
    expect(s.genres.map((g) => g[0]).sort()).toEqual(["Action", "Fantasy", "Romance"]);
  });

});
