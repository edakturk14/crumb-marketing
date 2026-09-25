# Crumb — Cake Gallery’s marketing companion

A working local MVP for **Cake Gallery Maslak**, a custom cake bakery in Istanbul. English interface; Turkish captions, on-screen text, CTAs, hashtags, analysis feedback, seasonal ideas and filming advice.

## Run locally

Requires **Node.js 24 or newer** (uses built-in SQLite).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. No API keys or Instagram account are required. Your content library and Results start empty, ready for your own uploads. No Instagram metrics are fetched or fabricated.

For a production build running locally:

```sh
npm run build
npm start
```

Optional configuration:

```sh
cp .env.example .env
```

Edit `.env`, then restart the server. `DEMO_MODE=false` is the default. Sample fixtures are only loaded when explicitly enabled for isolated testing. To remove legacy samples from an existing workspace, run `npm run remove:samples`; real uploads and their results are preserved.

## Try the whole loop

1. **Content:** drop a week’s photos and videos together. Each file uploads with progress and a thumbnail, then gets Great / Usable / Skip feedback. Open an asset to see Turkish advice. Repeated or very similar images are flagged, not deleted.
2. **Today:** see useful unused inventory, a recommended post, one seasonal idea and one practical capture instruction. Low inventory offers a three-shot guide.
3. **Create this post:** get a Reel, single image, carousel (select multiple assets), or Story (suitable tall image). Edit the Turkish caption, text, CTA and hashtags in an Instagram-style preview. Save a draft, copy the caption, and download text and media. Reel drafts include a suggested cover frame.
4. Share the draft manually in Instagram, then click **I’ve posted this**. This marks its media as used; it never publishes remotely.
5. **Results:** add views, reach, likes, comments and saves from Instagram. Leave unavailable metrics blank. Results persist and feed the next recommendation. Two video and two photo observations are required for a format comparison; tagged close-up/wide photos are compared separately. Actual entered results replace sample data in the summary rather than mixing with it.
6. **How to use:** a visual four-step guide, account requirements and connection status. **Settings:** business name, industry, location, Turkish language and Instagram connection.

## What is real, and what is mocked?

| Capability           | Local MVP behavior                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload/storage       | Real file uploads; originals stored on disk, separate normalized JPEG thumbnails. 50 MB per file; many files handled sequentially to bound memory. Images: JPG, PNG, WebP, AVIF. Videos: MP4, MOV, WebM; playback depends on browser codec support.   |
| Persistence          | SQLite stores business, asset metadata/analysis/tags, used state, drafts, performance, connection state and latest recommendation. Media lives outside the DB.                                                                                        |
| Without an AI key    | Real local brightness, resolution and duplicate checks. Subject recognition is **not** performed. Turkish copy comes from labeled templates; seeded analyses are examples.                                                                            |
| With an AI key       | Server-side OpenAI Responses adapter analyzes an image or a browser-selected video frame and produces schema-validated Turkish content. On refusal, invalid response, timeout or outage, local/template fallback is shown with an explicit notice.    |
| Video analysis       | Browser selects one frame around the first second. The AI can assess that frame, not motion or audio. If extraction fails, video is retained with basic guidance. Preview it before sharing.                                                          |
| Crop/trim/text       | Recommendations and a visual preview, **not rendered edits**. Original media downloads unchanged. No video transcoding or automatic editing.                                                                                                          |
| Instagram connection | **Mock adapter only**, clearly labeled. Disabled in the normal app. In explicit test/demo mode only, “Try demo connection” loads example historical posts and metrics. No external account access, authentication, sync or publishing.                |
| Results and learning | Real deterministic calculations on persisted data, including manually entered real results. Missing values stay unknown. Reach is summed per post, not unique people across all posts. Followers are unavailable and omitted. No AI-invented metrics. |
| Seasonal ideas       | Istanbul calendar and available tags; no external trend scraping.                                                                                                                                                                                     |
| S3                   | Optional adapter implemented; local disk is the tested default. S3 requires your credentials/bucket and has not been verified against a live account.                                                                                                 |

## Credentials and connections

**None needed to use the complete local demo.**

For live AI, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` in `.env`. An account with API access and available usage credit is required. The key stays on the server; only resized previews and relevant text metadata are sent. Live paid calls are not exercised by the tests.

For real Instagram history, the remaining work is **integration development**, not just adding a token. Supply an Instagram Professional account, a Meta developer app with the necessary approved permissions, and a registered callback URL. Then replace `server/instagram.mjs` with OAuth, token storage/refresh, pagination and normalized media/insights fetching. Exact permissions and authentication flow must be verified against Meta’s current documentation during that integration. No app credentials or approval are needed for the mock. Publishing remains out of scope.

For optional S3-compatible storage, set the `S3_*` variables in `.env.example`; use a private bucket. Leave them blank for local file storage.

## Tests

```sh
npm test
npm run build
npx playwright install chromium   # first time only, if Chromium is not installed
npm run test:ui
```

API tests start a separate app against a disposable data directory, verify file downloads and persistence across a real process restart. Browser tests use another temporary data directory and the production build. They exercise a 25-file batch (20 photos + 5 actual generated test videos), failure/duplicate handling, optional Instagram demo, mobile navigation, generation, editing, copy/download, saved drafts, marked-as-posted state, manual results, carousel preview and low inventory. Provider contract tests use a fake HTTP response; no credentials or paid calls.

See [verification details](docs/verification.md) and screenshots in `docs/screenshots/`.

## Architecture and limits

- React + Vite frontend; Express server; Node SQLite; Sharp thumbnails/checks.
- `server/ai.mjs`: replaceable `analyze()` / `generate()` provider boundary. `AI_PROVIDER=demo|openai`; optional OpenAI implementation uses [image inputs](https://developers.openai.com/api/docs/guides/images-vision) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
- `server/domain.mjs`: pure inventory, seasonal, comparison, recommendation and template functions.
- `server/instagram.mjs`: mock history/connection adapter. No publishing endpoint exists.
- `server/storage.mjs`: private local or S3 storage behind the same file URLs.
- `server/db.mjs`: persisted records scoped to the single Cake Gallery workspace.
- `src/app.jsx`: UI and upload queue; `src/style.css`: responsive visual styles.

This is a **single-owner local application**, bound to loopback by default, without login/multi-tenant authorization. Keep it local; public hosting needs authentication, authorization, quotas and durable backups. Uploads and AI requests are synchronous, bounded and retriable, suitable for a local MVP. Near-duplicate detection is a simple perceptual hash and can flag false matches. Review flagged media and use “Analyze again” for quality checks; similarity flags remain intentionally conservative. HEIC is not advertised: export iPhone HEIC photos as JPG first. No scheduling, team management, billing, ads, Google integrations or other social networks.

Back up the SQLite database and media objects together while the app is stopped. `.env`, `.data/`, dependencies and build/test artifacts are ignored by Git. Do not commit secrets or private bakery photos.

## GitHub and Vercel next step

Suggested GitHub repository: **crumb-marketing**. Create an empty repository; the local source is ready for an initial push. No local database, uploaded media, secrets or dependencies belong in Git.

The current persistence is local SQLite (`.data/crumb.sqlite`) and local files (`.data/objects`). It is not yet wired to a hosted database. Before a Vercel preview is used for real uploads, migrate metadata to a hosted database, use durable object storage, and adapt uploads to go directly to storage. Vercel functions have a 4.5 MB request payload limit, below the MVP’s 50 MB video limit. Add owner authentication as part of that deployment.

A suitable next setup is Neon Postgres and private Vercel Blob; provisioning and migration have not been performed. References: [Vercel storage](https://vercel.com/docs/storage), [function limits](https://vercel.com/docs/functions/limitations).
