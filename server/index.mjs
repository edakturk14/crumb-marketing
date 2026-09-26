import express from "express";
import multer from "multer";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { all, get, put, putMany, initialize, remove } from "./db.mjs";
import {
  saveObject,
  readObject,
  storageMode,
  signedUpload,
  signedDownload,
  objectInfo,
  removeObjects,
} from "./storage.mjs";
import { aiMode, inspectImage, analyze, generate } from "./ai.mjs";
import {
  summarize,
  recommendation,
  seasonalIdea,
  inventory,
} from "./domain.mjs";
import { instagramConfigured } from "./instagram.mjs";
import { instagramCallback, instagramRoutes } from "./instagram-routes.mjs";
import { installAuth } from "./auth.mjs";
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
instagramCallback(app);
installAuth(app);
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const find = async (kind, id) => {
  const value = await get(kind, id);
  if (!value) throw fail("This item could not be found.", 404);
  return value;
};
async function state() {
  const assets = (await all("asset")).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    ),
    summary = summarize(await all("metric")),
    next = recommendation(assets, summary);
  await put("recommendation", "latest", {
    ...next,
    createdAt: new Date().toISOString(),
  });
  return {
    business: await get("business", "profile"),
    assets,
    metrics: (await all("metric")).filter((m) => m.source !== "demo"),
    posts: (await all("post")).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    ),
    summary,
    recommendation: next,
    inventory: inventory(assets),
    seasonal: seasonalIdea(assets),
    connection: (await get("config", "instagram")) || {
      connected: false,
      mode: "live",
    },
    providers: {
      ai: aiMode,
      storage: storageMode,
      instagram: "live",
      instagramConfigured: instagramConfigured(),
      demoEnabled: process.env.DEMO_MODE === "true",
    },
  };
}
app.get("/api/health", (_, res) => res.json({ ok: true }));
app.use("/api", async (_, res, next) => {
  await initialize();
  res.set("Cache-Control", "no-store");
  next();
});
app.get("/api/state", async (_, res) => res.json(await state()));
app.patch("/api/business", async (req, res) => {
  const v = z
    .object({
      name: z.string().trim().min(1).max(100),
      industry: z.string().trim().min(1).max(100),
      location: z.string().trim().min(1).max(100),
      language: z.literal("Turkish"),
    })
    .parse(req.body);
  res.json(await put("business", "profile", { ...v, platform: "Instagram" }));
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 2, fields: 2 },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "frame", maxCount: 1 },
]);
async function createAsset(file, frame, existing = null) {
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
      ? frame
        ? await inspectImage(frame)
        : null
      : await inspectImage(file.buffer);
  } catch {
    throw fail("This image could not be read. Try exporting it as JPG.");
  }
  const hash = createHash("sha256").update(file.buffer).digest("hex");
  const others = await all("asset");
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
  const id = existing?.id || randomUUID(),
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
  const url = existing
    ? `/api/files/${existing.key}`
    : await saveObject(key, file.buffer, mime);
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
    key: existing?.key || key,
    size: file.buffer.length,
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
  await put("asset", id, asset);
  return asset;
}
app.post("/api/assets", upload, async (req, res) => {
  if (storageMode === "supabase")
    throw fail("Use the direct upload flow for this workspace.");
  res
    .status(201)
    .json(
      await createAsset(req.files?.file?.[0], req.files?.frame?.[0]?.buffer),
    );
});
const mediaTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
app.post("/api/uploads", async (req, res) => {
  if (storageMode !== "supabase") throw fail("Direct upload is unavailable.");
  const v = z
    .object({
      name: z.string().min(1).max(200),
      mime: z.enum(Object.keys(mediaTypes)),
      size: z
        .number()
        .int()
        .positive()
        .max(50 * 1024 * 1024),
      frame: z.boolean(),
    })
    .parse(req.body);
  const assets = await all("asset"),
    pending = await all("upload");
  if (
    [...assets, ...pending].reduce((n, a) => n + (a.size || 0) + 250000, 0) +
      v.size >
    900 * 1024 * 1024
  )
    throw fail(
      "Your free storage is nearly full. Delete unused files before uploading more.",
      409,
    );
  const id = randomUUID(),
    key = `${id}.${mediaTypes[v.mime]}`,
    frameKey = v.frame ? `${id}-input.jpg` : null;
  await put("upload", id, {
    ...v,
    id,
    key,
    frameKey,
    createdAt: new Date().toISOString(),
  });
  res.status(201).json({
    id,
    url: await signedUpload(key),
    frameUrl: frameKey ? await signedUpload(frameKey) : null,
  });
});
app.post("/api/uploads/:id/complete", async (req, res) => {
  const saved = await get("asset", req.params.id);
  if (saved) return res.json(saved);
  const u = await find("upload", req.params.id);
  const metadata = await objectInfo(u.key);
  if (Number(metadata.size) !== u.size)
    throw fail("The upload size did not match. Please try this file again.");
  if (
    u.frameKey &&
    Number((await objectInfo(u.frameKey)).size) > 2 * 1024 * 1024
  )
    throw fail("Video preview is too large.");
  const [buffer, frame] = await Promise.all([
    readObject(u.key),
    u.frameKey ? readObject(u.frameKey) : null,
  ]);
  const asset = await createAsset(
    { originalname: u.name, mimetype: u.mime, buffer },
    frame,
    u,
  );
  if (u.frameKey) await removeObjects([u.frameKey]);
  await remove("upload", u.id);
  res.status(201).json(asset);
});
app.delete("/api/uploads/:id", async (req, res) => {
  const u = await get("upload", req.params.id);
  if (u && !(await get("asset", u.id))) {
    await removeObjects([u.key, u.frameKey].filter(Boolean));
    await remove("upload", u.id);
  }
  res.json({ ok: true });
});
app.delete("/api/assets/:id", async (req, res) => {
  const a = await find("asset", req.params.id);
  if ((await all("post")).some((p) => p.assetIds.includes(a.id)))
    throw fail(
      "This media belongs to a saved post. Keep it so the post can still open.",
      409,
    );
  await removeObjects([a.key, a.coverKey].filter(Boolean));
  await remove("asset", a.id);
  res.json({ ok: true });
});
app.patch("/api/assets/:id", async (req, res) => {
  const a = await find("asset", req.params.id);
  const v = z
    .object({
      used: z.boolean().optional(),
      title: z.string().trim().min(1).max(150).optional(),
    })
    .parse(req.body);
  res.json(await put("asset", a.id, { ...a, ...v }));
});
app.post("/api/assets/:id/analyze", async (req, res) => {
  const a = await find("asset", req.params.id);
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
    await put("asset", a.id, {
      ...a,
      analysis: await analyze(info, a.type, a.analysis.duplicateOf),
    }),
  );
});
app.get("/api/files/:key", async (req, res) => {
  const key = req.params.key;
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) throw fail("File not found.", 404);
  const asset = (await all("asset")).find(
    (a) => a.key === key || a.coverKey === key,
  );
  if (!asset) throw fail("File not found.", 404);
  if (storageMode === "supabase")
    return res.redirect(await signedDownload(key));
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
  const assets = await Promise.all(assetIds.map((id) => find("asset", id)));
  if (assets.some((a) => a.analysis.quality === "Skip"))
    throw fail("Choose a Great or Usable asset for this post.");
  const post = {
    id: randomUUID(),
    assetIds,
    ...(await generate(
      assets,
      await get("business", "profile"),
      summarize(await all("metric")),
    )),
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  await put("post", post.id, post);
  res.status(201).json(post);
});
const postEdits = z.object({
  caption: z.string().max(1800),
  overlay: z.string().max(150),
  cta: z.string().max(200),
  hashtags: z.array(z.string().max(80)).max(6),
});
app.patch("/api/posts/:id", async (req, res) => {
  const post = await find("post", req.params.id);
  const edits = postEdits.parse(req.body);
  if (
    [edits.caption, edits.cta, edits.hashtags.join(" ")].join("\n\n").length >
    2200
  )
    throw fail("Keep the caption, CTA and hashtags under 2,200 characters.");
  res.json(await put("post", post.id, { ...post, ...edits }));
});
app.post("/api/posts/:id/posted", async (req, res) => {
  const post = await find("post", req.params.id);
  if (post.status === "posted") return res.json(post);
  const rows = [];
  for (const id of post.assetIds) {
    const a = await find("asset", id);
    rows.push(["asset", id, { ...a, used: true }]);
  }
  rows.push([
    "post",
    post.id,
    { ...post, status: "posted", postedAt: new Date().toISOString() },
  ]);
  await putMany(rows);
  res.json(await get("post", post.id));
});
const metricNumber = z.number().int().min(0).max(1e10).nullable();
app.put("/api/posts/:id/metrics", async (req, res) => {
  const post = await find("post", req.params.id);
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
  const asset = await find("asset", post.assetIds[0]);
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
  res.json(await put("metric", post.id, row));
});
instagramRoutes(app);
app.use("/api", (_, res) =>
  res.status(404).json({ error: "This action could not be found." }),
);
if (process.env.DEMO_MODE === "true")
  app.use("/demo", express.static("tests/fixtures/media"));
if (!process.env.VERCEL && process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else if (!process.env.VERCEL) {
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
if (!process.env.VERCEL) {
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
}
export default app;
