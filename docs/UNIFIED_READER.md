# Unified reader

Dawghwa shows one title page per series. Chapters from every linked provider are
merged into one list, and every chapter opens in Dawghwa's own reader. Nobody is
sent to a provider website to read.

The API side of the contract (canonical identity, merge rules, capability
matrix, security) is in `dawghwa.api/docs/UNIFIED_CHAPTERS.md`. This document
covers the app.

## Data flow

1. The title page calls `GET /api/titles/{ref}/chapters/all?stream=1` (NDJSON)
   through `streamUnifiedChapters` (`src/lib/api/endpoints.ts`).
2. `useChapters` (`src/lib/query.ts`) writes each partial `chapters` event into
   the query cache, so the first provider's chapters render before slower
   providers finish. The source status bar shows each provider's state
   (loading / ok / error / no match / needs review) with a retry.
3. Rows become `Chapter` objects (`toChapter` in `src/lib/chapters.ts`):
   - `id` is the canonical chapter key, e.g.
     `dwg:md:<uuid>/en/s0/ch:1.5`. `numberText` keeps the exact string
     (`1.10` is not `1.1`). `kind` is `regular`, `prologue`, `epilogue`,
     `special`, `oneshot` or `unnumbered`.
   - `variants` are the provider uploads of that chapter, with
     `variantId = <sourceId>:<providerChapterId>`, language, edition
     (`official`, `scanlation`, `unknown`) and group.
4. If the unified route is not deployed (404), the app falls back to the
   single-source `/api/chapters` endpoint. Other errors are shown, not hidden.

## Title page (`src/routes/TitlePage.tsx`)

- One row per canonical chapter, virtualized (`useWindowVirtual`).
- Language chip per row and a language filter when several translations exist.
- "2 versions" control opens the version sheet: provider, group, edition and
  language for each upload. Tapping a version opens it in the reader.
- "Find chapter" jumps to an exact number first (typing `1` puts Chapter 1 on
  top, then 10, 11, ...).
- The read CTA resumes the canonical chapter and the version last read.

## Reader (`src/routes/Reader.tsx`)

Choosing a version (`pickVariant`): explicit `v=` URL param, then `s=` source,
then the provider and group read last, then the first upload.

Navigation: previous/next and the chapter sheet only list chapters in the
current chapter's language. Moving to the next chapter keeps the same provider
and group when that chapter has it.

Fallback (`fallbackPlan`):

| Situation | What happens |
| --- | --- |
| Page manifest fails, comes back empty, or images keep failing after one manifest refresh | The failed version is marked as failed for this session. |
| Another upload of the same canonical chapter, same language, same edition exists | Switch automatically. A banner names the failed provider and the new provider / group, and states the language. |
| Only a different edition (official vs fan translation) exists | Nothing switches. The reader explains and offers buttons for each edition, plus retry. |
| No upload in the same language | Error with retry. The reader never moves to another chapter or language. |

Unknown-language uploads (`language: null`) are never used as automatic
fallbacks. Upload links the API marks `source-only` are never used either.
Every failure is reported to `POST /api/reports` (best effort) with whether the
fallback was attempted and whether it worked.

Position across versions (`mapPosition`): same page count keeps the same page.
Different page counts map to the closest page by reading fraction, and the
reader says so ("This version splits pages differently (8 pages instead of
14), so you're at the closest point: page 5."). Page one stays page one. Panel
level matching between different scans is not possible and is not claimed.

Progress: saved under the canonical chapter key with `variantId`, `sourceId`
and `language`. Old records saved under a provider chapter id still resolve
(`findChapter` matches aliases and the URL is replaced with the canonical id),
and read marks count under any alias (`isChapterRead`). History, continue
reading, library and recommendations keep working off the same title key.

Bookmarks (`src/lib/store/bookmarks.ts`): page bookmarks per title, keyed by
canonical chapter so a bookmark survives a version switch. Stored in
localStorage, so they work offline. Toggle in the top bar; listed in the
chapter sheet.

Other reader features (unchanged, still in place): vertical / paged / long
strip, RTL and LTR, lazy loading with prefetch, per-image retry, throttled
manifest refresh for expiring MangaDex@Home URLs, settings persistence,
offline-friendly progress mirror, and a fullscreen toggle in reader settings
(when the browser allows it).

## Tests

- Unit: `src/lib/chapters.test.ts` (merge-facing helpers, legacy ids, fallback
  rules, position mapping, labels), `src/lib/store/bookmarks.test.ts`.
- Live E2E: `e2e/live-providers.spec.ts`, run with `E2E_LIVE=1` against a
  running API. Real providers, no mocked responses:
  - MangaDex, Dynasty Reader and WEBTOON: provider search, Dawghwa title page,
    open chapter, images decode in the browser (`naturalWidth > 0`), progress
    saved under the canonical key with the provider recorded.
  - Merge: Aiura shows MangaDex and Dynasty uploads on one row.
  - Fallback: the MangaDex page request is forced to fail (the only intercepted
    request); the reader switches to the real Dynasty upload of the same
    chapter, in English, shows the notice and sends a report.

```bash
# API: (in dawghwa.api). The API allows 12 expensive requests per client per
# minute; the full two-project suite needs more, so raise it locally.
RATE_LIMIT_EXPENSIVE_PER_MINUTE=120 PORT=3100 npx next dev -p 3100
npm run build
npm run e2e:live          # live provider checks only
E2E_LIVE=1 npm run e2e    # whole suite
```

Last run (2026-11-19, local API, Chromium): full suite 33 passed, 1 skipped
(a phone-only layout check on the desktop project); the live file passes 5/5
on both mobile and desktop. Reader startup to first decoded image, measured in
the browser: MangaDex 1.5 s, Dynasty Reader 1.5 s, WEBTOON 1.8 s.
