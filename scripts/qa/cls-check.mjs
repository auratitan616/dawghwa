import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 412, height: 823 }, serviceWorkers: "block" }); const p = await ctx.newPage();
await p.addInitScript(() => { window.__s = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__s.push({ v: e.value, src: e.sources?.map((s) => (s.node?.className || s.node?.nodeName) + " " + JSON.stringify(s.previousRect) + "->" + JSON.stringify(s.currentRect)) }); }).observe({ type: "layout-shift", buffered: true }); });
await p.goto("http://localhost:4173/search"); await p.waitForTimeout(6000);
console.log(JSON.stringify(await p.evaluate(() => window.__s), null, 1).slice(0, 3000)); await b.close();
