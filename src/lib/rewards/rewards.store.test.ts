import { beforeEach, describe, expect, it } from "vitest";
import { catalog } from "@/test/catalog";
import { createProfile, getUser, initUser, markChaptersRead, saveProgress, setStatus, switchProfile } from "../store/user";
import { exportProfile, importProfile } from "../store/transfer";
import { XP, progressionFor } from "./index";

const t = { ...catalog[0]!, meta: { ...catalog[0]!.meta, status: "completed" as const, genres: ["Action"] } };
// Weekly quests depend on the (random) profile id; compare reading XP only.
const reading = (l: { entries: { reason: string; xp: number }[] }) => l.entries.filter((e) => e.reason !== "quest").reduce((n, e) => n + e.xp, 0);
const u = (n: number, finished = true) => ({ title: t, chapterId: `c${n}`, chapterNumber: n, page: 9, pageCount: 10, fraction: 1, finished, lastChapterNumber: 2 });

// The test setup gives every test a fresh database, so each test builds its own history.
beforeEach(async () => {
  await initUser();
  const p = await createProfile("Rewards test");
  await switchProfile(p.id);
});

describe("rewards from the real store", () => {
  it("opening or marking chapters read earns nothing", async () => {
    await saveProgress(u(1, false));
    await markChaptersRead(t, [{ id: "c1", number: 1 }], true);
    await setStatus(t, "completed");
    await setStatus(t, "reading");
    expect(progressionFor(getUser()).ledger.total).toBe(0); // no quest can complete without a finished chapter
  });

  it("finishing chapters earns XP once, and reading to the end completes the series", async () => {
    await saveProgress(u(1));
    await saveProgress(u(1));
    const one = progressionFor(getUser()).ledger;
    expect(reading(one)).toBe(XP.chapter + XP.series + XP.genre);
    await saveProgress(u(2));
    const two = progressionFor(getUser()).ledger;
    expect(two.completed).toBe(1);
    expect(reading(two)).toBe(reading(one) + XP.chapter + XP.complete);
  });

  it("un-marking and re-reading a chapter does not farm XP", async () => {
    await saveProgress(u(1));
    await saveProgress(u(2));
    const before = progressionFor(getUser()).ledger;
    await markChaptersRead(t, [{ id: "c2", number: 2 }], false);
    await saveProgress(u(2));
    expect(progressionFor(getUser()).ledger.total).toBe(before.total);
  });

  it("survives export and import with identical progression", async () => {
    await saveProgress(u(1));
    await saveProgress(u(2));
    const before = progressionFor(getUser());
    const data = await exportProfile();
    await importProfile(JSON.stringify(data));
    const after = progressionFor(getUser());
    expect(getUser().profile?.name).toBe("Rewards test");
    expect(after.ledger.total).toBe(before.ledger.total);
    expect(after.level.level).toBe(before.level.level);
    expect(after.sets.map((s) => s.tier)).toEqual(before.sets.map((s) => s.tier));
    expect([...after.ledger.genres.keys()]).toEqual([...before.ledger.genres.keys()]);
  });
});
