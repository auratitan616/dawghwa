# Review of dawghwa.api PR #6 and dawghwa PR #20

Status checked on 2026-11-21 with `gh pr view`:

- dawghwa.api #6 is **open**: "Universal chapter page extraction: 46 providers, Asura Scans first". Reviewed head: `8facf09`.
- dawghwa #20 is **open**, with a base that is behind `main`. Reviewed head: `b1c6c0d`.
- dawghwa #10 is open (the old blueprint-v2 work). #19, #21 and #22 are merged.

Fixes are on local branches that have not been pushed:

- API: `fix/pr6-page-extraction-hardening`, commit `5d73612` on top of `8facf09`.
- App: `fix/pr20-live-e2e-determinism`, with `e2680e1` (a cherry-pick of `b1c6c0d`) and `04bab57`.

The regression tests in `src/tests/adapters/page-hardening.test.ts` and `src/tests/api/routes.test.ts` were also run against an untouched `8facf09` worktree: **11 tests failed there**, and all of them pass with `5d73612`.

## Which layer each finding affects

| Layer | Findings |
|---|---|
| Provider registration | 9 (claimed totals) |
| Search | none found |
| Chapter list | none found (list identity is handled in `src/lib/chapters.ts` in the app) |
| Page extraction | 1, 2, 7 |
| Image delivery (relay, URL policy, network) | 3, 4, 5 |
| Native reader gating | 6, 9 |
| Identity matching across providers | 1, for WebtoonClub, which matches chapter objects by chapter number |
| App E2E | 8 |

Every finding below was confirmed. None was dismissed.

## Findings

### 1. The longest array is taken as the chapter's pages

- **Where (8facf09):** `src/lib/scrapers/pages/strategies.ts`, in `nextCmsPages`, `flightUrlList`, `nextDataPages` and `webtoonclubPages`.
- **Failure mode:** a reader payload that also carries another chapter's list (a preview of the next chapter, or a "recommended" strip) returns the longer list. The reader then shows the wrong chapter's pages under the right title.
- **Fix:** a new `pickChapterList` helper.
  - Identical repeated copies are accepted.
  - Distinct lists that cannot be told apart throw `PAGE_FORMAT_CHANGED`.
  - WebtoonClub selects the object whose chapter number matches the request.
- **Tests:** "a second, longer page list in the reader payload is refused instead of returned"; "an identical repeated copy of the chapter's list is still read"; "WebtoonClub picks the chapter object matching the requested chapter, even when another one is longer"; "pickChapterList: distinct lists without a way to tell them apart are ambiguous".

### 2. Malformed entries are silently dropped

- **Where:** `src/lib/scrapers/pages/extract.ts` (`if (!u) continue`, `imagesBySelector`) and the MangaThemesia `ts_reader.run` path.
- **Failure mode:** a page without a URL, or a non-string entry, disappears. The chapter is then served as complete with a page missing.
- **Fix:** `finalizePages` throws `PAGE_FORMAT_CHANGED` on any entry it cannot read.
- **Tests:** four cases under "finding 2" (missing URL, non-string entry, `<img>` without a usable source, MangaThemesia non-string source).

### 3. HTTP page images are accepted, while the docs say HTTPS only

- **Where:** `src/lib/scrapers/pages/policy.ts` and `extract.ts`.
- **Failure mode:**
  - Mixed content.
  - Images on plain-HTTP or non-443 ports pass the allowlist.
  - A resizing proxy can wrap an `http:` target.
- **Fix:** host rules require `https:` on port 443, inner proxy targets get the same check, and an `http:` page fails the chapter with a clear error.
- **Tests:** three cases under "finding 3".

### 4. `/api/pages` hands out direct URLs when the relay refuses them

- **Where:** `src/app/api/pages/route.ts`.
- **Failure mode:** when `/api/image` would refuse a host, the route returns the raw upstream URL. The browser then loads an unvetted host directly, which leaks the reader's IP and referrer and bypasses the policy.
- **Fix:** the route fails closed with an error, and never returns the raw URL.
- **Test:** `routes.test.ts`, "fails closed instead of handing out a page URL the relay would refuse (PR #6 review, finding 4)".

### 5. DNS check and connection resolve separately (rebinding / TOCTOU)

- **Where:** `src/app/api/image/route.ts`, `src/lib/services/page-image.ts` and `src/lib/core/http.ts`. Each checks DNS through `net-guard.ts`, then lets `fetch` resolve the name again.
- **Failure mode:** a name that resolves to a public address at check time and to a private or metadata address at connect time reaches internal services. This is server-side request forgery (SSRF).
- **Fix:** `guardedLookup`, `guardedDispatcher` and `guardedFetch` in `src/lib/core/net-guard.ts` check every resolved address at connect time. They use an `undici@7.16.0` dispatcher, now a direct dependency.
- **Tests:** `src/tests/core/net-guard-connect.test.ts`.
  - The resolver cases.
  - A real loopback server that a rebinding name cannot reach, with a control case that reaches it when unguarded.
  - Two `pages-image.test.ts` cases asserting that page hosts and provider HTML are dialled through the guard.

### 6. The verifier checks helpers but is described as route-level

- **Where:** `scripts/verify-readers.ts`, `docs/PAGE_EXTRACTION.md` and the PR description.
- **Failure mode:** the "verified" status claims more than was tested. Route wiring, caching and the relay were not exercised.
- **Fix:**
  - The verifier calls the real route handlers, or a running server when `VERIFY_BASE_URL` is set.
  - The docs now describe exactly what is checked.
  - The capabilities route exposes `verification` (method, network, date) taken from `src/lib/providers/verification.ts`.

### 7. Fixture tests check only count, first and last

- **Where:** `src/tests/adapters/page-extraction.test.ts`.
- **Failure mode:** missing, reordered or duplicated middle pages pass.
- **Fix:** `src/tests/golden/expected-pages.json.gz` holds full ordered lists for all 46 fixtures.
- **Tests:** "has a golden list for every recorded fixture…" and "a swap of two middle pages is caught".

### 8. PR #20 live E2E relies on fixed sleeps and ambiguous `.first()`

- **Where:** dawghwa `e2e/live-providers.spec.ts` at `b1c6c0d`, which uses `waitForTimeout(1500)` and `.first()` on search hits and chapter rows.
- **Failure mode:** flaky passes or failures. A run can also pass after opening the wrong title or chapter and saving progress for it.
- **Fix (`04bab57`):**
  - All fixed sleeps are removed in favour of a `savedProgress` poll helper.
  - Asura chapter 1 is selected by the exact key suffix `/ch:1`.
  - The Thunderscans hit is selected by name, asserted with `toHaveCount(1)`.
  - Saved progress is checked against the opened chapter's key.
- **Run:** all 14 tests compile (`--list`), and lint passes. The live MangaDex case passed on desktop with `E2E_LIVE=1`. The other live providers were not run, to keep third-party traffic low.

### 9. The static ledger drives headline totals

- **Where:** `src/lib/providers/verification.ts`, which records `verifiedAt 2026-11-19` from a development network, and feeds the `pagesVerified` and `nativeReaderVerified` totals in capabilities.
- **App behaviour:** the app gates reading on the declared `capabilities.chapterPages` (`src/routes/Reader.tsx:135`, `src/routes/TitlePage.tsx:489`) and falls back to the source site on errors. So the totals do not change what readers can open; they only change what is claimed.
- **Fix:** capabilities now say how the ledger was produced (helper method, dev-sandbox network, static). Headline counts were **not** increased, and no unverified adapter was enabled.
- MangaDex, WEBTOON and Dynasty override `allowPageImage`. This was checked and is intended.
- **Still pending:** re-running the ledger against a deployed preview. This needs approval because it sends live traffic to 46 third-party sites.

## Results on `5d73612`

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` | 929 passed, 405 skipped (32 files) |
| `npm run build` | OK |
| Baseline at `8facf09` | 861 passed, 405 skipped |
