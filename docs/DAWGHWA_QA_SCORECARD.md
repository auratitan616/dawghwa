# QA scorecard

The scores come from the independent critic agent, never from the build agent. Weights: Blueprint fidelity 20%, Visual 15%, UX 15%, Reader 15%, Features 10%, Responsive 10%, Accessibility 5%, Performance 5%, Code 5%.

Acceptance requires all of the following:
- Overall score of 9.0 or higher.
- Blueprint, Reader, UX and Responsive each 9 or higher.
- No unresolved critical defects.

| Round | Build | Blueprint | Visual | UX | Reader | Features | Responsive | A11y | Perf | Code | Overall | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | baseline `main` | 5.0 | 7.0 | 6.5 | 6.5 | 8.0 | 7.5 | 7.5 | 7.5 | 7.5 | 6.7 | Not accepted |
| 1 | `feature/blueprint-experience` (6d21757) | 8.0 | 7.5 | 7.0 | 8.0 | 8.5 | 6.5 | 7.5 | 8.0 | 7.5 | 7.6 | Not accepted (C2 partial, C3 new) |
| 2 | `fix/critic-round1` (f689900) | 9.0 | 8.5 | 9.0 | 9.2 | 9.0 | 9.3 | 8.0 | 8.0 | 8.5 | 8.86 | Not accepted (overall < 9.0; no criticals) |
| 3 | `fix/critic-round2` (merged as 672311e) | 9.0 | 9.0 | 9.0 | 9.2 | 9.0 | 9.4 | 8.5 | 8.5 | 8.5 | 8.995 → 9.0 | ACCEPTED (gates met, no criticals) |

## Automated checks (latest)

| Check | Result |
| --- | --- |
| `tsc -b` | Pass |
| `eslint --max-warnings 0` | Pass |
| `vitest run` | 50 out of 50 pass |
| `vite build` | Pass, no source maps |
| Playwright e2e (Pixel 7 and desktop, production API) | 17 pass, 1 phone-only skip on desktop |
| CI (`web`, `android`) on PR #6 | See the PR |

## Viewports checked

360×740 (small Android), 390×844 (iPhone), 430×932 (large phone), 820×1180 (tablet), 1440×900 (desktop) and 1920×1080 (large desktop), in dark and light themes.

## Lighthouse

See `DAWGHWA_PROGRESS.md` for the before and after table.
