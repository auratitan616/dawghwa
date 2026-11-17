import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4173";
const [,, ...paths] = process.argv;
const browser = await chromium.launch();
for (const vp of [{ name: "m", width: 390, height: 844, mobile: true }, { name: "d", width: 1440, height: 900 }]) {
  const ctx = await browser.newContext({ serviceWorkers: "block", colorScheme: process.env.THEME || "light", viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // Sandbox browser egress returns 502 for uploads.mangadex.org; relay through Node (QA only).
  await ctx.route((u) => !u.hostname.includes("localhost") && !u.hostname.includes("fonts"), async (route) => { try { const r = await fetch(route.request().url()); const body = Buffer.from(await r.arrayBuffer()); await route.fulfill({ status: r.status, contentType: r.headers.get("content-type") ?? "image/jpeg", body }); } catch { await route.abort(); } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror " + e.message));
  page.on("console", (m) => m.type() === "error" && errs.push("console " + m.text()));
  // onboard quickly: skip
  await page.goto(base + "/welcome");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForTimeout(500);
  for (const p of paths) {
    await page.goto(base + p);
    await page.waitForTimeout(Number(process.env.WAIT||5000));
    const f = `/tmp/shots/${vp.name}-${p.replace(/[^\w]+/g, "_") || "home"}.png`;
    await page.screenshot({ path: f, fullPage: false });
    console.log(f);
  }
  console.log(vp.name, errs.slice(0, 10).join("\n"));
  await ctx.close();
}
await browser.close();
