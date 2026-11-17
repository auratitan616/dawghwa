# Continuation report

Living status document. Updated with each logical commit so work can resume from any point.

## Branches

| Repo | Branch | State |
| --- | --- | --- |
| Titan717/dawghwa | `feature/app-foundation` | Pushed. Not merged. |
| Titan717/dawghwa.api | `feature/catalog-metadata-browse` | Pushed. Not merged. |

## Done (verified locally)

- Vite + React + TypeScript PWA scaffold, Capacitor config (`app.dawghwa`), icons, manifest, robots, sitemap script.
- Typed API client: timeouts, retries, cancellation, in-flight dedup, normalised errors, NDJSON streaming.
- Local-first IndexedDB store with isolated profiles, export/import, in-memory fallback.
- On-device recommender (Web Worker), explainable reasons, evaluation harness and tests.
- Deterministic natural-language search parser (server vs on-device filters shown separately).
- Screens: Home, Discover, Search, Title, Reader, Library, History, Profile, Welcome, About, 404.
- Visual QA at 390px and 1440px against the local API; layout fixes committed.
- Last verified: `tsc -b`, `eslint --max-warnings 0`, `vite build`, `vitest run` (32 tests) all pass.

## Known environment notes

- In this sandbox the headless browser gets 502/403 for `uploads.mangadex.org`; `scripts/qa/screenshots.mjs` relays images through Node for QA only. Real browsers are unaffected by this relay.
- No Android SDK/JDK available yet, so no APK has been built.

## Remaining

1. More tests: export/import roundtrip, profile isolation, reader progress rules; Playwright e2e against `vite preview`.
2. Android: `npx cap add android`, back button/status bar/deep links, CI workflow for debug APK.
3. Bundle review (index chunk ~278 KB raw / 91 KB gzip; font subsets).
4. README, ARCHITECTURE, RECOMMENDATIONS docs; final engineering report.
5. Open draft PRs for both repos.
6. Mascot artwork: no Dawghwa mascot files were supplied. Panda.fun's panda is a different brand and is not used. Drop artwork into `src/assets/mascot/`.

## How to run

```bash
# API (in dawghwa.api)
npm run build && RATE_LIMIT_PER_MINUTE=2000 npx next start -p 3100
# App
npm install && npm run build && npm run preview   # proxies /api to localhost:3100
```
