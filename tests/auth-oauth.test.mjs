import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("private workspace and browser-bound OAuth: cancel, success, replay, encrypted token, read-only sync and disconnect", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "crumb-oauth-"));
  Object.assign(process.env, {
    DATA_DIR: dir,
    DEMO_MODE: "false",
    STORAGE_PROVIDER: "local",
    APP_ACCESS_CODE_HASH: createHash("sha256")
      .update("owner-code")
      .digest("hex"),
    SESSION_SECRET: "x".repeat(48),
    INSTAGRAM_APP_ID: "123",
    INSTAGRAM_APP_SECRET: "secret",
    INSTAGRAM_REDIRECT_URI: "https://crumb.example/api/instagram/callback",
  });
  const nativeFetch = globalThis.fetch;
  const external = [];
  globalThis.fetch = async (input, opts) => {
    const url = new URL(input);
    external.push({ url, opts });
    if (url.hostname === "api.instagram.com")
      return Response.json({
        data: [
          {
            access_token: "short",
            permissions:
              "instagram_business_basic,instagram_business_manage_insights",
          },
        ],
      });
    if (url.pathname === "/access_token")
      return Response.json({
        access_token: "private-long-token",
        expires_in: 5184000,
      });
    if (url.pathname.endsWith("/me"))
      return Response.json({
        user_id: "1234",
        username: "cakegallerymaslak",
        followers_count: 10,
      });
    if (url.pathname.endsWith("/media"))
      return Response.json({
        data: [
          {
            id: "99",
            timestamp: new Date(Date.now() - 1000).toISOString(),
            media_type: "IMAGE",
            like_count: 2,
            comments_count: 0,
          },
        ],
      });
    if (url.pathname.endsWith("/insights"))
      return Response.json({
        data: [{ name: "views", values: [{ value: 120 }] }],
      });
    if (url.pathname.endsWith("/permissions") && opts.method === "DELETE")
      return Response.json({ success: true });
    throw Error("Unexpected external request");
  };
  const { installAuth } = await import("../server/auth.mjs");
  const { instagramCallback, instagramRoutes } =
    await import("../server/instagram-routes.mjs");
  const db = await import("../server/db.mjs");
  const app = express();
  app.use(express.json());
  instagramCallback(app);
  installAuth(app);
  instagramRoutes(app);
  app.get("/api/private", (_, res) => res.json({ ok: true }));
  app.use((e, req, res, next) =>
    res.status(e.status || 500).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, cookie) =>
    nativeFetch(base + "/api" + url, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  t.after(async () => {
    globalThis.fetch = nativeFetch;
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  assert.equal((await request("/private")).status, 401);
  assert.equal((await request("/instagram/connect", {})).status, 401);
  assert.equal((await request("/login", { code: "wrong" })).status, 401);
  const login = await request("/login", { code: "owner-code" }),
    owner = login.headers.get("set-cookie").split(";")[0];
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
  assert.equal((await request("/private", null, owner)).status, 200);
  const begin = async () => {
    const r = await request("/instagram/connect", {}, owner),
      data = await r.json();
    return {
      state: new URL(data.url).searchParams.get("state"),
      cookie: r.headers.get("set-cookie").split(";")[0],
    };
  };
  const cancelled = await begin();
  const cancel = await request(
    `/instagram/callback?state=${cancelled.state}&error=access_denied`,
    null,
    cancelled.cookie,
  );
  assert.match(cancel.headers.get("location"), /cancelled/);
  assert.equal(external.length, 0);
  const flow = await begin();
  const invalid = await request(
    `/instagram/callback?state=${flow.state}&code=ok`,
  );
  assert.match(invalid.headers.get("location"), /invalid/);
  assert.equal(external.length, 0);
  const callback = await request(
    `/instagram/callback?state=${flow.state}&code=ok`,
    null,
    flow.cookie,
  );
  assert.match(callback.headers.get("location"), /connected/);
  const stored = await db.get("secret", "instagram");
  assert.ok(!stored.token.includes("private-long-token"));
  const replay = await request(
    `/instagram/callback?state=${flow.state}&code=ok`,
    null,
    flow.cookie,
  );
  assert.match(replay.headers.get("location"), /invalid/);
  assert.equal((await request("/instagram/sync", {}, owner)).status, 200);
  assert.equal((await db.all("metric"))[0].views, 120);
  assert.equal((await request("/instagram/disconnect", {}, owner)).status, 200);
  assert.equal(await db.get("secret", "instagram"), null);
  assert.equal((await db.all("metric")).length, 0);
  assert.ok(
    external.every(
      ({ url, opts }) =>
        !opts.method ||
        url.hostname === "api.instagram.com" ||
        (opts.method === "DELETE" && url.pathname.endsWith("/permissions")),
    ),
  );
  const logout = await request("/logout", {}, owner);
  assert.match(logout.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
});
