import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
const base = "http://127.0.0.1:43167";
const req = async (url, body, method = body ? "POST" : "GET") => {
  const r = await fetch(base + "/api" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
};
const upload = async (buffer, name = "photo.jpg", type = "image/jpeg") => {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), name);
  const r = await fetch(base + "/api/assets", { method: "POST", body: form });
  return { status: r.status, data: await r.json() };
};
test("API: upload → analyze → recommend → generate → post → results → persistent learning", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "crumb-api-"));
  let server;
  const start = async () => {
    server = spawn(process.execPath, ["server/index.mjs"], {
      env: {
        ...process.env,
        DATA_DIR: dir,
        PORT: "43167",
        NODE_ENV: "production",
        AI_PROVIDER: "demo",
        OPENAI_API_KEY: "",
        S3_BUCKET: "",
        DEMO_MODE: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    server.stdout.on("data", (b) => (log += b));
    server.stderr.on("data", (b) => (log += b));
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error(log);
      try {
        if ((await req("/health")).status === 200) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Server did not start: " + log);
  };
  const stop = async () => {
    if (server && server.exitCode === null) {
      const done = new Promise((r) => server.once("exit", r));
      server.kill("SIGTERM");
      await done;
    }
  };
  t.after(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });
  await start();
  const empty = (await req("/state")).data;
  assert.equal(empty.assets.length, 0);
  assert.equal(empty.summary.views, null);
  assert.equal(empty.recommendation.asset, null);
  const jpg = await readFile("tests/fixtures/media/pink.jpg");
  const first = await upload(jpg);
  assert.equal(first.status, 201);
  assert.equal(first.data.type, "photo");
  assert.equal(first.data.analysis.source, "local");
  assert.notEqual(first.data.analysis.quality, "Skip");
  const a = first.data;
  const duplicate = await upload(jpg, "duplicate.jpg");
  assert.equal(duplicate.data.analysis.quality, "Skip");
  assert.equal(duplicate.data.analysis.duplicateOf, a.id);
  const other = await upload(
    await readFile("tests/fixtures/media/strawberry.jpg"),
    "berry.jpg",
  );
  assert.notEqual(other.data.analysis.quality, "Skip");
  const bad = await upload(Buffer.from("not an image"));
  assert.equal(bad.status, 400);
  assert.equal(
    (await upload(Buffer.from("<svg/>"), "bad.svg", "image/svg+xml")).status,
    400,
  );
  assert.equal(
    (await upload(Buffer.from("bad"), "bad.mp4", "video/mp4")).status,
    400,
  );
  const r = await fetch(base + a.url);
  assert.equal(r.status, 200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), jpg);
  assert.match(r.headers.get("content-type"), /image/);
  const range = await fetch(base + a.url, { headers: { range: "bytes=0-99" } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  assert.equal(
    (await fetch(base + a.url, { headers: { range: "bytes=999999999-" } }))
      .status,
    416,
  );
  assert.equal(
    (await req("/posts", { assetIds: [duplicate.data.id] })).status,
    400,
  );
  assert.equal((await req("/posts", { assetIds: ["missing"] })).status, 404);
  const post = (await req("/posts", { assetIds: [a.id, other.data.id] })).data;
  assert.equal(post.format, "Carousel");
  assert.equal(post.source, "template");
  assert.ok(post.caption.length > 30);
  const edits = {
    caption: "Maslak’ta tatlı bir mola. 💗",
    overlay: post.overlay,
    cta: post.cta,
    hashtags: post.hashtags,
  };
  assert.equal((await req("/posts/" + post.id, edits, "PATCH")).status, 200);
  assert.equal(
    (
      await req(
        "/posts/" + post.id + "/metrics",
        {
          views: 100,
          reach: null,
          likes: null,
          comments: null,
          saves: null,
          date: new Date().toISOString(),
        },
        "PUT",
      )
    ).status,
    400,
  );
  await req("/posts/" + post.id + "/posted", {});
  await req("/posts/" + post.id + "/posted", {});
  const after = (await req("/state")).data;
  assert.equal(after.inventory.used, 2);
  assert.equal(after.recommendation.asset, null);
  const m = {
    views: 1200,
    reach: 800,
    likes: 70,
    comments: 5,
    saves: null,
    date: new Date().toISOString(),
  };
  assert.equal(
    (await req("/posts/" + post.id + "/metrics", m, "PUT")).status,
    200,
  );
  assert.equal(
    (await req("/posts/" + post.id + "/metrics", { ...m, views: -1 }, "PUT"))
      .status,
    400,
  );
  assert.equal(
    (
      await req(
        "/posts/" + post.id + "/metrics",
        { ...m, date: "2099-01-01T00:00:00.000Z" },
        "PUT",
      )
    ).status,
    400,
  );
  assert.equal((await req("/instagram/connect", {})).status, 503);
  const s = (await req("/state")).data;
  assert.equal(s.connection.mode, "live");
  assert.equal(s.connection.connected, false);
  assert.equal(s.providers.demoEnabled, false);
  assert.equal(s.summary.views, 1200);
  assert.equal(s.summary.count, 1);
  assert.equal(s.summary.interactions, 75);
  assert.equal(s.summary.source, "manual");
  assert.equal(
    (
      await req(
        "/business",
        {
          name: "Updated Bakery",
          industry: "Bakery",
          location: "Maslak",
          language: "Turkish",
        },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "/business",
        { name: "a", industry: "b", location: "c", language: "English" },
        "PATCH",
      )
    ).status,
    400,
  );
  const csrf = await fetch(base + "/api/instagram/connect", {
    method: "POST",
    headers: { Origin: "https://unrelated.example" },
  });
  assert.equal(csrf.status, 403);
  await stop();
  await start();
  const persisted = (await req("/state")).data;
  assert.equal(persisted.business.name, "Updated Bakery");
  assert.equal(persisted.posts[0].caption, edits.caption);
  assert.equal(persisted.summary.views, 1200);
  assert.equal((await fetch(base + a.url)).status, 200);
});
