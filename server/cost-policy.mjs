// The owner requires zero service charges. This is intentionally not an
// environment-variable toggle: paid adapters need a deliberate code change
// after the owner explicitly changes that requirement.
export function freeOnlyConfiguration(env = process.env) {
  if (env.AI_PROVIDER && env.AI_PROVIDER !== "demo") {
    throw new Error(
      "Free-only mode: paid AI is disabled. Set AI_PROVIDER=demo to use local checks and Turkish templates.",
    );
  }
  if (env.S3_BUCKET) {
    throw new Error(
      "Free-only mode: external S3 storage is disabled. Clear S3_BUCKET to keep media on local disk.",
    );
  }
  return Object.freeze({ ai: "demo", storage: "local" });
}
export const freeOnly = freeOnlyConfiguration();
