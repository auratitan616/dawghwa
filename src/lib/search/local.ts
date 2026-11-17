import type { Title } from "../titles";
import { detectThemes } from "../intel/themes";
import type { Intent } from "./intent";

/** Normalise for matching: lower-case, strip accents/punctuation. */
export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Title relevance in [0, 1] against the main title and alternative titles:
 * exact 1, prefix 0.85, all tokens 0.7, partial token overlap below that.
 */
export function textScore(t: Pick<Title, "title" | "meta">, query: string): number {
  const q = norm(query);
  if (!q) return 0;
  const qTokens = q.split(" ");
  let best = 0;
  for (const name of [t.title, ...(t.meta?.altTitles ?? [])]) {
    const n = norm(name);
    if (!n) continue;
    if (n === q) return 1;
    if (n.startsWith(q)) best = Math.max(best, 0.85);
    else if (n.includes(q)) best = Math.max(best, 0.75);
    const tokens = new Set(n.split(" "));
    const hit = qTokens.filter((x) => tokens.has(x) || [...tokens].some((tk) => tk.startsWith(x) && x.length >= 3)).length;
    if (hit) best = Math.max(best, 0.7 * (hit / qTokens.length) * (hit === qTokens.length ? 1 : 0.8));
  }
  return best;
}

export interface LocalResult {
  kept: Title[];
  /** How many fetched titles the local filters removed. */
  removed: number;
  /** Titles without the metadata a local filter needs (cannot be judged, removed). */
  unknown: number;
}

const lc = (xs?: string[]) => new Set((xs ?? []).map((x) => x.toLowerCase()));

/** Hidden gem: well rated, followed by relatively few readers. */
export const GEM = { minRating: 7.6, maxFollows: 25_000, minFollows: 300 };
export const isGem = (t: Title) => (t.rating ?? 0) >= GEM.minRating && (t.follows ?? Infinity) <= GEM.maxFollows && (t.follows ?? 0) >= GEM.minFollows;

/** Filters the API cannot apply, run on this device over fetched results. */
export function applyLocal(items: Title[], i: Intent): LocalResult {
  let unknown = 0;
  const kept = items.filter((t) => {
    const m = t.meta;
    const needsMeta = i.includeThemes.length || i.excludeThemes.length || i.anyTags.length;
    if (needsMeta && !m) {
      unknown++;
      return false;
    }
    const tags = lc(m?.tags);
    const themes = new Set(detectThemes(t));
    if (i.includeThemes.some((x) => !themes.has(x))) return false;
    if (i.excludeThemes.some((x) => themes.has(x))) return false;
    if (i.anyTags.some((g) => !g.tags.some((x) => tags.has(x.toLowerCase())))) return false;
    // client-side tag checks also cover sources whose browse ignores tags
    if (m?.tags && i.includeTags.some((x) => !tags.has(x.toLowerCase()))) return false;
    if (m?.tags && i.excludeTags.some((x) => tags.has(x.toLowerCase()))) return false;
    const ch = t.latestChapter ?? m?.lastChapter;
    if (i.maxChapters !== undefined) {
      if (!ch) {
        unknown++;
        return false;
      }
      if (ch > i.maxChapters) return false;
    }
    if (i.minChapters !== undefined && (!ch || ch < i.minChapters)) return false;
    if (i.yearMin && (!m?.year || m.year < i.yearMin)) return false;
    if (i.yearMax && (!m?.year || m.year > i.yearMax)) return false;
    if (i.hiddenGems && !isGem(t)) return false;
    if (i.demographic.length && !(m?.demographic && (i.demographic as string[]).includes(m.demographic.toLowerCase()))) return false;
    return true;
  });
  return { kept, removed: items.length - kept.length - unknown, unknown };
}
