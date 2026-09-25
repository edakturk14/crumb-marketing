// Adapter boundary: production OAuth + pagination + normalized insights can replace this object.
// No remote authentication or publishing is performed in the local MVP.
export const instagram = {
  mode: "mock",
  async connect() {
    return {
      connected: true,
      mode: "mock",
      username: "cakegallerymaslak",
      connectedAt: new Date().toISOString(),
    };
  },
  async historicalMedia() {
    return Array.from({ length: 10 }, (_, i) => {
      const video = i % 2 === 0;
      return {
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
        tags: video ? ["süsleme"] : i < 6 ? ["yakın plan"] : ["geniş çekim"],
        title: video ? "Pasta süsleme videosu" : "Bitmiş pasta fotoğrafı",
        thumbnail: `/demo/${video ? "chocolate" : "pink"}.jpg`,
      };
    });
  },
};
