import { apiUrl, fetchOnce, parseNdjson, request } from "./client";
import { ApiError, toApiError } from "./errors";
import { browseCatalog, catalogTitle, catalogVocabulary } from "./catalog";
import type {
  ApiIndex,
  BrowseQuery,
  ChaptersResponse,
  UnifiedChaptersResponse,
  UnifiedStreamEvent,
  HealthEntry,
  MangaResponse,
  PagesResponse,
  SingleSearchResponse,
  Source,
  StreamLine,
  StreamSummary,
} from "./types";

type Opt = { signal?: AbortSignal };

export const api = {
  index: (o: Opt = {}) => request<ApiIndex>("/api", { signal: o.signal, timeoutMs: 8000 }),

  sources: (o: Opt = {}) =>
    request<{ sources: Source[]; total: number }>("/api/sources", { signal: o.signal, timeoutMs: 10_000 }),

  source: (id: string, o: Opt = {}) =>
    request<{ source: Source }>(`/api/sources/${encodeURIComponent(id)}`, { signal: o.signal }),

  /** Single-source search (JSON). */
  search: (query: string, source: string, o: Opt = {}) =>
    request<SingleSearchResponse>("/api/search", { body: { query, source }, signal: o.signal, timeoutMs: 20_000 }),

  chapters: (
    b: { url: string; source?: string; order?: "source" | "asc" | "desc"; offset?: number; limit?: number },
    o: Opt = {},
  ) => request<ChaptersResponse>("/api/chapters", { body: b, signal: o.signal, timeoutMs: 40_000 }),

  /** Unified, reader-capable chapters across matching providers for a metadata title. */
  unifiedChapters: (
    b: { source: string; id: string; limit?: number; refresh?: boolean },
    o: Opt = {},
  ) => {
    const ref = encodeURIComponent(`${b.source}:${b.id}`);
    const params = new URLSearchParams();
    if (b.limit) params.set("limit", String(b.limit));
    if (b.refresh) params.set("refresh", "1");
    return request<UnifiedChaptersResponse>(`/api/titles/${ref}/chapters/all?${params.toString()}`, {
      signal: o.signal,
      timeoutMs: 60_000,
      retries: 0,
    });
  },

  manga: (b: { url: string; source?: string }, o: Opt = {}) =>
    request<MangaResponse>("/api/manga", { body: b, signal: o.signal, timeoutMs: 20_000 }),

  pages: (b: { source: string; chapterId: string; url?: string; dataSaver?: boolean; refresh?: boolean } | { url: string; source?: string; chapterId?: string; dataSaver?: boolean; refresh?: boolean }, o: Opt = {}) =>
    // page URLs expire (MangaDex@Home) so the request is never de-duplicated across screens for long
    request<PagesResponse>("/api/pages", { body: b, signal: o.signal, timeoutMs: 20_000 }),

  /** Catalogue browsing over GET /api/catalog (see ./catalog.ts for what is applied where). */
  browse: (q: BrowseQuery, o: Opt = {}) => browseCatalog(q, o),

  /** Filter vocabulary from GET /api/catalog/filters. */
  vocabulary: (o: Opt = {}) => catalogVocabulary(o),

  /** Full title metadata from GET /api/titles/mangadex:{id}. */
  title: (id: string, o: Opt = {}) => catalogTitle(id, o),

  /** Tell the API a chapter version failed in the reader (and whether fallback worked). Best effort. */
  report: (b: { sourceId: string; kind: "pages" | "image" | "empty"; chapterKey?: string; providerChapterId?: string; errorCode?: string; fallback?: { attempted: boolean; succeeded: boolean; toSourceId?: string } }) =>
    request<{ accepted: boolean }>("/api/reports", { body: b, timeoutMs: 8000, retries: 0 }).catch(() => undefined),

  health: (o: Opt = {}) =>
    request<{ sources: Record<string, HealthEntry>; summary?: Record<string, number>; stale?: boolean }>("/api/health", {
      signal: o.signal,
      timeoutMs: 60_000,
      retries: 0,
    }),
};

export interface StreamSearchOptions {
  sources?: string[];
  signal?: AbortSignal;
  onLine: (line: StreamLine) => void;
  timeoutMs?: number;
}

/**
 * Multi-source search over the NDJSON stream. Each source's line is delivered
 * to `onLine` as soon as it arrives, so the UI fills in progressively instead
 * of waiting for the slowest source.
 */
export async function streamSearch(query: string, opts: StreamSearchOptions): Promise<StreamSummary | undefined> {
  const body = opts.sources?.length ? { query, sources: opts.sources } : { query, source: "all" };
  let res: Response;
  try {
    res = await fetchOnce(
      apiUrl("/api/search"),
      { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(body) },
      opts.timeoutMs ?? 30_000,
      opts.signal,
    );
  } catch (e) {
    throw toApiError(e);
  }
  if (!res.body) throw new ApiError({ kind: "parse", message: "Streaming not supported" });
  let summary: StreamSummary | undefined;
  try {
    for await (const line of parseNdjson<StreamLine | StreamSummary>(res.body)) {
      if (opts.signal?.aborted) break;
      if ((line as StreamSummary).done === true) summary = line as StreamSummary;
      else if ((line as StreamLine).sourceId) opts.onLine(line as StreamLine);
    }
  } catch (e) {
    if (opts.signal?.aborted) throw new ApiError({ kind: "aborted", message: "Aborted" });
    throw toApiError(e);
  }
  return summary;
}

export interface UnifiedStreamOptions {
  refresh?: boolean;
  signal?: AbortSignal;
  onEvent: (e: UnifiedStreamEvent) => void;
  timeoutMs?: number;
}

/**
 * Progressive unified chapter list (NDJSON). `chapters` events carry a full
 * merged snapshot after each provider finishes, so the UI can render the first
 * provider's chapters while slower ones load. Throws ApiError on HTTP errors.
 */
export async function streamUnifiedChapters(ref: string, opts: UnifiedStreamOptions): Promise<void> {
  const params = new URLSearchParams({ stream: "1" });
  if (opts.refresh) params.set("refresh", "1");
  let res: Response;
  try {
    res = await fetchOnce(
      apiUrl(`/api/titles/${encodeURIComponent(ref)}/chapters/all?${params.toString()}`),
      { headers: { Accept: "application/x-ndjson" } },
      opts.timeoutMs ?? 60_000,
      opts.signal,
    );
  } catch (e) {
    throw toApiError(e);
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      /* not json */
    }
    throw new ApiError({ kind: "http", status: res.status, message });
  }
  if (!res.body) throw new ApiError({ kind: "parse", message: "Streaming not supported" });
  try {
    for await (const line of parseNdjson<UnifiedStreamEvent>(res.body)) {
      if (opts.signal?.aborted) break;
      if (line && typeof line === "object" && "event" in line) opts.onEvent(line);
    }
  } catch (e) {
    if (opts.signal?.aborted) throw new ApiError({ kind: "aborted", message: "Aborted" });
    throw toApiError(e);
  }
}
