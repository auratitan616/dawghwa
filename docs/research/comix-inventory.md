# Reference site inventory: comix.ws (observed 2026-11-20/21)

Method: low-volume manual browsing of public pages in a sandboxed Chrome at desktop width and at 390 px, plus reading what the browser itself loaded (page markup, bundle names, network requests the pages made on their own, `localStorage` keys the site wrote). No account was created, no form was submitted, nothing was posted, liked or reported, and no hidden endpoint was probed. A request the site protects (a chapter image manifest replayed outside the page) returned 403 and was not retried or worked around.

Labels:

- **Observed**: seen directly in the UI or in the browser's own traffic.
- **Inferred**: a conclusion from observations; the evidence is given.
- **Unknown**: not visible from public behaviour. The site's backend code, database schema, hosting and provider relationships are not knowable from the UI and are not claimed here.

Nothing from the site (branding, copy, artwork, code) is reused in Dawghwa. Only behaviours are described.

## Platform

| Item | Label | Evidence |
|---|---|---|
| Single-page app; hashed bundles under `/assets/build/<hash>/dist/*.js` | Observed | Page source and network panel |
| Cloudflare in front of the site (insights beacon) | Observed | Beacon request from the page |
| Device-local state in `localStorage`: `auth`, `front_t3.searchHistory`, `recs.recent.v1`, `list.filters.v2`, `browse:advancedOpen` | Observed | Storage inspector after browsing |
| Browse filters restored from `localStorage` on return | Inferred | `list.filters.v2` written when filters change; filters reappeared on a bare `/browse` visit |
| Backend language, database, image hosting arrangements | Unknown | Not visible from public behaviour |

## Home

| Feature | Label | Notes |
|---|---|---|
| Announcement strip | Observed | Notices at the top |
| "Most recent popular" carousel with rank numbers and a timeframe switch | Observed | |
| "Most follows" and "New comics" shelves | Observed | |
| Latest updates list with Hot / New tabs | Observed | |
| Recently added and completed series shelves | Observed | |
| User-made collections shelf | Observed | Community lists; visible logged out |

## Browse and search

| Feature | Label | Notes |
|---|---|---|
| Keyword field plus a collapsible advanced filter panel | Observed | Panel open state is remembered (`browse:advancedOpen`) |
| Sorts: best match, latest update, recently added, title A–Z / Z–A, year newest / oldest, highest rated, most viewed (7, 30, 90 days, all time), most followed | Observed | |
| Content rating multi-select (safe and suggestive on by default; two adult levels off) | Observed | |
| Type multi-select (for example manhua) | Observed | |
| Genres with a MATCH ALL / ANY switch, type-ahead, and tri-state include / exclude chips | Observed | URL carries `genres_in`, `genres_ex`, `genres_mode=or` |
| Demographic multi-select | Observed | |
| Release status (five values) | Observed | |
| Chapter count min / max, year from / to | Observed | |
| Author and artist filters | Observed | |
| Reset, "I'm feeling lucky", list / grid toggle, result count | Observed | |
| URL state: `?genres_in=…&genres_ex=…&genres_mode=or&page=N&sort=relevance:desc&types=manhua` | Observed | URL updated with `history.replaceState` (back does not step through filter changes) |
| The page's own API call: `GET /api/v1/manga?order[...]&page&limit=28&content_rating[]&genres_in[]&genres_ex[]&genres_mode&_=<opaque>` | Observed | Seen in the network panel; not called directly |
| Numbered pagination (28 per page) | Observed | |
| Empty result shows "0 items" with filters kept | Observed | |
| Search autocomplete: debounced, 6 suggestions, "View all results" | Observed | |
| Free-text relevance is weak | Inferred | A few test queries ranked loosely related titles above closer matches; small sample |

## Title page

| Feature | Label | Notes |
|---|---|---|
| Breadcrumb, alternative titles, badges (type, status, rating), rank, score, follower count | Observed | |
| Start reading, follow and add-to-collection buttons | Observed | Follow and collection need an account |
| Tags link to browse with that tag applied | Observed | |
| Links out to AniList, MangaUpdates, MangaDex and MangaBaka | Observed | |
| Chapter list with one row per upload per group (not merged across groups), group filter, sort, 20 per page | Observed | |
| Chapter image list behind a protected API (403 when replayed outside the page) | Observed | Not retried |
| Comments thread with cursor pagination, best / newest / oldest, rich-text editor, likes and nested replies | Observed (read only) | Nothing posted |

## Reader

| Feature | Label | Notes |
|---|---|---|
| Long strip with per-page placeholders and "N / total" | Observed | |
| Previous / next chapter, chapter list, comments toggle, fullscreen | Observed | |
| Auto-scroll start / pause button | Observed | |
| Settings: reading direction (LTR, RTL, top-to-bottom), page margin, keyboard scroll amount, auto-scroll mode (continuous or step) and speed (default shown as 150 px/s), progress bar position, preload count, greyscale, dim | Observed | |
| Shortcuts: P auto-scroll, B / [ and N / ] chapters, M / C comments, F fullscreen, H / ? help | Observed | From the in-reader help |
| Manual wheel scrolling did not pause auto-scroll | Observed | Dawghwa deliberately does the opposite (yields to the reader, then resumes) |
| Page images served from several unrelated hostnames that rotate | Observed | |
| How those image hosts relate to the site | Unknown | |

## Accounts and community

| Feature | Label | Notes |
|---|---|---|
| Login modal: email and password, Google sign-in, create account; a captcha widget loads with the modal | Observed | Not submitted |
| Reader settings say "Saved to this device. No account needed." | Observed | Same model as Dawghwa's device settings |
| Community forum at `/community` | Observed | Read only |
| Session storage format, token lifetime, moderation tooling | Unknown | |

## Mobile (390 px)

| Feature | Label | Notes |
|---|---|---|
| Stacked layouts; filter panel becomes a full-width collapsible block | Observed | |

## Screenshots

Screenshots of the reader timed out in the sandbox browser (very long image strips), so this inventory relies on direct observation notes rather than a full screenshot set. No reference screenshots are committed to the repository, to avoid redistributing the site's artwork.
