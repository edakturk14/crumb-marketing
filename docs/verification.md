# MVP verification

Run date: 2026-09-25. Local seeded mode, no external credentials.

| Requirement                                                    | Evidence                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App runs locally / production build                            | `npm run build`, `npm run dev`, `/api/health`; browser suite serves the actual `dist/` build                                                                    |
| Four primary pages plus settings                               | Browser navigation at desktop and 390px mobile; screenshots                                                                                                     |
| Cake Gallery profile + Turkish                                 | Seeded profile; API validation locks Turkish; captions/advice/templates; business settings save test                                                            |
| Bulk uploads with progress + stored thumbnails                 | Browser uploads 20 JPGs and five real WebM test clips in one batch, waits for all 25 analyses; API downloads originals and byte ranges                          |
| Quality and analysis                                           | Real brightness/resolution tests; dark media skipped; malformed media rejected; duplicates flagged; live multimodal request schema tested with a fake transport |
| Subject understanding                                          | Optional OpenAI adapter; not verified with a live key. Local UI explicitly discloses that subject recognition is unavailable                                    |
| Inventory + starvation                                         | Pure function tests and browser exhaustion of all unused media; practical Turkish shot list                                                                     |
| Recommend and generate                                         | Used/Skip exclusions, measured performance priority, all four format choices; browser creates Reel and carousel                                                 |
| Preview, caption, text, CTA, hashtags, cover, edit suggestions | Actual post dialog and editable fields; carousel navigation; Reel cover link; copied caption and text download                                                  |
| Persistence                                                    | Real server restart preserves originals, edited caption, profile, used state and metrics                                                                        |
| Optional Instagram                                             | Browser connects labeled demo; API mock imports normalized metrics. No real OAuth or publishing                                                                 |
| Results and learning                                           | Missing vs zero, date boundaries, minimum samples, type and close-up comparison, real/sample separation; UI records metrics and updates recommendation          |
| Plain errors                                                   | Unsupported/malformed files, missing assets, invalid numbers/date, unposted result validation; UI bad-upload feedback                                           |
| Responsive layout                                              | 390px navigation, content and overflow assertions; desktop/mobile screenshots visually inspected                                                                |
| Safe external boundaries                                       | Origin checks; server-only keys; strict structured outputs; no publishing endpoint                                                                              |

`npm test`: domain, provider contract and API lifecycle tests.
`npm run test:ui`: browser workflow tests.
`npm audit`: patched Sharp to 0.35.4; zero vulnerabilities at install audit.

Not claimed as tested: live OpenAI requests, S3 account operations, real Meta OAuth/insights. The core loop runs on local file storage, explicit AI fallback/templates and mock Instagram data; manually recorded results are real persisted input.

## Empty real workspace (2026-09-25)

- Default startup no longer seeds media or metrics; `DEMO_MODE=true` is explicit test opt-in.
- Test images moved out of public assets into `tests/fixtures/media` and only served in opt-in mode.
- Normal Instagram connection cannot insert example performance data.
- Removed 8 sample assets, 10 sample metrics, 1 sample-only draft and its cached recommendation from the local workspace.
- Cleanup regression test preserves real uploads, mixed drafts and real results; repeat runs make no additional changes.
- `npm test`: 8 passing tests after cleanup; production build passes.
