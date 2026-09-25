# Owner's cost constraint

The owner explicitly requires **no service bills** for this project.

- Do not provision paid plans, paid trials, payment methods, domains, usage-billed APIs, or services with automatic paid overages.
- A free allowance on a paid account does not satisfy this requirement. Before deploying, verify the actual account/project plan and what happens when its quota is exhausted.
- Use only free plans that restrict/stop service rather than charging on exhaustion. Never upgrade or disable a spending cap automatically.
- The owner clarified that this is a personal, non-commercial prototype: they will not sell it or earn money from it. Vercel Hobby is suitable for this stated scope. Do not treat the Cake Gallery example profile as evidence of commercial deployment. Revisit hosting eligibility only if the user changes that scope.
- OpenAI and S3 adapters are retained in source but disabled by `server/cost-policy.mjs`. The presence of an API key must not activate a paid service.
- Keep the app working locally until a compatible free hosted setup is verified. Local AI fallback is image checks and Turkish templates, not semantic vision or a live LLM.
- If a capability cannot be supplied free of charge, explain the limitation. Do not sign up for a paid alternative or weaken this constraint without an explicit change of instruction from the owner.
- Keep sample assets and statistics out of the normal workspace. Test fixtures require explicit DEMO_MODE=true in an isolated database.

# Verification

Use `npm test` for backend changes; `npm run build` plus relevant `npm run test:ui` coverage for UI changes. Tests must never call a paid API. Never commit local SQLite files, uploads, secrets, or generated screenshots.
