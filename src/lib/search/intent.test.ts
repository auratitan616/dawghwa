import { describe, expect, it } from "vitest";
import vocab from "@/test/fixtures/vocabulary.json";
import { hasLocalFilters, parseIntent, toBrowseQuery } from "./intent";

const p = (s: string) => parseIntent(s, vocab);

describe("parseIntent (spec examples)", () => {
  it("Manhwa with an overpowered MC and revenge", () => {
    const i = p("Manhwa with an overpowered MC and revenge");
    expect(i.kinds).toEqual(["manhwa"]);
    expect(i.includeThemes.sort()).toEqual(["overpowered", "revenge"]);
    expect(i.text).toBe("");
    expect(i.chips.filter((c) => c.where === "local").length).toBe(2);
  });

  it("Completed fantasy manga with romance", () => {
    const i = p("Completed fantasy manga with romance");
    expect(i.status).toEqual(["completed"]);
    expect(i.kinds).toEqual(["manga"]);
    expect(i.includeTags.sort()).toEqual(["Fantasy", "Romance"]);
    expect(toBrowseQuery(i)).toMatchObject({ status: ["completed"], kinds: ["manga"], order: "popular" });
    expect(hasLocalFilters(i)).toBe(false);
  });

  it("Dark Korean manhwa without a love triangle", () => {
    const i = p("Dark Korean manhwa without a love triangle");
    expect(i.kinds).toEqual(["manhwa"]);
    expect(i.excludeThemes).toEqual(["love_triangle"]);
    expect(i.includeThemes).toEqual([]);
    expect(i.anyTags.map((a) => a.label)).toEqual(["Dark"]);
    expect(i.chips.find((c) => c.id === "theme:love_triangle")).toMatchObject({ negative: true, where: "local" });
  });

  it("Something similar to Solo Leveling", () => {
    const i = p("Something similar to Solo Leveling");
    expect(i.similarTo).toBe("Solo Leveling");
    expect(i.text).toBe("");
  });

  it("Hidden gems with fewer than 100 chapters", () => {
    const i = p("Hidden gems with fewer than 100 chapters");
    expect(i.hiddenGems).toBe(true);
    expect(i.maxChapters).toBe(100);
    expect(i.order).toBe("rating");
  });
});

describe("parseIntent (more)", () => {
  it("keeps plain title searches as text", () => {
    const i = p("omniscient reader");
    expect(i.structured).toBe(false);
    expect(i.text).toBe("omniscient reader");
  });

  it("treats a negated list as all negative", () => {
    const i = p("romance without harem or love triangles");
    expect(i.includeTags).toEqual(["Romance"]);
    expect(i.excludeTags).toEqual(["Harem"]);
    expect(i.excludeThemes).toEqual(["love_triangle"]);
  });

  it("does not treat 'I like X' as similar-to", () => {
    const i = p("I like romance comedy");
    expect(i.similarTo).toBeUndefined();
    expect(i.includeTags.sort()).toEqual(["Comedy", "Romance"]);
  });

  it("parses aliases, demographics, and years", () => {
    const i = p("seinen sci fi from 2018 with martial arts, no BL");
    expect(i.demographic).toEqual(["seinen"]);
    expect(i.includeTags.sort()).toEqual(["Martial Arts", "Sci-Fi"]);
    expect(i.excludeTags).toEqual(["Boys' Love"]);
    expect(i.yearMin).toBe(2018);
  });

  it("supports similar-to with extra filters", () => {
    const i = p("manhwa like Solo Leveling but completed");
    expect(i.similarTo).toBe("Solo Leveling");
    expect(i.status).toEqual(["completed"]);
    expect(i.kinds).toEqual(["manhwa"]);
  });

  it("works without a vocabulary (themes and kinds only)", () => {
    const i = parseIntent("regression manhua");
    expect(i.kinds).toEqual(["manhua"]);
    expect(i.includeThemes).toEqual(["regression"]);
  });
});
