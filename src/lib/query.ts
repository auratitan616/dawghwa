import { QueryClient, useInfiniteQuery, useQuery, keepPreviousData } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { api } from "./api/endpoints";
import { isApiError } from "./api/errors";
import type { BrowseQuery, Chapter } from "./api/types";
import { cacheTitles, kvGet, kvSet, db } from "./store/db";
import { fromResult, isIdAddressable, mergeTitle, titleKey, type Title } from "./titles";

/**
 * Query layer: TanStack Query for stale-while-revalidate, with public catalogue
 * queries (browse rows, title details, vocabulary) persisted to IndexedDB so
 * the app opens instantly and works offline with the last known data.
 * Private data never goes through this cache: it lives in the profile store.
 * Chapter page URLs are never persisted (they expire).
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 24 * 3600_000,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
      // The client already retries transient HTTP failures; only retry here for network-level ones.
      retry: (count, e) => count < 1 && (!isApiError(e) || (e.retryable && e.kind !== "http")),
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => kvGet<string>(`rq:${k}`).then((v) => v ?? null),
    setItem: (k, v) => kvSet(`rq:${k}`, v),
    removeItem: async (k) => {
      await (await db()).delete("kv", `rq:${k}`);
    },
  },
  throttleTime: 2000,
});

export const PERSIST_MAX_AGE = 7 * 24 * 3600_000;
export const shouldPersist = (key: readonly unknown[]) => ["browse", "title", "vocab", "chapters"].includes(String(key[0]));

export const BROWSE_SOURCE = "mangadex";

function toTitles(items: { id: string }[] & unknown[], sourceId: string, source: string): Title[] {
  return (items as Parameters<typeof fromResult>[0][]).map((r) => fromResult(r, sourceId, source));
}

export function browseKey(q: BrowseQuery) {
  return ["browse", JSON.stringify({ source: BROWSE_SOURCE, ...q })] as const;
}

export async function fetchBrowse(q: BrowseQuery, signal?: AbortSignal) {
  const res = await api.browse({ source: BROWSE_SOURCE, ...q }, { signal });
  const items = toTitles(res.items, res.sourceId, res.source);
  void cacheTitles(items);
  return { items, total: res.total, hasMore: res.pagination.hasMore, offset: res.pagination.offset };
}

export function useBrowse(q: BrowseQuery | null, opts: { staleTime?: number } = {}) {
  return useQuery({
    queryKey: q ? browseKey(q) : ["browse", "off"],
    queryFn: ({ signal }) => fetchBrowse(q!, signal),
    enabled: Boolean(q),
    staleTime: opts.staleTime ?? 15 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useBrowseInfinite(q: BrowseQuery | null, pageSize = 30) {
  return useInfiniteQuery({
    queryKey: ["browse-inf", JSON.stringify(q), pageSize],
    enabled: Boolean(q),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchBrowse({ ...q!, offset: pageParam, limit: pageSize }, signal),
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
    staleTime: 15 * 60_000,
  });
}

export function useVocabulary() {
  return useQuery({
    queryKey: ["vocab", BROWSE_SOURCE],
    queryFn: ({ signal }) => api.vocabulary({ signal }),
    staleTime: 24 * 3600_000,
  });
}

export function useSources() {
  return useQuery({ queryKey: ["sources"], queryFn: ({ signal }) => api.sources({ signal }).then((r) => r.sources), staleTime: 30 * 60_000 });
}

/** Title details. id-addressable sources resolve by id; others by the canonical URL. */
export function useTitle(sourceId: string, id: string, url?: string) {
  const key = titleKey(sourceId, id);
  return useQuery({
    queryKey: ["title", key],
    queryFn: async ({ signal }) => {
      const cached = await (await db()).get("titles", key);
      let res;
      if (isIdAddressable(sourceId)) res = await api.title(id, { signal });
      else {
        const u = url ?? cached?.url ?? "";
        if (!u) throw new Error("This title link is incomplete. Open it again from search.");
        res = await api.manga({ source: sourceId, url: u }, { signal });
      }
      const m = res.manga;
      const t: Title = mergeTitle(cached, {
        key,
        sourceId: res.sourceId,
        sourceName: res.source,
        id,
        url: m.url,
        title: m.title,
        cover: m.coverImage ?? cached?.cover,
        coverLarge: m.metadata?.coverImageLarge ?? m.coverImage ?? cached?.coverLarge,
        rating: m.metadata?.rating ?? cached?.rating,
        follows: m.metadata?.follows ?? cached?.follows,
        latestChapter: m.metadata?.lastChapter || cached?.latestChapter,
        meta: m.metadata ?? cached?.meta,
      });
      void cacheTitles([t]);
      return t;
    },
    staleTime: 30 * 60_000,
  });
}

export interface ChapterList {
  chapters: Chapter[];
  total: number;
}

/** Full chapter list (the API caches it server-side and returns it in one response). */
export function useChapters(t: Pick<Title, "key" | "url" | "sourceId" | "id"> | undefined) {
  return useQuery({
    queryKey: ["chapters", t?.key, "unified-v1"],
    enabled: Boolean(t?.url),
    queryFn: async ({ signal }): Promise<ChapterList> => {
      if (t && isIdAddressable(t.sourceId)) {
        try {
          const response = await api.unifiedChapters({ source: t.sourceId, id: t.id, limit: 64 }, { signal });
          const chapters: Chapter[] = response.chapters.map((item) => {
            const primary = item.variants[0];
            return {
              // Prefer the title's original provider chapter id when present so
              // existing reading-progress keys survive the aggregation rollout.
              id: item.variants.find((variant) => variant.sourceId === t.sourceId)?.providerChapterId ?? item.key,
              number: item.number,
              title: item.title,
              url: primary?.url ?? "",
              lastUpdated: primary?.lastUpdated,
              group: primary?.group,
              variants: item.variants,
            };
          });
          return { chapters, total: response.totalChapters };
        } catch (error) {
          // Keep the deployed app usable while the matching API deployment rolls out.
          if (!isApiError(error) || error.status !== 404) throw error;
        }
      }
      const r = await api.chapters({ url: t!.url, source: t!.sourceId, order: "asc" }, { signal });
      return {
        chapters: r.chapters.map((chapter) => ({
          ...chapter,
          variants: [{ sourceId: r.sourceId, source: r.source, providerChapterId: chapter.id, url: chapter.url, group: chapter.group, lastUpdated: chapter.lastUpdated }],
        })),
        total: r.totalChapters,
      };
    },
    staleTime: 10 * 60_000,
  });
}

export function usePages(
  sourceId: string,
  chapterId: string | undefined,
  dataSaver: boolean,
  enabled: boolean,
  chapterUrl?: string,
) {
  return useQuery({
    queryKey: ["pages", sourceId, chapterId, chapterUrl, dataSaver],
    enabled: Boolean(chapterId || chapterUrl) && enabled,
    queryFn: ({ signal }) => api.pages(
      { source: sourceId, chapterId: chapterId!, url: chapterUrl, dataSaver },
      { signal },
    ),
    staleTime: 10 * 60_000, // MangaDex@Home URLs are valid for ~15 minutes
    gcTime: 12 * 60_000,
    retry: 1,
  });
}

export function prefetchTitle(t: Title) {
  queryClient.setQueryData(["title", t.key], (prev: Title | undefined) => prev ?? t);
}
