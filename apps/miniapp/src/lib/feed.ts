/**
 * Daily feed loader. На M0 — статический mock (см. CLAUDE.md §10),
 * позже переключим на fetch к @x10/api через c.env.API_BASE_URL.
 */

export type FeedSection =
  | "main"
  | "numbers"
  | "people"
  | "playbook"
  | "weekend"
  | "longread"
  | "newsletter";

export type FeedItem = {
  id: string;
  slug: string;
  section: FeedSection;
  tease: string;
  lede: string;
  readSeconds: number;
  isPaid: boolean;
  publishedAt: string;
};

const MOCK_ITEMS: FeedItem[] = [
  {
    id: "mock-1",
    slug: "cb-rate-hike-2026-05",
    section: "main",
    tease: "ЦБ держит ключевую на 16% — четвёртое заседание подряд",
    lede:
      "Эльвира Набиуллина подтвердила: инфляция стабильна около 7.4% год к году, но риски второго полугодия требуют осторожности.",
    readSeconds: 28,
    isPaid: false,
    publishedAt: "2026-05-26T06:00:00.000Z",
  },
  {
    id: "mock-2",
    slug: "ozon-q1-revenue-record",
    section: "numbers",
    tease: "Ozon: выручка Q1 2026 — 312 млрд ₽, GMV вырос на 41%",
    lede:
      "Маркетплейс отчитался: первый раз за три года положительная EBITDA сегмента e-commerce — 8.2 млрд ₽.",
    readSeconds: 25,
    isPaid: false,
    publishedAt: "2026-05-26T05:45:00.000Z",
  },
  {
    id: "mock-3",
    slug: "rybakov-fund-school-program",
    section: "people",
    tease: "Фонд Рыбакова закрывает «Школу-2030» — итоги 7 лет",
    lede:
      "За программу прошли 2 100 директоров из 73 регионов. Игорь объявил переход к новой инициативе — «Учитель будущего».",
    readSeconds: 30,
    isPaid: false,
    publishedAt: "2026-05-26T05:30:00.000Z",
  },
  {
    id: "mock-4",
    slug: "ai-pipeline-cost-benchmark",
    section: "playbook",
    tease: "Сколько стоит AI-редакция в 2026: бенчмарк 12 медиа",
    lede:
      "Средняя себестоимость статьи: $0.42-1.80. Лидеры — те, кто разделил pipeline на дешёвые Haiku-проходы и точечные Sonnet/Opus.",
    readSeconds: 27,
    isPaid: true,
    publishedAt: "2026-05-26T05:15:00.000Z",
  },
];

export async function loadDailyFeed(limit = 20): Promise<FeedItem[]> {
  // TODO(layer-4): switch to fetch(`${API_BASE_URL}/v1/feed/daily?limit=${limit}`)
  // когда Layer 4 (workers + Inngest) поднимет реальный ingest.
  return MOCK_ITEMS.slice(0, limit);
}

export async function loadArticle(slug: string): Promise<FeedItem | null> {
  return MOCK_ITEMS.find((i) => i.slug === slug) ?? null;
}
