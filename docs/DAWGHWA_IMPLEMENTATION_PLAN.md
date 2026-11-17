# Dawghwa implementation plan

Order: dependencies first, then the screens with the most blueprint weight. Each milestone passes `tsc -b`, `eslint --max-warnings 0`, `vitest`, `vite build`, a rendered-UI check (390, 820, 1440 and 1920px) and, before merge, Playwright e2e against the production API.

| Milestone | Scope | Files | Status |
| --- | --- | --- | --- |
| 0. Merge foundation | API PRs #1 and #2, frontend PR #1, frontend PR #2 rebased onto main's `/api/catalog` | both repos | Done |
| 1. Tokens | Retune the dark and light tokens, radii and type for the blueprint | `tokens.css`, `app.css` | Done |
| 2. Home | Hero carousel, category shelf | `Hero.tsx`, `CategoryShelf.tsx`, `Home.tsx` | Done |
| 3. Title page | Own header, centred cover, tabs, About sheet, sticky CTA | `TitlePage.tsx`, `Shell.tsx` | Done |
| 4. Search | Landing modules, title-first results (C1) | `Search.tsx` | Done |
| 5. Reader | Exact resume (C2), paged centring, RTL cue, a single auto-continue | `Reader.tsx`, `reader.css`, `db.ts` | Done |
| 6. Library | Recent tab, uppercase tabs, unread scope, empty states | `Library.tsx` | Done |
| 7. Onboarding | Icon chips, Next (n), finding splash | `Onboarding.tsx` | Done |
| 8. Feedback and errors | Undo toasts, radio sheet, human 5xx copy, retry cap, offline search | `TitlePage.tsx`, `errors.ts`, `client.ts`, `query.ts`, `Search.tsx` | Done |
| 9. Responsive chrome | Tablet nav and hero, 1920 header alignment | `app.css` | Done |
| 10. Content defaults | Mature cover blur and toggle, dark default | `Cover.tsx`, `settings.ts`, `index.html`, `Profile.tsx` | Done |
| 11. Critic loop | Rounds until 9.0 or higher overall and 9 or higher on Blueprint, Reader, UX and Responsive | (critic) | In progress |
| 12. Ship | PR #3 to main, Vercel production check | | In progress |

## Constraints followed

- No invented API features. Rows and filters the catalogue cannot back are hidden.
- No accounts. Everything is stored per profile in IndexedDB on the device. Nothing private goes into shared caches; the service worker caches only fonts and public cover images. API responses are kept in IndexedDB on the device, never in a shared cache.
- No force-pushes. Merges use merge commits after green CI.
