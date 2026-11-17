import { apiUrl, fetchOnce, parseNdjson, request } from "./client";
import { ApiError, toApiError } from "./errors";
import type {
  ApiIndex,
  BrowseQuery,
  BrowseResponse,
  BrowseVocabulary,
  ChaptersResponse,
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

  manga: (b: { url: string; source?: string } | { source: string; id: string }, o: Opt = {}) =>
    request<MangaResponse>("/api/manga", { body: b, signal: o.signal, timeoutMs: 20_000 }),

  pages: (b: { source: string; chapterId: string; dataSaver?: boolean } | { url: string; dataSaver?: boolean }, o: Opt = {}) =>
    // page URLs expire (MangaDex@Home) so the request is never de-duplicated across screens for long
    request<PagesResponse>("/api/pages", { body: b, signal: o.signal, timeoutMs: 20_000 }),

  browse: (q: BrowseQuery, o: Opt = {}) =>
    request<BrowseResponse>("/api/browse", { body: q, signal: o.signal, timeoutMs: 20_000 }),

  browseSources: (o: Opt = {}) => request<{ sources: { id: string; name: string }[] }>("/api/browse", { signal: o.signal }),

  vocabulary: (source: string, o: Opt = {}) =>
    request<BrowseVocabulary>(`/api/browse?source=${encodeURIComponent(source)}`, { signal: o.signal }),

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
