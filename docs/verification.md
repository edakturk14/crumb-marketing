# Verification — 2026-09-26

- Backend: 15 tests cover the real API upload/generation/results loop; restart persistence; brightness/duplicate handling; free-only provider guard; read-only scope allowlist; GET-only history; unsupported/missing insight values; encrypted tokens; browser-bound one-use OAuth state; cancellation; invalid/replayed callbacks; private workspace; disconnect and token/data removal.
- Browser: four workflows pass on the actual production build. Includes desktop/390px mobile navigation, optional Instagram setup, 20 photos + five generated WebM clips, progress and malformed uploads, duplicates, Turkish Reel/carousel drafts, editing, copy/download, persistence, manual results and low-inventory capture guidance.
- Hosted storage: initialized a dedicated Supabase Free Plan Postgres database and private bucket. Verified TLS with Supabase CA; records RLS enabled and anon/authenticated privileges removed. Uploaded a real JPEG larger than 4.5 MB directly to storage, completed image analysis, repeated completion safely, fetched private media and verified saved state. Removed only the smoke-test media afterward. Workspace remained empty.
- Vercel: Hobby plan verified; free-only configuration and owner access protection required at startup. No paid AI, S3, add-on or trial activated.
- Live Meta account testing is **not completed**: it requires the owner’s Meta app credentials, allowed Professional account and consent. All automated Meta calls are fakes. No fabricated results appear in the normal app.

Reproduce local verification with `npm test`, `npm run build`, `npm run test:ui`. Tests use disposable local databases. Cloud smoke verification is opt-in through `scripts/verify-hosted.mjs`; it never removes pre-existing user media.

## Google sign-in migration — 2026-09-26

- `npm test`: 18 passing tests, including Supabase SDK PKCE exchange, missing-verifier/replay rejection, verified Google identity/allowed-email checks, server-side revalidation, cookie flags, cache prevention, sign-out and rejection of legacy access codes in Google mode.
- `npm run test:ui`: seven passing browser workflows. Google screen has no password/code field in Google mode; consent handoff, cancellation, denied accounts, missing-provider state, Settings sign-out and mobile layout are exercised with controlled provider responses.
- Existing photo/video upload, Turkish generation, persistence and results flows still pass.
- Live Supabase settings checked: Google provider is **disabled**. Real Google consent has not been exercised. The legacy access code remains temporarily available on the live site until the Google client and owner-provided email allowlist are configured.
- No new database/user table, paid service, cloud plan, billing account or Google content permission added. Supabase stores its standard managed account record; Crumb stores no Google passwords.
