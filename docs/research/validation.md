# Validation record

All checks ran locally, with Node 22 and Playwright Chromium 1254, on 2026-11-21. The app E2E suite used a local API (`next start -p 3100`, built from `feat/catalog-advanced-filters`). Rate limits on that API were raised so the suite does not trip them. Live provider traffic was kept to the minimum needed.

## Baseline on `main` (before any change)

| Repo | Check | Result |
|---|---|---|
| dawghwa `b72b603` | typecheck, lint | exit 0, exit 0 |
| | vitest | 131 passed (20 files) |
| | build | OK |
| | Playwright (mobile + desktop) | 60 passed, 13 skipped, **1 failed (pre-existing)**: `[mobile] a11y.spec.ts` "axe: core routes (light)", `aria-prohibited-attr` on `.hero`. It depends on timing: it fails when the Home skeleton is still showing during the scan. The first attempt also failed for an environmental reason (no Playwright browser was installed); that is not counted. |
| dawghwa.api `f67dacb` | typecheck, lint | exit 0, exit 0 |
| | vitest | 636 passed, 401 skipped |
| dawghwa.api PR #6 `8facf09` | vitest | 861 passed, 405 skipped |

## After the changes

| Branch | Check | Result |
|---|---|---|
| api `fix/pr6-page-extraction-hardening` `5d73612` | typecheck, lint, build | 0, 0, OK |
| | vitest | 929 passed, 405 skipped (32 files) |
| | new regression tests run against `8facf09` | 11 failed there, all pass on `5d73612` |
| api `feat/catalog-advanced-filters` `5526bcb` | typecheck, lint, build | 0, 0, OK |
| | vitest | 637 passed, 401 skipped (26 files passed, 2 skipped) |
| api, both branches together | `git merge-tree` | merges without conflicts |
| app `local/integration` (all three app feature branches merged) | typecheck, lint | 0, 0 |
| | vitest | 147 passed (22 files) |
| | build | OK |
| | Playwright full suite | **73 passed, 13 skipped, 0 failed** (4.1 min). The 13 skipped: 10 `E2E_LIVE` provider tests (5 per project), plus 3 tests that are written for one viewport only (phone-only on desktop, desktop-only on phone). |
| app `fix/pr20-live-e2e-determinism` | `playwright --list`, lint | 14 tests compile, lint 0 |
| | live MangaDex case (`E2E_LIVE=1`, desktop) | passed |

An earlier full-suite run on `local/integration` had one failure in a test I wrote: "advanced filters live in the URL…" on desktop. The test checked whether the filter panel was visible before the page had rendered. It was fixed in `3563678` and then passed 6 of 6 times with `--repeat-each 3` before the full suite was run again.

## Regression coverage asked for in the task

| Risk | Test |
|---|---|
| Wrong chapter's pages | api `page-hardening.test.ts` finding 1 (four cases); app `e2e/live-providers.spec.ts` checks progress against the exact chapter key |
| Malformed page lists | api `page-hardening.test.ts` finding 2, plus golden full ordered lists for 46 fixtures |
| Source, language and version kept | existing `e2e/reader.spec.ts`, `title.spec.ts` provider picker, live fallback test (language kept); the auto-scroll reset key includes the variant |
| URL policy and redirects | `page-hardening.test.ts` finding 3, `routes.test.ts` fail-closed, `net-guard-connect.test.ts` rebinding against a real socket; redirect handling in `src/tests/core/http.test.ts` and `src/tests/api/proxy-security.test.ts` |
| Filter URL round trip and pagination | app `e2e/discovery.spec.ts` "advanced filters live in the URL…" (URL → API params → reload → back); `src/lib/query-paging.test.ts` (`nextBrowseOffset`); api catalogue route tests |
| Unsupported filters not ignored | api tests: AniList and MangaUpdates return 400 for the new filters, MangaDex refuses unsafe one-shot/doujinshi mixes; app `catalog.test.ts` `UnsupportedFilterError` |
| Auto-scroll start, pause, resume, speed, end | `src/lib/autoScroll.test.ts` (12 tests, fake clock); `e2e/auto-scroll.spec.ts`, four tests on both projects: start, progress, pause, resume, speed kept after reload; holds while a reader layer is open, in a hidden tab and during manual scrolling; stops at the end card without navigating; reduced motion moves a screen at a time |
| Progress persistence | existing `reader.spec.ts` (opening does not mark read); `live-providers.spec.ts` `savedProgress` poll |
| Keyboard and accessibility | axe on core routes (light and dark), the new deterministic axe test for the Home loading state, the P / − / + keys in the auto-scroll E2E |

## Targeted live checks

- MangaDex browse requests made by the E2E suite through the local API.
- One direct MangaDex request to confirm that `originalLanguage=ko` with `publicationDemographic=seinen` has 0 results upstream (josei: 252, shounen: 283). This explains a "0 results" screenshot; it is not a Dawghwa bug.
- One live E2E case for MangaDex.

## Design checks (Taste skill)

- **Screen inspection:** `inspect.mjs --app` at 1440 px and 390 px on Discover, both before (`main`) and after (`local/integration`). These flags were already on `main` and are unchanged:
  - 10px nav labels;
  - uppercase micro-labels;
  - a 44px title on an app screen;
  - a cream-tinted ink colour.
  The after build adds three uppercase group labels (Demographic, Release year, Included tags must). They follow the documented rule in `docs/DAWGHWA_DESIGN_SYSTEM.md` ("Uppercase labels use 11 to 12.5px…"). Changing the shared `.eyebrow` token would restyle Search and History as well, so it was left as a design-system decision for you.
- **Source lint:** `lint.mjs --app` on the changed files. The only FAIL, an emoji-like "✓" in `reader.css:464`, is already on `main`. The new warnings are the floating auto-scroll pill's shadow and blur, the same treatment as the existing reader bar (an overlay over page images).
- **Visual review of screenshots:** one defect found and fixed. On phones the auto-scroll speed readout wrapped ("80" / "px/s" on separate lines); fixed in `feat/reader-auto-scroll`.

## Proposed but not run

- Live E2E for Asura, Thunderscans, Dynasty and WEBTOON (`E2E_LIVE=1`), to limit third-party traffic.
- `scripts/verify-readers.ts` against a deployed preview (needs approval and a deployment).
- Lighthouse and performance budgets on a production build behind a CDN.
- Android (Capacitor) build of the new reader controls on a real device.
- Screen-reader pass (VoiceOver and TalkBack) of the auto-scroll controls; only automated axe checks and ARIA roles were verified.
