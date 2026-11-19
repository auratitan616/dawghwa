// Screenshot every route at 390px and 1440px in dark and light. QA only.
// BASE=http://localhost:4173 OUT=/tmp/shots/before node scripts/qa/audit-shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.env.BASE || "http://localhost:4173";
const out = process.env.OUT || "/tmp/shots";
mkdirSync(out, { recursive: true });
const VPS = [{ name: "390", width: 390, height: 844, mobile: true }, { name: "1440", width: 1440, height: 900 }];
const THEMES = (process.env.THEMES || "dark,light").split(",");
const browser = await chromium.launch();
const relay = async (ctx) => ctx.route((u) => u.hostname.includes("mangadex"), async (route) => { try { const r = await fetch(route.request().url()); await route.fulfill({ status: r.status, contentType: r.headers.get("content-type") ?? "image/jpeg", body: Buffer.from(await r.arrayBuffer()) }); } catch { await route.abort(); } });
let titleUrl = process.env.TITLE, readUrl = process.env.READ;
for (const theme of THEMES) for (const vp of VPS) {
  const ctx = await browser.newContext({ serviceWorkers: "block", colorScheme: theme, viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  await relay(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const shot = async (name, full = false) => { await page.screenshot({ path: `${out}/${theme}-${vp.name}-${name}.png`, fullPage: full }); };
  await page.addInitScript((t) => { try { const s = JSON.parse(localStorage.getItem("dawghwa:settings") || "{}"); s.theme = t; localStorage.setItem("dawghwa:settings", JSON.stringify(s)); } catch {} }, theme);
  await page.goto(base + "/welcome");
  await page.waitForTimeout(1500);
  await shot("welcome");
  const skip = page.getByRole("button", { name: /^(Skip|Cancel|Skip for now)$/ }).first();
  if (await skip.count()) await skip.click();
  await page.waitForTimeout(800);
  for (const [name, path] of [["home", "/"], ["search", "/search"], ["discover", "/discover"], ["library", "/library"], ["history", "/history"], ["profile", "/profile"], ["rewards", "/rewards"], ["about", "/about"]]) {
    await page.goto(base + path);
    await page.waitForTimeout(Number(process.env.WAIT || 3500));
    await shot(name);
    if (name === "home" && !titleUrl) titleUrl = await page.locator('a[href^="/title/"]').first().getAttribute("href");
  }
  if (titleUrl) {
    await page.goto(base + titleUrl);
    await page.waitForTimeout(4000);
    await shot("title");
    if (!readUrl) readUrl = await page.locator('a[href^="/read/"]').first().getAttribute("href").catch(() => null);
  }
  if (readUrl) {
    await page.goto(base + readUrl);
    await page.waitForTimeout(6000);
    await shot("reader");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2500);
    await shot("reader-end");
  }
  console.log(theme, vp.name, "errors:", errs.slice(0, 3).join(" | ") || "none");
  await ctx.close();
}
console.log("title", titleUrl, "read", readUrl);
await browser.close();
