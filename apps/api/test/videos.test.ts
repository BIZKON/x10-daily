import { describe, expect, it } from "vitest";
import { parseYoutubeFeed } from "../src/routes/videos";

// Усечённый реальный YouTube Atom-фид (канал «Игорь Рыбаков»): channel-level
// <title> + 2 entry (full /watch и short /shorts), entity в заголовке.
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Игорь Рыбаков</title>
  <entry>
    <id>yt:video:abc123</id>
    <yt:videoId>abc123</yt:videoId>
    <title>Бизнес в 2026: ИИ &amp; маркетплейсы</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
    <published>2026-06-07T09:00:00+00:00</published>
    <media:group>
      <media:thumbnail url="https://i4.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360"/>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:short99</id>
    <yt:videoId>short99</yt:videoId>
    <title>Смотри полное видео на канале Игорь Рыбаков</title>
    <link rel="alternate" href="https://www.youtube.com/shorts/short99"/>
    <published>2026-06-08T14:00:02+00:00</published>
  </entry>
</feed>`;

describe("parseYoutubeFeed", () => {
  const items = parseYoutubeFeed(FIXTURE);

  it("парсит обе записи, игнорирует channel-level <title>", () => {
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.title)).not.toContain("Игорь Рыбаков");
  });

  it("полное видео: id/title/url/thumbnail/published, isShort=false, entity раскодирован", () => {
    const v = items[0]!;
    expect(v.youtubeId).toBe("abc123");
    expect(v.title).toBe("Бизнес в 2026: ИИ & маркетплейсы");
    expect(v.url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(v.thumbnailUrl).toBe("https://i.ytimg.com/vi/abc123/hqdefault.jpg");
    expect(v.publishedAt).toBe("2026-06-07T09:00:00+00:00");
    expect(v.isShort).toBe(false);
  });

  it("short: isShort=true по /shorts/ в href", () => {
    const v = items[1]!;
    expect(v.youtubeId).toBe("short99");
    expect(v.url).toContain("/shorts/");
    expect(v.isShort).toBe(true);
  });

  it("пустой/мусорный xml → []", () => {
    expect(parseYoutubeFeed("")).toEqual([]);
    expect(parseYoutubeFeed("<feed></feed>")).toEqual([]);
  });
});
