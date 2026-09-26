# Crumb — Cake Gallery’s marketing companion

A personal, non-commercial prototype for Cake Gallery Maslak. English UI; Turkish captions, recommendations, on-screen text and filming advice. **No paid AI or services. No sample content or statistics in the normal workspace.**

## Run locally

Node.js 24 or newer:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. No credentials needed: local SQLite, files under `.data/objects`, image checks and Turkish templates. To serve a production build locally, run `npm run build` then `npm start`.

Optional settings are documented in `.env.example`. `DEMO_MODE=true` is only for isolated tests. `npm run remove:samples` removes legacy local samples while preserving real content.

## The working loop

Upload many photos/videos → Great / Usable / Skip feedback → Today recommendation → editable Turkish post preview → copy/download and share manually → enter results or refresh connected Instagram insights → next capture recommendation.

The app provides Today, Content, Results, How to use and Settings. Original media is preserved. It recommends crops/trims and text but does not render edited videos. It never publishes to Instagram.

## Hosted prototype

Live app: https://crumb-marketing-eight.vercel.app. GitHub auto-deploy linking needs the Vercel GitHub app to have access to this repository; CLI deployment works independently.

Vercel **Hobby** serves the frontend and one Express function. A separate, explicitly provisioned Supabase **Free Plan** stores metadata in Postgres and files in a private bucket. No paid trial, automatic upgrade, paid AI or S3 connection is enabled. Free limits restrict availability rather than enabling billable overages. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq).

- One private owner workspace, protected by a random access code and HttpOnly session cookie.
- Local access code: `.data/prototype-access.txt` (ignored by Git and excluded from deployments).
- Originals upload directly to private storage, avoiding Vercel’s 4.5 MB request limit. Maximum 50 MB/file; 900 MB application storage allowance below the Free Plan’s 1 GB bucket quota. Delete unneeded media from its detail dialog. Media used by saved posts is protected from deletion.
- Postgres uses verified TLS; records deny anonymous/authenticated Data API access. Server credentials never enter the frontend.
- Free projects can pause after inactivity. No automatic paid upgrades or background keep-alive services.
- Local and hosted workspaces are separate; local uploads are not automatically copied online.

For a new hosted installation: verify the actual free plans, provide the environment variables in `.env.example`, run `scripts/setup-hosted.mjs` with those variables, and configure private access before deploying. `scripts/prepare-access.mjs` generates local ignored access files; do not commit them. `vercel.json` routes the Vite frontend and Express API.

## Instagram: read-only

OAuth and insights importing are implemented. Real connection needs the Instagram App ID, App Secret and callback URI from a Meta developer app. See [exact setup instructions](docs/instagram-setup.md).

The fixed permission list is **only** `instagram_business_basic` and `instagram_business_manage_insights`. No publishing, messages, comment-management or advertising scopes. Tokens are encrypted server-side. Refresh imports recent posts and available insights; disconnect deletes the saved token/imported results and attempts remote revocation.

Before credentials are configured, the UI honestly shows setup pending. **Live Meta login has not been verified with a real account.** Automated OAuth tests use controlled responses. Personal prototype testers must be added to the Meta app; accounts outside that group require Meta approval.

Results show lifetime metrics for posts published within the last 30 days. Missing values remain unknown. Per-post reach is summed, not unique across posts. Imported results take precedence over manual entries to prevent double counting; the data source is labeled. Instagram history informs recommendations, but is not automatically imported into the unused media library.

## What remains limited

- **AI:** real brightness, resolution and duplicate checks; one selected video frame. Turkish text uses clearly labeled templates. No semantic cake recognition, live LLM, motion/audio analysis, or paid API calls.
- **Video editing:** previews and instructions, not rendered edits or transcoding. Browser codec support determines playback. Export HEIC photos as JPG first.
- **Account model:** a single private prototype workspace, not a multi-user product. Keep the access code private. No billing, teams, ads, scheduling or other social platforms.
- **Backups:** keep original media and export important drafts. No paid backup add-on is provisioned. Back up local SQLite and media together while the app is stopped.

## Verification

```sh
npm test
npm run build
npx playwright install chromium  # first use only
npm run test:ui
```

Backend tests cover persistence, quality checks, permissions, OAuth cancellation/replay, encrypted tokens, read-only requests, missing metrics and no-bill configuration. Browser tests cover a 25-file batch, navigation, Turkish drafts, editing, copy/download, results and low inventory. Cloud smoke tests use `scripts/verify-hosted.mjs` explicitly against the owner’s workspace and remove only their own temporary media.

Architecture: `server/db.mjs` selects SQLite/Postgres; `server/storage.mjs` handles private files; `server/domain.mjs` contains recommendations; `server/instagram.mjs` contains the read-only adapter; `server/instagram-routes.mjs` owns OAuth/sync; `server/ai.mjs` contains local checks and disabled paid adapter; `src/app.jsx` is the UI. See [verification details](docs/verification.md).

Repository: [edakturk14/crumb-marketing](https://github.com/edakturk14/crumb-marketing).
