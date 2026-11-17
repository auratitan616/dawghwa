import { describe, expect, it } from "vitest";
import raw from "@/test/fixtures/catalog.json";
import { localOnly, toCatalogParams, toResult, type CatalogItem } from "./catalog";

const items = (raw as unknown as { items: CatalogItem[] }).items;
const genres = new Set(["action", "fantasy", "romance"]);

describe("catalogue adapter", () => {
  it("translates a browse query to documented /api/catalog params", () => {
    const p = toCatalogParams({ kinds: ["manhwa"], status: ["completed"], includedTags: ["Action", "Monsters"], excludedTags: ["Harem"], order: "rating", year: 2020, offset: 60, limit: 30 }, genres);
    expect(p.get("provider")).toBe("mangadex");
    expect(p.get("format")).toBe("manhwa");
    expect(p.get("status")).toBe("completed");
    expect(p.getAll("genre")).toEqual(["Action"]);
    expect(p.getAll("tag")).toEqual(["Monsters"]);
    expect(p.getAll("excludeGenre")).toEqual(["Harem"]);
    expect(p.get("sort")).toBe("score");
    expect(p.get("year")).toBe("2020");
    expect(p.get("page")).toBe("3");
    expect(p.get("limit")).toBe("30");
  });

  it("does not send several formats or statuses as one server filter, and reports them as local", () => {
    const q = { kinds: ["manga", "manhwa"] as const, status: ["ongoing", "hiatus"] as const, demographic: ["seinen"] as const };
    const p = toCatalogParams({ ...q, kinds: [...q.kinds], status: [...q.status], demographic: [...q.demographic] }, genres);
    expect(p.has("format")).toBe(false);
    expect(p.has("status")).toBe(false);
    expect(localOnly({ kinds: ["manga", "manhwa"], status: ["ongoing", "hiatus"], demographic: ["seinen"] })).toEqual(["kinds", "status", "demographic"]);
    expect(localOnly({ kinds: ["manga"], status: ["ongoing"] })).toEqual([]);
  });

  it("defaults to relevance for text and popularity otherwise, and clamps limit", () => {
    expect(toCatalogParams({ query: "solo" }, genres).get("sort")).toBe("relevance");
    expect(toCatalogParams({}, genres).get("sort")).toBe("popularity");
    expect(toCatalogParams({ limit: 500 }, genres).get("limit")).toBe("100");
  });

  it("maps real catalogue items without inventing fields", () => {
    const solo = items.find((i) => i.title === "Solo Leveling")!;
    const r = toResult(solo);
    expect(r.id).toBe(solo.providerId);
    expect(r.metadata?.kind).toBe("manhwa");
    expect(r.metadata?.genres).toEqual(solo.genres);
    expect(r.metadata?.description).toBe(solo.description);
    // the catalogue has no follower counts or ratings for MangaDex lists
    expect(r.metadata?.follows).toBeUndefined();
    expect(r.rating).toBeUndefined();
    const bare = toResult({ ...solo, tagNames: undefined, description: undefined, demographic: undefined });
    expect(bare.metadata?.tags).toBeUndefined();
    expect(bare.metadata?.description).toBeUndefined();
    expect("demographic" in (bare.metadata ?? {})).toBe(false);
  });

  it("marks unknown status as missing rather than a value", () => {
    expect(toResult({ ...items[0]!, status: "unknown" }).metadata?.status).toBeUndefined();
  });
});
