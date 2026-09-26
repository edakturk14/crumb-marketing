# Connect Instagram with read-only access

The integration is implemented; real account authorization requires a Meta app. It uses **Instagram API with Instagram Login**, not Facebook Login. The owner signs in on Instagram, never gives Crumb an Instagram password, and needs a Professional (Business or Creator) account.

## One-time Meta setup

1. Open [Meta for Developers](https://developers.facebook.com/apps/) and create or select the Crumb app. Add Instagram and use **API setup with Instagram login**.
2. In Business login settings, copy the **Instagram App ID** and **Instagram App Secret** (these are not necessarily the parent Facebook app’s credentials).
3. Configure the exact OAuth redirect URI: `https://crumb-marketing-eight.vercel.app/api/instagram/callback`. Use the stable production domain, not a temporary deployment hostname. Set the same value in `INSTAGRAM_REDIRECT_URI`.
4. Request **only** `instagram_business_basic` and `instagram_business_manage_insights`. Crumb hardcodes these scopes. Do not add publishing, messages, comment management, Facebook Page or ads permissions.
5. For a personal prototype, add the managed Professional account in the app dashboard and accept the tester invitation where Meta directs you. Standard Access covers accounts you own/manage and add to the app. Connecting accounts outside that group requires Meta’s Advanced Access/App Review; a Vercel deployment alone cannot grant this.
6. Add `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, and `INSTAGRAM_REDIRECT_URI` in Vercel project environment variables; redeploy. A token encryption secret is already supplied by `SESSION_SECRET`. Keep all secrets server-side. Do not paste them into chat, GitHub, or the app UI.
7. In Crumb, choose **Connect Instagram**, approve only profile/media and insights access, then return to Results. Sign-in triggers a first refresh. Settings → Manage connection → Refresh results runs another import.

For public App Review, Meta may require privacy/deletion URLs and other app verification. Do not claim the app is approved until Meta actually approves it. This private prototype does not automatically complete that review.

## Read-only behavior and limits

- No publish/upload-to-Instagram endpoint exists. “I’ve posted this” changes local tracking only.
- OAuth state is one-use, expires in ten minutes, and is tied to an HttpOnly browser cookie. Tokens are encrypted at rest and never returned through `/api/state`.
- Import reads up to 100 recent posts, bounded by request time. No returned pagination URL is followed directly; only an opaque cursor is passed to Instagram’s fixed host.
- Results show lifetime organic metrics for posts published during the last 30 days, not all account activity during those dates. Per-post reach is summed and is not unique account reach. Manual data is excluded when imported results exist, avoiding accidental double counting.
- Metrics Meta omits or refuses remain unknown (`—`), never estimated. Individual insight failures leave the post visible with an explanation. No claims about a cake’s subject are inferred from metrics.
- A valid long-lived token is refreshed when nearing expiration during a user-triggered sync. Expired/revoked access requires reconnecting. No cron jobs or paid services.
- Disconnect deletes Crumb’s saved token/imported metrics and attempts to revoke its authorization at Instagram. If Meta cannot be reached, the UI also directs the owner to remove Crumb under Instagram’s Apps and websites settings.
- All live OAuth/insight tests still require the actual app credentials and the owner’s consent. Automated integration tests use controlled Meta responses, not real accounts.

Verified against Meta documentation on 2026-09-25:

- [Business Login for Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Insights: permissions and access levels](https://developers.facebook.com/documentation/instagram-platform/insights)
- [Media insights: metrics and supported version](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights)
