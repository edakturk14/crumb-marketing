// Read-only readiness check. Never logs credentials or the invited email list.
import { googleConfiguration } from "../server/google-auth.mjs";
const c = googleConfiguration(process.env);
if (!c.url || !c.key || !c.origin || !c.emails.size) {
  console.error(
    "Not ready: set APP_ORIGIN, AUTH_ALLOWED_EMAILS and the Supabase URL/public key first.",
  );
  process.exitCode = 1;
} else {
  const r = await fetch(c.url + "/auth/v1/settings", {
    headers: { apikey: c.key },
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json();
  if (!r.ok || d.external?.google !== true) {
    console.error(
      "Not ready: enable Google and configure its OAuth client in Supabase Auth first.",
    );
    process.exitCode = 1;
  } else
    console.log(
      "Google provider is enabled and the workspace allowlist is present. Set AUTH_PROVIDER=google and redeploy. Then verify a real invited Google sign-in.",
    );
}
