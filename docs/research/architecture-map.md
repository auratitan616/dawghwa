# Dawghwa architecture map (2026-11-21)

Snapshot of `titan717/dawghwa` at `b72b603` (main) and `titan717/dawghwa.api` at `f67dacb` (main). Every path below was read in this review. "Implemented" means the code path runs and is covered by a test or by a check run in this review. Anything else is labelled as a stub, a local-only feature or a documentation claim.

## System overview

```
Browser / PWA / Capacitor Android shell
  └─ dawghwa (React 19, Vite 7, react-router 7, TanStack Query, idb)
       │  /api/* is rewritten to the API (vercel.json → https://dawghwaapi.vercel.app;
       │  vite preview/dev proxy → DAWGHWA_API, default http://localhost:3100)
       ▼
dawghwa.api (Next.js 14.2 route handlers, Node runtime, deployed on Vercel)
  route → service → Provider.run → adapter → shared HTTP client (net-guard + retry + circuit breaker)
       ├─ metadata providers: MangaDex, AniList, MangaUpdates (catalogue, title metadata)
       └─ 96 source adapters (search, chapter lists, page extraction for those that declare it)
```

## Frontend (`dawghwa`)

| Area | Paths | Status |
|---|---|---|
| Entry, shell, routing | `src/main.tsx`, `src/app/router.tsx`, `src/app/Shell.tsx`, `src/app/RouteError.tsx` | Implemented. Routes: `/`, `/discover`, `/search`, `/title/:source/:id/:slug?`, `/library`, `/history`, `/profile`, `/about`, `/achievements`, `/read/:source/:id/:chapterId`, `/welcome` |
| PWA | `src/app/pwa.ts`, `public/manifest.webmanifest`, `vite.config.ts` | Implemented (service worker; blocked in E2E) |
| Android shell | `capacitor.config.ts`, `android/`, `src/lib/platform/index.ts` (back button, haptics, immersive) | Implemented as a shell; no store build in this review |
| API client | `src/lib/api/client.ts` (timeouts, error mapping), `src/lib/api/endpoints.ts`, `src/lib/api/errors.ts`, `src/lib/api/types.ts` | Implemented |
| Catalogue adapter | `src/lib/api/catalog.ts` (MangaDex catalogue via `/api/catalog`, `/api/catalog/filters`, `/api/titles/:ref`) | Implemented. Before this work: one format and one status per request on the server; several values filtered on the loaded page |
| Images | `src/lib/api/images.ts` (relay URLs, data saver) | Implemented |
| Query layer | `src/lib/query.ts` (browse, infinite browse, vocabulary, sources, title, chapters, pages) | Implemented. Paging bug fixed in this work (see changes) |
| Home | `src/routes/Home.tsx`, `src/components/Hero.tsx`, `src/components/Row.tsx`, `src/lib/feed/*` | Implemented. Loading hero had an a11y violation (fixed) |
| Discover | `src/routes/Discover.tsx`, `src/routes/DiscoverHub.tsx` | Implemented. Advanced filters added in this work |
| Search | `src/routes/Search.tsx`, `src/lib/search/{intent,local,run}.ts` | Implemented (catalogue search + "Search all sources") |
| Title page | `src/routes/TitlePage.tsx`, `src/lib/chapters.ts`, `src/components/TitleActions.tsx` | Implemented: unified chapter list, version picker, language/edition labels |
| Reader | `src/routes/Reader.tsx`, `src/lib/readerGestures.ts`, `src/styles/reader.css` | Implemented: vertical long strip only, auto-hide bar, double-tap zoom, progress scrubber, position restore, fallback to another version, end-of-chapter card, opt-in auto-next countdown. Auto-scroll added in this work (`src/lib/autoScroll.ts`) |
| Settings | `src/lib/settings.ts` (localStorage `dawghwa:settings` + IndexedDB mirror) | Implemented. Retired settings (`readerMode`, `direction`, `fit`, `pageGap`, `tapZones`) are dropped on load |
| Library, history, progress, ratings | `src/lib/store/{db,user,store,transfer}.ts`, `src/routes/{Library,HistoryPage}.tsx` | Implemented, device-local (IndexedDB) with export/import |
| Bookmarks | `src/lib/store/bookmarks.ts` | Implemented, device-local (localStorage) |
| "Accounts" | `src/lib/store/accounts.ts`, `src/components/SignIn.tsx`, `src/routes/Profile.tsx` | Local profiles only: several readers on one device, optional PIN (salted SHA-256, unlock state in sessionStorage). Not authentication; no server, no sync |
| "Comments" | `src/lib/comments.ts`, `src/components/Comments.tsx` | Private notes stored in IndexedDB on this device, labelled as such in the UI. Not a community feature |
| Rewards | `src/lib/rewards/*`, `src/routes/Achievements.tsx`, `src/components/{Quests,Celebrate,LevelMascot}.tsx` | Implemented, derived from local reading data; can be turned off |
| Design tokens | `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/app.css`, `src/styles/reader.css`, `docs/DAWGHWA_DESIGN_SYSTEM.md` | Implemented; shared components `Segmented`, `Sheet` (`Layer.tsx`), `States`, `Grid` |
| Tests | `src/**/*.test.ts(x)` (Vitest, happy-dom), `e2e/*.spec.ts` (Playwright, Pixel 7 + 1440×900), `e2e/a11y.spec.ts` (axe) | See validation |

Documentation claims that do not match the code:

- `README.md` line 14 describes single/double page and RTL/LTR reader modes. The reader is scroll-only (decision D8 in `docs/DECISIONS.md`; `src/lib/settings.ts` deletes those settings on load).
- The catalogue comment in `src/routes/Discover.tsx` said "Every filter maps 1:1 to a server-side /api/browse filter". Several formats or statuses were filtered on the loaded page only.

## Backend (`dawghwa.api`)

| Area | Paths | Status |
|---|---|---|
| HTTP surface | `src/app/api/**/route.ts`: `search`, `manga`, `chapters`, `pages`, `image`, `browse`, `catalog` (+ `filters`, `providers`), `titles/[ref]` (+ `sources`, `chapters`, `chapters/all`, `identity`), `availability`, `sources` (+ `[id]`, `capabilities`), `frontpage`, `reports`, `health`, `proxy/html` | Implemented |
| Handler wrapper | `src/lib/api/handler.ts` (`route()`, `parseWith`, `json`, error body `{error, code, requestId, details}`) | Implemented |
| Middleware | `src/middleware.ts` (CORS, rate limits `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_EXPENSIVE_PER_MINUTE`) | Implemented |
| Core | `src/lib/core/{http,net-guard,retry,circuit-breaker,rate-limiter,pool,singleflight,antibot,errors,config,context}.ts` | Implemented. `net-guard.ts` resolves DNS and refuses private ranges; before PR #6 hardening the socket re-resolved the name (rebinding gap) |
| Cache | `src/lib/core/cache/index.ts` (`getCache()`); Upstash/Redis REST when `UPSTASH_REDIS_REST_URL`/`REDIS_REST_URL` are set, otherwise in-process | Implemented |
| Metadata | `src/lib/metadata/{index,types,mangadex,anilist,mangaupdates,client}.ts` | Implemented. `clampCatalogQuery` refuses filters a provider does not list |
| Providers | `src/lib/providers/{registry,provider,manifest.generated,normalize,status,reports,verification}.ts` | Implemented; 96 adapters registered |
| Adapters | `src/lib/scrapers/*.ts` (98 files incl. base), page extraction in `src/lib/scrapers/pages/{extract,strategies,policy}.ts` (PR #6) | Search and chapter lists for all registered adapters; page extraction declared for 46 on the PR #6 branch, of which 5 are proven in the native reader |
| Services | `src/lib/services/{search,catalog,unified,availability,health,cover-image,page-image}.ts` | Implemented |
| Unified chapters and identity | `src/lib/chapters/{merge,number}.ts`, `src/lib/identity/index.ts` | Implemented (merging across providers by canonical chapter key `dwg:md:<id>/<lang>/<season>/ch:<n>`) |
| Image relay | `src/app/api/image/route.ts`, `src/lib/services/page-image.ts` | Implemented: per-provider host and path allowlist, content-type and size limits, timeouts |
| Tests | `src/tests/**` (Vitest, fixture-backed adapters, route tests); live tests skipped unless enabled | See validation |
| Deploy | `vercel.json` (function durations) | Production at `dawghwaapi.vercel.app` (not touched in this review) |

The API contains a `Comix` adapter (`src/lib/scrapers/comix.ts`, base `https://comix.to`). It is a different host from the reference site and was not used in this review.
