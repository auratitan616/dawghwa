# Continuation report

Living status document. Updated with each logical commit so work can resume from any point.

## Branches

| Repo | Branch | State |
| --- | --- | --- |
| Titan717/dawghwa | `feature/app-foundation` | Pushed. Draft PR #1. Not merged. |
| Titan717/dawghwa.api | `feature/catalog-metadata-browse` | Pushed. Draft PR #1. Not merged. |

## Done (verified locally)

- Vite + React + TypeScript PWA scaffold, Capacitor config (`app.dawghwa`), icons, manifest, robots, sitemap script.
- Typed API client: timeouts, retries, cancellation, in-flight dedup, normalised errors, NDJSON streaming.
- Local-first IndexedDB store with isolated profiles, export/import, in-memory fallback.
- On-device recommender (Web Worker), explainable reasons, evaluation harness and tests.
- Deterministic natural-language search parser (server vs on-device filters shown separately).
- Screens: Home, Discover, Search, Title, Reader, Library, History, Profile, Welcome, About, 404.
- Visual QA at 390px and 1440px, light and dark, against the local API; layout fixes committed.
- Store tests (reader progress rules, profile isolation, deletion, export/import), checked to fail when the read-at-end rule is broken.
- Playwright e2e: 8 scenarios x 2 projects (Pixel 7, desktop). 16/16 pass locally with the API running; in CI the live-data ones skip.
- Android: platform added, brand icons and splash, dawghwa:// deep links, network/vibrate permissions, native API guard. A debug APK (app.dawghwa, minSdk 24, targetSdk 36) was built locally with JDK 21 + SDK 36. It was a UI-only build without VITE_API_BASE_URL, and it was not run on a device or emulator.
- CI (`.github/workflows/ci.yml`) passes on GitHub: typecheck, lint, unit, build, e2e, and a debug APK artifact.
- Precache trimmed to Latin fonts (70 entries, 804 KiB).
- Last verified: `tsc -b`, `eslint --max-warnings 0`, `vite build`, `vitest run` (40 tests) all pass.

## Known environment notes

- In this sandbox the headless browser gets 502/403 for `uploads.mangadex.org`; `scripts/qa/screenshots.mjs` relays images through Node for QA only. Real browsers are unaffected by this relay.
- Capacitor CLI needs Node 22+. The Java SDK manager needed the system CA bundle imported into a truststore to download packages here.

## Remaining

1. Deploy the API and set the repository variable `DAWGHWA_API_URL` so CI builds a working APK; test it on a device (back button, immersive reader, deep links, keyboard).
2. Verified https App Links need a domain plus `/.well-known/assetlinks.json`.
3. Release signing (keystore kept outside the repo) and versioning.
4. Initial JS is about 145 KB gzip, mostly react-dom; acceptable, revisit if needed.
5. Bump GitHub Actions to Node 24-based major versions (warnings only today).
6. Mascot artwork: no Dawghwa mascot files were supplied. Panda.fun's panda is a different brand and is not used. Drop artwork into `src/assets/mascot/`.

## How to run

```bash
# API (in dawghwa.api)
npm run build && RATE_LIMIT_PER_MINUTE=2000 npx next start -p 3100
# App
npm install && npm run build && npm run preview   # proxies /api to localhost:3100
```
