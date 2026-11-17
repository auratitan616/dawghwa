// Capture a real catalogue sample from a running Dawghwa API for the
// recommender tests and offline evaluation (public metadata only). Items are
// stored exactly as GET /api/catalog returns them (trimmed), and the tests map
// them through the app's own adapter (src/lib/api/catalog.ts).
// Usage: DAWGHWA_API=http://localhost:3100 node scripts/capture-fixture.mjs
import { writeFileSync } from "node:fs";

const API = process.env.DAWGHWA_API ?? "http://localhost:3100";
const queries = [
  { format: "manhwa", sort: "popularity" },
  { format: "manga", sort: "popularity" },
  { format: "manhua", sort: "popularity" },
  { format: "manga", sort: "score" },
  { format: "manhwa", sort: "score" },
  { status: "completed", sort: "popularity" },
];
const seen = new Map();
for (const q of queries) {
  for (const page of [1, 2]) {
    const p = new URLSearchParams({ provider: "mangadex", limit: "100", page: String(page), ...q });
    const r = await fetch(`${API}/api/catalog?${p}`);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const body = await r.json();
    for (const it of body.items) {
      if (seen.has(it.ref)) continue;
      seen.set(it.ref, { ...it, altTitles: it.altTitles?.slice(0, 4), description: it.description?.slice(0, 700) });
    }
    console.log(JSON.stringify(q), page, seen.size);
  }
}
writeFileSync("src/test/fixtures/catalog.json", JSON.stringify({ capturedAt: new Date().toISOString(), provider: "mangadex", endpoint: "/api/catalog", items: [...seen.values()] }));
console.log("wrote", seen.size);
