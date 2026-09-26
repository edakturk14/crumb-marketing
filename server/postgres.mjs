import { readFileSync } from "node:fs";
export function postgresOptions() {
  const url = new URL(process.env.POSTGRES_URL);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  return {
    connectionString: url.href,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL("./certs/supabase-ca.crt", import.meta.url),
        "utf8",
      ),
    },
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
  };
}
