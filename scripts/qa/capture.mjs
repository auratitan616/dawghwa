/**
 * Visual QA capture. Usage:
 *   node scripts/qa/capture.mjs [--theme dark|light] [--vp m,s,t,d] [--full] path1 path2 ...
 * Viewports: s=360x740 (small Android), m=390x844, l=430x932, t=820x1180, d=1440x900.
 * Saves to /tmp/shots/<vp>-<theme>-<path>.png. Set CHROME to override the executable.
 * Sandbox note: headless egress to uploads.mangadex.org can fail, so remote images
 * are relayed through Node (QA only; real browsers load them directly).
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (k) => {
  const i = args.indexOf(`--${k}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const theme = opt("theme", "dark");
const vps = opt("vp", "m,d").split(",");
const wait = Number(opt("wait", "4500"));
const full = flag("full");
const onboard = flag("onboard");
const base = process.env.BASE ?? "http://localhost:4173";
const VP = {
  s: { width: 360, height: 740, mobile: true },
  m: { width: 390, height: 844, mobile: true },
  l: { width: 430, height: 932, mobile: true },
  t: { width: 820, height: 1180, mobile: true },
  d: { width: 1440, height: 900 },
};
function chrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = `${homedir()}/.cache/ms-playwright`;
  for (const d of readdirSync(root).filter((x) => x.startsWith("chromium-")).sort().reverse()) {
    const p = `${root}/${d}/chrome-linux64/chrome`;
    if (existsSync(p)) return p;
  }
  return undefined;
}
mkdirSync("/tmp/shots", { recursive: true });
const browser = await chromium.launch({ executablePath: chrome() });
for (const name of vps) {
  const vp = VP[name];
  const ctx = await browser.newContext({ serviceWorkers: "block", colorScheme: theme, viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => {
    try {
      const s = JSON.parse(localStorage.getItem("dawghwa:settings") ?? "{}");
      localStorage.setItem("dawghwa:settings", JSON.stringify({ ...s, theme: t }));
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  await ctx.route((u) => !u.hostname.includes("localhost"), async (route) => {
    try {
      const r = await fetch(route.request().url());
      const body = Buffer.from(await r.arrayBuffer());
      await route.fulfill({ status: r.status, contentType: r.headers.get("content-type") ?? "image/jpeg", body });
    } catch {
      await route.abort();
    }
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror " + e.message));
  page.on("console", (m) => m.type() === "error" && errs.push("console " + m.text().slice(0, 200)));
  if (!onboard) {
    await page.goto(base + "/welcome");
    await page.getByRole("button", { name: /skip/i }).first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  for (const raw of args) {
    const [p, action] = raw.split("#");
    await page.goto(base + p);
    await page.waitForTimeout(wait);
    if (action) {
      for (const a of action.split("|")) {
        if (a.startsWith("click=")) await page.getByRole("button", { name: new RegExp(a.slice(6), "i") }).first().click().catch((e) => errs.push("click " + e.message.slice(0, 80)));
        else if (a.startsWith("type=")) await page.keyboard.type(a.slice(5));
        else if (a.startsWith("scroll=")) await page.mouse.wheel(0, Number(a.slice(7)));
        else if (a.startsWith("tap")) await page.mouse.click(vp.width / 2, vp.height / 2);
        else if (a.startsWith("wait=")) await page.waitForTimeout(Number(a.slice(5)));
        else if (a.startsWith("radio=")) await page.getByRole("radio", { name: new RegExp(a.slice(6), "i") }).first().click().catch((e) => errs.push("radio " + e.message.slice(0, 80)));
        else if (a.startsWith("link=")) await page.getByRole("link", { name: new RegExp(a.slice(5), "i") }).first().click().catch((e) => errs.push("link " + e.message.slice(0, 80)));
        else if (a.startsWith("key=")) await page.keyboard.press(a.slice(4));
        else if (a === "end") await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(700);
      }
    }
    const f = `/tmp/shots/${name}-${theme}-${(raw.replace(/[^\w]+/g, "_") || "home").slice(-70)}.png`;
    await page.screenshot({ path: f, fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(f, overflow > 1 ? `HORIZONTAL OVERFLOW ${overflow}px` : "");
  }
  if (errs.length) console.log(name, "errors:\n" + [...new Set(errs)].slice(0, 12).join("\n"));
  await ctx.close();
}
await browser.close();
