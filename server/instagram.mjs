import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
// This allowlist is deliberately fixed. No publishing, comments, messages or ads permissions.
export const READ_SCOPES = Object.freeze([
  "instagram_business_basic",
  "instagram_business_manage_insights",
]);
export const instagramConfigured = (env = process.env) =>
  !!(
    env.INSTAGRAM_APP_ID &&
    env.INSTAGRAM_APP_SECRET &&
    env.INSTAGRAM_REDIRECT_URI &&
    (env.INSTAGRAM_TOKEN_SECRET || env.SESSION_SECRET)
  );
const failure = (message, status = 502) =>
  Object.assign(new Error(message), { status });
const numeric = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export function sealToken(token, secret) {
  const iv = randomBytes(12),
    key = createHash("sha256").update(secret).digest(),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, body, cipher.getAuthTag()]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function openToken(value, secret) {
  const [iv, body, tag] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv,
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}
export function createInstagram({ env = process.env, fetcher = fetch } = {}) {
  const version = env.INSTAGRAM_API_VERSION || "v25.0";
  if (!/^v\d+\.\d+$/.test(version))
    throw Error("Invalid Instagram API version");
  async function request(url, options = {}) {
    let response, data;
    try {
      response = await fetcher(url, {
        ...options,
        signal: AbortSignal.timeout(10000),
      });
      data = await response.json();
    } catch {
      throw failure(
        "Instagram is taking too long to respond. Please try again.",
      );
    }
    if (!response.ok || data.error) {
      const code = data.error?.code;
      const e = failure(
        code === 190
          ? "Your Instagram connection has expired. Please reconnect."
          : code === 10 || code === 200
            ? "Instagram has not allowed access to these insights. Reconnect and allow insights, or check the app’s tester access."
            : "Instagram could not provide this data right now. Please try again.",
        code === 190 ? 400 : 502,
      );
      e.metaCode = code;
      throw e;
    }
    return data;
  }
  async function graph(token, resource, params = {}) {
    // Restrict data operations to GET on our own profile, media and insights.
    if (!/^(me|\d+)(\/(media|insights))?$/.test(resource))
      throw Error("Unsupported read-only Instagram operation");
    const url = new URL(`https://graph.instagram.com/${version}/${resource}`);
    for (const [k, v] of Object.entries(params))
      url.searchParams.set(k, String(v));
    return request(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  return {
    authorizationURL(state) {
      if (!instagramConfigured(env))
        throw failure(
          "Instagram setup is not finished. The app owner needs to add the Meta app credentials first.",
          503,
        );
      const redirect = new URL(env.INSTAGRAM_REDIRECT_URI);
      if (redirect.protocol !== "https:")
        throw failure("Instagram needs a secure callback address.", 503);
      const url = new URL("https://www.instagram.com/oauth/authorize");
      for (const [k, v] of Object.entries({
        client_id: env.INSTAGRAM_APP_ID,
        redirect_uri: redirect.href,
        response_type: "code",
        scope: READ_SCOPES.join(","),
        state,
        enable_fb_login: "0",
        force_reauth: "true",
      }))
        url.searchParams.set(k, v);
      return url.href;
    },
    async exchange(code) {
      const short = await request(
        "https://api.instagram.com/oauth/access_token",
        {
          method: "POST",
          body: new URLSearchParams({
            client_id: env.INSTAGRAM_APP_ID,
            client_secret: env.INSTAGRAM_APP_SECRET,
            grant_type: "authorization_code",
            redirect_uri: env.INSTAGRAM_REDIRECT_URI,
            code,
          }),
        },
      );
      const permissions = short.permissions || short.data?.[0]?.permissions;
      const granted =
        typeof permissions === "string" ? permissions.split(",") : permissions;
      if (
        Array.isArray(granted) &&
        granted.some((p) => !READ_SCOPES.includes(p))
      )
        throw failure(
          "Remove this app in Instagram settings, then reconnect with read-only access.",
        );
      const token = short.access_token || short.data?.[0]?.access_token;
      if (!token)
        throw failure("Instagram did not complete sign-in. Please reconnect.");
      const url = new URL("https://graph.instagram.com/access_token");
      for (const [k, v] of Object.entries({
        grant_type: "ig_exchange_token",
        client_secret: env.INSTAGRAM_APP_SECRET,
        access_token: token,
      }))
        url.searchParams.set(k, v);
      const long = await request(url);
      if (!long.access_token || !numeric(long.expires_in))
        throw failure(
          "Instagram did not provide a valid connection. Please reconnect.",
        );
      const profile = await graph(long.access_token, "me", {
        fields: "user_id,username,account_type,followers_count",
      });
      if (
        !/^\d+$/.test(String(profile.user_id || profile.id)) ||
        !profile.username
      )
        throw failure("Choose an Instagram Professional account to connect.");
      return {
        token: long.access_token,
        expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(),
        profile: {
          id: String(profile.user_id || profile.id),
          username: profile.username,
          followers: numeric(profile.followers_count),
        },
      };
    },
    async refresh(token) {
      const url = new URL("https://graph.instagram.com/refresh_access_token");
      url.searchParams.set("grant_type", "ig_refresh_token");
      url.searchParams.set("access_token", token);
      const data = await request(url);
      if (!data.access_token || !numeric(data.expires_in))
        throw failure("Please reconnect Instagram to refresh access.");
      return {
        token: data.access_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      };
    },
    async revoke(token, id) {
      if (!/^\d+$/.test(id)) throw Error("Invalid account");
      // The only Graph mutation removes this app’s own authorization.
      await request(
        `https://graph.instagram.com/${version}/${id}/permissions`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
    },
    async history(token, id, now = new Date()) {
      const start = Date.now(),
        cutoff = now.getTime() - 30 * 86400000,
        rows = [];
      let after,
        partial = false;
      for (let page = 0; page < 5; page++) {
        if (Date.now() - start > 35000) {
          partial = true;
          break;
        }
        const result = await graph(token, `${id}/media`, {
          fields:
            "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
          limit: 20,
          ...(after ? { after } : {}),
        });
        const recent = (result.data || []).filter(
          (m) =>
            Date.parse(m.timestamp) >= cutoff &&
            Date.parse(m.timestamp) <= now.getTime(),
        );
        for (let i = 0; i < recent.length; i += 4) {
          if (Date.now() - start > 35000) {
            partial = true;
            break;
          }
          rows.push(
            ...(await Promise.all(
              recent.slice(i, i + 4).map(async (m) => {
                let insights = [],
                  unavailable = false;
                try {
                  insights =
                    (
                      await graph(token, `${m.id}/insights`, {
                        metric:
                          m.media_product_type === "STORY"
                            ? "views,reach,total_interactions"
                            : "views,reach,saved,total_interactions",
                      })
                    ).data || [];
                } catch (e) {
                  if (e.metaCode === 190) throw e;
                  unavailable = true;
                }
                return normalizeMedia(m, insights, id, unavailable);
              }),
            )),
          );
        }
        after = result.paging?.cursors?.after;
        if (
          partial ||
          !result.paging?.next ||
          !after ||
          (result.data || []).some((m) => Date.parse(m.timestamp) < cutoff)
        )
          break;
        if (page === 4) partial = true;
      }
      return { rows, partial };
    },
  };
}
export function normalizeMedia(m, insights, accountId, unavailable = false) {
  const value = (name) => {
    const r = insights.find((x) => x.name === name);
    return numeric(r?.total_value?.value ?? r?.values?.[0]?.value);
  };
  return {
    id: `instagram-${accountId}-${m.id}`,
    instagramId: m.id,
    accountId,
    source: "instagram",
    type:
      m.media_product_type === "STORY"
        ? "STORY"
        : m.media_type === "CAROUSEL_ALBUM"
          ? "CAROUSEL"
          : m.media_type === "VIDEO"
            ? "VIDEO"
            : "IMAGE",
    date: m.timestamp,
    title: (m.caption || "Instagram gönderisi").slice(0, 150),
    thumbnail:
      m.thumbnail_url || (m.media_type !== "VIDEO" ? m.media_url : null),
    permalink: m.permalink,
    views: value("views"),
    reach: value("reach"),
    interactions: value("total_interactions"),
    likes: numeric(m.like_count),
    comments: numeric(m.comments_count),
    saves: value("saved"),
    tags: [],
    insightsUnavailable: unavailable,
    syncedAt: new Date().toISOString(),
  };
}
