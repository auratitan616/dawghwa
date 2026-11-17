// Capture a real catalogue sample from a running Dawghwa API for the
// recommender tests and offline evaluation (public metadata only).
// Usage: DAWGHWA_API=http://localhost:3100 node scripts/capture-fixture.mjs
import { writeFileSync } from "node:fs";

const API = process.env.DAWGHWA_API ?? "http://localhost:3100";
const queries = [
  { kinds: ["manhwa"], order: "popular" },
  { kinds: ["manga"], order: "popular" },
  { kinds: ["manhua"], order: "popular" },
  { kinds: ["manga"], order: "rating" },
  { kinds: ["manhwa"], order: "rating" },
  { status: ["completed"], order: "popular" },
];
const seen = new Map();
for (const q of queries) {
  for (const offset of [0, 100]) {
    const r = await fetch(`${API}/api/browse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "mangadex", limit: 100, offset, ...q }) });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const body = await r.json();
    for (const it of body.items) {
      if (seen.has(it.id)) continue;
      const m = it.metadata ?? {};
      seen.set(it.id, {
        id: it.id, title: it.title, url: it.url, latestChapter: it.latestChapter, lastUpdated: it.lastUpdated,
        metadata: { ...m, description: m.description?.slice(0, 700), altTitles: m.altTitles?.slice(0, 4), coverImageLarge: undefined, availableLanguages: undefined },
      });
    }
    console.log(JSON.stringify(q), offset, seen.size);
  }
}
writeFileSync("src/test/fixtures/catalog.json", JSON.stringify({ capturedAt: new Date().toISOString(), source: "mangadex", items: [...seen.values()] }));
console.log("wrote", seen.size);
