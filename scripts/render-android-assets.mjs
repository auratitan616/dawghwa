// Renders Android launcher icons and splash screens from the brand mark.
// Usage: node scripts/render-android-assets.mjs  (needs Playwright's Chromium and an android/ project)
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";

const res = new URL("../android/app/src/main/res/", import.meta.url);
const icons = new URL("../public/icons/", import.meta.url);
const BRAND = "#ff5a36";
const INK = "#0e0d0c";
const D = '<path d="M196 181h62c50 0 83 31 83 75s-33 75-83 75H196z" fill="none" stroke="' + INK + '" stroke-width="32" stroke-linejoin="round"/>';

// Adaptive foreground: 108dp canvas, glyph inside the 66dp safe zone; transparent background.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(256 256) scale(0.82) translate(-256 -256)">${D}</g></svg>`;
const legacy = await readFile(new URL("mark.svg", icons), "utf8");
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="240" fill="${BRAND}"/><g transform="translate(256 256) scale(1.25) translate(-256 -256)">${D}</g></svg>`;

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(svg, w, h, out, bg = "transparent") {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${bg};width:${w}px;height:${h}px;display:grid;place-items:center">${svg}</body></html>`);
  await writeFile(new URL(out, res), await page.screenshot({ omitBackground: bg === "transparent" }));
}
const sized = (svg, px) => svg.replace("<svg ", `<svg style="width:${px}px;height:${px}px;display:block" `);

for (const [d, k] of Object.entries(densities)) {
  await render(sized(legacy, 48 * k), 48 * k, 48 * k, `mipmap-${d}/ic_launcher.png`);
  await render(sized(round, 48 * k), 48 * k, 48 * k, `mipmap-${d}/ic_launcher_round.png`);
  await render(sized(foreground, 108 * k), 108 * k, 108 * k, `mipmap-${d}/ic_launcher_foreground.png`);
}

// Splash: dark surface with the mark centred (Android 12+ uses the icon; older versions use these).
const splashes = {
  "drawable/splash.png": [480, 320],
  "drawable-port-mdpi/splash.png": [320, 480], "drawable-port-hdpi/splash.png": [480, 800], "drawable-port-xhdpi/splash.png": [720, 1280], "drawable-port-xxhdpi/splash.png": [960, 1600], "drawable-port-xxxhdpi/splash.png": [1280, 1920],
  "drawable-land-mdpi/splash.png": [480, 320], "drawable-land-hdpi/splash.png": [800, 480], "drawable-land-xhdpi/splash.png": [1280, 720], "drawable-land-xxhdpi/splash.png": [1600, 960], "drawable-land-xxxhdpi/splash.png": [1920, 1280],
};
for (const [out, [w, h]] of Object.entries(splashes)) await render(sized(legacy, Math.round(Math.min(w, h) * 0.28)), w, h, out, INK);
await browser.close();
console.log("android assets rendered");
