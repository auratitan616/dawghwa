import raw from "./fixtures/catalog.json";
import { toResult, type CatalogItem } from "@/lib/api/catalog";
import { fromResult, type Title } from "@/lib/titles";

/**
 * Real MangaDex catalogue sample captured from GET /api/catalog
 * (scripts/capture-fixture.mjs), mapped through the app's own adapter.
 */
export const catalog: Title[] = (raw as unknown as { items: CatalogItem[] }).items.map((it) => fromResult(toResult(it), "mangadex", "MangaDex"));
export const byTitle = (name: string) => catalog.find((t) => t.title.toLowerCase() === name.toLowerCase());
