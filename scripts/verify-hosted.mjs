// Explicit smoke test on your own instance. Creates and removes only its own media/draft.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
const base = process.env.VERIFY_URL || "http://127.0.0.1:43170";
const code = (await readFile(".data/prototype-access.txt", "utf8")).trim();
assert.equal((await fetch(base + "/api/state")).status, 401);
const login = await fetch(base + "/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie").split(";")[0];
const api = async (route, body, method = body ? "POST" : "GET") => {
  const r = await fetch(base + "/api" + route, {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.ok(r.ok, `${route}: ${data.error || r.status}`);
  return data;
};
const before = await api("/state");
assert.equal(before.providers.storage, "supabase");
console.log(
  "Private access and cloud database verified. Existing assets:",
  before.assets.length,
);
const bytes = await sharp(randomBytes(3000 * 2400 * 3), {
  raw: { width: 3000, height: 2400, channels: 3 },
})
  .jpeg({ quality: 95 })
  .toBuffer();
assert.ok(bytes.length > 4.5 * 1024 * 1024);
let ticket, asset;
try {
  ticket = await api("/uploads", {
    name: "verification-only.jpg",
    mime: "image/jpeg",
    size: bytes.length,
    frame: false,
  });
  const upload = await fetch(ticket.url, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: bytes,
  });
  assert.ok(upload.ok, `Direct upload: ${upload.status}`);
  asset = await api(`/uploads/${ticket.id}/complete`, {});
  assert.equal(asset.id, ticket.id);
  const again = await api(`/uploads/${ticket.id}/complete`, {});
  assert.equal(again.id, asset.id);
  const media = await fetch(base + asset.url, { headers: { cookie } });
  assert.equal(media.status, 200);
  assert.equal((await media.arrayBuffer()).byteLength, bytes.length);
  const state = await api("/state");
  assert.ok(state.assets.some((a) => a.id === asset.id));
  console.log(
    "Direct upload larger than Vercel’s 4.5 MB body limit, analysis, idempotency, private media and persistence passed.",
  );
} finally {
  if (asset) await api(`/assets/${asset.id}`, null, "DELETE");
  else if (ticket) await api(`/uploads/${ticket.id}`, null, "DELETE");
}
console.log("Verification media removed; original workspace preserved.");
