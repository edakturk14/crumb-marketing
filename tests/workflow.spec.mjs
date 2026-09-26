import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const errors = [];
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => errors.push(e.message));
});
test("Today, optional Instagram, instructions, settings and mobile navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good things deserve to be seen." }),
  ).toBeVisible();
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/today-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "See your shot list" }).click();
  await expect(page.getByRole("dialog")).toContainText("8–10 saniye");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Connect Instagram", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Professional account");
  await expect(page.getByRole("dialog")).toContainText("Read-only connection");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Connect Instagram" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "How to use", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Add your content", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create your post", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Not connected · optional", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Cake Gallery Maslak");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create this post" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshots/today-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("link", { name: "Content", exact: true }).click();
  await expect(
    page.getByText("All your cake photos. All your little videos."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("bulk week upload (20 photos + 5 videos), duplicate feedback, failed upload and filters", async ({
  page,
}) => {
  await page.goto("/#Content");
  await expect(page.getByText("browse files", { exact: true })).toBeVisible();
  const videoBytes = await page.evaluate(async () => {
    const img = new Image();
    img.src = "/demo/chocolate.jpg";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 640;
    const ctx = c.getContext("2d");
    const stream = c.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (recorder.onstop = r));
    recorder.start();
    for (let i = 0; i < 15; i++) {
      ctx.drawImage(img, -i, 0, 500, 640);
      await new Promise((r) => setTimeout(r, 85));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    return Array.from(
      new Uint8Array(
        await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
      ),
    );
  });
  const photos = await Promise.all(
    Array.from({ length: 20 }, async (_, i) => ({
      name: `Week photo ${i + 1}.jpg`,
      mimeType: "image/jpeg",
      buffer: await readFile(
        `tests/fixtures/media/${["pink", "strawberry", "wedding", "cupcakes", "slice"][i % 5]}.jpg`,
      ),
    })),
  );
  const videos = Array.from({ length: 5 }, (_, i) => ({
    name: `Week video ${i + 1}.webm`,
    mimeType: "video/webm",
    buffer: Buffer.from(videoBytes),
  }));
  await page
    .getByLabel("Upload photos and videos")
    .setInputFiles([...photos, ...videos]);
  await expect(
    page.getByRole("heading", { name: "25 of 25 files ready" }),
  ).toBeVisible({ timeout: 90000 });
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Week photo 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Week video 1", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Week photo 6", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Skip");
  await expect(page.getByRole("dialog")).toContainText("benzer");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Create post", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  await page
    .getByRole("button", { name: "Open Week video 1", exact: true })
    .click();
  const v = page.getByRole("dialog").locator("video");
  await expect(v).toBeVisible();
  await expect.poll(() => v.evaluate((el) => el.readyState)).toBeGreaterThan(0);
  await expect(page.getByRole("dialog")).toContainText("Selected frame only");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/content-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Upload photos and videos").setInputFiles({
    name: "broken.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not really jpeg"),
  });
  await expect(
    page.getByText("This image could not be read. Try exporting it as JPG."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("generate and edit Turkish Reel, copy/export, persistence, posted status, results and next recommendation", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Create this post" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Template draft");
  await expect(dialog.getByLabel("Caption", { exact: true })).toHaveValue(
    /Çikolatanın/,
  );
  await expect(
    dialog.getByText("Suggested Reel cover", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Caption", { exact: true })
    .fill("Maslak’ta güzel bir güne tatlı bir dokunuş. 💗");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await dialog.getByRole("button", { name: "Copy caption" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Maslak’ta",
  );
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download text" }).click();
  expect((await download).suggestedFilename()).toBe("cake-gallery-post.txt");
  await page.reload();
  await page.getByRole("link", { name: "Content", exact: true }).click();
  await page.getByRole("button", { name: /^Posts ·/ }).click();
  await page.locator(".draft-card").first().click();
  await expect(
    page.getByRole("dialog").getByLabel("Caption", { exact: true }),
  ).toHaveValue("Maslak’ta güzel bir güne tatlı bir dokunuş. 💗");
  await page.getByRole("button", { name: "I’ve posted this" }).click();
  await expect(
    page.getByText("Marked as posted", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add or update results" }).click();
  await page.getByLabel("Views", { exact: true }).fill("2345");
  await page.getByLabel("Reach", { exact: true }).fill("1800");
  await page.getByLabel("Likes", { exact: true }).fill("99");
  await page.getByLabel("Comments", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(
    page.getByText("Your recorded results — sample data is excluded.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".stats")).toContainText("2,345");
  await expect(page.locator(".stats")).toContainText("106");
  await expect(page.getByText("Biraz daha sonuç görelim.")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/results-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.locator(".hero-copy h2")).not.toHaveText(
    "Çikolatalı pastaya son dokunuş",
  );
  expect(errors).toEqual([]);
});
test("multi-asset carousel preview and low-inventory state", async ({
  page,
  request,
}) => {
  await page.goto("/#Content");
  await page.getByLabel("Select Pembe bir doğum günü", { exact: true }).check();
  await page
    .getByLabel("Select Mevsimin en tatlı hali", { exact: true })
    .check();
  await page.getByRole("button", { name: "Create post", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Carousel");
  await expect(page.getByText("1/2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next media" }).click();
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const state = await (await request.get("/api/state")).json();
  for (const a of state.assets)
    await request.patch("/api/assets/" + a.id, { data: { used: true } });
  await page.goto("/#Today");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "I need more content" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See your shot list" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Pastanın süslemeden önceki hali",
  );
  expect(errors).toEqual([]);
});
