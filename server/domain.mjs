export const businessDefaults = {
  name: "Cake Gallery Maslak",
  industry: "Bakery / custom cakes",
  location: "Maslak, Istanbul",
  language: "Turkish",
  platform: "Instagram",
};
export function seasonalIdea(assets, date = new Date()) {
  const month = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Istanbul",
      month: "numeric",
    }).format(date),
  );
  const season =
    month === 2
      ? [
          "Sevgililer Günü için küçük bir fikir",
          "pembe",
          "İki kişilik, sade bir pastanın hazırlığını paylaşabilirsin.",
        ]
      : month === 5
        ? [
            "Anneler Günü için tatlı bir fikir",
            "çiçek",
            "Çiçek detaylı bir pastanın son dokunuşlarını paylaşabilirsin.",
          ]
        : month === 6
          ? [
              "Kutlamalar mevsimi",
              "kutlama",
              "Mezuniyet kutlamaları için hazırladığın pastaların son dokunuşlarını çekebilirsin.",
            ]
          : month >= 9 && month <= 11
            ? [
                "Sonbahara küçük bir hazırlık",
                "çikolata",
                "Sıcak tonlar, tarçın ve elma… Bu hafta sonbahardan ilham alan bir pasta deneyebilirsin.",
              ]
            : month === 12
              ? [
                  "Yeni yıla tatlı bir hazırlık",
                  "kutlama",
                  "Yeni yıl için hazırladığın pastanın detaylarını gün ışığında çekebilirsin.",
                ]
              : month === 1
                ? [
                    "Yeni yıl, tatlı başlangıçlar",
                    "kutlama",
                    "Yılın ilk pastasının detaylarını gün ışığında paylaşabilirsin.",
                  ]
                : month >= 7 && month <= 8
                  ? [
                      "Yaz kutlamalarına yer aç",
                      "meyve",
                      "Yaz düğünleri için hazırladığın pastaların meyve ve çiçek detaylarını paylaşabilirsin.",
                    ]
                  : [
                      "Biraz bahar, biraz pasta",
                      "çiçek",
                      "Bahar renklerinde hazırladığın bir pastayı pencere önünde fotoğraflayabilirsin.",
                    ];
  const match = assets.find(
    (a) =>
      !a.used &&
      a.analysis?.quality !== "Skip" &&
      a.analysis?.tags?.some((t) => t.includes(season[1])),
  );
  return {
    kind: "seasonal",
    title: season[0],
    text:
      season[2] +
      (match
        ? " Arşivindeki bu pasta güzel bir başlangıç olur."
        : " Hazırlık sırasında 5–10 saniyelik bir video çekmen yeterli."),
    assetId: match?.id,
  };
}
const average = (rows, key) =>
  rows.reduce((n, m) => n + m[key], 0) / rows.length;
export function summarize(metrics, now = new Date()) {
  const recent = metrics.filter(
    (m) =>
      new Date(m.date) >= new Date(now.getTime() - 30 * 86400000) &&
      new Date(m.date) <= now,
  );
  // Never mix sample and actual results into the same evidence.
  const actual = recent.filter((m) => m.source !== "demo");
  const rows = actual.length ? actual : recent;
  const sum = (key) =>
    rows.some((m) => Number.isFinite(m[key]))
      ? rows.reduce((n, m) => n + (m[key] ?? 0), 0)
      : null;
  const videos = rows.filter(
    (m) => m.type === "VIDEO" && Number.isFinite(m.views),
  );
  const photos = rows.filter(
    (m) => m.type === "IMAGE" && Number.isFinite(m.views),
  );
  const close = photos.filter((m) => m.tags?.includes("yakın plan")),
    wide = photos.filter((m) => m.tags?.includes("geniş çekim"));
  const compare = (a, b) =>
    a.length >= 2 && b.length >= 2 && average(b, "views") > 0
      ? Math.round((average(a, "views") / average(b, "views")) * 10) / 10
      : null;
  return {
    views: sum("views"),
    reach: sum("reach"),
    interactions: sum("interactions"),
    followers: null,
    count: rows.length,
    ratio: compare(videos, photos),
    closeRatio: compare(close, wide),
    videos: videos.length,
    photos: photos.length,
    rows: rows.sort((a, b) => new Date(b.date) - new Date(a.date)),
    source: actual.length ? "manual" : rows.length ? "demo" : "none",
  };
}
export function chooseAssets(assets, summary) {
  return assets
    .filter((a) => !a.used && ["Great", "Usable"].includes(a.analysis?.quality))
    .sort((a, b) => {
      const score = (a) =>
        (a.analysis.quality === "Great" ? 4 : 1) +
        (summary.ratio > 1 && a.type === "video"
          ? 4
          : summary.ratio !== null && summary.ratio < 1 && a.type === "photo"
            ? 4
            : 0) +
        (summary.closeRatio > 1 && a.analysis.tags?.includes("yakın plan")
          ? 2
          : 0);
      return score(b) - score(a);
    });
}
export function recommendation(assets, summary) {
  const ready = chooseAssets(assets, summary),
    asset = ready[0] || null;
  const label =
    summary.source === "demo"
      ? "Örnek verilere"
      : "Girdiğin son 30 günlük sonuçlara";
  return {
    asset,
    count: ready.length,
    source: summary.ratio !== null ? summary.source : "creative",
    reason:
      summary.ratio > 1 && asset?.type === "video"
        ? `${label} göre videolar fotoğraflardan ${summary.ratio} kat daha fazla görüntüleniyor. Bu videoyla devam edebilirsin.`
        : summary.ratio !== null && summary.ratio < 1 && asset?.type === "photo"
          ? `${label} göre fotoğrafların ortalama görüntülenmesi daha yüksek. Bu fotoğrafla devam edebilirsin.`
          : "Bu çekim kullanılmamış ve kalite kontrolünden geçti. Paylaşmadan önce pastanın net göründüğünü kontrol et.",
    capture:
      summary.ratio > 1
        ? `${label} göre kısa videolar iyi bir başlangıç. Bir sonraki pastayı süslerken kremayı sıkma kısmını 5–10 saniye çek.`
        : summary.closeRatio > 1
          ? "Yakın plan fotoğrafların daha fazla izleniyor. Bir sonraki çekimde pastaya biraz daha yaklaş."
          : "Bir sonraki pastanı gün ışığında, yakından çek. Ardından bitmiş pastayı yavaşça çevirerek kısa bir video ekle.",
  };
}
export function inventory(assets) {
  const unused = assets.filter((a) => !a.used),
    useful = unused.filter((a) => a.analysis?.quality !== "Skip");
  const photos = unused.filter((a) => a.type === "photo").length,
    videos = unused.filter((a) => a.type === "video").length;
  const usefulVideos = useful.filter((a) => a.type === "video").length,
    usefulPhotos = useful.filter((a) => a.type === "photo").length;
  const observation =
    usefulPhotos >= 3 && usefulVideos < 2
      ? " Fotoğraf stoğun iyi durumda ama kullanabileceğin videolar azaldı. Bir sonraki pastayı süslerken 5–10 saniyelik bir video çek."
      : useful.length < 3
        ? " İyi çekimlerin bitmek üzere; bir sonraki pasta yapımında üç kısa çekim ekle."
        : "";
  return {
    photos,
    videos,
    usefulVideos,
    usefulPhotos,
    used: assets.filter((a) => a.used).length,
    useful: useful.length,
    low: useful.length < 3,
    text: `${photos} kullanılmamış fotoğrafın, ${videos} kullanılmamış videon var. ${useful.length} çekim paylaşım için uygun görünüyor.${observation}`,
  };
}
export function templatePost(assets, profile = businessDefaults, summary = {}) {
  const a = assets[0],
    chocolate = a.analysis.tags?.includes("çikolata");
  const format =
    assets.length > 1
      ? "Carousel"
      : a.type === "video"
        ? "Reel"
        : a.analysis.format === "Story"
          ? "Story"
          : "Single image";
  return {
    format,
    caption: chocolate
      ? "Çikolatanın en güzel hali, mutfakta geçirdiğimiz bu küçük anlarda saklı.\n\nHer katını, her detayını severek hazırladık. Sizin kutlamanızda da bir dilim mutluluğumuz olsun 🤎"
      : "Bu hafta mutfaktan küçük bir paylaşım.\n\nHer detayına özen gösterdiğimiz hazırlıklardan, güzel bir kutlamaya… Sizin özel gününüze de tatlı bir dokunuş katmak isteriz.",
    overlay: chocolate
      ? "Biraz çikolata, çokça emek."
      : "Güzel günlere tatlı bir dokunuş.",
    cta: "Özel pasta siparişleri için bize DM’den ulaşabilirsiniz.",
    hashtags: [
      `#${profile.name.replace(/[^\p{L}\p{N}]/gu, "")}`,
      "#ÖzelPasta",
      "#PastaTasarımı",
    ],
    edits:
      a.type === "video"
        ? "Pastanın net göründüğü 8–12 saniyeyi seç. 9:16 kırp ve yazıyı üst kısma ekle. Seçilen kareyi kapak olarak kullan; hareketi ve sesi paylaşmadan önce kontrol et."
        : format === "Story"
          ? "9:16 kırp. Pastayı ortala ve yazı için üstte boşluk bırak."
          : assets.length > 1
            ? "Her fotoğrafı 4:5 kırp. En net çekimi ilk sıraya koy; detayları sonraki karelerde göster."
            : "Pastayı ortalayarak 4:5 kırp. Detayları görünür bırak; doğal renkleri koru.",
    reason:
      assets.length > 1
        ? "Bu çekimleri birlikte seçtin. İlk karede pastayı, sonraki karelerde detaylarını gösterebilirsin."
        : recommendation(
            assets.map((x) => ({ ...x, used: false })),
            summary,
          ).reason,
    source: "template",
  };
}
