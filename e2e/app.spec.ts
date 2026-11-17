import { expect, test } from "@playwright/test";
import { apiUp, maybeRelay, skipOnboarding } from "./helpers";

test.beforeEach(async ({ context }) => maybeRelay(context));

test("first run shows onboarding once, then home", async ({ page }) => {
  await skipOnboarding(page);
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main h1").first()).toBeAttached();
  await expect(page.locator("nav.bottomnav, .sidebar nav").first()).toBeAttached();
});

test("primary navigation reaches every section and back works", async ({ page, isMobile }) => {
  await skipOnboarding(page);
  const nav = page.locator(isMobile ? "nav.bottomnav" : ".sidebar nav");
  // History lives in the desktop sidebar; on mobile it is reached from Profile.
  const sections = [
    ["Library", /\/library$/, "Library"],
    ...(isMobile ? [] : ([["History", /\/history$/, "History"]] as const)),
    ["Profile", /\/profile$/, null],
    ["Discover", /\/discover/, "Discover"],
  ] as const;
  for (const [name, url, heading] of sections) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(url);
    if (heading) await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/profile$/);
});

test("empty library and history show honest empty states", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/library");
  await expect(page.getByText("Your library is empty")).toBeVisible();
  await page.goto("/history");
  await expect(page.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
});

test("natural-language search shows parsed filters", async ({ page }) => {
  test.skip(!(await apiUp(page)), "API not running");
  await skipOnboarding(page);
  await page.goto("/search?q=completed%20fantasy%20manhwa");
  for (const chip of ["Completed", "Fantasy", "Manhwa"]) await expect(page.getByText(chip, { exact: true }).first()).toBeVisible();
  await expect(page.locator("a[href^='/title/']").first()).toBeVisible({ timeout: 20_000 });
});

test("title page loads and offers a real action", async ({ page }) => {
  test.skip(!(await apiUp(page)), "API not running");
  await skipOnboarding(page);
  await page.goto("/discover?order=popular");
  const first = page.locator("a[href^='/title/']").first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  await first.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add to library|Library:/ })).toBeVisible();
});

test("favourite persists across reloads", async ({ page }) => {
  test.skip(!(await apiUp(page)), "API not running");
  await skipOnboarding(page);
  await page.goto("/discover?order=popular");
  const first = page.locator("a[href^='/title/']").first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  await first.click();
  await page.getByRole("button", { name: "Add to favourites" }).click();
  await expect(page.getByRole("button", { name: "Remove from favourites" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove from favourites" })).toBeVisible();
});

test("offline: navigation keeps working and failures say offline, not 'updated'", async ({ page, context }) => {
  await skipOnboarding(page);
  await page.goto("/library");
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await context.setOffline(true);
  // Service workers are blocked in tests, so an unvisited screen's code cannot load offline.
  await page.locator("a[href='/history']:visible").first().click();
  const history = page.getByRole("heading", { level: 1, name: "History" });
  const offline = page.getByRole("heading", { level: 1, name: "You're offline" });
  await expect(history.or(offline)).toBeVisible();
  await expect(page.getByText("Dawghwa was updated")).toHaveCount(0);
  await context.setOffline(false);
});
