// The Android app has no same-origin /api, so it must be built with an absolute API URL.
// Reads VITE_API_BASE_URL from the environment or .env files (same precedence as Vite).
import { readFileSync, existsSync } from "node:fs";

function fromFiles(key) {
  for (const f of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    if (m && m[1].trim()) return m[1].trim();
  }
}
const base = process.env.VITE_API_BASE_URL?.trim() || fromFiles("VITE_API_BASE_URL");
if (!base) {
  if (process.env.ALLOW_NO_API === "1") {
    console.warn("[native] VITE_API_BASE_URL is not set; the app will build but cannot load any catalogue data.");
    process.exit(0);
  }
  console.error("[native] Set VITE_API_BASE_URL to your deployed Dawghwa API (https://...) before building the Android app.\n         Use ALLOW_NO_API=1 to build anyway (for UI-only smoke tests).");
  process.exit(1);
}
if (!/^https:\/\//.test(base)) {
  console.error(`[native] VITE_API_BASE_URL must be https (got ${base}). Android blocks cleartext traffic.`);
  process.exit(1);
}
console.log(`[native] API: ${base}`);
