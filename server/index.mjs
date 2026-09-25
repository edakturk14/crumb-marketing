import express from "express";
import multer from "multer";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { all, get, put, db } from "./db.mjs";
import { saveObject, readObject, storageMode } from "./storage.mjs";
import { aiMode, inspectImage, analyze, generate } from "./ai.mjs";
import {
  summarize,
  recommendation,
  seasonalIdea,
  inventory,
} from "./domain.mjs";
import { instagram } from "./instagram.mjs";
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== `http://${req.headers.host}` &&
    req.headers.origin !== `https://${req.headers.host}`
  )
    return res
      .status(403)
      .json({ error: "Please use the app in its own browser tab." });
  next();
});
app.use(express.json({ limit: "100kb" }));
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const find = (kind, id) => {
  const value = get(kind, id);
  if (!value) throw fail("This item could not be found.", 404);
  return value;
};
function state() {
  const assets = all("asset").sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    ),
    summary = summarize(all("metric")),
    next = recommendation(assets, summary);
  put("recommendation", "latest", {
    ...next,
    createdAt: new Date().toISOString(),
  });
  return {
    business: get("business", "profile"),
    assets,
    metrics: all("metric").filter((m) => m.source !== "demo"),
    posts: all("post").sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    ),
    summary,
    recommendation: next,
    inventory: inventory(assets),
    seasonal: seasonalIdea(assets),
    connection: get("config", "instagram") || {
      connected: false,
      mode: "mock",
    },
    providers: {
      ai: aiMode,
      storage: storageMode,
      instagram: "mock",
      demoEnabled: process.env.DEMO_MODE === "true",
    },
  };
}
app.get("/api/health", (_, res) => res.json({ ok: true }));
app.get("/api/state", (_, res) => res.json(state()));
app.patch("/api/business", (req, res) => {
  const v = z
    .object({
      name: z.string().trim().min(1).max(100),
      industry: z.string().trim().min(1).max(100),
      location: z.string().trim().min(1).max(100),
      language: z.literal("Turkish"),
    })
    .parse(req.body);
  res.json(put("business", "profile", { ...v, platform: "Instagram" }));
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 2, fields: 2 },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "frame", maxCount: 1 },
]);
app.post("/api/assets", upload, async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) throw fail("Choose a photo or video to upload.");
  const isVideo = ["video/mp4", "video/quicktime", "video/webm"].includes(
    file.mimetype,
  );
  if (
    !isVideo &&
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
      file.mimetype,
    )
  )
    throw fail("Use JPG, PNG, WebP, AVIF, MP4, MOV or WebM.");
  if (
    isVideo &&
    !(
      file.buffer.toString("ascii", 4, 8) === "ftyp" ||
      file.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    )
  )
    throw fail("This video file could not be read. Try exporting it as MP4.");
  let info;
  try {
    info = isVideo
      ? req.files.frame
        ? await inspectImage(req.files.frame[0].buffer)
        : null
      : await inspectImage(file.buffer);
  } catch {
    throw fail("This image could not be read. Try exporting it as JPG.");
  }
  const hash = createHash("sha256").update(file.buffer).digest("hex");
  const others = all("asset");
  const exact = others.find((a) => a.digest === hash);
  const similar =
    !isVideo &&
    info &&
    others.find(
      (a) =>
        a.type === "photo" &&
        a.visualHash &&
        a.analysis?.quality !== "Skip" &&
        [...a.visualHash].filter((c, i) => c !== info.hash[i]).length <= 3,
    );
  const id = randomUUID(),
    type = isVideo ? "video" : "photo",
    extension = isVideo
      ? file.mimetype === "video/webm"
        ? "webm"
        : file.mimetype === "video/quicktime"
          ? "mov"
          : "mp4"
      : { jpeg: "jpg", png: "png", webp: "webp", avif: "avif", heif: "heic" }[
          info.format
        ];
  const mime = isVideo
      ? file.mimetype
      : {
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
          avif: "image/avif",
          heif: "image/heic",
        }[info.format],
    key = `${id}.${extension}`;
  const url = await saveObject(key, file.buffer, mime);
  const thumbnail = info
    ? await saveObject(`${id}-cover.jpg`, info.preview, "image/jpeg")
    : null;
  const analysis = await analyze(info, type, exact?.id || similar?.id);
  const asset = {
    id,
    title: file.originalname.replace(/\.[^.]+$/, "").slice(0, 150),
    type,
    url,
    thumbnail,
    key,
    mime,
    coverKey: info ? `${id}-cover.jpg` : null,
    createdAt: new Date().toISOString(),
    used: false,
    demo: false,
    digest: hash,
    visualHash: info?.hash,
    width: info?.width,
    height: info?.height,
    analysis,
  };
  put("asset", id, asset);
  res.status(201).json(asset);
});
app.patch("/api/assets/:id", (req, res) => {
  const a = find("asset", req.params.id);
  const v = z
    .object({
      used: z.boolean().optional(),
      title: z.string().trim().min(1).max(150).optional(),
    })
    .parse(req.body);
  res.json(put("asset", a.id, { ...a, ...v }));
});
app.post("/api/assets/:id/analyze", async (req, res) => {
  const a = find("asset", req.params.id);
  const image = a.demo
    ? await readFile(
        path.join("tests/fixtures/media", path.basename(a.thumbnail)),
      )
    : a.coverKey
      ? await readObject(a.coverKey)
      : a.type === "photo"
        ? await readObject(a.key)
        : null;
  const info = image ? await inspectImage(image) : null;
  res.json(
    put("asset", a.id, {
      ...a,
      analysis: await analyze(info, a.type, a.analysis.duplicateOf),
    }),
  );
});
app.get("/api/files/:key", async (req, res) => {
  const key = req.params.key;
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) throw fail("File not found.", 404);
  const asset = all("asset").find((a) => a.key === key || a.coverKey === key);
  if (!asset) throw fail("File not found.", 404);
  let buffer;
  try {
    buffer = await readObject(key);
  } catch {
    throw fail("This media file is unavailable.", 404);
  }
  res
    .type(asset.coverKey === key ? "image/jpeg" : asset.mime)
    .set("Accept-Ranges", "bytes");
  if (req.headers.range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    const start = m ? Number(m[1]) : -1,
      end =
        m && m[2]
          ? Math.min(Number(m[2]), buffer.length - 1)
          : buffer.length - 1;
    if (start < 0 || start >= buffer.length || end < start)
      return res
        .status(416)
        .set("Content-Range", `bytes */${buffer.length}`)
        .end();
    res
      .status(206)
      .set("Content-Range", `bytes ${start}-${end}/${buffer.length}`)
      .send(buffer.subarray(start, end + 1));
  } else res.send(buffer);
});
app.post("/api/posts", async (req, res) => {
  const { assetIds } = z
    .object({
      assetIds: z
        .array(z.string())
        .min(1)
        .max(10)
        .refine((v) => new Set(v).size === v.length),
    })
    .parse(req.body);
  const assets = assetIds.map((id) => find("asset", id));
  if (assets.some((a) => a.analysis.quality === "Skip"))
    throw fail("Choose a Great or Usable asset for this post.");
  const post = {
    id: randomUUID(),
    assetIds,
    ...(await generate(
      assets,
      get("business", "profile"),
      summarize(all("metric")),
    )),
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  put("post", post.id, post);
  res.status(201).json(post);
});
const postEdits = z.object({
  caption: z.string().max(1800),
  overlay: z.string().max(150),
  cta: z.string().max(200),
  hashtags: z.array(z.string().max(80)).max(6),
});
app.patch("/api/posts/:id", (req, res) => {
  const post = find("post", req.params.id);
  const edits = postEdits.parse(req.body);
  if (
    [edits.caption, edits.cta, edits.hashtags.join(" ")].join("\n\n").length >
    2200
  )
    throw fail("Keep the caption, CTA and hashtags under 2,200 characters.");
  res.json(put("post", post.id, { ...post, ...edits }));
});
app.post("/api/posts/:id/posted", (req, res) => {
  const post = find("post", req.params.id);
  if (post.status === "posted") return res.json(post);
  db.exec("BEGIN");
  try {
    for (const id of post.assetIds) {
      const a = find("asset", id);
      put("asset", id, { ...a, used: true });
    }
    put("post", post.id, {
      ...post,
      status: "posted",
      postedAt: new Date().toISOString(),
    });
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.json(get("post", post.id));
});
const metricNumber = z.number().int().min(0).max(1e10).nullable();
app.put("/api/posts/:id/metrics", (req, res) => {
  const post = find("post", req.params.id);
  if (post.status !== "posted")
    throw fail("Mark the post as shared before adding results.");
  const metrics = z
    .object({
      views: metricNumber,
      reach: metricNumber,
      likes: metricNumber,
      comments: metricNumber,
      saves: metricNumber,
      date: z.iso.datetime(),
    })
    .parse(req.body);
  if (new Date(metrics.date) > new Date())
    throw fail("The posting date cannot be in the future.");
  if (
    !["views", "reach", "likes", "comments", "saves"].some(
      (k) => metrics[k] !== null,
    )
  )
    throw fail("Enter at least one result. Leave unavailable numbers blank.");
  const asset = find("asset", post.assetIds[0]);
  const interactions = ["likes", "comments", "saves"].some(
    (k) => metrics[k] !== null,
  )
    ? ["likes", "comments", "saves"].reduce((n, k) => n + (metrics[k] ?? 0), 0)
    : null;
  const row = {
    ...metrics,
    id: post.id,
    source: "manual",
    type:
      post.format === "Reel"
        ? "VIDEO"
        : post.format === "Carousel"
          ? "CAROUSEL"
          : post.format === "Story"
            ? "STORY"
            : "IMAGE",
    interactions,
    title: asset.title,
    thumbnail: asset.thumbnail,
    tags: asset.analysis.tags,
    postId: post.id,
  };
  res.json(put("metric", post.id, row));
});
app.post("/api/instagram/connect", async (_, res) => {
  if (process.env.DEMO_MODE !== "true")
    throw fail(
      "Instagram sign-in is not connected yet. You can upload content and record results without it.",
      503,
    );
  const c = await instagram.connect();
  for (const m of await instagram.historicalMedia()) put("metric", m.id, m);
  put("config", "instagram", c);
  res.json(c);
});
app.post("/api/instagram/disconnect", (_, res) =>
  res.json(put("config", "instagram", { connected: false, mode: "mock" })),
);
app.use("/api", (_, res) =>
  res.status(404).json({ error: "This action could not be found." }),
);
if (process.env.DEMO_MODE === "true")
  app.use("/demo", express.static("tests/fixtures/media"));
if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: { port: Number(process.env.PORT || 3000) + 10000 },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const validation = err instanceof z.ZodError;
  const message =
    err instanceof multer.MulterError
      ? "Upload one file at a time, up to 50 MB each."
      : validation
        ? "Please check the fields and try again."
        : err.status
          ? err.message
          : "Something went wrong. Please try again; your saved work is still here.";
  if (!validation && !err.status) console.error(err.message);
  res
    .status(
      err.status ||
        (validation || err instanceof multer.MulterError ? 400 : 500),
    )
    .json({ error: message });
});
const server = app.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  (error) => {
    if (error) {
      console.error(`Could not start Crumb: ${error.message}`);
      process.exit(1);
    }
    console.log(
      `Crumb is ready at http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3000}`,
    );
  },
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
