import { describe, expect, it } from "vitest";
import type { EventRecord } from "../store/db";
import type { Title } from "../titles";
import { monthRecap, recapLine } from "./recap";

let seq = 0;
const ev = (titleKey: string, at: number, value: number): EventRecord => ({ profileId: "p", seq: ++seq, kind: "chapter_read", titleKey, at, value });
const title = (key: string, genres: string[]) => ({ key, title: key, meta: { genres } }) as unknown as Title;
const titles = new Map([title("a", ["Action"]), title("b", ["Romance", "Action"])].map((t) => [t.key, t]));
const NOW = new Date(2026, 10, 20, 12).getTime();
const NOV = (d: number) => new Date(2026, 10, d, 10).getTime();
const OCT = (d: number) => new Date(2026, 9, d, 10).getTime();

describe("monthRecap", () => {
  it("counts first completions in the month only (re-reads don't inflate it)", () => {
    const events = [ev("a", OCT(3), 1), ev("a", NOV(2), 1), ev("a", NOV(2), 2), ev("a", NOV(4), 2), ev("b", NOV(5), 1)];
    const r = monthRecap(events, titles, 0, NOW);
    expect(r.chapters).toBe(2); // a#2, b#1 (a#1 was October; a#2 twice counts once)
    expect(r.newSeries).toBe(1);
    expect(r.newGenres).toEqual(["Romance"]);
    expect(r.genres).toEqual([["Action", 2], ["Romance", 1]]);
    expect(r.top[0]).toEqual({ titleKey: "a", chapters: 1 });
    expect(r.activeDays).toBe(2);
    expect(r.previous).toBe(1);
  });
  it("supports earlier months", () => {
    const r = monthRecap([ev("a", OCT(3), 1), ev("a", NOV(2), 2)], titles, 1, NOW);
    expect(r.chapters).toBe(1);
    expect(r.label).toMatch(/Oct/);
  });
  it("uses neutral copy for quiet months", () => {
    const quiet = monthRecap([ev("a", OCT(3), 1), ev("a", OCT(4), 2), ev("a", NOV(3), 3)], titles, 0, NOW);
    expect(recapLine(quiet)).toMatch(/calmer/);
    expect(recapLine(monthRecap([], titles, 0, NOW))).not.toMatch(/lost|miss|behind|streak/i);
  });
});
