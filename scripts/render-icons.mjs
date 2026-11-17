// Renders the brand mark SVGs in public/icons to PNG (app, maskable, apple, favicon, OG image).
// Usage: node scripts/render-icons.mjs  (needs Playwright's Chromium)
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";

const dir = new URL("../public/icons/", import.meta.url);
const jobs = [
  ["icon-full.svg", "icon-192.png", 192],
  ["icon-full.svg", "icon-512.png", 512],
  ["icon-maskable.svg", "maskable-192.png", 192],
  ["icon-maskable.svg", "maskable-512.png", 512],
  ["icon-full.svg", "apple-touch-icon.png", 180],
  ["mark.svg", "favicon-64.png", 64],
  ["icon-full.svg", "android-foreground-432.png", 432],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = await readFile(new URL(src, dir), "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg style="width:${size}px;height:${size}px;display:block" `)}</body></html>`);
  await writeFile(new URL(out, dir), await page.screenshot({ omitBackground: true }));
}
// Open Graph card 1200x630
await page.setViewportSize({ width: 1200, height: 630 });
const mark = await readFile(new URL("mark.svg", dir), "utf8");
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;background:#0e0d0c;color:#f4efe6;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box">
<div style="display:flex;align-items:center;gap:28px">${mark.replace("<svg ", '<svg style="width:120px;height:120px" ')}<span style="font-size:96px;font-weight:800;letter-spacing:-0.03em">Dawghwa</span></div>
<p style="font-size:40px;line-height:1.3;color:#b9b1a5;margin:40px 0 0;max-width:900px">Find your next manhwa, manga or manhua. Recommendations learned on your device.</p></body></html>`);
await writeFile(new URL("../og.png", dir), await page.screenshot());
await browser.close();
console.log("icons rendered");
