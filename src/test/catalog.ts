import raw from "./fixtures/catalog.json";
import type { SearchResult } from "@/lib/api/types";
import { fromResult, type Title } from "@/lib/titles";

/** Real MangaDex catalogue sample captured from the Dawghwa API (scripts/capture-fixture.mjs). */
export const catalog: Title[] = (raw as { items: SearchResult[] }).items.map((r) => fromResult(r, "mangadex", "MangaDex"));
export const byTitle = (name: string) => catalog.find((t) => t.title.toLowerCase() === name.toLowerCase());
