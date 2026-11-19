# UX and gamification audit

Phase 0 of the gamification work. Every route was captured at 390px (Pixel-class phone) and 1440px (desktop), in dark and light, against the production API (`https://dawghwaapi.vercel.app`) on `main` at `e4bc596`. Contact sheets are in `docs/audit/before/`. Capture script: `scripts/qa/audit-shots.mjs`.

| Sheet | Routes |
| --- | --- |
| `dark-390.jpg`, `light-390.jpg` | Welcome, Home, Search, Discover, Library, History, Profile, `/rewards` (404 today), About, Title |
| `dark-1440.jpg`, `light-1440.jpg` | Same, desktop |
| `title.jpg`, `reader.jpg` | Title page and Reader (The Eminence in Shadow, chapter 1), all four combinations |

Baseline numbers: initial JS 138.4 KB gzip (`scripts/qa/bundle-size.mjs`), 52 unit tests passing, typecheck and lint clean.

The owner's reference PDF (`mascot-blueprint-and-reader.pdf`) adds these targets: a mascot-led onboarding with speech bubbles and one question per screen, WEBTOON-style chapter comments (Top / Newest, composer pinned to the bottom), a chapter end with credits and a "Next Episode" card, and the black-and-white collie mascot with the book bandana.

## Friction points

### Navigation and shell

1. The phone top bar repeats the bottom nav. Its search icon and avatar go to the same places as the Search and Profile tabs, and it takes 56px plus the safe area on every screen. On About the brand shows twice (top bar and page header).
2. Discover and Search do the same job. Both have category entry points ("Pick a genre" vs "Browse categories"), and the bottom nav gives each a tab, so five slots go to four ideas.
3. On desktop the header search box repeats the sidebar's Search link, and the sidebar footer repeats the Profile link.
4. Achievements have no home. They live halfway down Profile under the stats, and `/rewards` returns a 404.

### Progression and motivation

5. Milestones are seven flat, one-shot items. Once "First page turned" is earned there is nothing to aim for until 10 and then 100 chapters. Locked rows are grey and look disabled, not like goals.
6. Finishing a chapter has no reward beat. The end panel says "One more chapter?", but nothing confirms that the chapter counted.
7. There is no sense of breadth. Genre exploration exists only as "Favourite genres" (top 5), which shows what you already read, not what is left to explore.
8. Progress is shown in only one place, the Continue Reading bar on Home. Title cards, the Library grid and the title header show none.
9. "Show milestones" is under Appearance, mixed in with theme and motion. It is not a clear on/off switch for rewards.

### Reader

10. The bottom bar (chapter arrows, page slider, `1 / 37`, RTL chip) repeats the top hairline progress and covers the art at the bottom of every page in scroll mode.
11. Tapping toggles both bars, so the top bar (back, chapters, settings) disappears often and readers lose their way out.
12. Single and double-page layouts add four settings (layout, direction, fit, tap zones). The catalogue is mostly vertical webtoons and manhwa, and the owner wants scroll-only.
13. There is no place to react to a chapter. The PDF shows comments as the main end-of-chapter moment.
14. The end panel has a single button for the next chapter. It shows no cover or episode card, unlike the PDF's "Next Episode" card.

### Onboarding and identity

15. The mascot appears only in the 1.1s "Finding stories" beat. The three steps are text and chips, while the PDF has the mascot guiding each step in a speech bubble.
16. Next is disabled on step 1 and nothing says why ("Choose at least one" is missing).
17. There is no way to say who is reading. Every install starts as "Reader". Profiles exist but are buried in settings, with no sign-in style entry and no way to keep a sibling out of your profile.
18. The flow does not end with something to do. It finishes on Home with no first goal.

### States and polish

19. Before the profile loads, Profile renders nothing (`return null`) and Library shows its empty state for a moment, because neither checks `ready`. Neither has a skeleton.
20. The Library empty state sends people to Discover, which is leaving the bottom nav.
21. The Profile stats strip shows four zeros on a new profile, and its hard ink frame reads as "empty form".

## Inconsistencies

- Lime is used both as a filled action (buttons) and as an outline chip ("Surprise me" on Home). The design system reserves lime for the primary action.
- Section headers mix numbered kickers (`01 Popular by category`) with plain ones (`What everyone's reading`).
- Motion tokens exist (`--dur-*`, `--ease-*`), but there are no tokens for celebration, stagger or distance, so components hard-code them.
- Progress bars use two styles: `.progress-bar` on cards and an inline width on Library rows.
- The milestones copy says "no streaks", which is right for the ethos, but nothing offers a gentle, opt-in rhythm for people who want one.

## Top 10 opportunities

Ranked by impact divided by effort. Impact and effort are scored 1 to 5.

| # | Opportunity | Impact | Effort | Phase |
| --- | --- | --- | --- | --- |
| 1 | Chapter-end reward beat: confirm the chapter counted, show XP, level progress and quest ticks, never mid-chapter | 5 | 2 | 4 |
| 2 | Progress rings on title cards, Continue Reading and the title header, from data already stored | 4 | 1 | 4 |
| 3 | Navigation cleanup: drop the top bar, replace Discover with Achievements in the bottom nav, keep Discover reachable from Search and Home | 4 | 2 | 1 |
| 4 | XP and named levels from finished chapters, new series, completed series and new genres, derived from existing events (no new stores) | 5 | 3 | 2 |
| 5 | Mascot-led onboarding (PDF): one question per screen, speech bubbles, a local profile "sign up", ending on a first quest | 4 | 3 | 5 |
| 6 | Scroll-only reader with a fixed top bar, no bottom bar, and a comments button in the top bar | 4 | 2 | 4 |
| 7 | Tiered achievement sets (I/II/III) with progress hints, and a genre passport on Profile | 4 | 2 | 2 |
| 8 | Three rotating weekly quests generated on the device from the recommender, with cosmetic rewards only | 4 | 3 | 3 |
| 9 | Chapter comments (local, per profile), Top / Newest, quick reactions, with a preview at chapter end | 3 | 3 | 4 |
| 10 | Shareable reader card image (level, top genres, heatmap) and a monthly recap | 3 | 3 | 5 |

## Guardrails carried into every phase

- A chapter counts only when its last page is reached. XP, quests and achievements use the first completion of each chapter only.
- No lost streaks, no guilt copy and no nagging. The rhythm goal is opt-in, counts total weeks rather than consecutive ones, and has rest days built in.
- A Profile > Rewards toggle hides every gamified surface (nav tab, rings, beats, quests, badges).
- Reduced motion: no confetti and no animation, and state changes are instant.
- Initial JS stays at about 145 KB gzip. Gamification code loads lazily with the routes that use it.
