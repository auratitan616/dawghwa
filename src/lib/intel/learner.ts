import type { EventRecord } from "../store/db";
import type { SignalKind } from "../store/user";
import type { Title } from "../titles";
import { DIM, featureKeys, vectorize, type SparseVec } from "./features";
import { decay, LONG_HALF_LIFE_DAYS, SHORT_HALF_LIFE_DAYS, SIGNAL_WEIGHTS } from "./signals";

/**
 * Dawghwa Intelligence learner (per profile, on the device).
 *
 *  1. Taste vectors: short-term (half-life 14 days) and long-term (1 year)
 *     sums of the hashed feature vectors of titles the profile engaged with,
 *     signed by the signal (negatives pull away).
 *  2. Personal model: online logistic regression (AdaGrad) over the same
 *     sparse features, trained on weighted interactions plus a few low-weight
 *     contrast samples from the general catalogue pool (NOT from titles the
 *     user skipped: skipping is never treated as a dislike).
 *  3. Readable affinities per feature key for explanations and Taste DNA.
 *
 * The state is a pure function of (events, title metadata, now): `train`
 * replays the effective events deterministically, so corrections (unhide,
 * changing a rating, forgetting a title) are exact.
 */

export const SCHEMA = 1;

export interface Affinity {
  pos: number;
  neg: number;
  /** Decayed signed weight (long-term). */
  score: number;
  /** Titles with positive evidence for this key (max 5, most recent first). */
  titles: string[];
  lastAt: number;
}

export interface LearnerState {
  schema: number;
  profileId: string;
  w: Float32Array;
  g2: Float32Array;
  bias: number;
  shortT: Float32Array;
  longT: Float32Array;
  /** Number of trainable interactions applied. */
  n: number;
  /** Positive / negative evidence per title key (decayed, long-term). */
  liked: Record<string, number>;
  disliked: Record<string, number>;
  affinity: Record<string, Affinity>;
  trainedAt: number;
  eventCount: number;
}

export function emptyState(profileId: string): LearnerState {
  return {
    schema: SCHEMA,
    profileId,
    w: new Float32Array(DIM),
    g2: new Float32Array(DIM),
    bias: 0,
    shortT: new Float32Array(DIM),
    longT: new Float32Array(DIM),
    n: 0,
    liked: {},
    disliked: {},
    affinity: {},
    trainedAt: 0,
    eventCount: 0,
  };
}

const OPINION = new Set<SignalKind>(["like", "dislike", "not_interested", "hide", "unhide"]);

/**
 * Resolve corrections: for each title only the latest explicit opinion counts
 * (an unhide cancels an earlier hide / not-interested; a like after a dislike
 * replaces it). Forgotten titles are removed entirely.
 */
export function effectiveEvents(events: EventRecord[], forgotten: Set<string> = new Set(), resetAt = 0): EventRecord[] {
  const sorted = [...events].filter((e) => e.at >= resetAt && !forgotten.has(e.titleKey)).sort((a, b) => a.seq - b.seq);
  const lastOpinion = new Map<string, number>();
  for (const e of sorted) if (OPINION.has(e.kind as SignalKind)) lastOpinion.set(e.titleKey, e.seq);
  return sorted.filter((e) => e.kind !== "unhide" && (!OPINION.has(e.kind as SignalKind) || lastOpinion.get(e.titleKey) === e.seq));
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

export const LEARN = { lr: 0.3, l2: 0.003, contrast: 2, contrastWeight: 0.1 } as const;

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sgd(s: LearnerState, x: SparseVec, y: 0 | 1, weight: number) {
  const p = sigmoid(logit(s, x));
  const g = (p - y) * weight;
  for (let k = 0; k < x.idx.length; k++) {
    const i = x.idx[k]!;
    const gi = g * x.val[k]! + LEARN.l2 * s.w[i]!;
    s.g2[i] = s.g2[i]! + gi * gi;
    s.w[i] = s.w[i]! - (LEARN.lr / Math.sqrt(1e-6 + s.g2[i]!)) * gi;
  }
  s.bias -= 0.02 * g;
}

export function logit(s: LearnerState, x: SparseVec): number {
  let z = s.bias;
  for (let k = 0; k < x.idx.length; k++) z += x.val[k]! * s.w[x.idx[k]!]!;
  return z;
}

export function predict(s: LearnerState, x: SparseVec): number {
  return sigmoid(logit(s, x));
}

export interface TrainInput {
  profileId: string;
  events: EventRecord[];
  titles: Map<string, Title> | Record<string, Title>;
  /** Catalogue titles used as low-weight contrast samples. */
  pool?: Title[];
  forgotten?: Set<string>;
  resetAt?: number;
  now?: number;
}

/** Deterministic full replay. */
export function train(input: TrainInput): LearnerState {
  const now = input.now ?? Date.now();
  const get = (k: string) => (input.titles instanceof Map ? input.titles.get(k) : input.titles[k]);
  const s = emptyState(input.profileId);
  const events = effectiveEvents(input.events, input.forgotten, input.resetAt);
  s.eventCount = input.events.length;
  const chapterCount = new Map<string, number>();
  const pool = (input.pool ?? []).filter((t) => t.meta);
  for (const e of events) {
    const sig = SIGNAL_WEIGHTS[e.kind as SignalKind];
    if (!sig) continue;
    const t = get(e.titleKey);
    if (!t?.meta) continue; // features unknown: cannot learn from it
    let w = sig.w;
    if (e.kind === "chapter_read") {
      // diminishing returns: one long binge must not dominate the profile
      const c = (chapterCount.get(e.titleKey) ?? 0) + 1;
      chapterCount.set(e.titleKey, c);
      w = sig.w / Math.sqrt(c);
    }
    const x = vectorize(t);
    const sign = sig.y ? 1 : -1;
    const age = now - e.at;
    const ws = sign * w * decay(age, SHORT_HALF_LIFE_DAYS);
    const wl = sign * w * decay(age, LONG_HALF_LIFE_DAYS);
    for (let k = 0; k < x.idx.length; k++) {
      const i = x.idx[k]!;
      s.shortT[i] = s.shortT[i]! + ws * x.val[k]!;
      s.longT[i] = s.longT[i]! + wl * x.val[k]!;
    }
    sgd(s, x, sig.y, w);
    s.n++;
    if (sig.y) s.liked[e.titleKey] = (s.liked[e.titleKey] ?? 0) + wl;
    else s.disliked[e.titleKey] = (s.disliked[e.titleKey] ?? 0) - wl;
    for (const [key, fw] of featureKeys(t)) {
      if (key.startsWith("gp:")) continue;
      const a = (s.affinity[key] ??= { pos: 0, neg: 0, score: 0, titles: [], lastAt: 0 });
      if (sig.y) {
        a.pos++;
        if (!a.titles.includes(e.titleKey)) a.titles = [e.titleKey, ...a.titles].slice(0, 5);
      } else a.neg++;
      a.score += wl * fw;
      a.lastAt = Math.max(a.lastAt, e.at);
    }
    if (sig.y && pool.length) {
      const r = rng(e.seq * 7919 + 17);
      for (let c = 0; c < LEARN.contrast; c++) {
        const other = pool[Math.floor(r() * pool.length)]!;
        if (other.key === e.titleKey || s.liked[other.key]) continue;
        sgd(s, vectorize(other), 0, LEARN.contrastWeight);
      }
    }
  }
  s.trainedAt = now;
  return s;
}

/** Evidence in [0, 1): how much the profile's own behaviour should drive ranking. */
export function evidence(s: LearnerState): number {
  const positives = Object.values(s.liked).filter((v) => v > 0).length;
  return positives / (positives + 4);
}

// ---------------------------------------------------------------- persistence

export interface SerializedState extends Omit<LearnerState, "w" | "g2" | "shortT" | "longT"> {
  w: number[];
  shortT: number[];
  longT: number[];
}

/** Compact: only non-zero slots are stored (sparse pairs). */
export function serialize(s: LearnerState): SerializedState {
  const pack = (v: Float32Array) => {
    const out: number[] = [];
    for (let i = 0; i < v.length; i++) if (v[i] !== 0) out.push(i, Math.round(v[i]! * 1e5) / 1e5);
    return out;
  };
  const { g2: _g2, ...rest } = s;
  void _g2;
  return { ...rest, w: pack(s.w), shortT: pack(s.shortT), longT: pack(s.longT) };
}

export function deserialize(x: SerializedState): LearnerState | null {
  if (!x || x.schema !== SCHEMA) return null;
  const unpack = (pairs: number[]) => {
    const v = new Float32Array(DIM);
    for (let i = 0; i + 1 < pairs.length; i += 2) v[pairs[i]!] = pairs[i + 1]!;
    return v;
  };
  return { ...x, w: unpack(x.w), g2: new Float32Array(DIM), shortT: unpack(x.shortT), longT: unpack(x.longT) };
}
