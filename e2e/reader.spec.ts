import { expect, test } from "@playwright/test";
import { apiUp, maybeRelay, skipOnboarding } from "./helpers";

test.beforeEach(async ({ context }) => maybeRelay(context));

test("reader opens a supported chapter without marking it read", async ({ page, request }) => {
  test.skip(!(await apiUp(page)), "API not running");
  // Find a MangaDex title that actually has readable chapters right now.
  const browse = await request.get("/api/catalog?provider=mangadex&sort=popularity&limit=20");
  const items = ((await browse.json()) as { items: { providerId: string; url: string }[] }).items.map((i) => ({ id: i.providerId, url: i.url }));
  let target: { id: string; chapter: string } | undefined;
  for (const it of items) {
    const r = await request.post("/api/chapters", { data: { source: "mangadex", url: it.url } });
    const chs = ((await r.json()) as { chapters?: { id: string }[] }).chapters ?? [];
    if (chs.length) {
      target = { id: it.id, chapter: chs[chs.length - 1]!.id };
      break;
    }
  }
  test.skip(!target, "No readable chapters available from the provider right now");
  await skipOnboarding(page);
  await page.goto(`/read/mangadex/${target!.id}/${target!.chapter}`);
  await expect(page.locator(".reader img, [data-reader] img").first()).toBeAttached({ timeout: 25_000 });
  // Position is saved after a short debounce (and on pause/pagehide).
  await page.waitForTimeout(1500);
  await page.goto("/history");
  await expect(page.getByText(/page 1 of/)).toBeVisible();
  // Opened but not finished: the chapter must not count as read.
  await expect(page.getByText(/read$/i)).toHaveCount(0);
});
