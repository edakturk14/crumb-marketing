import { installGoogleAuth } from "./google-auth.mjs";
// Preserve access only during the one-time provider setup. Google mode accepts
// neither the legacy code endpoint nor previously issued access-code cookies.
const provider =
  process.env.AUTH_PROVIDER ||
  (process.env.APP_ACCESS_CODE_HASH
    ? "access-code"
    : process.env.VERCEL
      ? "google"
      : "local");
if (
  !["google", "local", "access-code"].includes(provider) ||
  (provider === "local" && process.env.VERCEL)
)
  throw Error("Unsupported hosted authentication configuration.");
const legacy =
  provider === "google" ? null : await import("./access-code-auth.mjs");
export function installAuth(app) {
  return provider === "google"
    ? installGoogleAuth(app)
    : legacy.installAuth(app);
}
