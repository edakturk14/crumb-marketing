import test from "node:test";
import assert from "node:assert/strict";
import {
  summarize,
  recommendation,
  inventory,
  seasonalIdea,
  templatePost,
} from "../server/domain.mjs";
import { inspectImage, analyze, structured } from "../server/ai.mjs";
import sharp from "sharp";
import { z } from "zod";
const now = new Date("2026-09-25T12:00:00Z");
const metric = (type, views, source = "manual", extra = {}) => ({
  type,
  views,
  source,
  date: now.toISOString(),
  ...extra,
});
const assets = [
  {
    id: "p",
    type: "photo",
    used: false,
    analysis: {
      quality: "Great",
      tags: ["yakın plan"],
      format: "Single image",
    },
  },
  {
    id: "v",
    type: "video",
    used: false,
    analysis: { quality: "Great", tags: ["süsleme"], format: "Reel" },
  },
  {
    id: "s",
    type: "photo",
    used: false,
    analysis: { quality: "Skip", tags: [] },
  },
];
test("learning compares means with minimum evidence and chooses unused matching media", () => {
  const rows = [
    metric("VIDEO", 400),
    metric("VIDEO", 600),
    metric("IMAGE", 100),
    metric("IMAGE", 100),
  ];
  const s = summarize(rows, now);
  assert.equal(s.ratio, 5);
  assert.equal(recommendation(assets, s).asset.id, "v");
  rows[0].views = 10;
  rows[1].views = 10;
  assert.equal(recommendation(assets, summarize(rows, now)).asset.id, "p");
  assert.equal(summarize(rows.slice(1), now).ratio, null);
  assert.equal(
    recommendation(
      assets.map((a) => ({ ...a, used: true })),
      s,
    ).asset,
    null,
  );
});
test("sample and entered metrics never mix; missing is not zero; rolling window excludes future and old", () => {
  const s = summarize(
    [
      metric("VIDEO", 99999, "demo"),
      metric("IMAGE", 0),
      metric("IMAGE", 22, "manual", { date: "2026-01-01" }),
      metric("IMAGE", 22, "manual", { date: "2026-09-26" }),
    ],
    now,
  );
  assert.equal(s.views, 0);
  assert.equal(s.reach, null);
  assert.equal(s.source, "manual");
  assert.equal(s.count, 1);
  assert.equal(summarize([], now).views, null);
});
test("close-up comparison uses only labeled photos and enough evidence", () => {
  const s = summarize(
    [
      metric("IMAGE", 500, "manual", { tags: ["yakın plan"] }),
      metric("IMAGE", 300, "manual", { tags: ["yakın plan"] }),
      metric("IMAGE", 100, "manual", { tags: ["geniş çekim"] }),
      metric("IMAGE", 100, "manual", { tags: ["geniş çekim"] }),
    ],
    now,
  );
  assert.equal(s.closeRatio, 4);
});
test("inventory, seasonal idea and four formats", () => {
  assert.equal(inventory(assets).useful, 2);
  assert.equal(inventory(assets).low, true);
  assert.match(seasonalIdea(assets, now).title, /Sonbahar/);
  assert.equal(templatePost([assets[0]]).format, "Single image");
  assert.equal(templatePost([assets[1]]).format, "Reel");
  assert.equal(templatePost(assets.slice(0, 2)).format, "Carousel");
  assert.equal(
    templatePost([
      { ...assets[0], analysis: { ...assets[0].analysis, format: "Story" } },
    ]).format,
    "Story",
  );
  assert.match(templatePost([assets[0]]).cta, /sipariş/);
});
test("image analysis checks actual brightness, resolution and duplicate evidence", async () => {
  const dark = await inspectImage(
    await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#080808" },
    })
      .jpeg()
      .toBuffer(),
  );
  assert.equal((await analyze(dark, "photo")).quality, "Skip");
  const mid = await inspectImage(
    await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#aaa" },
    })
      .jpeg()
      .toBuffer(),
  );
  assert.equal((await analyze(mid, "photo")).quality, "Great");
  assert.equal(
    (await analyze(mid, "photo", "other-id")).duplicateOf,
    "other-id",
  );
  assert.equal((await analyze(null, "video")).quality, "Usable");
});
test("replaceable live provider sends multimodal strict schema and validates results", async () => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    let body;
    const schema = z.object({ caption: z.string() });
    const result = await structured(
      "Turkish please",
      [Buffer.from("image")],
      schema,
      async (url, opts) => {
        assert.equal(url, "https://api.openai.com/v1/responses");
        body = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: '{"caption":"Merhaba İstanbul"}',
                  },
                ],
              },
            ],
          }),
        };
      },
    );
    assert.equal(result.caption, "Merhaba İstanbul");
    assert.equal(body.store, false);
    assert.equal(body.input[0].content[1].type, "input_image");
    assert.equal(body.text.format.strict, true);
    await assert.rejects(
      structured("test", [], schema, async () => ({ ok: false })),
    );
    await assert.rejects(
      structured("test", [], schema, async () => ({
        ok: true,
        json: async () => ({ status: "incomplete" }),
      })),
    );
  } finally {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  }
});
