// Run once with the verified Free Plan credentials. Does not create or upgrade services.
import pg from "pg";
import { postgresOptions } from "../server/postgres.mjs";
import { createClient } from "@supabase/supabase-js";
if (process.env.SUPABASE_PLAN !== "free")
  throw Error("Verify the actual Supabase Free Plan before setup.");
const pool = new pg.Pool(postgresOptions());
try {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS public.records (kind text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(kind,id)); ALTER TABLE public.records ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.records FROM anon, authenticated;`,
  );
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: bucket } = await client.storage.getBucket("crumb-media");
  const options = {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ],
  };
  const { error } = bucket
    ? await client.storage.updateBucket("crumb-media", options)
    : await client.storage.createBucket("crumb-media", options);
  if (error) throw error;
  console.log(
    "Database initialized; row access restricted; media bucket private (50 MB/file).",
  );
} finally {
  await pool.end();
}
