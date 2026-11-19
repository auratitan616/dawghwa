// Phase 5 screens: mascot onboarding, sign-in, monthly recap and reader card. QA only.
// BASE=http://localhost:4173 OUT=/tmp/shots/p5 READ=/read/... node scripts/qa/phase5-shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.env.BASE || "http://localhost:4173";
const out = process.env.OUT || "/tmp/shots/p5";
mkdirSync(out, { recursive: true });
const VPS = [{ name: "390", width: 390, height: 844, mobile: true }, { name: "1440", width: 1440, height: 900 }];
const browser = await chromium.launch();
for (const theme of ["dark", "light"]) for (const vp of VPS) {
  const ctx = await browser.newContext({ serviceWorkers: "block", colorScheme: theme, viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  await ctx.route((u) => u.hostname.includes("mangadex"), async (route) => { try { const r = await fetch(route.request().url()); await route.fulfill({ status: r.status, contentType: r.headers.get("content-type") ?? "image/jpeg", body: Buffer.from(await r.arrayBuffer()) }); } catch { await route.abort(); } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const shot = (n, full = false) => page.screenshot({ path: `${out}/${theme}-${vp.name}-${n}.png`, fullPage: full });
  await page.addInitScript((t) => { try { const s = JSON.parse(localStorage.getItem("dawghwa:settings") || "{}"); s.theme = t; localStorage.setItem("dawghwa:settings", JSON.stringify(s)); } catch {} }, theme);
  await page.goto(base + "/welcome");
  await page.waitForTimeout(1500);
  await shot("ob-hello");
  await page.getByRole("button", { name: "Create reader" }).click();
  await page.getByLabel("Reader name").fill("Mina");
  await page.getByLabel(/Ask for a PIN/).check();
  await page.getByLabel("4-digit PIN").fill("1234");
  await page.waitForTimeout(400);
  await shot("ob-reader");
  const cont = page.getByRole("button", { name: /^Continue/ });
  await cont.click();
  await page.waitForTimeout(800);
  for (const i of [0, 1, 4]) await page.locator(".onboard-tile").nth(i).click();
  await shot("ob-genres");
  await cont.click();
  await cont.click();
  await cont.click();
  await page.waitForTimeout(800);
  await shot("ob-ready");
  await page.getByRole("button", { name: /Go to Home|Start reading/ }).click();
  if (process.env.READ) {
    await page.goto(base + process.env.READ);
    await page.waitForTimeout(5000);
    for (let i = 0; i < 80; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await page.waitForTimeout(120);
      if (await page.evaluate(() => window.innerHeight + window.scrollY >= document.body.scrollHeight - 4)) break;
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2500);
  }
  await page.goto(base + "/profile");
  await page.waitForTimeout(2500);
  await shot("profile");
  await page.locator("#recap-h").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot("recap");
  const card = page.getByRole("button", { name: "Share reader card" });
  if (await card.count()) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await card.click();
    await page.waitForTimeout(2000);
    await shot("card");
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForTimeout(600);
  await shot("signin");
  await page.getByRole("button", { name: /Mina/ }).click();
  await page.getByLabel("Enter your 4-digit PIN").fill("1");
  await shot("signin-pin");
  console.log(theme, vp.name, "errors:", errs.slice(0, 3).join(" | ") || "none");
  await ctx.close();
}
await browser.close();
