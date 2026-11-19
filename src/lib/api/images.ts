import { apiUrl } from "./client";

const MANGADEX_COVERS = "https://uploads.mangadex.org/covers/";

/**
 * Image URL to put in `<img src>`. MangaDex's cover host challenges browser
 * requests, so its covers go through the API's cacheable relay
 * (`GET /api/image`). Other hosts (AniList, chapter pages) load directly.
 * Applied at render time, so covers saved in the library before this change
 * are fixed too.
 */
export function coverSrc(url: string): string;
export function coverSrc(url: string | undefined): string | undefined;
export function coverSrc(url: string | undefined): string | undefined {
  if (!url || !url.startsWith(MANGADEX_COVERS)) return url;
  return apiUrl(`/api/image?url=${encodeURIComponent(url)}`);
}
