import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { businessDefaults } from "./domain.mjs";
export const dataDir = path.resolve(process.env.DATA_DIR || ".data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(path.join(dataDir, "crumb.sqlite"));
db.exec(
  `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, business_id TEXT NOT NULL DEFAULT 'cake-gallery', data TEXT NOT NULL, PRIMARY KEY(kind,id));`,
);
export const get = (kind, id) => {
  const r = db
    .prepare("SELECT data FROM records WHERE kind=? AND id=? AND business_id=?")
    .get(kind, id, "cake-gallery");
  return r ? JSON.parse(r.data) : null;
};
export const all = (kind) =>
  db
    .prepare("SELECT data FROM records WHERE kind=? AND business_id=?")
    .all(kind, "cake-gallery")
    .map((r) => JSON.parse(r.data));
export const put = (kind, id, data) => {
  db.prepare(
    "INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
  ).run(kind, id, JSON.stringify(data));
  return data;
};
export const remove = (kind, id) =>
  db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
if (!get("business", "profile")) put("business", "profile", businessDefaults);
if (!get("config", "initialized")) {
  if (process.env.DEMO_MODE === "true") {
    const seeds = [
      [
        "chocolate",
        "Çikolatalı pastaya son dokunuş",
        "video",
        "Great",
        false,
        ["çikolata", "süsleme", "yakın plan"],
      ],
      [
        "pink",
        "Pembe bir doğum günü",
        "photo",
        "Great",
        false,
        ["pembe", "doğum günü", "bitmiş pasta"],
      ],
      [
        "strawberry",
        "Mevsimin en tatlı hali",
        "photo",
        "Great",
        false,
        ["meyve", "yakın plan", "bitmiş pasta"],
      ],
      [
        "wedding",
        "Bir kutlama için hazır",
        "photo",
        "Usable",
        false,
        ["kutlama", "çiçek", "bitmiş pasta"],
      ],
      [
        "cupcakes",
        "Mutfaktan küçük mutluluklar",
        "photo",
        "Great",
        false,
        ["mutfak", "yakın plan"],
      ],
      [
        "slice",
        "Çikolatalı bir mola",
        "photo",
        "Usable",
        true,
        ["çikolata", "yakın plan"],
      ],
      [
        "pink",
        "Pastanın son detayları",
        "video",
        "Great",
        true,
        ["süsleme", "pembe"],
      ],
      [
        "chocolate",
        "Farklı bir açı",
        "photo",
        "Skip",
        false,
        ["çikolata", "benzer çekim"],
      ],
    ];
    seeds.forEach(([image, title, type, quality, used, tags], i) =>
      put("asset", `demo-${i}`, {
        id: `demo-${i}`,
        title,
        type,
        url: `/demo/${image}.jpg`,
        thumbnail: `/demo/${image}.jpg`,
        demo: true,
        used,
        createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        analysis: {
          quality,
          tags,
          feedback:
            quality === "Great"
              ? "Bu içeriği kullan. Pasta net, ışık güzel ve detaylar iyi görünüyor."
              : quality === "Usable"
                ? "Bu kullanılabilir. Pastayı biraz daha yakın kırparak detayları öne çıkar."
                : "Aynı pastanın daha iyi bir çekimi var. Bu fotoğraf yerine onu kullanalım.",
          source: "demo",
          format: type === "video" ? "Reel" : "Single image",
        },
      }),
    );
    Array.from({ length: 10 }, (_, i) => {
      const video = i % 2 === 0;
      put("metric", `sample-${i}`, {
        id: `sample-${i}`,
        source: "demo",
        type: video ? "VIDEO" : "IMAGE",
        date: new Date(Date.now() - (i + 1) * 2 * 86400000).toISOString(),
        views: video ? 2300 + i * 92 : 1000 + (i - 1) * 40,
        reach: video ? 1780 + i * 30 : 760 + i * 25,
        interactions: video ? 176 + i * 4 : 68 + i * 2,
        saves: video ? 26 : 9,
        comments: video ? 12 : 4,
        likes: video ? 128 : 55,
        title: video ? "Pasta süsleme videosu" : "Bitmiş pasta fotoğrafı",
        thumbnail: `/demo/${video ? "chocolate" : "pink"}.jpg`,
      });
    });
  }
  put("config", "initialized", { at: new Date().toISOString() });
}
