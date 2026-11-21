# Phased plan

The plan favours a few vertical slices that work end to end. Each phase lists what was built in this review (on local branches that have not been pushed), what remains, and what needs your approval.

## Phase A: correctness and provider reliability (built)

- **API `fix/pr6-page-extraction-hardening`:** findings 1–7 and 9 from [pr6-review.md](pr6-review.md).
  - Page extraction fails closed.
  - Page images are HTTPS only.
  - A connect-time DNS guard is in place.
  - Verification is described honestly.
  - Golden full page lists cover every fixture.
- **App `fix/pr20-live-e2e-determinism`:** finding 8.
- **App `fix/home-loading-a11y`:** fixes an intermittent serious axe violation on the Home loading state. It was the only failing E2E test on `main`.
- **Remaining, needs approval:** re-run `scripts/verify-readers.ts` against a deployed preview (`VERIFY_BASE_URL`), then update `src/lib/providers/verification.ts` from that run. This sends live requests to 46 third-party sites.

## Phase B: catalogue (built)

- **API `feat/catalog-advanced-filters`:**
  - New query parameters, which can be repeated or comma-separated:
    - `status`
    - `format`
    - `demographic`
    - `genreMode=and|or`
    - `excludeMode=and|or`
  - A single value keeps the legacy behaviour.
  - Capabilities list the filters each catalogue provider supports.
  - Providers that cannot apply a filter return 400 instead of ignoring it.
  - Fixed: `main` read only the first `status`.
- **App `feat/discover-advanced-filters`:**
  - Several types and statuses at once, demographic, tag match all / any, and year.
  - All of these live in the URL, so a filtered view can be shared.
  - Controls appear only when the API advertises the filter.
  - Unsupported combinations show an error instead of wrong results.
  - When filtering happens on the device, the count reads "About N".
  - The catalogue's 10,000-result window is stated.
  - Paging bug fixed: "load more" now advances by the number of items the server returned (`nextBrowseOffset`).
- **Later (P2):**
  - Numbered pagination.
  - The exclude-mode toggle.
  - Content-rating multi-select. This needs a product decision on adult content.
  - Year and chapter-count ranges, which MangaDex cannot filter on. They are not offered rather than faked.

## Phase C: reader auto-scroll (built)

- **App `feat/reader-auto-scroll`:**
  - **Motion:**
    - The scroll is time-based (requestAnimationFrame with a frame-time clamp).
    - Glide mode moves continuously; screen-by-screen mode moves 85% of the viewport at a time.
    - Under reduced motion, screen-by-screen mode is always used.
  - **Pausing and stopping:**
    - It pauses while the tab is hidden or a dialog or sheet is open.
    - It yields to manual scrolling, touch and keys, then resumes 1.5 s after you stop.
    - At the chapter's end card it stops with a notice and does not open the next chapter.
  - **Controls:** speed runs from 20 to 400 px/s and is remembered, along with the mode. Shortcuts: P to start or pause, − and + for speed.
- **Later (P2):** shortcut help overlay, greyscale and dim options.

## Phase D: real accounts and sync (proposed; needs approval)

Today, profiles live on the device (`src/lib/store/accounts.ts`) with an optional PIN. They are clearly not authentication and should not be presented as such. A production account system needs choices that cost money or need external setup:

1. **Identity provider.** Options:
   - Managed: Clerk, Auth0, Supabase Auth.
   - Self-hosted: Auth.js on the Next.js API, with a database.
   Decision needed: which provider, its plan and pricing, and the data region.
2. **Database for synced library and progress**, for example Postgres (Neon or Supabase) or the existing Upstash Redis. Redis is a poor fit for relational sync.
3. **OAuth applications** (Google, Discord) registered under your accounts.
4. **Email delivery** for verification and reset (for example Resend or Postmark), and a sending domain.

Security design, whichever provider is chosen:

- **Sessions:** HttpOnly, Secure, SameSite=Lax cookies issued by the API domain. No tokens in `localStorage`.
- **CSRF:** a double-submit token or an Origin check on every write.
- **Abuse:** rate limits on sign-in, plus a captcha only after repeated failures.
- **Passwords:** stored with argon2id if passwords are used at all; a passkey or OAuth-first design is better.
- **Sync model:** device data stays the source of truth until sign-in. On first sign-in, local data merges into the account using a last-write-wins rule per item, with tombstones for deletions.
- **Account deletion:** an export and delete path, required for privacy compliance.

Acceptance tests:

- Sign-up, sign-in and sign-out.
- A session survives reload and is invalid after sign-out.
- Writes without a CSRF token are rejected.
- Progress made on device A appears on device B.
- Deleting the account removes its server data.

## Phase E: community comments (proposed; gated on D)

The current on-device notes (`src/lib/comments.ts`) are private and labelled honestly. A community thread needs:

- accounts (Phase D);
- storage with cursor pagination;
- server-side sanitising (plain text or a strict Markdown subset, no raw HTML);
- per-user rate limits;
- report and hide tools;
- a moderation owner;
- a policy on spoilers and on comments attached to content Dawghwa does not host.

Nothing will be shown with placeholder data. Decision needed: whether to run community features at all, given the moderation and legal load.

## Approval checklist

| Action | Needed for |
|---|---|
| Push the local branches and open or update PRs | All phases |
| Update or supersede PR #6 and PR #20 | Phase A |
| Merge to `main` and deploy (Vercel or another host) | Production |
| Live verifier run against third-party sites | Phase A, last step |
| Choose and pay for an auth provider, database and email service | Phase D |
| Register OAuth apps | Phase D |
| Decide on community features and moderation | Phase E |
