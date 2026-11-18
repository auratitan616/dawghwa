# Unified reader integration

The app consumes the API's unified chapter response while keeping the existing reader as the only reading surface.

## Data flow

1. Title details call the unified chapter query for metadata-addressable titles.
2. The API returns chapter groups with provider-specific variants.
3. The app maps each group to the existing Chapter view model and keeps its variants.
4. The first variant is selected by default; the reader settings selector allows switching to another variant.
5. Page requests send both provider chapter ID and the source chapter URL. ID-based providers (MangaDex) use the ID; HTML-based providers (WEBTOON and Dynasty Reader) use the URL.
6. All page results render through the same PageImage and reader layout.

## Progress continuity

For chapters that include the title's original provider variant, the app keeps that provider's chapter ID as the local progress key. This preserves existing MangaDex progress records while the list is aggregated. Other groups use the API's stable group key.

Switching source variants keeps the unified chapter key and current page index. If variants have different page counts, the reader clamps the position to the available range. Exact panel matching across different editions is not guaranteed.

## Failure behavior

- The app never redirects users to a provider website to read a chapter.
- If page retrieval fails, the reader offers retry and keeps alternate variants selectable.
- Failed image delivery triggers a throttled page-manifest refresh; this is important for temporary MangaDex@Home URLs.
- The app does not silently switch language or edition because the current API does not reliably expose per-chapter language metadata.

## Compatibility

While the API aggregation route is not deployed, the app falls back to the existing single-source chapter endpoint only when the unified route returns 404. Other API errors are surfaced rather than silently hiding source failures.
