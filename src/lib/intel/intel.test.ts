import { describe, expect, it } from "vitest";
import { catalog, byTitle } from "@/test/catalog";
import type { EventRecord } from "../store/db";
import type { Title } from "../titles";
import { cosineSparse, featureKeys, vectorize } from "./features";
import { effectiveEvents, evidence, predict, serialize, deserialize, train } from "./learner";
import { rank, rerankRow, surprise } from "./rank";
import { detectThemes } from "./themes";
import { evaluateAll } from "./evaluate";

const NOW = Date.UTC(2026, 0, 1);
const titles = new Map(catalog.map((t) => [t.key, t]));
let seq = 0;
const ev = (kind: string, t: Title, ageH = 1): EventRecord => ({ profileId: "p", seq: ++seq, kind, titleKey: t.key, at: NOW - ageH * 3_600_000 });
const tagged = (tag: string, kind?: string) => catalog.filter((t) => t.meta?.tags?.includes(tag) && (!kind || t.meta?.kind === kind));

describe("fixture", () => {
  it("is real API data with metadata", () => {
    expect(catalog.length).toBeGreaterThan(500);
    const sl = byTitle("Solo Leveling");
    expect(sl?.meta?.kind).toBe("manhwa");
    expect(catalog.filter((t) => t.meta?.genres?.length).length / catalog.length).toBeGreaterThan(0.9);
  });
});

describe("features", () => {
  it("are normalised and similar for related titles", () => {
    const a = tagged("Action", "manhwa")[0]!;
    const b = tagged("Action", "manhwa")[1]!;
    const c = tagged("Romance", "manga").find((t) => !t.meta?.tags?.includes("Action"))!;
    const n = vectorize(a).val.reduce((s, v) => s + v * v, 0);
    expect(n).toBeCloseTo(1, 4);
    expect(cosineSparse(vectorize(a), vectorize(b))).toBeGreaterThan(cosineSparse(vectorize(a), vectorize(c)));
  });

  it("detects story themes only from text that says so", () => {
    const sl = byTitle("Solo Leveling")!;
    expect(detectThemes(sl)).toContain("dungeon");
    expect(detectThemes({ meta: { description: "A quiet story about baking bread." } })).toEqual([]);
    expect(detectThemes({ meta: undefined })).toEqual([]);
    expect(featureKeys({ ...sl, meta: undefined })).toEqual([]);
  });
});

describe("learner safeguards", () => {
  const manhwa = tagged("Action", "manhwa").slice(0, 6);

  it("treats opening a title as a weak positive, never a negative", () => {
    const s = train({ profileId: "p", events: [ev("open", manhwa[0]!)], titles, now: NOW });
    expect(s.disliked[manhwa[0]!.key]).toBeUndefined();
    expect(s.liked[manhwa[0]!.key]).toBeGreaterThan(0);
    expect(s.liked[manhwa[0]!.key]).toBeLessThan(0.1);
  });

  it("ignores events that are not trainable (unknown kinds, missing metadata)", () => {
    const noMeta: Title = { key: "x:1", sourceId: "x", id: "1", url: "", title: "No meta" };
    const s = train({ profileId: "p", events: [ev("image_error", manhwa[0]!), ev("like", noMeta)], titles: new Map([...titles, [noMeta.key, noMeta]]), now: NOW });
    expect(s.n).toBe(0);
  });

  it("lets unhide cancel an earlier hide", () => {
    const t = manhwa[1]!;
    const evs = [ev("hide", t, 5), ev("unhide", t, 4)];
    expect(effectiveEvents(evs).map((e) => e.kind)).toEqual([]);
    const s = train({ profileId: "p", events: evs, titles, now: NOW });
    expect(s.disliked[t.key]).toBeUndefined();
  });

  it("keeps only the latest explicit opinion", () => {
    const t = manhwa[2]!;
    const s = train({ profileId: "p", events: [ev("dislike", t, 5), ev("like", t, 1)], titles, now: NOW });
    expect(s.disliked[t.key]).toBeUndefined();
    expect(s.liked[t.key]).toBeGreaterThan(1);
  });

  it("gives diminishing weight to many chapter reads of one title", () => {
    const t = manhwa[3]!;
    const one = train({ profileId: "p", events: [ev("chapter_read", t)], titles, now: NOW }).liked[t.key]!;
    const fifty = train({ profileId: "p", events: Array.from({ length: 50 }, () => ev("chapter_read", t)), titles, now: NOW }).liked[t.key]!;
    expect(fifty).toBeLessThan(one * 15); // not 50x
  });

  it("forgets titles and resets", () => {
    const t = manhwa[4]!;
    const s = train({ profileId: "p", events: [ev("like", t)], titles, forgotten: new Set([t.key]), now: NOW });
    expect(s.n).toBe(0);
    const r = train({ profileId: "p", events: [ev("like", t, 48)], titles, resetAt: NOW - 3_600_000, now: NOW });
    expect(r.n).toBe(0);
  });

  it("learns a preference the model can predict", () => {
    const romance = tagged("Romance", "manga").filter((t) => !t.meta?.tags?.includes("Action"));
    const events = manhwa.slice(0, 5).map((t) => ev("like", t)).concat(romance.slice(0, 5).map((t) => ev("dislike", t)));
    const s = train({ profileId: "p", events, titles, pool: catalog.slice(0, 200), now: NOW });
    const other = tagged("Action", "manhwa")[10]!;
    const otherRomance = romance[10]!;
    expect(predict(s, vectorize(other))).toBeGreaterThan(predict(s, vectorize(otherRomance)));
    expect(evidence(s)).toBeGreaterThan(0.4);
  });

  it("is deterministic and survives serialisation", () => {
    const events = manhwa.map((t) => ev("library_add", t));
    const a = train({ profileId: "p", events, titles, pool: catalog.slice(0, 100), now: NOW });
    const b = train({ profileId: "p", events, titles, pool: catalog.slice(0, 100), now: NOW });
    expect(Array.from(a.w)).toEqual(Array.from(b.w));
    const back = deserialize(JSON.parse(JSON.stringify(serialize(a))))!;
    const x = vectorize(catalog[300]!);
    expect(predict(back, x)).toBeCloseTo(predict(a, x), 3);
  });
});

describe("ranking", () => {
  const liked = tagged("Action", "manhwa").slice(0, 8);
  const state = train({ profileId: "p", events: liked.map((t) => ev("like", t)), titles, pool: catalog.slice(0, 300), now: NOW });
  const ctx = { state, titleOf: (k: string) => titles.get(k), exclude: new Set(liked.map((t) => t.key)) };

  it("excludes titles and never returns duplicates", () => {
    const out = rank([...catalog, ...catalog.slice(0, 50)], ctx, { k: 40 });
    const keys = out.map((o) => o.title.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((k) => ctx.exclude.has(k))).toBe(false);
  });

  it("puts the learned taste on top", () => {
    const out = rank(catalog, ctx, { k: 20 });
    const share = out.filter((o) => o.title.meta?.kind === "manhwa").length / out.length;
    expect(share).toBeGreaterThan(0.5);
  });

  it("explains only with real evidence", () => {
    const out = rank(catalog, ctx, { k: 30 });
    for (const o of out) {
      if (!o.reason) continue;
      if (o.reason.kind === "similar") {
        const name = o.reason.text.replace("Similar to ", "");
        expect(liked.map((t) => t.title)).toContain(name);
      }
      if (o.reason.kind === "feature") expect(o.reason.text).toMatch(/^(Because you enjoy|You tend to)/);
    }
    // new profile: no explanations at all
    const cold = rank(catalog, { titleOf: ctx.titleOf, state: null }, { k: 20 });
    expect(cold.every((o) => !o.reason)).toBe(true);
  });

  it("respects onboarding avoid lists", () => {
    const out = rank(catalog, { state: null, prefs: { genres: ["Romance"], kinds: [], avoid: ["Horror"] } }, { k: 40 });
    expect(out.some((o) => o.title.meta?.tags?.includes("Horror"))).toBe(false);
    expect(out.filter((o) => o.reason?.kind === "prefs").length).toBeGreaterThan(0);
  });

  it("keeps catalogue order for a new profile and re-ranks with evidence", () => {
    const row = catalog.slice(0, 20);
    expect(rerankRow(row, { state: null }).map((t) => t.key)).toEqual(row.map((t) => t.key));
    const re = rerankRow(row, ctx);
    expect(new Set(re.map((t) => t.key))).toEqual(new Set(row.filter((t) => !ctx.exclude.has(t.key)).map((t) => t.key)));
  });

  it("surprise avoids recent picks", () => {
    let i = 0;
    const rnd = () => ((i = (i * 9301 + 49297) % 233280) / 233280);
    const first = surprise(catalog, ctx, [], rnd)!;
    const next = surprise(catalog, ctx, [first.title.key], rnd)!;
    expect(next.title.key).not.toBe(first.title.key);
  });
});

describe("offline evaluation", () => {
  it("beats the popularity baseline for simulated readers", () => {
    const reports = evaluateAll(catalog);
    expect(reports.length).toBeGreaterThanOrEqual(4);
    const avg = (f: (r: (typeof reports)[number]) => number) => reports.reduce((s, r) => s + f(r), 0) / reports.length;
    const model = avg((r) => r.model.ndcgAt10);
    const pop = avg((r) => r.popularity.ndcgAt10);
    console.table(reports.map((r) => ({ persona: r.persona, train: r.trainSize, test: r.testSize, ndcg: r.model.ndcgAt10.toFixed(3), popNdcg: r.popularity.ndcgAt10.toFixed(3), recall50: r.model.recallAt50.toFixed(3), popRecall50: r.popularity.recallAt50.toFixed(3), div: r.model.diversityAt10.toFixed(3) })));
    expect(model).toBeGreaterThan(pop * 1.5);
    for (const r of reports) expect(r.model.recallAt50).toBeGreaterThanOrEqual(r.popularity.recallAt50);
  });
});
