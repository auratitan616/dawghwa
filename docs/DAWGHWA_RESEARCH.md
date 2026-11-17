# Reference research

These are patterns observed in established reading products, and how Dawghwa applies them. They are not copied. The blueprint stays the visual authority.

| Product | Pattern | Applied in Dawghwa |
| --- | --- | --- |
| [WEBTOON](https://www.webtoons.com/) | Full-bleed key-art hero, genre chips over a cover row, a title page with a sticky read CTA, "My Series" tabs, onboarding by genre | This is the blueprint's base: Home hero, category shelf, title page, Library tabs, Onboarding |
| [MangaDex](https://mangadex.org/) | Chapter lists by scanlation group, long-strip versus paged reading, a content-rating filter | Reader layouts (Scroll, Single, Double), group shown in the reader header, mature-cover blur by default |
| [MANGA Plus](https://mangaplus.shueisha.co.jp/) | Right-to-left paged reading for manga, with a clear direction cue | RTL default for manga, the "RTL" cue next to the page slider, mirrored chapter arrows |
| [Tapas](https://tapas.io/) | Simple library with Recent first and a clear unread state | The Recent tab is built from reading progress; "With unread chapters" scope |
| [Comick](https://comick.io/) | Dense search with type and status filters, and "continue" on every saved card | Natural-language search with parsed filter chips; Continue buttons in Library list view |
| [AniList](https://anilist.co/) | Rich metadata (genres, tags, score, status, year) and recommendations | Catalogue source through `/api/catalog`; the "Readers also like" tab |
| [MyAnimeList](https://myanimelist.net/) | Reading statuses (Reading, Completed, On hold, Dropped, Plan to read) | Library statuses and the status sheet with radio indicators |

## Takeaways

1. Readers resume more often than they browse, so "Continue" has to be one tap from Home and from the title page.
2. Reading direction must be visible in paged mode, or manga readers get lost.
3. Mature content needs a safe default with an explicit opt-in.
4. Empty states should be short and quiet. Readers already know what a library is.
