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
  const storage = env.STORAGE_PROVIDER || "local";
  if (!["local", "supabase"].includes(storage))
    throw new Error("Free-only mode: unsupported storage provider.");
  if (storage === "supabase" && env.SUPABASE_PLAN !== "free")
    throw new Error(
      "Free-only mode: verify Supabase Free Plan before connecting.",
    );
  if (env.VERCEL && (storage !== "supabase" || env.DEMO_MODE === "true"))
    throw new Error(
      "Hosted mode requires persistent free storage and no sample data.",
    );
  return Object.freeze({ ai: "demo", storage });
}
export const freeOnly = freeOnlyConfiguration();
