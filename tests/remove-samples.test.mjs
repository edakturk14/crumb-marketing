import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { removeSamples } from "../scripts/remove-samples.mjs";
test("sample removal preserves real media, results and profile and is repeatable", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE records(kind TEXT,id TEXT,business_id TEXT DEFAULT 'cake-gallery',data TEXT)",
  );
  const insert = db.prepare("INSERT INTO records(kind,id,data) VALUES(?,?,?)");
  const rows = [
    ["business", "profile", { name: "Cake Gallery Maslak" }],
    ["asset", "demo-0", { demo: true }],
    ["asset", "real", { demo: false }],
    ["post", "sample-post", { assetIds: ["demo-0"] }],
    ["post", "mixed-post", { assetIds: ["demo-0", "real"] }],
    ["post", "real-post", { assetIds: ["real"] }],
    ["metric", "example", { source: "demo" }],
    ["metric", "sample-post", { source: "manual", postId: "sample-post" }],
    [
      "metric",
      "real-post",
      { source: "manual", postId: "real-post", views: 120 },
    ],
    ["config", "instagram", { mode: "mock", connected: true }],
    ["recommendation", "latest", { asset: { demo: true } }],
  ];
  for (const [k, id, v] of rows) insert.run(k, id, JSON.stringify(v));
  assert.deepEqual(removeSamples(db), {
    assets: 1,
    posts: 1,
    metrics: 2,
    recommendations: 1,
  });
  const all = db.prepare("SELECT * FROM records").all();
  assert.equal(all.length, 5);
  assert.deepEqual(
    JSON.parse(all.find((r) => r.id === "mixed-post").data).assetIds,
    ["real"],
  );
  assert.equal(
    JSON.parse(all.find((r) => r.kind === "metric").data).views,
    120,
  );
  assert.deepEqual(removeSamples(db), {
    assets: 0,
    posts: 0,
    metrics: 0,
    recommendations: 0,
  });
  db.close();
});
