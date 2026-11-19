import { beforeEach, describe, expect, it } from "vitest";
import { openDB } from "idb";
import { catalog } from "@/test/catalog";
import { addComment, ago, cleanBody, deleteComment, editComment, MAX_COMMENT, resetCommentsForTests, threads, togglePin, voteComment } from "./comments";
import { DB_VERSION, db, resetDbForTests, type CommentRecord } from "./store/db";
import { createProfile, getUser, initUser, profileEvents, setCollections, setStatus, switchProfile } from "./store/user";
import { exportProfile, importProfile } from "./store/transfer";
import { progressionFor } from "./rewards";
import { completedCollections } from "./rewards/runtime";
import { migrateSettings } from "./settings";

const t = catalog[0]!;
const all = async () => (await db()).getAll("comments");

describe("database v2 migration", () => {
  it("upgrades a v1 database without touching its data and adds the comments store", async () => {
    resetDbForTests();
    const v1 = await openDB("dawghwa", 1, {
      upgrade(d) {
        d.createObjectStore("profiles", { keyPath: "id" });
        d.createObjectStore("titles", { keyPath: "key" });
        for (const n of ["library", "progress", "hidden"]) d.createObjectStore(n, { keyPath: ["profileId", "titleKey"] }).createIndex("byProfile", "profileId");
        d.createObjectStore("events", { keyPath: ["profileId", "seq"] }).createIndex("byProfile", "profileId");
        d.createObjectStore("intel", { keyPath: "profileId" });
        d.createObjectStore("kv", { keyPath: "key" });
      },
    });
    await v1.put("profiles", { id: "p1", name: "Old", color: "#fff", createdAt: 1, updatedAt: 1, onboarded: true, prefs: { genres: [], kinds: [], avoid: [], personalize: true } });
    await v1.put("events", { profileId: "p1", seq: 1, kind: "chapter_read", titleKey: "x", at: 1 });
    v1.close();

    const d = await db();
    expect(d.version).toBe(DB_VERSION);
    expect([...d.objectStoreNames]).toContain("comments");
    expect(d.transaction("comments").store.indexNames.contains("byChapter")).toBe(true);
    expect((await d.get("profiles", "p1"))?.name).toBe("Old");
    expect(await d.getAll("events")).toHaveLength(1);
  });
});

describe("chapter comments", () => {
  beforeEach(async () => {
    resetCommentsForTests();
    await initUser();
  });

  it("stores comments per profile and chapter, trimmed and capped", async () => {
    const c = await addComment({ title: t, chapterId: "ch1", chapterNumber: 1, body: `  ${"a".repeat(MAX_COMMENT + 40)}  ` });
    expect(c?.body).toHaveLength(MAX_COMMENT);
    expect(await addComment({ title: t, chapterId: "ch1", body: "   " })).toBeUndefined();
    const other = await createProfile("Other");
    await switchProfile(other.id);
    const rows = await (await db()).getAllFromIndex("comments", "byChapter", [other.id, "ch1"]);
    expect(rows).toHaveLength(0);
  });

  it("logs a comment event, and Margin notes counts distinct chapters (not farmable)", async () => {
    const c = await addComment({ title: t, chapterId: "ch1", body: "First" });
    await deleteComment(c!);
    await addComment({ title: t, chapterId: "ch1", body: "Again" });
    await addComment({ title: t, chapterId: "ch2", body: "Second chapter" });
    expect((await profileEvents()).filter((e) => e.kind === "comment")).toHaveLength(3);
    const set = progressionFor(getUser()).sets.find((s) => s.id === "comments")!;
    expect(set.value).toBe(2);
  });

  it("edits, pins, votes, and deletes a thread with its replies", async () => {
    const c = (await addComment({ title: t, chapterId: "ch1", body: "Top level" }))!;
    const r = (await addComment({ title: t, chapterId: "ch1", body: "Reply", parentId: c.id }))!;
    const e = await editComment(c, "Edited");
    expect(e.body).toBe("Edited");
    expect(e.editedAt).toBeTypeOf("number");
    expect((await togglePin(e)).pinned).toBe(true);
    const v = await voteComment(r, 1);
    expect(v.vote).toBe(1);
    expect((await voteComment(v, 1)).vote).toBeUndefined();
    await deleteComment(e);
    expect(await all()).toHaveLength(0);
  });

  it("Top puts pinned first, then liked; Newest is by time; replies nest", () => {
    const base = { profileId: "p", titleKey: "k", chapterId: "c", updatedAt: 0 };
    const rows: CommentRecord[] = [
      { ...base, id: "a", body: "old pinned", at: 1, pinned: true },
      { ...base, id: "b", body: "liked", at: 2, vote: 1 },
      { ...base, id: "c", body: "newest", at: 3 },
      { ...base, id: "d", body: "reply", at: 4, parentId: "b" },
    ];
    expect(threads(rows, "top").map((x) => x.comment.id)).toEqual(["a", "b", "c"]);
    expect(threads(rows, "newest").map((x) => x.comment.id)).toEqual(["c", "b", "a"]);
    expect(threads(rows, "top")[1]!.replies.map((x) => x.id)).toEqual(["d"]);
  });

  it("formats relative time and cleans bodies", () => {
    expect(ago(1000, 1000)).toBe("now");
    expect(ago(0, 5 * 60_000)).toBe("5m");
    expect(ago(0, 3 * 3600_000)).toBe("3h");
    expect(cleanBody("a\r\n\n\n\nb ")).toBe("a\n\nb");
  });

  it("round-trips comments through export/import (v2) and still imports v1 files", async () => {
    const c = (await addComment({ title: t, chapterId: "ch1", body: "Keep me" }))!;
    await addComment({ title: t, chapterId: "ch1", body: "And my reply", parentId: c.id });
    const out = await exportProfile();
    expect(out.version).toBe(2);
    expect(out.comments).toHaveLength(2);
    const imported = await importProfile(JSON.stringify(out));
    const rows = await (await db()).getAllFromIndex("comments", "byProfile", imported.id);
    expect(rows.map((r) => r.body).sort()).toEqual(["And my reply", "Keep me"]);
    expect(rows.find((r) => r.parentId)?.parentId).toBe(c.id);

    const { comments: _c, ...v1 } = { ...out, version: 1 as const };
    const old = await importProfile(JSON.stringify(v1));
    expect(old.name).toBe(out.profile.name);
    expect(await (await db()).getAllFromIndex("comments", "byProfile", old.id)).toHaveLength(0);
  });
});

describe("collection completion", () => {
  beforeEach(async () => {
    await initUser();
  });
  it("needs two or more series, all completed", async () => {
    const [a, b] = catalog;
    await setCollections(a!, ["Weekend"]);
    await setCollections(b!, ["Weekend"]);
    await setStatus(a!, "completed");
    expect(completedCollections(getUser()).has("Weekend")).toBe(false);
    await setStatus(b!, "completed");
    expect(completedCollections(getUser()).has("Weekend")).toBe(true);
  });
});

describe("retired reader settings", () => {
  it("drops paged-layout settings from older builds", () => {
    const out = migrateSettings({ readerMode: "single", direction: "ltr", fit: "height", tapZones: false, pageGap: true, autoNext: false } as never);
    expect(out).toEqual({ autoNext: false });
  });
});
