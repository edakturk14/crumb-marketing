import path from "node:path";
import { postgresOptions } from "./postgres.mjs";
import { freeOnly } from "./cost-policy.mjs";
import { businessDefaults } from "./domain.mjs";
export const dataDir = path.resolve(process.env.DATA_DIR || ".data");
const hosted = freeOnly.storage === "supabase";
const local = hosted ? null : await import("./local-db.mjs");
const pool = hosted
  ? new (await import("pg")).default.Pool(postgresOptions())
  : null;
export async function get(kind, id) {
  if (local) return local.get(kind, id);
  const r = await pool.query(
    "SELECT data FROM records WHERE kind=$1 AND id=$2",
    [kind, id],
  );
  return r.rows[0]?.data ?? null;
}
export async function all(kind) {
  if (local) return local.all(kind);
  return (
    await pool.query("SELECT data FROM records WHERE kind=$1", [kind])
  ).rows.map((r) => r.data);
}
export async function put(kind, id, data) {
  if (local) return local.put(kind, id, data);
  await pool.query(
    "INSERT INTO records(kind,id,data) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
    [kind, id, JSON.stringify(data)],
  );
  return data;
}
export async function remove(kind, id) {
  if (local) return local.remove(kind, id);
  await pool.query("DELETE FROM records WHERE kind=$1 AND id=$2", [kind, id]);
}
export async function putMany(rows) {
  if (local) {
    local.db.exec("BEGIN");
    try {
      for (const r of rows) local.put(...r);
      local.db.exec("COMMIT");
    } catch (e) {
      local.db.exec("ROLLBACK");
      throw e;
    }
  } else {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      for (const [kind, id, data] of rows)
        await c.query(
          "INSERT INTO records(kind,id,data) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
          [kind, id, JSON.stringify(data)],
        );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
export async function initialize() {
  if (hosted && !(await get("business", "profile")))
    await put("business", "profile", businessDefaults);
}
// Atomic one-use OAuth state consumption, including concurrent callback requests.
export async function consume(kind, id) {
  if (local) {
    const r = local.db
      .prepare("DELETE FROM records WHERE kind=? AND id=? RETURNING data")
      .get(kind, id);
    return r ? JSON.parse(r.data) : null;
  }
  return (
    (
      await pool.query(
        "DELETE FROM records WHERE kind=$1 AND id=$2 RETURNING data",
        [kind, id],
      )
    ).rows[0]?.data ?? null
  );
}
