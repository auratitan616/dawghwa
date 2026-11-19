# Continuation report

Living status document. Updated with each logical commit so work can resume from any point.

## Branches

| Repo | Branch | State |
| --- | --- | --- |
| titan717/dawghwa | `main` | PR #1 and PR #2 merged. Production: https://dawghwa.vercel.app (Vercel git integration). |
| titan717/dawghwa | `feature/blueprint-experience` | PR #3 to main: blueprint screens, critic fixes, `vercel.json`. |
| titan717/dawghwa.api | `main` | PR #1 and PR #2 merged. Production: https://dawghwaapi.vercel.app |

Mission docs: `DAWGHWA_AUDIT.md`, `DAWGHWA_DESIGN_SYSTEM.md`, `DAWGHWA_IMPLEMENTATION_PLAN.md`, `DAWGHWA_QA_SCORECARD.md`, `DAWGHWA_PROGRESS.md`, `DAWGHWA_RESEARCH.md`.

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
- The app uses the deployed API's catalogue (`/api/catalog`, `/api/catalog/filters`, `/api/titles/{ref}`) through `src/lib/api/catalog.ts`. e2e 16/16 passed against both https://dawghwaapi.vercel.app and a local build of API PR #2.
- Repository variable `DAWGHWA_API_URL=https://dawghwaapi.vercel.app` is set. CI run 44002866188 passed: live e2e 16/16 (none skipped), and the debug APK was built with that URL (bundle check step), artifact `dawghwa-debug-apk`, 5.3 MB. Not yet run on a device.
- Last verified: `tsc -b`, `eslint --max-warnings 0`, `vite build`, `vitest run` (45 tests) all pass.

## Gamification and UX programme (Phases 0-6)

| Phase | PR | Contents |
| --- | --- | --- |
| 0 Audit | #11 | `docs/UX_GAMIFICATION_AUDIT.md`, before screenshots in `docs/audit/before/` |
| 1 Foundations | #12 | Motion tokens, Celebrate, ProgressRing, Badge, skeletons, no top bar, Awards tab, Rewards toggle |
| 2 Progression | #13 | XP ledger, levels and tiers, achievement sets, genre passport |
| 3 Quests | #14 | Seeded weekly quests, cosmetics, opt-in rhythm with rest days |
| 4 Reading flow | #16 | Scroll-only reader, fixed top bar, comments (DB v2), reward beat, series rings |
| 5 Profile and onboarding | #17 | Local sign-in and PIN, mascot onboarding, first quest, recap, reader card |
| 6 Hardening | see PR | axe gate, rewards-off test, accessible-name fixes, Lighthouse, docs |

Phase 6 verification (local, production build):
- Unit tests: 121 passed. Typecheck and lint (0 warnings) are clean.
- e2e: 27 passed, 11 skipped (the live-provider suite runs only with `npm run e2e:live`). The axe audit has 0 serious or critical violations on 9 screens x 2 themes x 2 viewports.
- Lighthouse 12, `/welcome`: mobile performance 89, accessibility 100, best practices 100, CLS 0, LCP 3.2 s (simulated slow 4G). Desktop: 100/100/100, LCP 0.7 s. SEO is 54 by design (noindex, plus no `SITE_URL` locally; see D38).
- Initial JS: 143.8 KB gzip (budget about 145).
- The debug APK artifact `dawghwa-debug-apk` (6.5 MB) is built by the CI `android` job. It has not been installed on a device.

## Known environment notes

- In this sandbox the headless browser gets 502/403 for `uploads.mangadex.org`; `scripts/qa/screenshots.mjs` relays images through Node for QA only. Real browsers are unaffected by this relay.
- Capacitor CLI needs Node 22+. The Java SDK manager needed the system CA bundle imported into a truststore to download packages here.

## Remaining

1. Test the CI APK (artifact `dawghwa-debug-apk`) on a device: back button, immersive reader, deep links, keyboard.
2. Merge and deploy API PR #2 to restore mood and story-theme rows and filters, which need tags and synopses in list items. Until then those Home rows hide themselves and search reports the filters as not applied.
3. Hidden gems needs follower counts, which the catalogue does not return. It could come back if the API adds MangaDex statistics.
4. Verified https App Links need a domain plus `/.well-known/assetlinks.json`.
5. Release signing (keystore kept outside the repo) and versioning.
6. Initial JS is about 145 KB gzip, mostly react-dom; acceptable, revisit if needed.
7. Bump GitHub Actions to Node 24-based major versions (warnings only today).
8. Mascot artwork: no Dawghwa mascot files were supplied. Panda.fun's panda is a different brand and is not used. Drop artwork into `src/assets/mascot/`.

## How to run

```bash
# API (in dawghwa.api)
npm run build && RATE_LIMIT_PER_MINUTE=2000 npx next start -p 3100
# App
npm install && npm run build && npm run preview   # proxies /api to localhost:3100
```
