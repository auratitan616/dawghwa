import type { MangaKind, MangaMetadata, SearchResult } from "./api/types";

/**
 * Dawghwa's canonical title snapshot. Built only from API data; fields the API
 * did not provide stay undefined.
 */
export interface Title {
  key: string; // `${sourceId}:${id}`
  sourceId: string;
  sourceName?: string;
  id: string;
  url: string;
  title: string;
  cover?: string;
  coverLarge?: string;
  latestChapter?: number;
  updatedAt?: number;
  rating?: number;
  follows?: number;
  meta?: MangaMetadata;
}

export const titleKey = (sourceId: string, id: string) => `${sourceId}:${id}`;

export function fromResult(r: SearchResult, sourceId: string, sourceName?: string): Title {
  const follows = r.metadata?.follows ?? (r.followers !== undefined ? Number(String(r.followers).replace(/[^\d.]/g, "")) : undefined);
  return {
    key: titleKey(sourceId, r.id),
    sourceId,
    sourceName,
    id: r.id,
    url: r.url,
    title: r.title,
    cover: r.coverImage,
    coverLarge: r.metadata?.coverImageLarge ?? r.coverImage,
    latestChapter: r.latestChapter || r.metadata?.lastChapter || undefined,
    updatedAt: r.lastUpdatedTimestamp,
    rating: r.metadata?.rating ?? r.rating,
    follows: Number.isFinite(follows) ? follows : undefined,
    meta: r.metadata,
  };
}

/** Merge a newer snapshot into an older one without losing richer fields. */
export function mergeTitle(a: Title | undefined, b: Title): Title {
  if (!a) return b;
  return {
    ...a,
    ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)),
    meta: b.meta || a.meta ? { ...(a.meta ?? {}), ...(b.meta ?? {}) } : undefined,
  } as Title;
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Sources whose ids are stable and resolvable by the API (`/api/manga { source, id }`). */
const ID_ADDRESSABLE = new Set(["mangadex"]);
export const isIdAddressable = (sourceId: string) => ID_ADDRESSABLE.has(sourceId);

export function titlePath(t: Pick<Title, "sourceId" | "id" | "title" | "url">): string {
  const slug = slugify(t.title);
  const base = `/title/${encodeURIComponent(t.sourceId)}/${encodeURIComponent(t.id)}${slug ? `/${slug}` : ""}`;
  return isIdAddressable(t.sourceId) ? base : `${base}?u=${encodeURIComponent(t.url)}`;
}

export function readerPath(t: Pick<Title, "sourceId" | "id">, chapterId: string, page?: number): string {
  return `/read/${encodeURIComponent(t.sourceId)}/${encodeURIComponent(t.id)}/${encodeURIComponent(chapterId)}${page ? `?p=${page}` : ""}`;
}

export function kindLabel(k?: MangaKind): string | undefined {
  return k ? { manga: "Manga", manhwa: "Manhwa", manhua: "Manhua", comic: "Comic" }[k] : undefined;
}

/** Long-strip / webtoon presentation: provider flag first, otherwise the format kind. */
export function prefersVertical(t?: Title): boolean {
  if (!t?.meta) return false;
  if (t.meta.longStrip !== undefined) return t.meta.longStrip;
  return t.meta.kind === "manhwa" || t.meta.kind === "manhua";
}

export function statusLabel(s?: string): string | undefined {
  if (!s) return undefined;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function compactNumber(n?: number): string | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

const MATURE_TAGS = new Set(["ecchi", "hentai", "smut", "adult", "mature", "sexual violence"]);
/** Marked suggestive or adult by the provider (content rating or genre). Never guessed from the cover. */
export function isMature(t?: Title): boolean {
  const m = t?.meta;
  if (!m) return false;
  if (m.contentRating && ["suggestive", "erotica", "pornographic"].includes(m.contentRating)) return true;
  return [...(m.genres ?? []), ...(m.tags ?? [])].some((g) => MATURE_TAGS.has(g.toLowerCase()));
}
