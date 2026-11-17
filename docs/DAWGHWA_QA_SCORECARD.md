# QA scorecard

The scores come from the independent critic agent, never from the build agent. Weights: Blueprint fidelity 20%, Visual 15%, UX 15%, Reader 15%, Features 10%, Responsive 10%, Accessibility 5%, Performance 5%, Code 5%.

Acceptance requires all of the following:
- Overall score of 9.0 or higher.
- Blueprint, Reader, UX and Responsive each 9 or higher.
- No unresolved critical defects.

| Round | Build | Blueprint | Visual | UX | Reader | Features | Responsive | A11y | Perf | Code | Overall | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | baseline `main` | 5.0 | 7.0 | 6.5 | 6.5 | 8.0 | 7.5 | 7.5 | 7.5 | 7.5 | 6.7 | Not accepted |
| 1 | `feature/blueprint-experience` | pending | | | | | | | | | | |

## Automated checks (latest)

| Check | Result |
| --- | --- |
| `tsc -b` | Pass |
| `eslint --max-warnings 0` | Pass |
| `vitest run` | 49 out of 49 pass |
| `vite build` | Pass, no source maps |
| Playwright e2e (Pixel 7 and desktop, production API) | 16 out of 16 pass |
| CI (`web`, `android`) on PR #3 | See the PR |

## Viewports checked

360×740 (small Android), 390×844 (iPhone), 430×932 (large phone), 820×1180 (tablet), 1440×900 (desktop) and 1920×1080 (large desktop), in dark and light themes.

## Lighthouse

See `DAWGHWA_PROGRESS.md` for the before and after table.
