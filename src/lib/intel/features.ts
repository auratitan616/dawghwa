import type { Title } from "../titles";
import { detectThemes } from "./themes";

/**
 * Hashed sparse feature vectors for titles (feature hashing, 2^12 slots).
 * Feature families and weights:
 *   g: genre 1.0 · t: theme 0.8 · s: story theme (synopsis) 0.9 · f: format 0.5
 *   k: kind 0.8 · lang: original language 0.4 · demo: demographic 0.5
 *   st: status 0.3 · len: chapter-count band 0.35 · era: year band 0.25
 *   a: author 0.9 · ar: artist 0.6 · gp: genre pair 0.4
 * Vectors are L2-normalised, so cosine similarity is a dot product.
 */

export const DIM = 4096;

export interface SparseVec {
  idx: Int32Array;
  val: Float32Array;
}

const FORMATS_KEPT = new Set(["long strip", "full color", "web comic", "oneshot", "adaptation", "4-koma", "official colored", "anthology"]);

function hash(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % DIM;
}

export function slot(key: string): number {
  return hash(key);
}

export function lengthBand(chapters?: number): string | undefined {
  if (!chapters || chapters <= 0) return undefined;
  if (chapters < 30) return "short";
  if (chapters < 100) return "medium";
  if (chapters < 250) return "long";
  return "epic";
}

function eraBand(year?: number): string | undefined {
  if (!year) return undefined;
  if (year < 2000) return "classic";
  if (year < 2012) return "2000s";
  if (year < 2019) return "2010s";
  return "recent";
}

const norm = (s: string) => s.trim().toLowerCase();

/** Human-readable feature keys of a title (used for explanations and Taste DNA). */
export function featureKeys(t: Title): [string, number][] {
  const m = t.meta;
  const out: [string, number][] = [];
  if (!m) return out;
  const genres = (m.genres ?? []).map(norm);
  for (const g of genres) out.push([`g:${g}`, 1]);
  for (const th of m.themes ?? []) out.push([`t:${norm(th)}`, 0.8]);
  for (const s of detectThemes(t)) out.push([`s:${s}`, 0.9]);
  for (const f of m.formats ?? []) if (FORMATS_KEPT.has(norm(f))) out.push([`f:${norm(f)}`, 0.5]);
  if (m.kind) out.push([`k:${m.kind}`, 0.8]);
  if (m.originalLanguage) out.push([`lang:${norm(m.originalLanguage)}`, 0.4]);
  if (m.demographic) out.push([`demo:${norm(m.demographic)}`, 0.5]);
  if (m.status) out.push([`st:${norm(m.status)}`, 0.3]);
  const len = lengthBand(t.latestChapter ?? m.lastChapter);
  if (len) out.push([`len:${len}`, 0.35]);
  const era = eraBand(m.year);
  if (era) out.push([`era:${era}`, 0.25]);
  for (const a of (m.authors ?? []).slice(0, 3)) out.push([`a:${norm(a)}`, 0.9]);
  for (const a of (m.artists ?? []).slice(0, 2)) out.push([`ar:${norm(a)}`, 0.6]);
  const sorted = [...genres].sort();
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length && j < i + 4; j++) out.push([`gp:${sorted[i]}+${sorted[j]}`, 0.4]);
  return out;
}

const vecCache = new WeakMap<object, SparseVec>();

export function vectorize(t: Title): SparseVec {
  const cacheKey = t.meta ?? t;
  const hit = vecCache.get(cacheKey);
  if (hit) return hit;
  const acc = new Map<number, number>();
  for (const [k, w] of featureKeys(t)) {
    const i = slot(k);
    acc.set(i, (acc.get(i) ?? 0) + w);
  }
  let n = 0;
  acc.forEach((v) => (n += v * v));
  n = Math.sqrt(n) || 1;
  const idx = new Int32Array(acc.size);
  const val = new Float32Array(acc.size);
  let i = 0;
  for (const [k, v] of [...acc.entries()].sort((a, b) => a[0] - b[0])) {
    idx[i] = k;
    val[i++] = v / n;
  }
  const vec = { idx, val };
  vecCache.set(cacheKey, vec);
  return vec;
}

export function dot(x: SparseVec, dense: Float32Array): number {
  let s = 0;
  for (let k = 0; k < x.idx.length; k++) s += x.val[k]! * dense[x.idx[k]!]!;
  return s;
}

export function denseNorm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  return Math.sqrt(s);
}

export function cosineDense(x: SparseVec, dense: Float32Array, n = denseNorm(dense)): number {
  return n > 0 ? dot(x, dense) / n : 0;
}

/** Cosine of two normalised sparse vectors (merge join on sorted indices). */
export function cosineSparse(a: SparseVec, b: SparseVec): number {
  let i = 0;
  let j = 0;
  let s = 0;
  while (i < a.idx.length && j < b.idx.length) {
    const ai = a.idx[i]!;
    const bj = b.idx[j]!;
    if (ai === bj) s += a.val[i++]! * b.val[j++]!;
    else if (ai < bj) i++;
    else j++;
  }
  return s;
}

/** Feature-key label for UI ("g:fantasy" -> "fantasy"). */
export function featureLabel(key: string): string {
  const [fam, rest = ""] = key.split(/:(.*)/s);
  if (fam === "s") return ({ revenge: "revenge stories", regression: "regression stories", reincarnation: "reincarnation stories", overpowered: "overpowered leads", cultivation: "cultivation stories", dungeon: "dungeon and tower stories", system: "game-system stories", villainess: "villainess stories", love_triangle: "love triangles", worldbuilding: "big world-building" } as Record<string, string>)[rest] ?? rest;
  if (fam === "k") return rest === "manhwa" ? "manhwa" : rest === "manhua" ? "manhua" : rest === "manga" ? "manga" : "comics";
  if (fam === "len") return ({ short: "short series", medium: "mid-length series", long: "long series", epic: "very long series" } as Record<string, string>)[rest] ?? rest;
  if (fam === "st") return `${rest} series`;
  if (fam === "gp") return rest.replace("+", " + ");
  return rest;
}
