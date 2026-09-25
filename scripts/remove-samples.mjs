import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Target only records linked to our fixtures. Keep real uploads and their results.
export function removeSamples(db) {
  const records = db
    .prepare(
      "SELECT kind,id,data FROM records WHERE business_id='cake-gallery'",
    )
    .all()
    .map((r) => ({ ...r, value: JSON.parse(r.data) }));
  const sampleIds = new Set(
    records
      .filter((r) => r.kind === "asset" && r.value.demo === true)
      .map((r) => r.id),
  );
  const removedPosts = new Set();
  const counts = { assets: 0, posts: 0, metrics: 0, recommendations: 0 };
  const remove = db.prepare(
    "DELETE FROM records WHERE kind=? AND id=? AND business_id='cake-gallery'",
  );
  const update = db.prepare(
    "UPDATE records SET data=? WHERE kind=? AND id=? AND business_id='cake-gallery'",
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of records.filter((r) => r.kind === "post")) {
      const ids = r.value.assetIds || [];
      const kept = ids.filter((id) => !sampleIds.has(id));
      if (kept.length === ids.length) continue;
      if (!kept.length) {
        remove.run("post", r.id);
        removedPosts.add(r.id);
        counts.posts++;
      } else
        update.run(
          JSON.stringify({ ...r.value, assetIds: kept }),
          "post",
          r.id,
        );
    }
    for (const r of records) {
      if (r.kind === "asset" && sampleIds.has(r.id)) {
        remove.run(r.kind, r.id);
        counts.assets++;
      }
      if (
        r.kind === "metric" &&
        (r.value.source === "demo" ||
          removedPosts.has(r.value.postId) ||
          removedPosts.has(r.id))
      ) {
        remove.run(r.kind, r.id);
        counts.metrics++;
      }
      if (
        r.kind === "recommendation" &&
        (r.value.source === "demo" || r.value.asset?.demo === true)
      ) {
        remove.run(r.kind, r.id);
        counts.recommendations++;
      }
      if (
        r.kind === "config" &&
        r.id === "instagram" &&
        r.value.mode === "mock"
      )
        remove.run(r.kind, r.id);
    }
    db.exec("COMMIT");
    return counts;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const db = new DatabaseSync(
    path.join(path.resolve(process.env.DATA_DIR || ".data"), "crumb.sqlite"),
  );
  console.log(JSON.stringify(removeSamples(db)));
  db.close();
}
