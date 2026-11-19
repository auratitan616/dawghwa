# Architecture

```
dawghwa (this repo)                     dawghwa.api (separate repo)
React SPA / PWA / Capacitor  ── HTTPS ──>  Next.js API: catalogue, titles, search, chapters, pages, health
```

The app never talks to content providers for data. Provider logic, normalisation and rate limiting live only in the API. The app reads capabilities from the API (for example which sources support chapter pages) instead of hardcoding providers. Cover and page images load directly from the URLs the API returns.

## Layers

| Layer | Path | Notes |
| --- | --- | --- |
| API client | `src/lib/api/` | Typed endpoints, timeouts, retries with backoff, AbortSignal, in-flight dedup, normalised errors, API health tracking, incremental NDJSON parsing for multi-source search |
| Query cache | `src/lib/query.ts` | TanStack Query, stale-while-revalidate. Only public catalogue queries are persisted; nothing profile-specific |
| Local data | `src/lib/store/` | IndexedDB (`idb`): profiles, library, progress, hidden, events, intel state, title metadata cache. Every private record is keyed by profile id. Falls back to in-memory storage when IndexedDB is blocked and tells the user |
| Intelligence | `src/lib/intel/` | See RECOMMENDATIONS.md |
| Search | `src/lib/search/` | Deterministic intent parser; server-side vs on-device filters |
| Feed | `src/lib/feed/` | Home section definitions, personal ordering, cross-row dedupe |
| Platform | `src/lib/platform/` | Single abstraction over web and Capacitor (back button, status bar, immersive, haptics, share, network, lifecycle, deep links). Native plugins are lazy imported only on native |
| UI | `src/components/`, `src/routes/`, `src/styles/` | Lazy routes, design tokens, dark and light themes, reduced motion |

## Rewards (gamification)

Everything is derived; nothing about XP, levels or badges is stored.

- `src/lib/rewards/progression.ts`: pure functions. `ledger(events, titles)` turns the profile's append-only event log into XP entries with the farm-proofing rules (one award per series and chapter number, only `chapter_read` events, which the reader emits only when the last page is reached; completions only with context `"reader"` and at least half the chapters read). `levelFor`, `TIERS`, `achievementSets`, `passport` and `gains` (what changed between two snapshots).
- `src/lib/rewards/index.ts`: `progressionFor(state)` and `useProgression()`. Later features (quests, comments) add inputs with `registerProgressionInput` rather than new stores.
- `src/lib/rewards/runtime.ts`: lazy-loaded after the store is ready. Listens to signals, computes before and after, and calls `celebrate()`, unless a screen registered a sink with `setRewardSink` (the Reader's chapter-end panel).
- `UserState.events` holds the event log in memory, so progression is synchronous. Export includes the titles of every finished series, so genre stamps survive a round trip.
- `settings.rewards` (Profile > Rewards) hides every surface. Turning it off deletes nothing.

### Quests and cosmetics
`src/lib/rewards/quests.ts` builds the weekly quest book (`questBook(profileId, events, titles, now)`) from the same event log as XP. `cosmetics.ts` works out frame and emblem unlocks, and `rhythm.ts` computes the optional weekly reading rhythm. `progressionFor` folds quest XP and the quest count into levels and achievements. Nothing in this layer has its own store.

### Comments (DB v2)
`src/lib/comments.ts` owns the `comments` store: a per-chapter cache with `useChapterComments`, add/edit/pin/vote/delete, and `threads()` for Top/Newest ordering. Each new comment logs a `comment` event (recommender weight null) that feeds quests and the Margin notes set. The UI is in `src/components/Comments.tsx`. The Reader is scroll-only, with a fixed top bar (comments, chapters, settings, plus a 2px progress line) and a chapter-end panel (reward beat, Next Episode, comments preview, credits).

## Routing

`/`, `/discover`, `/search`, `/title/:source/:id/:slug?`, `/library`, `/history`, `/profile`, `/about` inside the shell; `/read/:source/:id/:chapterId` and `/welcome` are full screen. Private routes are disallowed in `robots.txt` and marked `noindex`.

## PWA

`vite-plugin-pwa` (prompt mode). Precaches the app shell, JS, CSS and Latin fonts. Covers use a bounded CacheFirst cache. API responses and chapter pages are not cached by the service worker, so offline reading is not promised.

## Testing

- Vitest: API client, intent parser, feed, recommender + evaluation, store (progress rules, profile isolation, export/import).
- Playwright (`e2e/`): Pixel 7 and desktop projects against the production build.
- CI (`.github/workflows/ci.yml`): typecheck, lint, unit, build, e2e, debug APK artifact.
