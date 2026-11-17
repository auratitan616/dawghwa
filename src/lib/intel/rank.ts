import type { Title } from "../titles";
import { cosineDense, cosineSparse, denseNorm, featureKeys, featureLabel, vectorize } from "./features";
import { evidence, predict, type LearnerState } from "./learner";

/**
 * Ranking = content-based taste similarity + learned model + cold-start
 * preferences + popularity/quality priors + exploration, followed by a
 * maximal-marginal-relevance diversity pass. Every explanation is derived
 * from a real signal; when none is strong enough, no explanation is shown.
 */

export interface Prefs {
  genres: string[];
  kinds: string[];
  avoid: string[];
}

export interface RankContext {
  state: LearnerState | null;
  prefs?: Prefs;
  /** Titles to exclude (hidden, disliked, finished, in progress ...). */
  exclude?: Set<string>;
  /** Titles shown recently (anti-repetition): mild penalty. */
  recentlyShown?: Map<string, number>;
  /** Weight of novelty / exploration (0 = none). */
  explore?: number;
  /** Lookup for explanation titles. */
  titleOf?: (key: string) => Title | undefined;
}

export interface Parts {
  tasteShort: number;
  tasteLong: number;
  model: number;
  prefs: number;
  popularity: number;
  quality: number;
  novelty: number;
  repeat: number;
}

export interface Scored {
  title: Title;
  score: number;
  parts: Parts;
  reason?: Reason;
}

export interface Reason {
  kind: "feature" | "similar" | "creator" | "prefs" | "different";
  text: string;
}

export const WEIGHTS = { tasteShort: 0.9, tasteLong: 0.7, model: 1.1, prefs: 1.0, popularity: 0.35, quality: 0.3, novelty: 1.0, repeat: 0.4 };

const lower = (xs?: string[]) => (xs ?? []).map((x) => x.toLowerCase());

export function prefsMatch(t: Title, p?: Prefs): number {
  if (!p || !t.meta) return 0;
  const tags = new Set([...lower(t.meta.genres), ...lower(t.meta.themes)]);
  if (p.avoid.some((a) => tags.has(a.toLowerCase()))) return -1;
  let s = 0;
  const g = p.genres.filter((x) => tags.has(x.toLowerCase())).length;
  if (p.genres.length) s += Math.min(1, g / 2);
  if (p.kinds.length && t.meta.kind) s += p.kinds.includes(t.meta.kind) ? 0.5 : -0.3;
  return Math.max(-1, Math.min(1.5, s));
}

function popularity(t: Title): number {
  return t.follows ? Math.min(1, Math.log10(1 + t.follows) / 5.5) : 0;
}

function quality(t: Title): number {
  return t.rating ? Math.max(-1, Math.min(1, (t.rating - 7) / 2)) : 0;
}

export function scoreTitle(t: Title, ctx: RankContext, positives: Title[]): Scored {
  const s = ctx.state;
  const x = vectorize(t);
  const e = s ? evidence(s) : 0;
  const parts: Parts = { tasteShort: 0, tasteLong: 0, model: 0, prefs: 0, popularity: popularity(t), quality: quality(t), novelty: 0, repeat: 0 };
  if (s && e > 0) {
    parts.tasteShort = cosineDense(x, s.shortT, denseNorm(s.shortT));
    parts.tasteLong = cosineDense(x, s.longT, denseNorm(s.longT));
    parts.model = predict(s, x) - 0.5;
  }
  parts.prefs = prefsMatch(t, ctx.prefs);
  if (ctx.explore && positives.length) {
    let maxSim = 0;
    for (const p of positives) maxSim = Math.max(maxSim, cosineSparse(x, vectorize(p)));
    parts.novelty = 1 - maxSim;
  }
  const shown = ctx.recentlyShown?.get(t.key) ?? 0;
  parts.repeat = shown ? Math.min(1, shown / 4) : 0;
  const personal = WEIGHTS.tasteShort * parts.tasteShort + WEIGHTS.tasteLong * parts.tasteLong + WEIGHTS.model * parts.model;
  const prefW = WEIGHTS.prefs * (1 - e * 0.7);
  const score =
    e * personal +
    prefW * parts.prefs +
    WEIGHTS.popularity * parts.popularity +
    WEIGHTS.quality * parts.quality +
    (ctx.explore ?? 0) * WEIGHTS.novelty * parts.novelty -
    WEIGHTS.repeat * parts.repeat -
    (parts.prefs <= -1 ? 2 : 0);
  return { title: t, score, parts };
}

/** Greedy maximal marginal relevance: balance score against similarity to already picked titles. */
export function mmr(items: Scored[], k: number, lambda = 0.75): Scored[] {
  const pool = [...items].sort((a, b) => b.score - a.score);
  const picked: Scored[] = [];
  const vecs = new Map(pool.map((p) => [p.title.key, vectorize(p.title)]));
  const max = Math.max(1e-6, ...pool.map((p) => Math.abs(p.score)));
  while (picked.length < k && pool.length) {
    let best = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length && i < 80; i++) {
      const c = pool[i]!;
      const v = vecs.get(c.title.key)!;
      let sim = 0;
      for (const p of picked) sim = Math.max(sim, cosineSparse(v, vecs.get(p.title.key)!));
      const val = lambda * (c.score / max) - (1 - lambda) * sim;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    }
    picked.push(pool.splice(best, 1)[0]!);
  }
  return picked;
}

export function positivesOf(ctx: RankContext): Title[] {
  const s = ctx.state;
  if (!s || !ctx.titleOf) return [];
  return Object.entries(s.liked)
    .filter(([, v]) => v > 0.3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k]) => ctx.titleOf!(k))
    .filter((t): t is Title => Boolean(t?.meta));
}

/**
 * Explanation from real evidence only:
 *  - creator shared with a title the profile engaged with
 *  - strongly similar to one specific engaged title
 *  - a feature the profile engaged with at least twice
 *  - onboarding preference (only while there is little behaviour)
 */
export function explain(sc: Scored, ctx: RankContext, positives: Title[]): Reason | undefined {
  const t = sc.title;
  const s = ctx.state;
  const keys = featureKeys(t).map(([k]) => k);
  if (s && positives.length) {
    for (const k of keys) {
      if (!k.startsWith("a:") && !k.startsWith("ar:")) continue;
      const a = s.affinity[k];
      const other = a?.titles.map((x) => ctx.titleOf?.(x)).find((x) => x && x.key !== t.key);
      if (a && a.score > 0.5 && other) {
        const name = t.meta?.authors?.find((n) => `a:${n.toLowerCase()}` === k) ?? t.meta?.artists?.find((n) => `ar:${n.toLowerCase()}` === k);
        if (name) return { kind: "creator", text: `From ${name}, who also made ${other.title}` };
      }
    }
    const x = vectorize(t);
    let best: Title | undefined;
    let bestSim = 0;
    for (const p of positives) {
      if (p.key === t.key) continue;
      const sim = cosineSparse(x, vectorize(p));
      if (sim > bestSim) {
        bestSim = sim;
        best = p;
      }
    }
    if (best && bestSim >= 0.62) return { kind: "similar", text: `Similar to ${best.title}` };
    let topKey: string | undefined;
    let top = 0;
    for (const k of keys) {
      if (k.startsWith("gp:") || k.startsWith("lang:") || k.startsWith("era:") || k.startsWith("f:")) continue;
      const a = s.affinity[k];
      if (!a || a.pos < 2 || a.score <= top || a.neg > a.pos) continue;
      top = a.score;
      topKey = k;
    }
    if (topKey && top > 0.6) {
      const label = featureLabel(topKey);
      if (topKey.startsWith("st:completed")) return { kind: "feature", text: "You tend to enjoy completed series" };
      return { kind: "feature", text: `Because you enjoy ${label}` };
    }
  }
  if (ctx.prefs?.genres.length && (!s || evidence(s) < 0.5)) {
    const g = ctx.prefs.genres.find((x) => lower(t.meta?.genres).includes(x.toLowerCase()) || lower(t.meta?.themes).includes(x.toLowerCase()));
    if (g) return { kind: "prefs", text: `You picked ${g} during setup` };
  }
  return undefined;
}

export interface RankOptions {
  k: number;
  lambda?: number;
  /** Add an exploration slot every N items, labelled "Something different". */
  exploreEvery?: number;
}

/** Full personal ranking for "Picked for you" style rows. */
export function rank(candidates: Title[], ctx: RankContext, opts: RankOptions): Scored[] {
  const seen = new Set<string>();
  const uniq = candidates.filter((t) => t.meta && !ctx.exclude?.has(t.key) && !seen.has(t.key) && seen.add(t.key));
  const positives = positivesOf(ctx);
  const scored = uniq.map((t) => scoreTitle(t, ctx, positives));
  let out = mmr(scored.filter((x) => x.parts.prefs > -1), opts.k, opts.lambda ?? 0.75);
  if (opts.exploreEvery && positives.length >= 3) {
    const chosen = new Set(out.map((o) => o.title.key));
    const different = scored
      .filter((x) => !chosen.has(x.title.key) && x.parts.prefs > -1)
      .map((x) => ({ ...x, novelty: 1 - Math.max(0, ...positives.map((p) => cosineSparse(vectorize(x.title), vectorize(p)))) }))
      .filter((x) => x.novelty > 0.75 && x.parts.quality > 0)
      .sort((a, b) => b.parts.quality + b.parts.popularity - (a.parts.quality + a.parts.popularity));
    const res: Scored[] = [];
    let d = 0;
    out.forEach((o, i) => {
      res.push(o);
      if ((i + 1) % opts.exploreEvery! === 0 && different[d]) res.push({ ...different[d++]!, reason: { kind: "different", text: "Something different from your usual reading" } });
    });
    out = res.slice(0, opts.k);
  }
  return out.map((o) => (o.reason ? o : { ...o, reason: explain(o, ctx, positives) }));
}

/**
 * Personalise the order of a catalogue row without replacing it: a blend of
 * the catalogue position and the personal score. The blend grows with
 * evidence (0 for a new profile, at most 0.6), so it is a re-ranking.
 */
export function rerankRow(items: Title[], ctx: RankContext): Title[] {
  const s = ctx.state;
  const e = s ? evidence(s) : 0;
  const filtered = items.filter((t) => !ctx.exclude?.has(t.key));
  const hasPrefs = Boolean(ctx.prefs?.genres.length || ctx.prefs?.kinds.length || ctx.prefs?.avoid.length);
  if ((e === 0 && !hasPrefs) || filtered.length < 3) return filtered;
  const blend = Math.min(0.6, 0.15 + e * 0.6);
  const positives = positivesOf(ctx);
  const n = filtered.length;
  const scored = filtered.map((t, i) => {
    const sc = scoreTitle(t, ctx, positives);
    return { t, avoid: sc.parts.prefs <= -1, v: (1 - blend) * (1 - i / n) + blend * Math.tanh(sc.score) };
  });
  return scored
    .filter((x) => !x.avoid)
    .sort((a, b) => b.v - a.v)
    .map((x) => x.t);
}

/**
 * Surprise Me: sample from the top of the personal ranking with probability
 * proportional to score², skipping the most recent picks.
 */
export function surprise(candidates: Title[], ctx: RankContext, recentPicks: string[], random = Math.random): Scored | undefined {
  const ranked = rank(candidates, { ...ctx, explore: 0.3 }, { k: 25, lambda: 0.6 }).filter((s) => !recentPicks.includes(s.title.key));
  if (!ranked.length) return undefined;
  const min = Math.min(...ranked.map((r) => r.score));
  const weights = ranked.map((r) => (r.score - min + 0.05) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let x = random() * total;
  for (let i = 0; i < ranked.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return ranked[i];
  }
  return ranked[ranked.length - 1];
}
