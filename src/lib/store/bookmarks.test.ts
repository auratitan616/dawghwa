import { beforeEach, describe, expect, it } from "vitest";
import { bookmarksFor, isBookmarked, removeBookmark, resetBookmarks, toggleBookmark } from "./bookmarks";

const base = { titleKey: "mangadex:abc", chapterId: "t/en/ch:1", chapterLabel: "Chapter 1", page: 3, pageCount: 14, variantId: "mangadex:md-1", sourceId: "mangadex" };

describe("bookmarks", () => {
  beforeEach(() => {
    localStorage.clear();
    resetBookmarks();
  });
  it("toggles a page bookmark and persists it", () => {
    expect(toggleBookmark(base)).toBe(true);
    expect(isBookmarked(base.titleKey, base.chapterId, 3)).toBe(true);
    expect(JSON.parse(localStorage.getItem("dawghwa.bookmarks.v1")!)[base.titleKey]).toHaveLength(1);
    expect(toggleBookmark(base)).toBe(false);
    expect(isBookmarked(base.titleKey, base.chapterId, 3)).toBe(false);
  });
  it("keys by canonical chapter, so another version of the chapter shares bookmarks", () => {
    toggleBookmark(base);
    expect(isBookmarked(base.titleKey, "t/en/ch:1", 3)).toBe(true);
    expect(isBookmarked(base.titleKey, "t/en/ch:1.5", 3)).toBe(false);
  });
  it("removes a specific bookmark and keeps newest first", () => {
    toggleBookmark(base);
    toggleBookmark({ ...base, page: 5 });
    expect(bookmarksFor(base.titleKey).map((b) => b.page)).toEqual([5, 3]);
    removeBookmark(base.titleKey, base.chapterId, 5);
    expect(bookmarksFor(base.titleKey).map((b) => b.page)).toEqual([3]);
  });
});
