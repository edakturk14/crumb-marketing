import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
await mkdir(".data", { recursive: true, mode: 0o700 });
let code;
try {
  code = (await readFile(".data/prototype-access.txt", "utf8")).trim();
} catch {
  code = randomBytes(24).toString("base64url");
  await writeFile(".data/prototype-access.txt", code + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}
let secret;
try {
  secret = (await readFile(".data/session-secret.txt", "utf8")).trim();
} catch {
  secret = randomBytes(48).toString("base64url");
  await writeFile(".data/session-secret.txt", secret + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}
const settings = {
  STORAGE_PROVIDER: "supabase",
  SUPABASE_PLAN: "free",
  AI_PROVIDER: "demo",
  DEMO_MODE: "false",
  APP_ACCESS_CODE_HASH: createHash("sha256").update(code).digest("hex"),
  SESSION_SECRET: secret,
};
await writeFile(
  ".env.access.local",
  Object.entries(settings)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
await writeFile(
  "/tmp/crumb-vercel-env.json",
  JSON.stringify(
    Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      type: ["SESSION_SECRET", "APP_ACCESS_CODE_HASH"].includes(key)
        ? "encrypted"
        : "plain",
      target: ["production", "preview", "development"],
    })),
  ),
  { mode: 0o600 },
);
console.log(
  "Private access code saved in .data/prototype-access.txt. Environment payload prepared without displaying secrets.",
);
