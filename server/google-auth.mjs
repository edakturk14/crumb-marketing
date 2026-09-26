import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";

// This MVP is one shared bakery workspace. Authentication alone does not grant access.
export function allowedGoogleUser(user, emails) {
  if (!user?.id || !user.email_confirmed_at || !user.email) return false;
  const email = user.email.trim().toLowerCase();
  if (!emails.has(email)) return false;
  return (
    user.identities?.some(
      (identity) =>
        identity.provider === "google" &&
        identity.identity_data?.email_verified === true &&
        identity.identity_data?.email?.trim().toLowerCase() === email,
    ) || false
  );
}
export function googleConfiguration(env = process.env) {
  const emails = new Set(
    (env.AUTH_ALLOWED_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  let origin;
  try {
    const u = new URL(env.APP_ORIGIN);
    if (
      u.protocol === "https:" ||
      (!env.VERCEL && ["localhost", "127.0.0.1"].includes(u.hostname))
    )
      origin = u.origin;
  } catch {}
  return {
    url: env.SUPABASE_URL,
    key: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
    origin,
    emails,
    secure: !!env.VERCEL || origin?.startsWith("https:"),
  };
}
export function installGoogleAuth(
  app,
  { env = process.env, fetcher = fetch } = {},
) {
  const config = googleConfiguration(env);
  const configured = !!(
    config.url &&
    config.key &&
    config.origin &&
    config.emails.size
  );
  const cookieName = "crumb_google";
  let readiness = { until: 0, ready: false };
  async function ready() {
    if (!configured) return false;
    if (readiness.until > Date.now()) return readiness.ready;
    try {
      const r = await fetcher(config.url + "/auth/v1/settings", {
        headers: { apikey: config.key },
        signal: AbortSignal.timeout(8000),
      });
      const body = await r.json();
      readiness = {
        until: Date.now() + 30000,
        ready: r.ok && body.external?.google === true,
      };
    } catch {
      readiness = { until: Date.now() + 5000, ready: false };
    }
    return readiness.ready;
  }
  function client(req, res) {
    const jar = new Map(
      parseCookieHeader(req.headers.cookie || "").map((c) => [
        c.name,
        c.value ?? "",
      ]),
    );
    return createServerClient(config.url, config.key, {
      global: { fetch: fetcher },
      cookieOptions: {
        name: cookieName,
        httpOnly: true,
        secure: config.secure,
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        encode: "tokens-only",
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies, headers) => {
          for (const [name, value] of Object.entries(headers || {}))
            res.set(name, value);
          for (const { name, value, options } of cookies) {
            jar.set(name, value);
            res.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, {
                ...options,
                httpOnly: true,
                secure: config.secure,
                sameSite: "lax",
                path: "/",
              }),
            );
          }
        },
      },
    });
  }
  function clear(req, res) {
    for (const c of parseCookieHeader(req.headers.cookie || ""))
      if (c.name.startsWith(cookieName))
        res.clearCookie(c.name, {
          path: "/",
          httpOnly: true,
          secure: config.secure,
          sameSite: "lax",
        });
    res.clearCookie("crumb_session", { path: "/" }); // Legacy access codes never authenticate in Google mode.
  }
  async function user(req, res) {
    if (!configured || !(req.headers.cookie || "").includes(cookieName))
      return null;
    const { data, error } = await client(req, res).auth.getUser(); // Server-verified identity, never cookie claims/user_metadata.
    return error ? null : data.user;
  }
  app.use("/api", (req, res, next) => {
    res.set({
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
    });
    next();
  });
  app.get("/api/session", async (req, res) => {
    const u = await user(req, res);
    const authenticated = allowedGoogleUser(u, config.emails);
    res.json({
      authenticated,
      protected: true,
      provider: "google",
      ready: await ready(),
      ...(authenticated ? { email: u.email } : {}),
      ...(u && !authenticated
        ? {
            error:
              "This Google account does not have access to Cake Gallery. Ask the owner to add your email.",
          }
        : {}),
    });
  });
  app.post("/api/auth/google", async (req, res) => {
    if (!(await ready()))
      return res.status(503).json({
        error:
          "Google sign-in needs its one-time setup. Please contact the app owner.",
      });
    const { data, error } = await client(req, res).auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: config.origin + "/api/auth/callback",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url)
      return res.status(503).json({
        error: "Google sign-in is temporarily unavailable. Please try again.",
      });
    res.json({ url: data.url });
  });
  app.get("/api/auth/callback", async (req, res) => {
    if (!configured) return res.redirect("/?auth=setup");
    if (req.query.error) {
      clear(req, res);
      return res.redirect("/?auth=cancelled");
    }
    if (typeof req.query.code !== "string" || req.query.code.length > 4000) {
      clear(req, res);
      return res.redirect("/?auth=expired");
    }
    const auth = client(req, res).auth;
    const { error } = await auth.exchangeCodeForSession(req.query.code);
    if (error) {
      clear(req, res);
      return res.redirect("/?auth=expired");
    }
    const { data, error: validationError } = await auth.getUser();
    if (validationError || !allowedGoogleUser(data.user, config.emails)) {
      await auth.signOut({ scope: "local" });
      clear(req, res);
      return res.redirect("/?auth=denied");
    }
    res.clearCookie("crumb_session", { path: "/" });
    res.redirect("/");
  });
  app.post("/api/logout", async (req, res) => {
    if (configured) await client(req, res).auth.signOut({ scope: "local" });
    clear(req, res);
    res.json({ ok: true });
  });
  app.post("/api/login", (_, res) =>
    res
      .status(410)
      .json({ error: "Access codes have been replaced by Google sign-in." }),
  );
  app.use("/api", async (req, res, next) => {
    if (req.path === "/health") return next();
    const u = await user(req, res);
    if (!u)
      return res
        .status(401)
        .json({ error: "Sign in with Google to open this private workspace." });
    if (!allowedGoogleUser(u, config.emails))
      return res.status(403).json({
        error: "This Google account does not have access to Cake Gallery.",
      });
    req.user = { id: u.id, email: u.email };
    next();
  });
}
