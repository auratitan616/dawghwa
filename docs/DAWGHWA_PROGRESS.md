# Progress

The latest entry is first. Every milestone passed typecheck, lint, unit tests and build, and was checked in the rendered UI before commit.

## 2026-11-17

### Merged

- API `titan717/dawghwa.api`: PR #2 (catalogue summary detail) and PR #1 (`/api/browse`). PR #1 had earlier been marked as superseded by `/api/catalog`. It is additive (571 tests, CI and Vercel preview green). The app does not depend on it.
- Frontend: PR #1 (app foundation) and PR #2 (manga design system, rebased onto main's `/api/catalog` semantics; e2e updated to match the redesigned home, mobile nav and Discover hub). CI was green (web, android, Vercel) before each merge.
- PR #3 (`feature/blueprint-experience`): open, with CI green on its last push. This entry is updated when it merges.

### Built on `feature/blueprint-experience`

- Home hero carousel and "Popular by category" (M1, M2). Title page rebuild (M4). Search landing (M3).
- C1: search shows matching titles first. C2: exact webtoon resume (verified: before, page 7 at 934px; after, page 7 at 933px).
- Library: Recent tab, uppercase tabs, "With unread chapters", centred empty states.
- Onboarding: icon chips, Skip, Next (n) disabled at 0, "Finding stories for you" (about 1.1s, skipped under reduced motion and for Skip). Verified with `scripts/qa/onboarding-check.mjs`.
- M5: Undo toasts. M7: reader centring, RTL cue, and auto-continue now fires once (it previously skipped ch1 to ch3). M8: errors and retries. M9: tablet and 1920 chrome. M10: mature-cover blur and dark default. P2 to P5, P9 and P10.
- Production deployment fix: `vercel.json` adds the SPA fallback (deep links such as `/library` returned 404 on dawghwa.vercel.app) and an `/api/*` rewrite to `https://dawghwaapi.vercel.app`. The production build had no `VITE_API_BASE_URL`, so the app's same-origin `/api` calls returned 404.
- Search CLS fix: the trending row reserves its height while loading (CLS 0.191 before, 0.004 after).

### Lighthouse (mobile, simulated throttling, local preview against the production API)

| Page | Perf before | Perf after | A11y | Best practices | CLS before | CLS after |
| --- | --- | --- | --- | --- | --- | --- |
| `/` (first run, onboarding) | 79 | 84 | 100 / 100 | 100 / 100 | 0 | 0 |
| `/search` | 71 | 75 | 100 / 100 | 96 / 100 | 0.191 | 0.004 |
| `/discover?order=popular` | 87 | 82 | 100 / 100 | 96 / 96 | 0.001 | 0 |
| `/title/...` (Eminence in Shadow) | 62 | 83 | 100 / 100 | 100 / 100 | 0.469 | 0.014 |

SEO is 54 to 58 on `/welcome` and `/search` because those pages are deliberately `noindex`. It is 92 elsewhere. The raw reports are in `lighthouse/` in the workspace, outside the repo.

### Next

- Independent critic round 1, then fixes until acceptance.
- Merge PR #3, then verify the production deployment in a browser.
