import { describe, expect, it } from "vitest";
import { catalog } from "@/test/catalog";
import { CATALOGUE_SECTIONS, dedupeAcross, orderSections } from "./sections";
import { train } from "../intel/learner";

describe("home sections", () => {
  it("local theme rows find real matches in real catalogue data", () => {
    const counts = Object.fromEntries(CATALOGUE_SECTIONS.filter((s) => s.filter).map((s) => [s.id, catalog.filter(s.filter!).length]));
    console.log(counts);
    for (const id of ["revenge", "regression", "overpowered", "dark-fantasy", "cultivation", "dungeon", "hidden-gems"]) expect(counts[id]).toBeGreaterThanOrEqual(6);
  });

  it("orders rows by onboarding picks, then by learned affinity", () => {
    const base = orderSections(CATALOGUE_SECTIONS, null).map((s) => s.id);
    expect(base[0]).toBe("trending");
    const manhua = orderSections(CATALOGUE_SECTIONS, null, { genres: [], kinds: ["manhua"], avoid: [] }).map((s) => s.id);
    expect(manhua.indexOf("popular-manhua")).toBeLessThan(base.indexOf("popular-manhua"));
    const liked = catalog.filter((t) => t.meta?.kind === "manhua").slice(0, 10);
    const state = train({ profileId: "p", events: liked.map((t, i) => ({ profileId: "p", seq: i + 1, kind: "like", titleKey: t.key, at: Date.now() })), titles: new Map(catalog.map((t) => [t.key, t])) });
    const learned = orderSections(CATALOGUE_SECTIONS, state).map((s) => s.id);
    expect(learned.indexOf("popular-manhua")).toBeLessThan(base.indexOf("popular-manhua"));
  });

  it("dedupes repeated titles across rows without emptying rows", () => {
    const a = catalog.slice(0, 10);
    const b = catalog.slice(5, 20);
    const [, b2] = dedupeAcross([a, b], 3);
    expect(b2!.some((t) => a.slice(0, 10).includes(t))).toBe(false);
    const [, c2] = dedupeAcross([a, a.slice(0, 4)], 3);
    expect(c2!.length).toBe(4);
  });
});
