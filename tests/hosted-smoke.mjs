// Opt-in live UI smoke test; credentials remain in ignored local files.
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const base =
  process.env.VERIFY_URL || "https://crumb-marketing-eight.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let testId;
try {
  await page.goto(base);
  await page
    .getByLabel("Access code", { exact: true })
    .fill((await readFile(".data/prototype-access.txt", "utf8")).trim());
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page
    .getByRole("heading", { name: "Good things deserve to be seen." })
    .waitFor();
  const initial = await (await page.request.get(base + "/api/state")).json();
  assert.equal(initial.assets.length, 0);
  assert.equal(initial.metrics.length, 0);
  assert.equal(initial.providers.instagramConfigured, false);
  await page.getByRole("link", { name: "Content", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/media/pink.jpg");
  await page.getByText("Done", { exact: true }).waitFor({ timeout: 60000 });
  const state = await (await page.request.get(base + "/api/state")).json();
  testId = state.assets.find((a) => a.title === "pink")?.id;
  assert.ok(testId);
  const del = await page.request.delete(base + "/api/assets/" + testId);
  assert.ok(del.ok());
  testId = null;
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Manage connection" }).click();
  await page.getByText("Read-only connection.", { exact: false }).waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Connect Instagram", exact: true })
      .isDisabled(),
    true,
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Today", exact: true }).click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Access code", { exact: true }).waitFor();
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/hosted-login.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Live UI: private login, direct upload, empty results, read-only setup, mobile layout and logout passed. Test photo removed.",
  );
} finally {
  if (testId) await page.request.delete(base + "/api/assets/" + testId);
  await browser.close();
}
