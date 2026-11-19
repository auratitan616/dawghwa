/**
 * Types mirroring the Dawghwa API contract (dawghwa.api docs/API.md).
 * Only fields the API documents are declared; optional ones stay optional.
 */

export type MangaKind = "manga" | "manhwa" | "manhua" | "comic";
export type SourceStatus = "active" | "unstable" | "shutdown" | "disabled";

export interface SourceCapabilities {
  search: boolean;
  chapters: boolean;
  mangaInfo: boolean;
  frontpage: boolean;
  chapterPages: boolean;
  browse?: boolean;
  clientOnly: boolean;
}

export interface Source {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;
  clientOnly: boolean;
  type: "scanlator" | "aggregator";
  status: SourceStatus;
  statusNote?: string;
  priority: number;
  capabilities: SourceCapabilities;
  circuit?: string;
}

export interface MangaMetadata {
  altTitles?: string[];
  description?: string;
  tags?: string[];
  genres?: string[];
  themes?: string[];
  formats?: string[];
  kind?: MangaKind;
  longStrip?: boolean;
  originalLanguage?: string;
  demographic?: string;
  status?: string;
  year?: number;
  contentRating?: string;
  authors?: string[];
  artists?: string[];
  rating?: number;
  follows?: number;
  coverImageLarge?: string;
  availableLanguages?: string[];
  lastChapter?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  coverImage?: string;
  latestChapter: number;
  lastUpdated: string;
  lastUpdatedTimestamp?: number;
  rating?: number;
  followers?: string;
  metadata?: MangaMetadata;
}

export interface CacheMeta {
  cache?: "hit" | "stale" | "miss" | "bypass";
  age?: number;
  durationMs?: number;
}

export interface SingleSearchResponse {
  results: SearchResult[];
  source: string;
  sourceId: string;
  meta?: CacheMeta & { total?: number };
}

export interface StreamLine {
  source: string;
  sourceId: string;
  results: SearchResult[];
  error?: string;
  errorCode?: string;
  done: false;
  cached?: boolean;
  durationMs?: number;
}

export interface StreamSummary {
  done: true;
  totalSources: number;
  completedSources: number;
  failedSources: number;
  timedOutSources: number;
  totalResults: number;
  durationMs: number;
}

export type Edition = "official" | "scanlation" | "unknown";
export type ChapterKind = "prologue" | "regular" | "epilogue" | "special" | "oneshot" | "unnumbered";

/** One provider upload of a canonical chapter. */
export interface ChapterVariant {
  /** `<sourceId>:<providerChapterId>` */
  variantId?: string;
  sourceId: string;
  source: string;
  providerChapterId: string;
  url: string;
  language?: string | null;
  edition?: Edition;
  group?: { id: string; name: string; url?: string };
  title?: string;
  volume?: string;
  originalNumber?: string | null;
  publishedAt?: string;
  lastUpdated?: string;
  pages?: number;
  /** exact | number | source-only: how the API attached this variant to the row. */
  match?: "exact" | "number" | "source-only";
}

export interface Chapter {
  /** Canonical chapter key for unified lists; provider chapter id for legacy single-source lists. */
  id: string;
  /** Float value for ordering / legacy displays. */
  number: number;
  /** Exact chapter number string ("1.10" stays "1.10"); null when unnumbered. */
  numberText?: string | null;
  kind?: ChapterKind;
  /** Human label ("Chapter 10.5", "Prologue", "Bonus Episode 2"). */
  display?: string;
  title?: string;
  url: string;
  lastUpdated?: string;
  language?: string | null;
  volume?: string;
  season?: number;
  translations?: number;
  group?: { id: string; name: string; url?: string };
  /** Provider-specific readable versions of this chapter. */
  variants?: ChapterVariant[];
}

export interface UnifiedChapterRow {
  key: string;
  canonicalTitleId: string;
  kind: ChapterKind;
  number: string | null;
  numberValue: number;
  season?: number;
  volume?: string;
  title?: string;
  display: string;
  language: string | null;
  publishedAt?: string;
  translations: number;
  variants: ChapterVariant[];
  order: number;
}

export interface UnifiedSourceReport {
  sourceId: string;
  source: string;
  status: "linked" | "loading" | "ok" | "error" | "timeout" | "cancelled" | "no-match" | "review";
  chapterCount?: number;
  durationMs?: number;
  error?: string;
  errorCode?: string;
  link?: { providerTitleId: string; url: string; title: string; evidence: { method: string; decision: string; confidence: number; reason: string } };
}

export interface UnifiedSummary {
  canonicalTitleId: string;
  readerProviders: number;
  linkedSources: number;
  succeededSources: number;
  failedSources: number;
  totalChapters: number;
  totalVariants: number;
  mergedRows: number;
  firstResultMs?: number;
  durationMs: number;
}

export interface UnifiedChaptersResponse {
  title: { id: string; ref: string; title: string };
  chapters: UnifiedChapterRow[];
  totalChapters: number;
  languages: string[];
  sources: UnifiedSourceReport[];
  summary: UnifiedSummary;
}

export type UnifiedStreamEvent =
  | { event: "identity"; title: { id: string; ref: string; title: string } }
  | { event: "source"; report: UnifiedSourceReport }
  | { event: "chapters"; chapters: UnifiedChapterRow[]; complete: boolean; sourcesDone: number; sourcesTotal: number }
  | { event: "summary"; summary: UnifiedSummary }
  | { event: "error"; error: string };

export interface ChaptersResponse {
  chapters: Chapter[];
  source: string;
  sourceId: string;
  totalChapters: number;
  pagination?: { offset: number; limit: number; returned: number; total: number; hasMore: boolean };
  meta?: CacheMeta;
}

export interface MangaResponse {
  manga: { title: string; id: string; url: string; coverImage?: string; metadata?: MangaMetadata };
  source: string;
  sourceId: string;
  meta?: CacheMeta;
}

export interface ChapterPage {
  index: number;
  url: string;
  width?: number;
  height?: number;
}

export interface PagesResponse {
  pages: ChapterPage[];
  totalPages: number;
  source: string;
  sourceId: string;
  chapterId?: string;
  meta?: CacheMeta & { dataSaver?: boolean };
}

export type BrowseOrder = "popular" | "rating" | "latest" | "new" | "relevance" | "title";

export interface BrowseQuery {
  source?: string;
  query?: string;
  includedTags?: string[];
  excludedTags?: string[];
  kinds?: MangaKind[];
  status?: ("ongoing" | "completed" | "hiatus" | "cancelled")[];
  demographic?: ("shounen" | "shoujo" | "seinen" | "josei" | "none")[];
  year?: number;
  order?: BrowseOrder;
  offset?: number;
  limit?: number;
}

export interface BrowseResponse {
  items: SearchResult[];
  total: number;
  pagination: { offset: number; limit: number; returned: number; total: number; hasMore: boolean };
  source: string;
  sourceId: string;
  meta?: CacheMeta;
}

export interface BrowseVocabulary {
  source: string;
  sourceId: string;
  tags: { name: string; group: "genre" | "theme" | "format" | "content" | string }[];
  kinds: MangaKind[];
  status: string[];
  demographic: string[];
  orders: BrowseOrder[];
  maxOffset: number;
  maxLimit: number;
}

export interface HealthEntry {
  status: "healthy" | "cloudflare" | "timeout" | "error";
  message?: string;
  responseTime?: number;
  lastChecked?: string;
  errorCode?: string;
  circuit?: string;
}

export interface ApiIndex {
  name: string;
  version: string;
  endpoints: string[];
}

export interface ApiErrorBody {
  error: string;
  code: string;
  requestId?: string;
  details?: Record<string, unknown>;
}
