import test from "node:test";
import assert from "node:assert/strict";
import {
  createInstagram,
  READ_SCOPES,
  sealToken,
  openToken,
  normalizeMedia,
} from "../server/instagram.mjs";
import { summarize } from "../server/domain.mjs";
const env = {
  INSTAGRAM_APP_ID: "123",
  INSTAGRAM_APP_SECRET: "test-secret",
  INSTAGRAM_REDIRECT_URI: "https://crumb.example/api/instagram/callback",
  SESSION_SECRET: "s".repeat(48),
};
test("Instagram authorization requests exactly two read-only scopes", () => {
  const url = new URL(createInstagram({ env }).authorizationURL("test-state"));
  assert.equal(url.origin, "https://www.instagram.com");
  assert.deepEqual(url.searchParams.get("scope").split(","), READ_SCOPES);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    env.INSTAGRAM_REDIRECT_URI,
  );
  assert.equal(url.searchParams.get("state"), "test-state");
  assert.ok(
    !/publish|messages|comments|ads|pages/.test(url.searchParams.get("scope")),
  );
  assert.throws(
    () => createInstagram({ env: {} }).authorizationURL("a"),
    /setup/,
  );
});
test("stored tokens are encrypted and authenticated; missing metrics are never invented", () => {
  const encrypted = sealToken("private-token", env.SESSION_SECRET);
  assert.ok(!encrypted.includes("private-token"));
  assert.equal(openToken(encrypted, env.SESSION_SECRET), "private-token");
  assert.throws(() => openToken(encrypted, "wrong-key"));
  const row = normalizeMedia(
    {
      id: "1",
      timestamp: new Date().toISOString(),
      media_type: "IMAGE",
      like_count: 0,
    },
    [],
    "2",
    true,
  );
  assert.equal(row.likes, 0);
  assert.equal(row.views, null);
  assert.equal(row.interactions, null);
  assert.equal(row.saves, null);
  const summary = summarize([
    { ...row, views: 100 },
    { ...row, id: "manual", source: "manual", views: 999 },
  ]);
  assert.equal(summary.source, "instagram");
  assert.equal(summary.views, 100);
});
test("history uses GET only, cursor pagination, excludes old posts and preserves unavailable insights", async () => {
  const calls = [],
    now = new Date();
  const adapter = createInstagram({
    env,
    fetcher: async (input, options) => {
      const url = new URL(input);
      calls.push({ url, options });
      assert.equal(options.method, undefined);
      assert.equal(url.origin, "https://graph.instagram.com");
      assert.equal(options.headers.Authorization, "Bearer token");
      const media = (id) => ({
        id,
        timestamp: now.toISOString(),
        media_type: "VIDEO",
        media_product_type: "REELS",
        like_count: 5,
        comments_count: 1,
      });
      if (url.pathname.endsWith("/9/media"))
        return Response.json(
          url.searchParams.has("after")
            ? { data: [media("2")] }
            : {
                data: [media("1")],
                paging: {
                  next: "https://untrusted.example/?access_token=do-not-follow",
                  cursors: { after: "cursor" },
                },
              },
        );
      if (url.pathname.endsWith("/1/insights"))
        return Response.json({
          data: [
            { name: "views", values: [{ value: 20 }] },
            { name: "reach", values: [{ value: 0 }] },
          ],
        });
      return Response.json({ error: { code: 10 } }, { status: 400 });
    },
  });
  const { rows } = await adapter.history("token", "9", now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].views, 20);
  assert.equal(rows[0].reach, 0);
  assert.equal(rows[1].views, null);
  assert.equal(rows[1].insightsUnavailable, true);
  assert.ok(calls.every((c) => c.url.origin === "https://graph.instagram.com"));
});
test("token exchange stays server-side and rejects previously granted write permissions", async () => {
  const adapter = createInstagram({
    env,
    fetcher: async () =>
      Response.json({
        data: [
          {
            access_token: "token",
            permissions:
              "instagram_business_basic,instagram_business_content_publish",
          },
        ],
      }),
  });
  await assert.rejects(adapter.exchange("code"), /read-only/);
});
