// Production smoke test: real browser, no relay, records console errors and failed requests.
import { chromium } from "playwright";
const BASE = process.env.BASE || "https://dawghwa.vercel.app";
const out = process.env.OUT || "/tmp/prod";
const b = await chromium.launch();
for (const vp of [{ n: "m", width: 390, height: 844, mobile: true }, { n: "d", width: 1440, height: 900 }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, colorScheme: "dark" });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
  p.on("response", (r) => r.status() >= 400 && r.url().includes("/api/") && errs.push(`${r.status()} ${r.url().slice(0, 120)}`));
  await p.goto(BASE + "/");
  await p.waitForURL(/welcome/);
  await p.getByRole("button", { name: "Skip" }).click();
  await p.waitForURL(/\/$/);
  await p.waitForTimeout(7000);
  const hero = await p.locator(".hero-slide h2, .hero-slide .hero-title").first().textContent().catch(() => null);
  const cards = await p.locator("a[href^='/title/']").count();
  await p.screenshot({ path: `${out}-${vp.n}-home.png` });
  await p.goto(BASE + "/library");
  const lib = await p.getByRole("heading", { level: 1, name: "Library" }).isVisible();
  await p.goto(BASE + "/title/mangadex/77bee52c-d2d6-44ad-a33a-1734c1fe696a");
  await p.waitForTimeout(6000);
  const h1 = await p.locator("h1").first().textContent();
  await p.screenshot({ path: `${out}-${vp.n}-title.png` });
  await p.goto(BASE + "/search?q=solo%20leveling");
  await p.waitForTimeout(6000);
  const hits = await p.locator("a[href^='/title/']").count();
  await p.screenshot({ path: `${out}-${vp.n}-search.png` });
  console.log(JSON.stringify({ vp: vp.n, hero, cards, lib, h1, hits, errs }));
  await ctx.close();
}
await b.close();
