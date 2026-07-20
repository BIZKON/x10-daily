/**
 * Demo fixtures для admin когда apps/api недоступен.
 *
 * Назначение — показать редактору как UI выглядит с данными, не разворачивая
 * Neon + wrangler + миграции. Все UUIDs стабильные → клик по карточке очереди
 * ведёт на корректную detail-страницу с тем же mock.
 *
 * Активируется автоматически когда X10_API_BASE_URL не задан / API недоступен.
 * Полная активация — banner вверху layout'а (см. components/demo-banner.tsx).
 */

import type {
  AdminAuthor,
  AdminDigest,
  AdminEvent,
  AdminPipelineConfig,
  ArticleDetail,
  PipelineAgent,
  PipelineRunStats,
  PostingControl,
  QueueItem,
  QueueResponse,
} from "./api";

/* ----------------------------------------------------------------
 * Queue (3 статьи на разных этапах ревью)
 * ---------------------------------------------------------------- */

const QUEUE_ITEMS: QueueItem[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "ii-agenty-msp-doshli-do-tipovyh-zadach",
    section: "numbers",
    category: "news",
    subcategory: "news.adoption",
    template: "card-news",
    tags: ["ИИ-агенты", "МСП", "автоматизация"],
    tease: "ИИ-агенты дошли до типовых задач малого бизнеса",
    lede: "Обработка заявок, документы и отчёты — типовые процессы МСП теперь закрываются готовыми ИИ-решениями. Порог входа упал до недель.",
    wordCount: 270,
    readSeconds: 30,
    createdAt: "2026-05-26T06:14:00.000Z",
    scoreTotal: 41,
    scoreVerdict: "Готово к publish",
    factcheckStatus: "passed",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    slug: "keys-ii-agent-na-vhodyashchih-zayavkah",
    section: "main",
    category: "cases",
    subcategory: "cases.sales",
    template: "deep-dive",
    tags: ["кейс", "продажи", "внедрение"],
    tease: "ИИ-агент на входящих заявках: минус 70% времени обработки",
    lede: "Сервисная компания перевела первичную обработку заявок на ИИ-агента. Что изменилось в цифрах, где споткнулись и какие 5 уроков для МСБ.",
    wordCount: 1820,
    readSeconds: 545,
    createdAt: "2026-05-26T11:42:00.000Z",
    scoreTotal: 37,
    scoreVerdict: "Перепиши открывалку — слабый hook",
    factcheckStatus: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    slug: "razbor-pochemu-vnedreniya-ii-ne-okupayutsya",
    section: "people",
    category: "founder",
    subcategory: "founder.take",
    template: "daily-take",
    tags: ["разбор", "внедрение", "выгода"],
    tease: "Почему половина внедрений ИИ не окупается",
    lede: "Разбор от основателя: где бизнес теряет деньги на ИИ-хайпе и что посчитать до старта проекта.",
    wordCount: 180,
    readSeconds: 54,
    createdAt: "2026-05-27T07:08:00.000Z",
    scoreTotal: 44,
    scoreVerdict: "Готово к publish",
    factcheckStatus: "passed",
  },
];

export const MOCK_QUEUE: QueueResponse = {
  items: QUEUE_ITEMS,
  count: QUEUE_ITEMS.length,
};

/* ----------------------------------------------------------------
 * Rich article detail — для одной из статей очереди (#001).
 * Содержит полный body + metadata (scorecard, hooks, social, factcheck).
 * ---------------------------------------------------------------- */

export const MOCK_ARTICLE_DETAIL: ArticleDetail = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "ii-agenty-msp-doshli-do-tipovyh-zadach",
  section: "numbers",
  category: "news",
  subcategory: "news.adoption",
  template: "card-news",
  tags: ["ИИ-агенты", "МСП", "автоматизация"],
  coverImageUrl: null,
  status: "ready",
  tease: "ИИ-агенты дошли до типовых задач малого бизнеса",
  lede: "Обработка заявок, документы и отчёты — типовые процессы МСП теперь закрываются готовыми ИИ-решениями. Порог входа упал до недель.",
  whyItMatters:
    "Внедрение ИИ-агента перестало требовать штатного разработчика. Для МСП это вопрос недель и десятков тысяч рублей, а не кварталов и миллионов.",
  body: [
    {
      type: "callout",
      kind: "why",
      text: "ИИ-агенты перестали быть темой корпораций. Типовые процессы МСП — первичная обработка заявок, документооборот, отчёты — уже закрываются готовыми решениями без штата разработчиков.",
    },
    {
      type: "numbers",
      items: [
        {
          label: "Срок пилотного внедрения",
          value: "2-4 недели",
          source: "https://ai-index.example.ru/msp-2026",
        },
        {
          label: "Экономия на обработке заявки",
          value: "−70%",
          source: "https://ai-index.example.ru/msp-2026",
        },
        {
          label: "Типовая окупаемость",
          value: "3-6 мес",
          source: "https://ai-index.example.ru/msp-2026",
        },
      ],
    },
    {
      type: "quote",
      text: "Мы не нанимали разработчика. Агент разобрал очередь заявок за первую неделю — дальше считали только сэкономленные часы.",
      attribution: "Мария Ковалёва · директор сервисной компании · интервью для выпуска",
    },
    {
      type: "callout",
      kind: "yes-but",
      text: "Половина проектов буксует на данных: если заявки живут в чатах и Excel без структуры, агенту нечего автоматизировать. Сначала процесс — потом ИИ.",
    },
    {
      type: "callout",
      kind: "what-next",
      text: "Посчитать часы на рутинных операциях за месяц и сравнить со стоимостью пилота. Если экономия видна на калькуляторе — запускать пилот на одном процессе.",
    },
  ],
  wordCount: 270,
  readSeconds: 30,
  citations: [
    {
      url: "https://ai-index.example.ru/msp-2026",
      title: "Индекс автоматизации МСП 2026 (демо-фикстура)",
      publisher: "Демо-данные",
      publishedAt: "2026-05-26",
    },
    {
      url: "https://ai-index.example.ru/msp-2026/method",
      title: "Методика расчёта (демо-фикстура)",
      publisher: "Демо-данные",
      publishedAt: "2026-05-10",
    },
  ],
  publishedAt: null,
  createdAt: "2026-05-26T06:14:00.000Z",
  metadata: {
    brevity: {
      beforeWords: 412,
      afterWords: 270,
      cuts: [
        "Удалил преамбулу про историю нейросетей",
        "Слил два абзаца про окупаемость в один с цифрой",
        "Сократил цитату директора до одной фразы",
      ],
    },
    score: {
      total: 41,
      verdict: "Готово к publish с лёгкими правками открывалки",
      breakdown: {
        hookStrength: 8,
        voiceMatch: 9,
        valueDensity: 9,
        structureFormat: 8,
        publishReadiness: 7,
      },
      fixes: [
        {
          criterion: "hookStrength",
          issue: "tease не содержит дельты или контр-факта",
          suggestion:
            "Заменить на «ИИ-агенты за 2 недели: типовые задачи МСП закрываются без разработчика»",
        },
      ],
    },
    hooks: [
      {
        pattern: "number-led",
        text: "−70% времени на заявку — без найма разработчика",
        reasoning: "Конкретное число + снятое возражение",
      },
      {
        pattern: "contrarian",
        text: "ИИ-хайп прошёл. Осталась экономия часов",
        reasoning: "Ломает ожидание «ИИ — это дорого и сложно»",
      },
      {
        pattern: "transformation",
        text: "Было: разбор заявок вручную. Стало: агент за 2 недели",
        reasoning: "До/после, подсвечивает скорость внедрения",
      },
      {
        pattern: "authority",
        text: "Директор сервисной компании: считали только сэкономленные часы",
        reasoning: "Прямая цитата практика",
      },
      {
        pattern: "admission",
        text: "Половина внедрений буксует на данных",
        reasoning: "Признание неприятного факта — анти-хайп",
      },
      {
        pattern: "future-shock",
        text: "Что будет с ценой заявки, когда агенты станут нормой",
        reasoning: "Сценарный вопрос на будущее",
      },
    ],
    social: {
      channel: "tg-x10",
      framework: "BAB",
      post: "ИИ-агенты дошли до типовых задач малого бизнеса.\n\nПорог входа упал до недель.\n\nЧто это значит для МСП:\n— Пилот за 2-4 недели без штатного разработчика\n— Минус 70% времени на обработку заявки\n— Окупаемость 3-6 месяцев\n\nЧитать в ProAgent AI →",
      hookLine: "ИИ-агенты дошли до типовых задач малого бизнеса",
      twistLine: "Порог входа упал до недель",
      wordCount: 38,
      lineCount: 9,
    },
    factcheck: {
      status: "passed",
      haltReason: null,
      claims: [
        {
          claim: "Пилотное внедрение занимает 2-4 недели",
          location: "body[1]",
          verdict: "supported",
          confidence: "high",
          rationale: "Демо-фикстура: цифра подтверждена источником в citations.",
        },
        {
          claim: "Экономия времени на заявку −70%",
          location: "body[1]",
          verdict: "supported",
          confidence: "high",
          rationale: "Демо-фикстура: цифра подтверждена источником в citations.",
        },
      ],
    },
    totalCostUsd: 0.084,
  },
};

/* ----------------------------------------------------------------
 * Authors (4 профиля, один flagship — основатель)
 * ---------------------------------------------------------------- */

export const MOCK_AUTHORS: AdminAuthor[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    slug: "founder",
    name: "Основатель ProAgent AI",
    role: "Основатель · внедрение ИИ-агентов",
    bio: "Основатель ProAgent AI. Разборы внедрений от первого лица: кейсы, цифры выгоды, ошибки. Без хайпа, без регалий в шапке.",
    avatarUrl: null,
    bylineColor: "linear-gradient(135deg, #E63946, #D4A24C)",
    isStaff: true,
    isFlagship: true,
    subscriberCount: 24180,
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    slug: "redakciya-proagent",
    name: "Редакция ProAgent AI",
    role: "Нейтральная редакция",
    bio: "Авто-контент конвейера: новости ИИ для малого и среднего бизнеса в формате Smart Brevity, с цифрами и источниками.",
    avatarUrl: null,
    bylineColor: "#1F2937",
    isStaff: true,
    isFlagship: false,
    subscriberCount: 2840,
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    slug: "elena-smirnova",
    name: "Елена Смирнова",
    role: "Эксперт по автоматизации · гостевой автор",
    bio: "Внедряет CRM и ИИ-агентов в рознице и сервисном бизнесе. Разборы для рубрики howto.",
    avatarUrl: null,
    bylineColor: "#D4A24C",
    isStaff: false,
    isFlagship: false,
    subscriberCount: 1120,
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    slug: "pavel-orlov",
    name: "Павел Орлов",
    role: "Юрист · гостевой автор",
    bio: "Персональные данные и 152-ФЗ при внедрении ИИ. Разборы для рубрики business — что проверить до запуска агента.",
    avatarUrl: null,
    bylineColor: "#3FB950",
    isStaff: false,
    isFlagship: false,
    subscriberCount: 480,
  },
];

/* ----------------------------------------------------------------
 * Events (3 upcoming + 2 past)
 * ---------------------------------------------------------------- */

const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(19, 0, 0, 0);
  return d.toISOString();
};

export const MOCK_EVENTS: AdminEvent[] = [
  {
    id: "30000000-0000-0000-0000-000000000001",
    slug: "ii-agenty-dlya-msb-webinar-jun",
    title: "ИИ-агенты для малого бизнеса · вебинар",
    type: "webinar",
    startDate: dayOffset(8),
    endDate: null,
    city: null,
    isOnline: true,
    organizer: "ProAgent AI",
    ticketPriceFrom: null,
    registeredCount: 420,
    capacity: 500,
    seatsLeft: 80,
  },
  {
    id: "30000000-0000-0000-0000-000000000002",
    slug: "demo-den-ii-resheniy-2026",
    title: "Демо-день ИИ-решений для бизнеса",
    type: "festival",
    startDate: dayOffset(45),
    endDate: dayOffset(46),
    city: "Москва",
    isOnline: false,
    organizer: "ProAgent AI",
    ticketPriceFrom: 25000,
    registeredCount: 1240,
    capacity: 2000,
    seatsLeft: 760,
  },
  {
    id: "30000000-0000-0000-0000-000000000003",
    slug: "biznes-zavtrak-ii-v-prodazhah-jul",
    title: "Бизнес-завтрак: ИИ в продажах",
    type: "breakfast",
    startDate: dayOffset(14),
    endDate: null,
    city: "Москва",
    isOnline: false,
    organizer: "ProAgent AI",
    ticketPriceFrom: null,
    registeredCount: 28,
    capacity: 40,
    seatsLeft: 12,
  },
  {
    id: "30000000-0000-0000-0000-000000000004",
    slug: "mitap-razbor-keysov-avtomatizatsii-may",
    title: "Митап: разбор кейсов автоматизации",
    type: "meet-up",
    startDate: dayOffset(-12),
    endDate: null,
    city: "Санкт-Петербург",
    isOnline: false,
    organizer: "ProAgent AI",
    ticketPriceFrom: 3000,
    registeredCount: 120,
    capacity: 120,
    seatsLeft: 0,
  },
  {
    id: "30000000-0000-0000-0000-000000000005",
    slug: "avtomatizatsiya-dokumentov-webinar-apr",
    title: "Автоматизация документооборота с ИИ · вебинар",
    type: "webinar",
    startDate: dayOffset(-30),
    endDate: null,
    city: null,
    isOnline: true,
    organizer: "ProAgent AI",
    ticketPriceFrom: null,
    registeredCount: 840,
    capacity: null,
    seatsLeft: null,
  },
];

/* ----------------------------------------------------------------
 * Digest (1 latest)
 * ---------------------------------------------------------------- */

export const MOCK_DIGEST_LATEST: AdminDigest = {
  id: "40000000-0000-0000-0000-000000000001",
  issueDate: new Date().toISOString().slice(0, 10),
  intro:
    "Понедельник, утренний выпуск ProAgent AI. Новости ИИ, кейс автоматизации заявок, разбор от основателя. Поехали.",
  topArticleIds: QUEUE_ITEMS.map((q) => q.id),
  tomorrow: "Завтра разберём ИИ-агентов в рознице и что изменили новые тарифы API.",
  sentAt: null,
};

/* ----------------------------------------------------------------
 * Lookups by slug/id для detail-страниц.
 * ---------------------------------------------------------------- */

export function findMockAuthor(slug: string): AdminAuthor | undefined {
  return MOCK_AUTHORS.find((a) => a.slug === slug);
}

export function findMockEvent(slug: string): AdminEvent | undefined {
  return MOCK_EVENTS.find((e) => e.slug === slug);
}

export function findMockArticleDetail(id: string): ArticleDetail | undefined {
  return MOCK_ARTICLE_DETAIL.id === id ? MOCK_ARTICLE_DETAIL : undefined;
}

export function findMockDigest(date: string): AdminDigest | undefined {
  return MOCK_DIGEST_LATEST.issueDate === date ? MOCK_DIGEST_LATEST : undefined;
}

/* ----------------------------------------------------------------
 * Pipeline configs — 12 агентов с дефолтами (enabled=true, override=null,
 * threshold=0.700). Дублирует schema defaults — для demo mode без api.
 *
 * Несколько демо-вариаций для эстетики (factcheck с threshold 0.85,
 * audio/visual disabled — отражает планируемое состояние "scaffold").
 * ---------------------------------------------------------------- */

const PIPELINE_DEFAULT_CONFIG = {
  enabled: true,
  modelOverride: null,
  confidenceThreshold: "0.700",
} as const;

function mockConfig(
  agent: PipelineAgent,
  overrides: Partial<Omit<AdminPipelineConfig, "agent">> = {},
): AdminPipelineConfig {
  return { agent, ...PIPELINE_DEFAULT_CONFIG, ...overrides };
}

export const MOCK_PIPELINE_CONFIGS: AdminPipelineConfig[] = [
  mockConfig("ingest"),
  mockConfig("draft"),
  mockConfig("numbers"),
  mockConfig("factcheck", { confidenceThreshold: "0.850" }),
  mockConfig("tov"),
  mockConfig("brevity"),
  mockConfig("audio", { enabled: false }),
  mockConfig("hookgen"),
  mockConfig("social"),
  mockConfig("visual", { enabled: false }),
  mockConfig("score"),
  mockConfig("newsletter"),
];

/* ----------------------------------------------------------------
 * $-дашборд (session 20) — demo fixture. Статичные timestamp'ы (без Date.now)
 * чтобы не запекать время в prerender (см. api.ts NEXT_PHASE guard).
 * ---------------------------------------------------------------- */
export const MOCK_PIPELINE_RUN_STATS: PipelineRunStats = {
  budget: { capUsd: 15, warnUsd: 9, todaySpendUsd: 4.21, todayRuns: 38, pct: 28 },
  byAgent: [
    { agent: "ingest", runs: 34, spendUsd: 0.39 },
    { agent: "draft", runs: 8, spendUsd: 3.82 },
  ],
  series7d: [
    { day: "2026-05-29", spendUsd: 5.4, runs: 41 },
    { day: "2026-05-30", spendUsd: 6.1, runs: 47 },
    { day: "2026-05-31", spendUsd: 3.2, runs: 22 },
    { day: "2026-06-01", spendUsd: 7.8, runs: 58 },
    { day: "2026-06-02", spendUsd: 9.3, runs: 64 },
    { day: "2026-06-03", spendUsd: 5.9, runs: 44 },
    { day: "2026-06-04", spendUsd: 4.21, runs: 38 },
  ],
  gateToday: { accepted: 8, skipped: 26 },
  recent: [
    {
      agent: "draft",
      status: "succeeded",
      costUsd: 0.47,
      modelUsed: "anthropic/claude-sonnet-4-6",
      articleId: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-06-04T18:02:24.000Z",
    },
    {
      agent: "ingest",
      status: "skipped",
      costUsd: 0.0011,
      modelUsed: "anthropic/claude-haiku-4-5",
      articleId: null,
      createdAt: "2026-06-04T18:00:12.000Z",
    },
    {
      agent: "ingest",
      status: "succeeded",
      costUsd: 0.0013,
      modelUsed: "anthropic/claude-haiku-4-5",
      articleId: null,
      createdAt: "2026-06-04T17:55:03.000Z",
    },
  ],
  alertsToday: [],
};

/** Стоп-кран автопостинга (session 20) — demo: тихие часы 21→09 включены. */
export const MOCK_POSTING_CONTROL: PostingControl = {
  paused: false,
  quietEnabled: true,
  quietStartHour: 21,
  quietEndHour: 9,
  updatedAt: "2026-06-04T18:00:00.000Z",
  currentlyPaused: false,
  pauseReason: null,
  mskHour: 14,
};
