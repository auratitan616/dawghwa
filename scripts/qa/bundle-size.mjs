// Initial JS (gzip) = entry script + modulepreloads referenced by dist/index.html.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const html = readFileSync("dist/index.html", "utf8");
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const f of new Set(files)) { const n = gzipSync(readFileSync(`dist/${f}`)).length; total += n; console.log(`${(n / 1024).toFixed(1).padStart(7)} KB  ${f}`); }
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  initial JS (gzip)`);
const limit = Number(process.env.BUNDLE_LIMIT_KB || 150);
if (total / 1024 > limit) { console.error(`Initial JS exceeds ${limit} KB`); process.exit(1); }
