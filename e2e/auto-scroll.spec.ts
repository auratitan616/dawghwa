import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { apiUp, maybeRelay, skipOnboarding } from "./helpers";

/**
 * Reader auto-scroll (src/lib/autoScroll.ts). No fixed sleeps: movement is
 * checked with polls, and "did not move" is measured over a fixed number of
 * animation frames, which is what drives auto-scroll.
 */

test.beforeEach(async ({ context }) => maybeRelay(context));

async function openChapter(page: Page, request: APIRequestContext, settings: Record<string, unknown> = {}) {
  test.skip(!(await apiUp(page)), "API not running");
  const browse = await request.get("/api/catalog?provider=mangadex&sort=popularity&limit=20");
  test.skip(browse.status() === 503, "MangaDex is paused upstream (circuit open)");
  const items = ((await browse.json()) as { items: { providerId: string; url: string }[] }).items;
  let target: { id: string; chapter: string } | undefined;
  for (const it of items) {
    const r = await request.post("/api/chapters", { data: { source: "mangadex", url: it.url } });
    const chs = ((await r.json()) as { chapters?: { id: string }[] }).chapters ?? [];
    if (chs.length > 1) {
      target = { id: it.providerId, chapter: chs[chs.length - 2]!.id };
      break;
    }
  }
  test.skip(!target, "No readable chapters available from the provider right now");
  await page.addInitScript((s) => {
    const cur = JSON.parse(localStorage.getItem("dawghwa:settings") ?? "{}");
    localStorage.setItem("dawghwa:settings", JSON.stringify({ ...cur, ...s }));
  }, settings);
  await skipOnboarding(page);
  const path = `/read/mangadex/${target!.id}/${target!.chapter}`;
  await page.goto(path);
  await expect(page.locator(".rd-page img").first()).toBeAttached({ timeout: 25_000 });
  // the reader replaces the provider chapter id with its canonical chapter key once loaded
  await expect(page).toHaveURL(/\/read\/mangadex\/[^/]+\/dwg%3A/, { timeout: 10_000 });
  void path;
  return new URL(page.url()).pathname;
}

/** Scroll distance over N animation frames. */
const movedOver = (page: Page, frames = 30) =>
  page.evaluate(
    (n) =>
      new Promise<number>((resolve) => {
        const y0 = window.scrollY;
        let i = 0;
        const f = () => (++i < n ? requestAnimationFrame(f) : resolve(window.scrollY - y0));
        requestAnimationFrame(f);
      }),
    frames,
  );

test("starts on request, advances progress, pauses, resumes and keeps its speed", async ({ page, request }) => {
  await openChapter(page, request);
  const y0 = await page.evaluate(() => window.scrollY);
  expect(await movedOver(page)).toBe(0); // never starts by itself
  await page.getByRole("button", { name: "Start auto-scroll" }).click();
  const control = page.getByRole("group", { name: "Auto-scroll" });
  await expect(control).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBeGreaterThan(y0 + 40);
  const progress = page.getByRole("slider", { name: "Chapter progress" });
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow")), { timeout: 15_000 }).toBeGreaterThan(0);

  await control.getByRole("button", { name: "Pause auto-scroll" }).click();
  await expect(control.getByRole("status")).toHaveText("Paused");
  expect(await movedOver(page)).toBe(0);

  await control.getByRole("button", { name: "Faster" }).click();
  await expect(control.getByTestId("auto-speed")).toHaveText("100");
  await page.keyboard.press("p");
  await expect(control.getByRole("status")).not.toHaveText("Paused");
  await expect.poll(() => movedOver(page, 20)).toBeGreaterThan(0);

  await control.getByRole("button", { name: "Stop auto-scroll" }).click();
  await expect(control).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".rd-page img").first()).toBeAttached({ timeout: 25_000 });
  await page.getByRole("button", { name: "Reader settings" }).click();
  await expect(page.getByRole("dialog").getByText("100 px/s", { exact: false })).toBeVisible();
});

test("holds while a reader layer is open, in a background tab, and while the reader scrolls", async ({ page, request }) => {
  await openChapter(page, request);
  await page.getByRole("button", { name: "Start auto-scroll" }).click();
  const control = page.getByRole("group", { name: "Auto-scroll" });
  await expect.poll(() => movedOver(page, 10)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Reader settings" }).click();
  await expect(page.getByRole("dialog", { name: "Reader settings" })).toBeVisible();
  expect(await movedOver(page)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => movedOver(page, 10)).toBeGreaterThan(0);

  // background tab
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(control.getByRole("status")).toHaveText("Paused in background");
  expect(await movedOver(page)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => movedOver(page, 10)).toBeGreaterThan(0);

  // the reader's own wheel input wins, then auto-scroll comes back
  await page.mouse.move(10, 300);
  await page.mouse.wheel(0, -200);
  await expect(control.getByRole("status")).toHaveText("Resumes shortly");
  await expect(control.getByRole("status")).not.toHaveText("Resumes shortly", { timeout: 5_000 });
  await expect(control).toBeVisible();
});

test("stops at the end of the chapter and does not navigate", async ({ page, request }) => {
  const path = await openChapter(page, request, { autoNext: false, autoScrollSpeed: 400 });
  // start near the end so the test is short
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight * 3));
  // the bar has slid away after that jump; the shortcut works without it
  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-notice")).toHaveText("Auto-scroll stopped at the end of the chapter.", { timeout: 30_000 });
  await expect(page.getByRole("group", { name: "Auto-scroll" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "End of chapter" })).toBeInViewport();
  expect(new URL(page.url()).pathname).toBe(path);
  expect(await movedOver(page)).toBe(0);
});

test("with reduced motion it moves a screen at a time", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openChapter(page, request, { autoScrollSpeed: 400 });
  await page.getByRole("button", { name: "Reader settings" }).click();
  await expect(page.getByText("Reduce motion is on, so auto-scroll moves a screen at a time.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start auto-scroll" }).click();
  await expect(page.getByRole("group", { name: "Auto-scroll" }).getByRole("status")).toHaveText("Stepping");
  const vh = await page.evaluate(() => window.innerHeight);
  const y0 = await page.evaluate(() => window.scrollY);
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBeGreaterThan(y0);
  // the first move is one whole step, not a glide
  expect((await page.evaluate(() => window.scrollY)) - y0).toBeGreaterThanOrEqual(Math.round(vh * 0.85) - 2);
});
