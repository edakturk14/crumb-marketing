import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { get, all, put, putMany, remove, consume } from "./db.mjs";
import {
  createInstagram,
  instagramConfigured,
  sealToken,
  openToken,
} from "./instagram.mjs";
const adapter = createInstagram();
const secret = () =>
  process.env.INSTAGRAM_TOKEN_SECRET || process.env.SESSION_SECRET;
const digest = (s) => createHash("sha256").update(s).digest("hex");
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const cookieOptions = {
  httpOnly: true,
  secure: !!process.env.VERCEL,
  sameSite: "lax",
  path: "/api/instagram/callback",
  maxAge: 600000,
};
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  /^[a-f0-9]{64}$/.test(a) &&
  /^[a-f0-9]{64}$/.test(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function instagramCallback(app) {
  // OAuth has its own browser-bound one-use state; the workspace cookie is SameSite=Strict.
  app.get("/api/instagram/callback", async (req, res) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("crumb_instagram="))
      ?.slice(16);
    res.clearCookie("crumb_instagram", cookieOptions);
    if (!equal(state, cookie))
      return res.redirect("/?instagram=invalid#Settings");
    const pending = await consume("oauth", digest(state));
    if (!pending || pending.expiresAt < Date.now())
      return res.redirect("/?instagram=invalid#Settings");
    if (req.query.error) return res.redirect("/?instagram=cancelled#Settings");
    if (typeof req.query.code !== "string" || req.query.code.length > 4000)
      return res.redirect("/?instagram=invalid#Settings");
    try {
      const result = await adapter.exchange(req.query.code);
      const connection = {
        connected: true,
        mode: "live",
        accountId: result.profile.id,
        username: result.profile.username,
        followers: result.profile.followers,
        connectedAt: new Date().toISOString(),
        expiresAt: result.expiresAt,
        lastSyncedAt: null,
      };
      // A reconnect never mixes results from a different account into this bakery.
      for (const m of await all("metric"))
        if (m.source === "instagram" && m.accountId !== connection.accountId)
          await remove("metric", m.id);
      await putMany([
        [
          "secret",
          "instagram",
          {
            token: sealToken(result.token, secret()),
            expiresAt: result.expiresAt,
          },
        ],
        ["config", "instagram", connection],
      ]);
      res.redirect("/?instagram=connected#Results");
    } catch {
      res.redirect("/?instagram=failed#Settings");
    }
  });
}
export function instagramRoutes(app) {
  app.post("/api/instagram/connect", async (_, res) => {
    const state = randomBytes(32).toString("hex");
    const url = adapter.authorizationURL(state);
    for (const row of await all("oauth"))
      if (row.expiresAt < Date.now()) await remove("oauth", row.id);
    const id = digest(state);
    await put("oauth", id, { id, expiresAt: Date.now() + 600000 });
    res.cookie("crumb_instagram", state, cookieOptions).json({ url });
  });
  app.post("/api/instagram/sync", async (_, res) => {
    const c = await get("config", "instagram"),
      stored = await get("secret", "instagram");
    if (!c?.connected || !stored)
      throw fail("Connect Instagram before refreshing results.");
    if (new Date(stored.expiresAt) <= new Date())
      throw fail("Your Instagram connection has expired. Please reconnect.");
    let token = openToken(stored.token, secret());
    if (new Date(stored.expiresAt) - Date.now() < 7 * 86400000) {
      const refreshed = await adapter.refresh(token);
      token = refreshed.token;
      await put("secret", "instagram", {
        token: sealToken(token, secret()),
        expiresAt: refreshed.expiresAt,
      });
      c.expiresAt = refreshed.expiresAt;
    }
    const result = await adapter.history(token, c.accountId);
    const current = await get("config", "instagram");
    if (!current?.connected || current.connectedAt !== c.connectedAt)
      throw fail(
        "The Instagram connection changed. Refresh the page before continuing.",
      );
    await putMany(result.rows.map((row) => ["metric", row.id, row]));
    const connection = {
      ...c,
      lastSyncedAt: new Date().toISOString(),
      partial: result.partial,
      insightsUnavailable: result.rows.some((r) => r.insightsUnavailable),
    };
    await put("config", "instagram", connection);
    res.json(connection);
  });
  app.post("/api/instagram/disconnect", async (_, res) => {
    const c = await get("config", "instagram"),
      stored = await get("secret", "instagram");
    let revoked = false;
    if (c?.accountId && stored)
      try {
        await adapter.revoke(openToken(stored.token, secret()), c.accountId);
        revoked = true;
      } catch {}
    await remove("secret", "instagram");
    for (const m of await all("metric"))
      if (m.source === "instagram" || m.source === "demo")
        await remove("metric", m.id);
    await remove("recommendation", "latest");
    await put("config", "instagram", { connected: false, mode: "live" });
    res.json({
      ok: true,
      message: revoked
        ? "Instagram disconnected. Imported results have been removed."
        : "Disconnected from Crumb. You can also remove Crumb in Instagram’s Apps and websites settings.",
    });
  });
}
