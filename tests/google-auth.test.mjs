import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  installGoogleAuth,
  allowedGoogleUser,
  googleConfiguration,
} from "../server/google-auth.mjs";
const googleUser = {
  id: "user-1",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  identities: [
    {
      id: "identity-1",
      user_id: "user-1",
      provider: "google",
      identity_data: { email: "owner@example.com", email_verified: true },
    },
  ],
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { full_name: "Not used for authorization" },
};
const env = {
  SUPABASE_URL: "https://testproject.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  APP_ORIGIN: "https://crumb.example",
  AUTH_ALLOWED_EMAILS: "owner@example.com",
};
test("workspace authorization requires a verified Google identity, never user-editable metadata", () => {
  const allow = new Set(["owner@example.com"]);
  assert.equal(allowedGoogleUser(googleUser, allow), true);
  assert.equal(
    allowedGoogleUser({ ...googleUser, email: "stranger@example.com" }, allow),
    false,
  );
  assert.equal(
    allowedGoogleUser({ ...googleUser, email_confirmed_at: null }, allow),
    false,
  );
  assert.equal(
    allowedGoogleUser(
      {
        ...googleUser,
        identities: [],
        user_metadata: {
          email: "owner@example.com",
          provider: "google",
          email_verified: true,
        },
      },
      allow,
    ),
    false,
  );
  assert.equal(
    allowedGoogleUser(
      {
        ...googleUser,
        identities: [
          {
            provider: "google",
            identity_data: { email: "other@example.com", email_verified: true },
          },
        ],
      },
      allow,
    ),
    false,
  );
  assert.equal(allowedGoogleUser(googleUser, new Set()), false);
  assert.equal(
    googleConfiguration({ ...env, VERCEL: "1", APP_ORIGIN: "http://evil.test" })
      .origin,
    undefined,
  );
});
test("real Supabase SDK PKCE flow: private cookies, server identity check, denied accounts, logout and no legacy bypass", async (t) => {
  const calls = [];
  let currentUser = googleUser,
    loggedOut = false;
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    Buffer.from(
      JSON.stringify({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url") +
    ".signature";
  const fetcher = async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    assert.equal(url.origin, "https://testproject.supabase.co");
    if (url.pathname.endsWith("/settings"))
      return Response.json({ external: { google: true } });
    if (url.pathname.endsWith("/token")) {
      const body = JSON.parse(options.body);
      assert.equal(url.searchParams.get("grant_type"), "pkce");
      assert.ok(body.code_verifier.length >= 43);
      assert.equal(body.auth_code, "approved-code");
      return Response.json({
        access_token: jwt,
        refresh_token: "refresh-secret",
        token_type: "bearer",
        expires_in: 3600,
        user: googleUser,
      });
    }
    if (url.pathname.endsWith("/user")) {
      const headers = new Headers(options.headers);
      if (headers.get("authorization") !== `Bearer ${jwt}` || loggedOut)
        return Response.json(
          { msg: "Invalid JWT", code: "bad_jwt" },
          { status: 401 },
        );
      return Response.json(currentUser);
    }
    if (url.pathname.endsWith("/logout")) {
      loggedOut = true;
      return new Response(null, { status: 204 });
    }
    throw Error("Unexpected auth request " + url.pathname);
  };
  const app = express();
  app.use(express.json());
  installGoogleAuth(app, { env, fetcher });
  app.get("/api/private", (req, res) => res.json({ ok: true, user: req.user }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const request = async (route, { body, cookie, update = true } = {}) => {
    const r = await fetch(base + route, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        cookie: cookie ?? [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (update)
      for (const value of r.headers.getSetCookie()) {
        const part = value.split(";")[0],
          split = part.indexOf("=");
        jar.set(part.slice(0, split), part.slice(split + 1));
      }
    return r;
  };
  assert.equal((await request("/api/private")).status, 401);
  assert.equal(
    (
      await request("/api/private", {
        cookie: "crumb_session=9999999999999.old-signature",
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/api/login", { body: { code: "old-code" } })).status,
    410,
  );
  const start = await request("/api/auth/google", { body: {} }),
    url = new URL((await start.json()).url);
  assert.equal(url.origin, env.SUPABASE_URL);
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(
    url.searchParams.get("redirect_to"),
    env.APP_ORIGIN + "/api/auth/callback",
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
  assert.equal(url.searchParams.has("access_type"), false);
  assert.equal(url.searchParams.has("scope"), false);
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.match(start.headers.get("set-cookie"), /HttpOnly/);
  assert.match(start.headers.get("set-cookie"), /Secure/);
  assert.match(start.headers.get("set-cookie"), /SameSite=Lax/);
  const bad = await request("/api/auth/callback?code=approved-code", {
    cookie: "",
    update: false,
  });
  assert.match(bad.headers.get("location"), /auth=expired/);
  assert.ok(!calls.some((c) => c.url.pathname.endsWith("/token")));
  const success = await request("/api/auth/callback?code=approved-code");
  assert.equal(success.headers.get("location"), "/");
  assert.match(success.headers.get("cache-control"), /no-store/);
  const replay = await request("/api/auth/callback?code=approved-code", {
    update: false,
  });
  assert.match(replay.headers.get("location"), /auth=expired/);
  const session = await (await request("/api/session")).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.email, googleUser.email);
  assert.ok(!JSON.stringify(session).includes("refresh-secret"));
  assert.equal((await request("/api/private")).status, 200);
  currentUser = { ...googleUser, email: "outsider@example.com" };
  assert.equal((await request("/api/private")).status, 403);
  assert.equal(
    (await (await request("/api/session")).json()).authenticated,
    false,
  );
  currentUser = googleUser;
  const logout = await request("/api/logout", { body: {} });
  assert.equal(logout.status, 200);
  assert.match(
    logout.headers.get("set-cookie"),
    /Max-Age=0|Expires=Thu, 01 Jan 1970/,
  );
  assert.equal((await request("/api/private")).status, 401);
});
test("missing Google configuration fails closed and exposes no allowlist", async (t) => {
  const app = express();
  app.use(express.json());
  installGoogleAuth(app, {
    env: {},
    fetcher: () => {
      throw Error("Should not call a provider");
    },
  });
  app.get("/api/private", (_, res) => res.json({ secret: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const s = await (await fetch(base + "/api/session")).json();
  assert.equal(s.ready, false);
  assert.equal(s.authenticated, false);
  assert.equal(s.provider, "google");
  assert.equal(s.emails, undefined);
  assert.equal((await fetch(base + "/api/private")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    503,
  );
});
