import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./db.mjs";
import { freeOnly } from "./cost-policy.mjs";
export const storageMode = freeOnly.storage;
export const supabase =
  storageMode === "supabase"
    ? (await import("@supabase/supabase-js")).createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
    : null;
const bucket = () => supabase.storage.from("crumb-media");
function check(error) {
  if (error)
    throw Object.assign(
      new Error(
        "Storage is unavailable or full. Please try again later; no paid upgrade will be made.",
      ),
      { status: 503 },
    );
}
export async function saveObject(key, buffer, mime) {
  if (supabase) {
    const { error } = await bucket().upload(key, buffer, {
      contentType: mime,
      upsert: true,
    });
    check(error);
  } else {
    await mkdir(path.join(dataDir, "objects"), { recursive: true });
    await writeFile(path.join(dataDir, "objects", key), buffer);
  }
  return `/api/files/${key}`;
}
export async function signedUpload(key) {
  const { data, error } = await bucket().createSignedUploadUrl(key);
  check(error);
  return data.signedUrl;
}
export async function signedDownload(key) {
  const { data, error } = await bucket().createSignedUrl(key, 300);
  check(error);
  return data.signedUrl;
}
export async function objectInfo(key) {
  const { data, error } = await bucket().info(key);
  check(error);
  return data;
}
export async function readObject(key) {
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) throw Error("Invalid key");
  if (supabase) {
    const { data, error } = await bucket().download(key);
    check(error);
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(path.join(dataDir, "objects", key));
}
export async function removeObjects(keys) {
  if (supabase) {
    const { error } = await bucket().remove(keys);
    check(error);
  } else
    await Promise.all(
      keys.map((k) =>
        unlink(path.join(dataDir, "objects", k)).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        }),
      ),
    );
}
