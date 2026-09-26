import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const signedOut = {
  authenticated: false,
  protected: true,
  provider: "google",
  ready: true,
};
test("Google-only screen, consent handoff and cancelled/denied sign-in messages", async ({
  page,
}) => {
  await page.route("**/api/session", (r) => r.fulfill({ json: signedOut }));
  await page.route("**/api/auth/google", (r) =>
    r.fulfill({
      json: {
        url: "https://testproject.supabase.co/auth/v1/authorize?provider=google",
      },
    }),
  );
  await page.route("https://testproject.supabase.co/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Controlled consent handoff</h1>",
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  await expect(page.locator("input")).toHaveCount(0);
  await expect(
    page.getByText("Your Google password stays with Google.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(
    /testproject.supabase.co\/auth\/v1\/authorize\?provider=google/,
  );
  await page.goto("/?auth=cancelled");
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await page.goto("/?auth=denied");
  await expect(page.getByRole("alert")).toContainText("does not have access");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/google-login.png",
    fullPage: true,
  });
});
test("Google session opens the existing workflow and signs out through Settings", async ({
  page,
}) => {
  let authenticated = true;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { ...signedOut, authenticated } }),
  );
  await page.route("**/api/logout", (r) => {
    authenticated = false;
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Content", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(page.locator("input")).toHaveCount(0);
});
test("unconfigured Google provider fails closed with a clear setup state", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { ...signedOut, ready: false } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Google sign-in setup is still being completed.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator("input")).toHaveCount(0);
});
