// Writes dist/sitemap.xml after `vite build`. Public routes only; never private screens.
// Set SITE_URL (absolute origin). If DAWGHWA_API is set, popular title pages are included too.
import { writeFile, readFile } from "node:fs/promises";

const site = (process.env.SITE_URL || process.env.VITE_SITE_URL || "").replace(/\/$/, "");
if (!site) {
  console.log("sitemap: SITE_URL not set, skipping (robots.txt still served)");
  process.exit(0);
}
const urls = ["/", "/discover", "/about"];
const api = process.env.DAWGHWA_API;
if (api) {
  try {
    const res = await fetch(`${api.replace(/\/$/, "")}/api/browse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "mangadex", order: "popular", limit: 100 }) });
    const data = await res.json();
    const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60);
    for (const it of data.items ?? []) urls.push(`/title/mangadex/${it.id}/${slug(it.title)}`);
  } catch (e) {
    console.warn("sitemap: title list unavailable:", e.message);
  }
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(new URL("../dist/sitemap.xml", import.meta.url), xml);
const robots = new URL("../dist/robots.txt", import.meta.url);
await writeFile(robots, (await readFile(robots, "utf8")).replace("Sitemap: /sitemap.xml", `Sitemap: ${site}/sitemap.xml`));
console.log(`sitemap: ${urls.length} urls`);
