import { createHash, createHmac, timingSafeEqual } from "node:crypto";
const hash = process.env.APP_ACCESS_CODE_HASH;
const secret = process.env.SESSION_SECRET;
if ((process.env.VERCEL || hash) && (!hash || !secret || secret.length < 32))
  throw Error("Hosted access protection must be configured.");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sign = (value) =>
  createHmac("sha256", secret).update(value).digest("hex");
export function hasSession(req) {
  if (!hash) return true;
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("crumb_session="))
    ?.slice(14);
  if (!cookie) return false;
  const [expires, signature] = cookie.split(".");
  return (
    /^\d+$/.test(expires) &&
    Number(expires) > Date.now() &&
    equal(signature, sign(expires))
  );
}
export function installAuth(app) {
  app.get("/api/session", (req, res) =>
    res
      .set("Cache-Control", "no-store")
      .json({ authenticated: hasSession(req), protected: !!hash }),
  );
  const attempts = new Map();
  app.post("/api/login", (req, res) => {
    if (!hash) return res.json({ ok: true });
    // Bound per-instance rate tracking; the generated code has 192 bits of entropy.
    const key = req.ip,
      now = Date.now(),
      entry = attempts.get(key);
    if (entry && entry.until > now && entry.count >= 10)
      return res
        .status(429)
        .json({ error: "Too many attempts. Please wait 15 minutes." });
    if (attempts.size > 1000) attempts.clear();
    attempts.set(
      key,
      entry && entry.until > now
        ? { ...entry, count: entry.count + 1 }
        : { count: 1, until: now + 900000 },
    );
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!equal(createHash("sha256").update(code).digest("hex"), hash))
      return res
        .status(401)
        .json({ error: "That access code did not match. Please try again." });
    attempts.delete(key);
    const expires = String(now + 7 * 86400000);
    res
      .cookie("crumb_session", `${expires}.${sign(expires)}`, {
        httpOnly: true,
        secure: !!process.env.VERCEL,
        sameSite: "strict",
        maxAge: 7 * 86400000,
        path: "/",
      })
      .json({ ok: true });
  });
  app.post("/api/logout", (_, res) =>
    res.clearCookie("crumb_session", { path: "/" }).json({ ok: true }),
  );
  app.use("/api", (req, res, next) =>
    hasSession(req) || req.path === "/health"
      ? next()
      : res.status(401).json({
          error: "Enter your access code to open this private workspace.",
        }),
  );
}
