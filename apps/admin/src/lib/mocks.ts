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
  AdminKlamp,
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
    slug: "tsb-derzhit-stavku-17",
    section: "numbers",
    category: "money",
    subcategory: "money.cbr",
    template: "card-news",
    tags: ["ЦБ", "ставка", "малый-бизнес"],
    tease: "ЦБ держит 17% — четвёртое заседание подряд",
    lede: "Совет директоров ЦБ сохранил ключевую ставку на уровне 17%. Кредитное окно для МСП остаётся закрытым минимум до сентября.",
    wordCount: 270,
    readSeconds: 30,
    createdAt: "2026-05-26T06:14:00.000Z",
    scoreTotal: 41,
    scoreVerdict: "Готово к publish",
    factcheckStatus: "passed",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    slug: "wildberries-kupil-tri-taksi",
    section: "main",
    category: "practice",
    subcategory: "practice.teardowns",
    template: "deep-dive",
    tags: ["маркетплейсы", "wildberries", "логистика"],
    tease: "Wildberries собирает логистическую империю",
    lede: "Маркетплейс купил три такси-сервиса за квартал. Что это даёт WB, что теряют продавцы, и какие 5 уроков для российского ритейла.",
    wordCount: 1820,
    readSeconds: 545,
    createdAt: "2026-05-26T11:42:00.000Z",
    scoreTotal: 37,
    scoreVerdict: "Перепиши открывалку — слабый hook",
    factcheckStatus: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    slug: "rybakov-ne-veryu-startapy",
    section: "people",
    category: "rybakov",
    subcategory: "rybakov.daily",
    template: "daily-take",
    tags: ["Рыбаков", "стартапы", "инвестиции"],
    tease: "Почему я не верю в стартап-инвестиции в 2026",
    lede: "«Хайп-экономика заканчивается. Что покупать вместо стартапов».",
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
  slug: "tsb-derzhit-stavku-17",
  section: "numbers",
  category: "money",
  subcategory: "money.cbr",
  template: "card-news",
  tags: ["ЦБ", "ставка", "малый-бизнес"],
  coverImageUrl: null,
  status: "ready",
  tease: "ЦБ держит 17% — четвёртое заседание подряд",
  lede: "Совет директоров ЦБ сохранил ключевую ставку на уровне 17%. Кредитное окно для МСП остаётся закрытым минимум до сентября.",
  whyItMatters:
    "При ставке 17% IRR проектов МСП в среднем ниже стоимости долга. Время оборотки собственным капиталом, а не банковским.",
  body: [
    {
      type: "callout",
      kind: "why",
      text: "Кредитное окно для МСП технически закрыто. Банки кредитуют только по эффективной ставке 22-25%, что выше IRR большинства торговых проектов.",
    },
    {
      type: "numbers",
      items: [
        { label: "Ключевая ставка", value: "17%", source: "https://www.cbr.ru/press/keypr/" },
        { label: "Инфляция апрель", value: "8.9%", source: "https://rosstat.gov.ru/" },
        {
          label: "Кредитов МСП за квартал",
          value: "−14%",
          source: "https://www.cbr.ru/statistics/",
        },
      ],
    },
    {
      type: "quote",
      text: "Решение сохранить ставку — это сигнал бизнесу: ждать снижения раньше осени не стоит.",
      attribution: "Эльвира Набиуллина · пресс-конференция ЦБ · 26 мая 2026",
    },
    {
      type: "callout",
      kind: "yes-but",
      text: "Регулятор оставляет окно для снижения в сентябре, если базовая инфляция стабильно опустится ниже 8%.",
    },
    {
      type: "callout",
      kind: "what-next",
      text: "Следить за PMI Manufacturing июнь и решением ЦБ 18 июля. До тех пор — оборотный капитал из прибыли, не из долга.",
    },
  ],
  wordCount: 270,
  readSeconds: 30,
  citations: [
    {
      url: "https://www.cbr.ru/press/keypr/",
      title: "Решение по ключевой ставке",
      publisher: "Банк России",
      publishedAt: "2026-05-26",
    },
    {
      url: "https://rosstat.gov.ru/storage/mediabank/inflation-april-2026.pdf",
      title: "Инфляция в апреле 2026",
      publisher: "Росстат",
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
        "Удалил преамбулу про историю ставок с 2014 года",
        "Слил два абзаца про IRR в один с цифрой",
        "Сократил Набиуллину до одной фразы",
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
          suggestion: "Заменить на «ЦБ держит 17% — кредитное окно закрыто до сентября»",
        },
      ],
    },
    hooks: [
      {
        pattern: "number-led",
        text: "17% — четвёртое заседание подряд",
        reasoning: "Конкретное число + временной маркер",
      },
      {
        pattern: "contrarian",
        text: "Все ждут снижения. ЦБ не снизит",
        reasoning: "Ломает консенсус ожиданий рынка",
      },
      {
        pattern: "transformation",
        text: "Было 21%, стало 17% — ничего не поменялось",
        reasoning: "До/после, подсвечивает иллюзию изменений",
      },
      {
        pattern: "authority",
        text: "Набиуллина: ждать снижения раньше осени не стоит",
        reasoning: "Прямая цитата главы ЦБ",
      },
      {
        pattern: "admission",
        text: "Кредитное окно для МСП закрыто",
        reasoning: "Признание неприятного факта для предпринимателей",
      },
      {
        pattern: "future-shock",
        text: "Что будет если ЦБ удержит ставку до Q4",
        reasoning: "Сценарный вопрос на будущее",
      },
    ],
    social: {
      channel: "tg-x10",
      framework: "BAB",
      post: "ЦБ держит ставку 17%.\n\nЧетвёртое заседание подряд без изменений.\n\nЧто это значит для бизнеса:\n— Кредитное окно для МСП закрыто до сентября\n— IRR проектов ниже стоимости долга\n— Время оборотки собственным капиталом\n\nЧитать полностью на x10daily.",
      hookLine: "ЦБ держит ставку 17%",
      twistLine: "Четвёртое заседание подряд",
      wordCount: 38,
      lineCount: 9,
    },
    factcheck: {
      status: "passed",
      haltReason: null,
      claims: [
        {
          claim: "ЦБ сохранил ставку 17%",
          location: "lede",
          verdict: "supported",
          confidence: "high",
          rationale: "Источник cbr.ru/press/keypr подтверждает решение от 26 мая 2026.",
        },
        {
          claim: "Инфляция апреля 8.9%",
          location: "body[1]",
          verdict: "supported",
          confidence: "high",
          rationale: "Росстат данные за апрель 2026 подтверждают цифру.",
        },
      ],
    },
    totalCostUsd: 0.084,
  },
};

/* ----------------------------------------------------------------
 * Authors (4 профиля, один flagship — Рыбаков)
 * ---------------------------------------------------------------- */

export const MOCK_AUTHORS: AdminAuthor[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    slug: "igor-rybakov",
    name: "Игорь Рыбаков",
    role: "Сооснователь Технониколь · грандмастер Х10",
    bio: "Сооснователь Технониколь, основатель Х10. Главный авторский голос медиа: ежедневные реакции, авторские эссе, разборы. Без регалий в шапке, без инфобиза.",
    avatarUrl: null,
    bylineColor: "linear-gradient(135deg, #E63946, #D4A24C)",
    isStaff: true,
    isFlagship: true,
    subscriberCount: 24180,
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    slug: "olga-slobodyanik",
    name: "Ольга Слободяник",
    role: "Главный редактор",
    bio: "Управляет редполитикой Х10 Daily. 12 лет в деловой журналистике (Forbes, Frank Media).",
    avatarUrl: null,
    bylineColor: "#1F2937",
    isStaff: true,
    isFlagship: false,
    subscriberCount: 2840,
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    slug: "ruslan-boisov",
    name: "Руслан Боисов",
    role: "Идеолог · рубрики и стратегия",
    bio: "Концепция рубрик, бенчмаркинг с международными деловыми медиа.",
    avatarUrl: null,
    bylineColor: "#D4A24C",
    isStaff: true,
    isFlagship: false,
    subscriberCount: 1120,
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    slug: "dmitry-kostalgin",
    name: "Дмитрий Костальгин",
    role: "Налоговый адвокат · гостевой автор",
    bio: "Партнёр Taxadvisor. Разборы для рубрики taxes.guides — переход с УСН на ОСН, налоговые споры.",
    avatarUrl: null,
    bylineColor: "#3FB950",
    isStaff: false,
    isFlagship: false,
    subscriberCount: 480,
  },
];

/* ----------------------------------------------------------------
 * Klamps (5 клампов по разным городам)
 * ---------------------------------------------------------------- */

export const MOCK_KLAMPS: AdminKlamp[] = [
  {
    id: "20000000-0000-0000-0000-000000000001",
    slug: "digital-breakthrough-krd",
    name: "Кламп «Цифровой прорыв»",
    city: "Краснодар",
    country: "РФ",
    leadName: "Алексей Петров",
    memberCount: 8,
    isOpen: true,
    meetingSchedule: "каждый второй четверг 19:00",
    description: "Малая группа предпринимателей в IT и e-commerce. Совместная цель на 90 дней.",
    goal: "Запустить совместный AI-сервис за 90 дней",
  },
  {
    id: "20000000-0000-0000-0000-000000000002",
    slug: "msk-traders",
    name: "Кламп «Трейдеры Москвы»",
    city: "Москва",
    country: "РФ",
    leadName: "Мария Иванова",
    memberCount: 10,
    isOpen: false,
    meetingSchedule: "каждую среду 20:00",
    description: "Торговля на маркетплейсах. Закрытая группа, набор по рекомендации.",
    goal: null,
  },
  {
    id: "20000000-0000-0000-0000-000000000003",
    slug: "spb-services",
    name: "Кламп «Услуги Петербурга»",
    city: "Санкт-Петербург",
    country: "РФ",
    leadName: "Дмитрий Соколов",
    memberCount: 7,
    isOpen: true,
    meetingSchedule: "первая суббота месяца 11:00",
    description: "Сервисный бизнес: салоны, клиники, медиа.",
    goal: "Внедрить AI-агентов на ресепшене",
  },
  {
    id: "20000000-0000-0000-0000-000000000004",
    slug: "kz-almaty",
    name: "Кламп «Алматы»",
    city: "Алматы",
    country: "KZ",
    leadName: "Айдар Жанибеков",
    memberCount: 12,
    isOpen: true,
    meetingSchedule: "каждый второй вторник 18:00",
    description: "Русскоязычные предприниматели в Казахстане. Релокация и ВЭД.",
    goal: null,
  },
  {
    id: "20000000-0000-0000-0000-000000000005",
    slug: "ae-dubai",
    name: "Кламп «Dubai»",
    city: "Дубай",
    country: "AE",
    leadName: "Игорь Володин",
    memberCount: 9,
    isOpen: true,
    meetingSchedule: "каждый месяц последняя пятница",
    description: "ОАЭ для русских предпринимателей. Free zones, банки, налоги.",
    goal: "Открыть совместный fulfillment-склад в Шардже",
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
    slug: "x10-meet-up-moscow-jun",
    title: "X10 Business Meet Up by Rybakov",
    type: "meet-up",
    startDate: dayOffset(8),
    endDate: null,
    city: "Москва",
    isOnline: false,
    organizer: "Х10 Москва",
    ticketPriceFrom: 5000,
    registeredCount: 420,
    capacity: 500,
    seatsLeft: 80,
  },
  {
    id: "30000000-0000-0000-0000-000000000002",
    slug: "kod-x10-2026",
    title: "КОД Х10 2026 · главное событие года",
    type: "kod-x10",
    startDate: dayOffset(45),
    endDate: dayOffset(46),
    city: "Москва",
    isOnline: false,
    organizer: "Х10",
    ticketPriceFrom: 25000,
    registeredCount: 1240,
    capacity: 2000,
    seatsLeft: 760,
  },
  {
    id: "30000000-0000-0000-0000-000000000003",
    slug: "klamp-breakfast-irkutsk-jul",
    title: "Кламперский бизнес-завтрак · Иркутск",
    type: "breakfast",
    startDate: dayOffset(14),
    endDate: null,
    city: "Иркутск",
    isOnline: false,
    organizer: "Кламп Иркутск",
    ticketPriceFrom: null,
    registeredCount: 28,
    capacity: 40,
    seatsLeft: 12,
  },
  {
    id: "30000000-0000-0000-0000-000000000004",
    slug: "x10-talks-ufa-may",
    title: "X10Talks: 7 историй о выходе из тени",
    type: "festival",
    startDate: dayOffset(-12),
    endDate: null,
    city: "Уфа",
    isOnline: false,
    organizer: "Х10 Уфа",
    ticketPriceFrom: 3000,
    registeredCount: 120,
    capacity: 120,
    seatsLeft: 0,
  },
  {
    id: "30000000-0000-0000-0000-000000000005",
    slug: "ai-for-business-webinar-apr",
    title: "AI-агенты для малого бизнеса · вебинар",
    type: "webinar",
    startDate: dayOffset(-30),
    endDate: null,
    city: null,
    isOnline: true,
    organizer: "Х10 Daily",
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
  intro: "Понедельник, утренний разбор. Ставка ЦБ, маркетплейсы, Рыбаков о стартапах. Поехали.",
  topArticleIds: QUEUE_ITEMS.map((q) => q.id),
  tomorrow: "Завтра разберём УСН 350 млн и реакцию рынка на ставку.",
  sentAt: null,
};

/* ----------------------------------------------------------------
 * Lookups by slug/id для detail-страниц.
 * ---------------------------------------------------------------- */

export function findMockAuthor(slug: string): AdminAuthor | undefined {
  return MOCK_AUTHORS.find((a) => a.slug === slug);
}

export function findMockKlamp(slug: string): AdminKlamp | undefined {
  return MOCK_KLAMPS.find((k) => k.slug === slug);
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
