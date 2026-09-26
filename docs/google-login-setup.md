# Google sign-in: one-time free setup

The application uses the existing Supabase Free Plan and its official Auth SDK. No new paid service, billing account, custom domain or Google API subscription is needed. Google handles passwords. Supabase maintains the standard account ID, email and Google profile metadata; Crumb does not create its own name/password table. Crumb uses only a server-verified email/identity to authorize the shared Cake Gallery workspace.

**Current migration status:** Google integration is implemented and tested with controlled provider responses. The live Supabase Google provider is still disabled. The old access code remains available temporarily to prevent locking the owner out. Google mode entirely rejects the old endpoint/cookies after setup is finished.

## 1. Create a Google OAuth client

In [Google Auth Platform](https://console.cloud.google.com/auth/clients), choose or create a project and configure an OAuth client of type **Web application**. Do not enable billing or start a paid trial.

- App name: `Crumb`
- Audience: External; while in Testing, add your and the bakery owner’s Google accounts as test users.
- Scopes: only `openid`, `userinfo.email`, `userinfo.profile`. No Gmail, Drive, Photos or other API access.
- Authorized JavaScript origin: `https://crumb-marketing-eight.vercel.app`
- Authorized redirect URI (Google → Supabase):

```text
https://opwggpjcfyovlwzylkku.supabase.co/auth/v1/callback
```

Google supplies a Client ID and Client Secret. Put them into Supabase in the next step, not into chat, the repository, or Crumb’s UI.

## 2. Enable Google in Supabase

Open Crumb’s [Supabase resource through Vercel](https://vercel.com/edakturk14s-projects/~/integrations/supabase/icfg_mVR6Osb9SfiRlFwvRqzirH57/resources/store_pC8i5p0koJkOcMGW), then open its Supabase dashboard. Use the Crumb project `opwggpjcfyovlwzylkku`, not another app’s project.

Under Authentication → Sign In / Providers → Google, enable Google and save that OAuth Client ID and secret. Keep nonce checks enabled. Under Authentication → URL Configuration set:

- Site URL: `https://crumb-marketing-eight.vercel.app`
- Redirect allowlist: `https://crumb-marketing-eight.vercel.app/api/auth/callback`

The callback URLs differ intentionally: Google returns to Supabase; Supabase returns to Crumb. Avoid wildcard preview origins for the private prototype.

## 3. Choose who can enter Cake Gallery

Provide the exact Google email addresses for yourself and the bakery owner. This is a **shared bakery workspace**, not separate data per Google account. Anyone outside this list is denied, even with a valid Google login. There is no first-user ownership shortcut or wildcard access.

In [Crumb’s Vercel settings](https://vercel.com/edakturk14s-projects/crumb-marketing/settings/environment-variables), add:

```text
APP_ORIGIN=https://crumb-marketing-eight.vercel.app
AUTH_ALLOWED_EMAILS=your-exact-email@gmail.com,owners-exact-email@gmail.com
```

The Supabase URL and public key are already provided by the integration. The Google secret stays in Supabase. Never use the service-role key as the authentication client key.

After the Google provider is enabled, run the read-only readiness check with the Supabase and new settings loaded:

```sh
node --env-file=.env.hosted.local --env-file=.env.google.local scripts/check-google.mjs
```

Then set `AUTH_PROVIDER=google` in Vercel and redeploy. The old access code is disabled in Google mode. Keep `SESSION_SECRET` because it encrypts Instagram tokens independently. Remove `APP_ACCESS_CODE_HASH` after verifying an invited Google login; it is ignored in Google mode.

## What the owner sees

Continue with Google → choose an invited account → workspace. Sign-out is under Settings. Cancelled or expired sign-ins have a retry message. An uninvited account is denied without revealing the invited emails.

This login does not connect Instagram or grant access to Google content. The separate Instagram connection continues to request profile/media and insights only.

## Verification and security

- Official Supabase SSR client, one client per request, PKCE code exchange.
- HttpOnly, Secure, SameSite=Lax cookies; tokens are not stored in browser local storage.
- Cache prevention on all auth responses, including token refresh.
- Every protected request verifies identity through Supabase `getUser()` and checks the allowed Google email. Never trusts `user_metadata` or decoded cookie claims.
- Records and media remain inaccessible through the public Supabase Data API; no database/storage policy was widened.
- Automated tests exercise real SDK behavior against a controlled transport. Actual Google consent/login still needs the external client setup and an invited person’s sign-in.

References: [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google), [server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Free Plan](https://supabase.com/pricing).
