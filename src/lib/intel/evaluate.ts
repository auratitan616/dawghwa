import type { EventRecord } from "../store/db";
import type { Title } from "../titles";
import { cosineSparse, vectorize } from "./features";
import { train } from "./learner";
import { rank, type Prefs } from "./rank";

/**
 * Offline evaluation with simulated readers over real catalogue metadata.
 * A persona is a deterministic preference predicate; part of its liked titles
 * become interaction events (train), the rest are held out (test). We rank
 * every unseen title and measure how well held-out titles are recovered,
 * against a popularity baseline that ignores the user.
 */

export interface Persona {
  name: string;
  likes: (t: Title) => boolean;
  prefs?: Prefs;
}

export interface Metrics {
  precisionAt10: number;
  recallAt50: number;
  ndcgAt10: number;
  /** Mean pairwise dissimilarity of the top 10 (higher = more varied). */
  diversityAt10: number;
}

export interface PersonaReport {
  persona: string;
  trainSize: number;
  testSize: number;
  model: Metrics;
  popularity: Metrics;
}

function rngFrom(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function metrics(ranked: Title[], relevant: Set<string>): Metrics {
  const top10 = ranked.slice(0, 10);
  const hits10 = top10.filter((t) => relevant.has(t.key)).length;
  const hits50 = ranked.slice(0, 50).filter((t) => relevant.has(t.key)).length;
  let dcg = 0;
  top10.forEach((t, i) => relevant.has(t.key) && (dcg += 1 / Math.log2(i + 2)));
  let idcg = 0;
  for (let i = 0; i < Math.min(10, relevant.size); i++) idcg += 1 / Math.log2(i + 2);
  let pairs = 0;
  let dis = 0;
  for (let i = 0; i < top10.length; i++)
    for (let j = i + 1; j < top10.length; j++) {
      dis += 1 - cosineSparse(vectorize(top10[i]!), vectorize(top10[j]!));
      pairs++;
    }
  return {
    precisionAt10: hits10 / 10,
    recallAt50: relevant.size ? hits50 / Math.min(50, relevant.size) : 0,
    ndcgAt10: idcg ? dcg / idcg : 0,
    diversityAt10: pairs ? dis / pairs : 0,
  };
}

export function evaluatePersona(catalog: Title[], p: Persona, opts: { trainFraction?: number; seed?: number; now?: number } = {}): PersonaReport {
  const now = opts.now ?? Date.UTC(2026, 0, 1);
  const r = rngFrom(opts.seed ?? 42);
  const liked = catalog.filter(p.likes);
  const shuffled = [...liked].sort(() => r() - 0.5);
  const nTrain = Math.max(3, Math.round(shuffled.length * (opts.trainFraction ?? 0.3)));
  const trainSet = shuffled.slice(0, nTrain);
  const test = new Set(shuffled.slice(nTrain).map((t) => t.key));
  const events: EventRecord[] = [];
  let seq = 0;
  trainSet.forEach((t, i) => {
    const at = now - (nTrain - i) * 3_600_000;
    events.push({ profileId: "eval", seq: ++seq, kind: "open", titleKey: t.key, at });
    const kind = i % 3 === 0 ? "library_add" : i % 3 === 1 ? "chapter_read" : "like";
    events.push({ profileId: "eval", seq: ++seq, kind, titleKey: t.key, at: at + 1000 });
  });
  const titles = new Map(catalog.map((t) => [t.key, t]));
  const trainedOn = new Set(trainSet.map((t) => t.key));
  const pool = catalog.filter((t) => !trainedOn.has(t.key));
  const state = train({ profileId: "eval", events, titles, pool, now });
  const candidates = catalog.filter((t) => !trainedOn.has(t.key));
  const ranked = rank(candidates, { state, prefs: p.prefs, titleOf: (k) => titles.get(k) }, { k: 50, lambda: 0.85 }).map((s) => s.title);
  const pop = [...candidates].sort((a, b) => (b.follows ?? 0) - (a.follows ?? 0));
  return { persona: p.name, trainSize: nTrain, testSize: test.size, model: metrics(ranked, test), popularity: metrics(pop, test) };
}

const has = (t: Title, tag: string) => (t.meta?.tags ?? []).some((x) => x.toLowerCase() === tag.toLowerCase());

/** Personas defined only by metadata the API actually provides. */
export const PERSONAS: Persona[] = [
  { name: "Action fantasy manhwa", likes: (t) => t.meta?.kind === "manhwa" && has(t, "Action") && has(t, "Fantasy") },
  { name: "Romance manga", likes: (t) => t.meta?.kind === "manga" && has(t, "Romance") && !has(t, "Action") },
  { name: "Martial arts manhua", likes: (t) => t.meta?.kind === "manhua" && (has(t, "Martial Arts") || has(t, "Wuxia")) },
  { name: "Psychological / horror", likes: (t) => has(t, "Psychological") && (has(t, "Horror") || has(t, "Thriller")) },
  { name: "Comedy slice of life", likes: (t) => has(t, "Comedy") && has(t, "Slice of Life") },
  // Harder: a broad taste plus ~8% liked titles with no pattern at all (noise).
  { name: "Noisy mixed reader", likes: (t) => (has(t, "Drama") && (t.meta?.kind === "manhwa" || has(t, "Historical"))) || noise(t.key) < 0.08 },
];

function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function evaluateAll(catalog: Title[], seed = 42): PersonaReport[] {
  return PERSONAS.map((p) => evaluatePersona(catalog, p, { seed })).filter((r) => r.testSize >= 5);
}
