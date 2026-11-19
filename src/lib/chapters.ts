/**
 * Client-side rules for the unified chapter list and the native reader.
 *
 * Pure functions only (unit tested in chapters.test.ts):
 *   - converting API rows to `Chapter`
 *   - finding a chapter by canonical key OR a legacy provider chapter id
 *     (progress saved before the unified list keeps working)
 *   - choosing which provider version (variant) to read
 *   - deciding which variants are acceptable automatic fallbacks
 *   - mapping a page position between versions with different page counts
 */
import type { Chapter, ChapterVariant, UnifiedChapterRow } from "@/lib/api/types";

export function variantIdOf(v: Pick<ChapterVariant, "variantId" | "sourceId" | "providerChapterId">): string {
  return v.variantId ?? `${v.sourceId}:${v.providerChapterId}`;
}

export function toChapter(row: UnifiedChapterRow): Chapter {
  const primary = row.variants[0];
  return {
    id: row.key,
    number: row.numberValue,
    numberText: row.number,
    kind: row.kind,
    display: row.display,
    title: row.title,
    url: primary?.url ?? "",
    lastUpdated: row.publishedAt ?? primary?.publishedAt ?? primary?.lastUpdated,
    language: row.language,
    volume: row.volume,
    season: row.season,
    translations: row.translations,
    group: primary?.group,
    variants: row.variants.map((v) => ({ ...v, variantId: variantIdOf(v) })),
  };
}

/** Every id this chapter has been known by (canonical key, provider ids, variant ids). */
export function chapterAliases(c: { id: string; variants?: Pick<ChapterVariant, "providerChapterId" | "variantId">[] }): string[] {
  const out = new Set<string>([c.id]);
  for (const v of c.variants ?? []) {
    out.add(v.providerChapterId);
    if (v.variantId) out.add(v.variantId);
  }
  return [...out];
}

/**
 * Find a chapter by canonical key, falling back to legacy provider chapter ids
 * (reading history saved before chapters had canonical keys).
 */
export function findChapter(list: Chapter[], id: string | undefined): { chapter: Chapter; index: number; legacy: boolean } | undefined {
  if (!id) return undefined;
  const direct = list.findIndex((c) => c.id === id);
  if (direct >= 0) return { chapter: list[direct]!, index: direct, legacy: false };
  const legacy = list.findIndex((c) => c.variants?.some((v) => v.providerChapterId === id || v.variantId === id));
  return legacy >= 0 ? { chapter: list[legacy]!, index: legacy, legacy: true } : undefined;
}

export function isChapterRead(read: Record<string, number> | undefined, c: Chapter): boolean {
  if (!read) return false;
  return chapterAliases(c).some((a) => Boolean(read[a]));
}

export interface VariantPreference {
  /** Explicit `<sourceId>:<id>` from the URL. */
  variantId?: string | null;
  /** Explicit source from the URL (`s=`). */
  sourceId?: string | null;
  /** The version read last (same title), to stay on the same source/group. */
  previous?: Pick<ChapterVariant, "sourceId" | "group" | "edition" | "language"> | null;
  /** Variants that failed in this session; never picked again automatically. */
  failed?: ReadonlySet<string>;
}

/**
 * Pick the version to read. Explicit choices win; otherwise keep the previous
 * source + group, then the previous source, then same edition, then the row's
 * first version. Failed variants are skipped unless they are the only option
 * and were explicitly requested.
 */
export function pickVariant(c: Chapter | undefined, pref: VariantPreference = {}): ChapterVariant | undefined {
  const vs = c?.variants ?? [];
  if (!vs.length) return undefined;
  const failed = pref.failed ?? new Set<string>();
  if (pref.variantId) {
    const v = vs.find((x) => variantIdOf(x) === pref.variantId);
    if (v) return v;
  }
  const ok = vs.filter((v) => !failed.has(variantIdOf(v)));
  const pool = ok.length ? ok : vs;
  if (pref.sourceId) {
    const bySource = pool.filter((v) => v.sourceId === pref.sourceId);
    const sameGroup = pref.previous?.group ? bySource.find((v) => v.group?.id === pref.previous!.group!.id) : undefined;
    if (sameGroup ?? bySource[0]) return sameGroup ?? bySource[0];
  }
  const p = pref.previous;
  if (p) {
    return (
      pool.find((v) => v.sourceId === p.sourceId && p.group && v.group?.id === p.group.id) ??
      pool.find((v) => v.sourceId === p.sourceId) ??
      pool.find((v) => p.edition && v.edition === p.edition) ??
      pool[0]
    );
  }
  return pool[0];
}

export interface FallbackPlan {
  /** Same canonical chapter, same language, same edition: safe to switch to automatically. */
  automatic: ChapterVariant[];
  /** Same chapter and language but a different edition (official vs scanlation): the reader must choose. */
  manual: ChapterVariant[];
}

/**
 * Which other versions of *this* chapter may replace a failed one. Never a
 * different chapter, never a different or unknown language.
 */
export function fallbackPlan(c: Chapter, failed: ChapterVariant, tried: ReadonlySet<string> = new Set()): FallbackPlan {
  // `undefined` inherits the row language; an explicit `null` means unknown and is never a fallback target
  const langOf = (x: ChapterVariant) => (x.language === undefined ? (c.language ?? null) : x.language);
  const lang = langOf(failed);
  const out: FallbackPlan = { automatic: [], manual: [] };
  if (!lang) return out;
  const failedId = variantIdOf(failed);
  for (const v of c.variants ?? []) {
    const id = variantIdOf(v);
    if (id === failedId || tried.has(id)) continue;
    if (langOf(v) !== lang) continue;
    if (v.match === "source-only") continue;
    const sameEdition = (v.edition ?? "unknown") === (failed.edition ?? "unknown");
    (sameEdition ? out.automatic : out.manual).push(v);
  }
  // prefer another upload on a different provider (the failure is usually provider-wide)
  const rank = (v: ChapterVariant) => (v.sourceId !== failed.sourceId ? 0 : 1);
  out.automatic.sort((a, b) => rank(a) - rank(b));
  return out;
}

export interface MappedPosition {
  page: number;
  exact: boolean;
}

/**
 * Map a page index from one version to another. Same page count: same page
 * (exact). Otherwise the closest page by reading fraction (approximate).
 */
export function mapPosition(page: number, fromCount: number, toCount: number): MappedPosition {
  if (toCount <= 0) return { page: 0, exact: false };
  if (fromCount <= 0 || page <= 0) return { page: 0, exact: page <= 0 };
  if (fromCount === toCount) return { page: Math.min(page, toCount - 1), exact: true };
  const fraction = page / Math.max(1, fromCount - 1);
  return { page: Math.min(toCount - 1, Math.max(0, Math.round(fraction * (toCount - 1)))), exact: false };
}

/** Short badge for the chapter number column: exact digits, or a kind marker. */
export function chapterBadge(c: Pick<Chapter, "numberText" | "number" | "kind">): string {
  if (c.numberText) return c.numberText;
  switch (c.kind) {
    case "prologue":
      return "Pro";
    case "epilogue":
      return "Epi";
    case "oneshot":
      return "One";
    case "special":
      return "SP";
    case "unnumbered":
      return "—";
    default:
      return String(c.number);
  }
}

export function chapterLabel(c: Pick<Chapter, "display" | "title" | "number" | "numberText" | "kind">): string {
  if (c.display) {
    // "Chapter 3" + meaningful title -> "Chapter 3: Rain"; specials already use their title
    if (c.title && c.kind === "regular" && !/^(?:chapter|episode|ep\.?|ch\.?)\s*[\d.]+$/i.test(c.title.trim()) && c.title !== c.display) return `${c.display}: ${c.title}`;
    return c.display;
  }
  return c.title || `Chapter ${c.numberText ?? c.number}`;
}

const LANG_NAMES: Record<string, string> = { en: "EN", "es-la": "ES-LA", es: "ES", fr: "FR", "pt-br": "PT-BR", id: "ID", de: "DE", it: "IT", th: "TH", "zh-hant": "ZH" };
export function languageLabel(lang: string | null | undefined): string {
  if (!lang) return "?";
  return LANG_NAMES[lang] ?? lang.toUpperCase();
}

export function editionLabel(e: ChapterVariant["edition"]): string {
  return e === "official" ? "Official" : e === "scanlation" ? "Fan translation" : "Unknown edition";
}
