# Dawghwa

Discover and read manga, manhwa, manhua and webtoons. Installable PWA and Android app (Capacitor) with recommendations learned on your device.

Dawghwa does not host content and contains no scrapers or source adapters. All catalogue, chapter and page data comes from the separate [Dawghwa API](https://github.com/titan717/dawghwa.api), which builds on [comick-source-api](https://github.com/GooglyBlox/comick-source-api) (MIT).

## What works

- Home with data-driven sections (catalogue rows, continue reading, personal picks with real explanations, Surprise Me).
- Discover with filters the API's catalogue supports (one format, one status, release year, include/exclude tags, sort).
- Search: plain titles, or natural language such as "completed fantasy manhwa, not romance". Filters the API supports run on the server; anything else is applied on the device and labelled "on device".
- Title pages with chapter lists, read marks, library status, favourites, collections and "More like this".
- One title page per series: chapters from every linked provider (verified for the native reader: MangaDex, Dynasty Reader, WEBTOON) are merged into one list, with a per-chapter version picker showing provider, translation group, edition and language. See [docs/UNIFIED_READER.md](docs/UNIFIED_READER.md).
- Native reader for every chapter in that list: vertical, single and double page, long strip, RTL/LTR, resume, bookmarks, fullscreen, auto-next. If a provider fails, the reader switches to the same chapter in the same language and edition from another provider and says so; it never changes chapter, language or edition on its own. A chapter is marked read only when its last page is reached.
- Library, history, multiple isolated profiles, export/import, all stored locally in IndexedDB.
- Rewards (optional, Profile > Rewards): XP from first chapter completions, levels with collie tiers, tiered achievements, a genre passport, three local weekly quests with cosmetic rewards, and a chapter-end reward beat. Re-reading never adds XP. Turning it off hides all of it.
- Local readers: a mascot-guided onboarding, a "Who's reading?" screen, and an optional 4-digit PIN per reader (a privacy curtain, not encryption). Also a monthly recap and a shareable reader card image.
- Reader: scroll-only, with a fixed top bar holding the chapter title, a progress line and a comments button. Comments are stored on the device per chapter.
- PWA: offline app shell, update prompt, cover caching. Chapter pages are not cached for offline reading.

## Develop

Requires Node 22+.

```bash
npm install
cp .env.example .env.local      # set DAWGHWA_API_DEV if your API is not on :3100
npm run dev
```

Run the API alongside (in `dawghwa.api`): `npm run build && npx next start -p 3100`, or point the dev/preview proxy at the deployed API: `DAWGHWA_API_DEV=https://dawghwaapi.vercel.app npm run preview`.

### API endpoints used

| Feature | Endpoint |
| --- | --- |
| Catalogue rows, Discover, structured search | `GET /api/catalog?provider=mangadex` |
| Filter vocabulary | `GET /api/catalog/filters?provider=mangadex` |
| Title details | `GET /api/titles/mangadex:{id}` |
| Multi-source title search | `POST /api/search` (NDJSON) |
| Chapters, pages | `GET /api/titles/{ref}/chapters/all` (unified, streamed), `POST /api/chapters` (single source fallback), `POST /api/pages` (MangaDex, Dynasty Reader, WEBTOON), `POST /api/reports` |

The catalogue provider is MangaDex, so catalogue ids are the ids the reader uses. `src/lib/api/catalog.ts` translates app queries to catalogue parameters. Several formats or statuses, and demographic, are filtered on the device and labelled so. Filters that need data the catalogue does not return (follower counts for "hidden gems"; tags and synopses for moods and story themes until the API includes them in list items) are skipped and the search says so.

| Command | |
| --- | --- |
| `npm run typecheck` / `npm run lint` | TypeScript, ESLint (0 warnings) |
| `npm test` | Unit and integration tests (Vitest, fake IndexedDB) |
| `npm run eval:intel` | Recommender evaluation report |
| `npm run build && npm run e2e` | Playwright on mobile and desktop against `vite preview` |
| `npm run e2e:live` | Live native-reader checks against real MangaDex, Dynasty Reader and WEBTOON (needs a running API) |
| `npm run icons` | Re-render web and Android icons from the brand mark |

## Android

```bash
VITE_API_BASE_URL=https://your-api.example npm run android:build
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

The app has no same-origin API on Android, so the build stops unless `VITE_API_BASE_URL` is an https URL (`ALLOW_NO_API=1` builds a UI-only smoke APK). Requires JDK 21 and the Android SDK (platform 36). CI builds a debug APK artifact on every push; set the repository variable `DAWGHWA_API_URL` for a working build.

Native integration: hardware back button (closes sheets, then navigates, then minimises), status bar colours follow the theme, immersive reader, safe areas, keyboard insets, splash, haptics, network status, pause/resume saves reading position, `dawghwa://` deep links.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Recommendations](docs/RECOMMENDATIONS.md)
- [Continuation report](docs/CONTINUATION.md)

## License

MIT. Upstream credits are listed on the in-app About page.
