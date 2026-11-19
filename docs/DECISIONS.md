# Decisions

Choices made without stopping to ask, each resolved toward the design system and the local-first rules. Newest phase last.

## Phase 0: audit

| # | Decision | Why |
| --- | --- | --- |
| D1 | Work branches off `main`. Open PR #10 (Blueprint v2) and draft PR #9 (unified reader) are left untouched. | PR #10 replaces lime with a green `#00f07a` and drops Archivo. The brief says to keep the existing tokens (lime, vermilion, lavender). Those PRs will need a rebase after this series. |
| D2 | The in-app mascot art becomes the black-and-white collie from the owner's PDF. The same files are already prepared in PR #10's `src/assets/mascot/`. Launcher icons and splash screens stay as they are (PR #10 owns them). | The PDF is the visual brief and the old beagle art does not match it. Lavender (the mascot token) still matches the art's purple rim light. |
| D3 | Audit screenshots are stored as JPEG contact sheets (about 1 MB in total), not as 40 full PNGs. | Keeps the repository small. Full-size captures can be regenerated with `scripts/qa/audit-shots.mjs`. |

## Owner requests that touch the non-negotiables

| # | Request | Resolution |
| --- | --- | --- |
| D4 | "Login / signup" | Local only. Each profile is a reader account on the device: "Create reader" (name, colour, optional 4-digit PIN) and "Sign in" (pick a reader, enter the PIN if one is set). The PIN is a SHA-256 hash with a per-profile salt, stored in the profile record. It is a privacy curtain for shared devices, not security, and the UI says so. There are no servers, emails or passwords, because the API is read-only and the brief says "no accounts". |
| D5 | "Comment bar" in the reader | The API has no comments endpoint, and we may not change it. Comments are stored on the device, per profile and per chapter, and included in export/import. The sheet says plainly that they are private to this device. Top / Newest tabs and reactions follow the PDF. "Top" sorts by your own reactions and pins, since there is no audience. |
| D6 | "Remove top bar navigation" | The shell top bar is removed at every breakpoint. Phone: Home has an in-page brand row that scrolls away. Desktop: the sidebar already has Search and Profile. Title pages keep their own back header. |
| D7 | "Remove Discover from the bottom bar, add achievements" | Bottom nav: Home, Search, Library, Awards, Profile. The label is "Awards" because "Achievements" does not fit a 78px slot at 390px; the route is `/achievements` and the page title is "Achievements". Discover stays reachable from Search (Browse categories, a Discover link) and Home. When Rewards is off, the Awards slot shows Discover again. |
| D8 | Reader "scroll only" | Vertical scroll is the only layout. Single, double, direction, fit and tap-zone settings are removed, and stored values are ignored. |
| D9 | Reader top bar "stuck on top" | The top bar is always visible (fixed, safe-area aware) and tapping no longer hides it. On Android the status bar still hides while reading. |
| D10 | "Progress page bar on the bottom should be removed" | The bottom bar is gone. Chapter navigation moves to the end of the chapter (Next Episode card) and the chapter list in the top bar. A 2px reading-progress line stays along the bottom edge of the top bar, because it is part of the top bar and costs no space. |
| D11 | Rewards toggle scope | `settings.rewards` is a device setting like theme (same place the old "Show milestones" switch lived), migrated from `achievements`. Off hides every gamified surface; nothing is deleted because it is all derived. |
| D12 | Reward card placement | Reward cards appear at the top of the screen (toasts stay at the bottom), max two at once, auto-dismiss after `--dur-celebrate`, with a 44px close button. They never take focus and use `role="status"`. |
| D13 | Haptics | Success haptic for level-ups and series completion, light for the rest; skipped under reduced motion and on the web. |
| D14 | Where progression lives | Derived from the event log at read time instead of a new `xp` store. No DB version bump, nothing to migrate, export/import keeps it for free, and it cannot drift from reading history. "Clear history" removes progress records but not events, so XP is kept. |
| D15 | XP values | Chapter +10, new series +25, new genre +15, series complete +100, weekly quest +50. Level step cost is 60 + 40 x (level - 1), so 100 chapters lands around level 7 to 8. |
| D16 | What counts as "completed a series" | Only a completion the reader earned: reaching the end of the final chapter of a series the source lists as completed, with at least half its chapters read here. Marking "Completed" by hand still organises the library, but earns no XP or badge. Older completions without context are not counted retroactively. |
| D17 | Mascot variants per tier | The brief says "beagle"; the in-app mascot is the PDF collie (D2). The character is never redrawn, so tiers unlock an accessory emblem on the mascot (paw print, bookmark, compass, reading glasses, scroll, crown) rather than altered art. Names: Pup, Bookhound, Story Scout, Lore Keeper, Archivist, Legend. |
| D18 | Genre passport scope | The 14 headline Discover genres are always shown (stamped or "Try it", linking to that genre on Discover). Other genres appear once stamped. A stamp needs one finished chapter, not a save. |
