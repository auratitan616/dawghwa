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

export interface Chapter {
  id: string;
  number: number;
  title?: string;
  url: string;
  lastUpdated?: string;
  group?: { id: string; name: string; url?: string };
}

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

export type BrowseOrder = "popular" | "rating" | "latest" | "new" | "relevance" | "year";

export interface BrowseQuery {
  source?: string;
  query?: string;
  includedTags?: string[];
  excludedTags?: string[];
  includedTagsMode?: "and" | "or";
  kinds?: MangaKind[];
  status?: ("ongoing" | "completed" | "hiatus" | "cancelled")[];
  demographic?: ("shounen" | "shoujo" | "seinen" | "josei" | "none")[];
  year?: number;
  createdWithinDays?: number;
  order?: BrowseOrder;
  offset?: number;
  limit?: number;
  withStats?: boolean;
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
