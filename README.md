# Dawghwa

Discover and read manga, manhwa, manhua and webtoons. Installable PWA and Android app (Capacitor) with recommendations learned on your device.

Dawghwa does not host content and contains no scrapers or source adapters. All catalogue, chapter and page data comes from the separate [Dawghwa API](https://github.com/titan717/dawghwa.api), which builds on [comick-source-api](https://github.com/GooglyBlox/comick-source-api) (MIT).

## What works

- Home with data-driven sections (catalogue rows, continue reading, personal picks with real explanations, Surprise Me).
- Discover with filters the API supports (format, status, demographic, include/exclude tags, sort).
- Search: plain titles, or natural language such as "completed fantasy manhwa, not romance". Filters the API supports run on the server; anything else is applied on the device and labelled "on device".
- Title pages with chapter lists, read marks, library status, favourites, collections and "More like this".
- Reader for providers that support chapter pages (currently MangaDex): vertical, single and double page, RTL/LTR, resume, auto-next. A chapter is marked read only when its last page is reached. Other providers open on the provider's site.
- Library, history, multiple isolated profiles, export/import, all stored locally in IndexedDB.
- PWA: offline app shell, update prompt, cover caching. Chapter pages are not cached for offline reading.

## Develop

Requires Node 22+.

```bash
npm install
cp .env.example .env.local      # set DAWGHWA_API_DEV if your API is not on :3100
npm run dev
```

Run the API alongside (in `dawghwa.api`): `npm run build && npx next start -p 3100`.

| Command | |
| --- | --- |
| `npm run typecheck` / `npm run lint` | TypeScript, ESLint (0 warnings) |
| `npm test` | Unit and integration tests (Vitest, fake IndexedDB) |
| `npm run eval:intel` | Recommender evaluation report |
| `npm run build && npm run e2e` | Playwright on mobile and desktop against `vite preview` |
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
