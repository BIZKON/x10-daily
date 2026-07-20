/**
 * scripts/seed.ts — идемпотентные dev-фикстуры для ProAgent AI.
 *
 * Запуск:
 *   export DATABASE_URL='postgresql://...'
 *   pnpm db:seed
 *
 * Предусловие: миграции применены (0000_core → актуальная).
 *   pnpm --filter @x10/db db:migrate
 *
 * Безопасно гонять много раз: все insert через onConflictDoNothing()
 * по уникальным ключам (slug / issueDate / (platform, platformUserId)).
 * UUID-ы стабильные и совпадают с apps/admin/src/lib/mocks.ts, чтобы
 * demo mode и реальная БД давали один и тот же набор id.
 *
 * Объём: 4 users · 4 authors · 3 events · 2 articles · 1 digest.
 * Все цифры/цитаты в статьях — демо-фикстуры, НЕ реальные факты.
 */
import "dotenv/config";
import {
  events,
  type ArticleBlock,
  type Citation,
  articles,
  authors,
  createDb,
  digests,
  users,
} from "@x10/db";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "[seed] DATABASE_URL (или DIRECT_DATABASE_URL) не задана.\n" +
      "Установите переменную окружения или положите её в корневой .env:\n" +
      "  export DATABASE_URL='postgresql://...'",
  );
  process.exit(1);
}

const db = createDb(url);

const ID = {
  user: {
    editor: "f0000000-0000-0000-0000-000000000001",
    admin: "f0000000-0000-0000-0000-000000000002",
    reader: "f0000000-0000-0000-0000-000000000003",
    devReader: "f0000000-0000-0000-0000-000000000004",
  },
  author: {
    founder: "10000000-0000-0000-0000-000000000001",
    redakciya: "10000000-0000-0000-0000-000000000002",
    smirnova: "10000000-0000-0000-0000-000000000003",
    orlov: "10000000-0000-0000-0000-000000000004",
  },
  event: {
    msbWebinar: "30000000-0000-0000-0000-000000000001",
    breakfast: "30000000-0000-0000-0000-000000000003",
    docsWebinar: "30000000-0000-0000-0000-000000000005",
  },
  article: {
    newsAgents: "00000000-0000-0000-0000-000000000001",
    caseLeads: "00000000-0000-0000-0000-000000000002",
  },
  digest: {
    today: "40000000-0000-0000-0000-000000000001",
  },
} as const;

const NOW = new Date();
const dayOffset = (n: number): Date => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  d.setHours(19, 0, 0, 0);
  return d;
};
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

async function seedUsers() {
  await db
    .insert(users)
    .values([
      {
        id: ID.user.editor,
        platform: "web",
        platformUserId: "seed_editor_olga",
        username: "editor",
        displayName: "Редактор ProAgent AI",
        email: "editor@pro-agent-ai.ru",
        role: "editor",
        locale: "ru",
      },
      {
        id: ID.user.admin,
        platform: "web",
        platformUserId: "seed_admin",
        username: "admin",
        displayName: "Admin",
        email: "admin@pro-agent-ai.ru",
        role: "admin",
        locale: "ru",
      },
      {
        id: ID.user.reader,
        platform: "telegram",
        platformUserId: "seed_tg_reader",
        username: "reader",
        displayName: "Пилотный читатель",
        role: "reader",
        locale: "ru",
      },
      {
        id: ID.user.devReader,
        platform: "telegram",
        platformUserId: "seed_tg_dev",
        username: "dev_user",
        displayName: "Dev Reader",
        role: "reader",
        locale: "ru",
      },
    ])
    .onConflictDoNothing();
  return 4;
}

async function seedAuthors() {
  await db
    .insert(authors)
    .values([
      {
        id: ID.author.founder,
        slug: "founder",
        name: "Основатель ProAgent AI",
        role: "Основатель · внедрение ИИ-агентов",
        bio: "Основатель ProAgent AI. Разборы внедрений от первого лица: кейсы, цифры выгоды, ошибки. Без хайпа, без регалий в шапке.",
        bylineColor: "#E63946",
        isStaff: true,
        isFlagship: true,
        subscriberCount: 24180,
      },
      {
        id: ID.author.redakciya,
        slug: "redakciya-proagent",
        name: "Редакция ProAgent AI",
        role: "Нейтральная редакция",
        bio: "Авто-контент конвейера: новости ИИ для малого и среднего бизнеса в формате Smart Brevity, с цифрами и источниками.",
        bylineColor: "#1F2937",
        isStaff: true,
        isFlagship: false,
        subscriberCount: 2840,
        userId: ID.user.editor,
      },
      {
        id: ID.author.smirnova,
        slug: "elena-smirnova",
        name: "Елена Смирнова",
        role: "Эксперт по автоматизации · гостевой автор",
        bio: "Внедряет CRM и ИИ-агентов в рознице и сервисном бизнесе. Разборы для рубрики howto.",
        bylineColor: "#D4A24C",
        isStaff: false,
        isFlagship: false,
        subscriberCount: 1120,
      },
      {
        id: ID.author.orlov,
        slug: "pavel-orlov",
        name: "Павел Орлов",
        role: "Юрист · гостевой автор",
        bio: "Персональные данные и 152-ФЗ при внедрении ИИ. Разборы для рубрики business — что проверить до запуска агента.",
        bylineColor: "#3FB950",
        isStaff: false,
        isFlagship: false,
        subscriberCount: 480,
      },
    ])
    .onConflictDoNothing();
  return 4;
}

async function seedEvents() {
  await db
    .insert(events)
    .values([
      {
        id: ID.event.msbWebinar,
        slug: "ii-agenty-dlya-msb-webinar-jun",
        title: "ИИ-агенты для малого бизнеса · вебинар",
        type: "webinar",
        startDate: dayOffset(8),
        timezone: "Europe/Moscow",
        city: null,
        isOnline: true,
        organizer: "ProAgent AI",
        ticketPriceFrom: null,
        speakerIds: [ID.author.founder, ID.author.smirnova],
        description:
          "Открытый вебинар: какие типовые задачи МСБ уже закрываются ИИ-агентами, с какими бюджетами и в какие сроки. Живые вопросы после разбора.",
        registeredCount: 420,
        capacity: 500,
      },
      {
        id: ID.event.breakfast,
        slug: "biznes-zavtrak-ii-v-prodazhah-jul",
        title: "Бизнес-завтрак: ИИ в продажах",
        type: "breakfast",
        startDate: dayOffset(14),
        timezone: "Europe/Moscow",
        city: "Москва",
        venue: {
          name: "Loft Hall",
          address: "Москва, Большой Овчинниковский пер., 16",
          lat: 55.7355,
          lng: 37.6275,
        },
        isOnline: false,
        organizer: "ProAgent AI",
        ticketPriceFrom: 3000,
        ticketUrl: null,
        speakerIds: [ID.author.founder],
        description:
          "Камерный бизнес-завтрак: разбор двух внедрений ИИ-агентов в отделах продаж. Цифры до/после, вопросы, нетворкинг.",
        registeredCount: 28,
        capacity: 40,
      },
      {
        id: ID.event.docsWebinar,
        slug: "avtomatizatsiya-dokumentov-webinar-apr",
        title: "Автоматизация документооборота с ИИ · вебинар",
        type: "webinar",
        startDate: dayOffset(-30),
        timezone: "Europe/Moscow",
        city: null,
        isOnline: true,
        organizer: "ProAgent AI",
        ticketPriceFrom: null,
        speakerIds: [ID.author.smirnova],
        description:
          "Запись прошедшего вебинара. Разбор 5 конкретных кейсов автоматизации документооборота в МСП.",
        registeredCount: 840,
        capacity: null,
      },
    ])
    .onConflictDoNothing();
  return 3;
}

async function seedArticles() {
  const newsBody: ArticleBlock[] = [
    {
      type: "callout",
      kind: "why",
      text: "ИИ-агенты перестали быть игрушкой корпораций: типовые задачи МСБ — заявки, документы, поддержка — закрываются готовыми связками за недели, а не кварталы.",
    },
    {
      type: "numbers",
      items: [
        {
          label: "МСП с ИИ в процессах",
          value: "18%",
          source: "https://example.com/demo-index-2026",
        },
        { label: "Медианный срок внедрения", value: "6 недель" },
        { label: "Медианная экономия", value: "32 ч/мес" },
      ],
    },
    {
      type: "callout",
      kind: "yes-but",
      text: "Экономия появляется только после настройки под процессы компании: «коробочный» агент без интеграции с CRM и базой знаний остаётся демо-игрушкой.",
    },
    {
      type: "callout",
      kind: "what-next",
      text: "Начинать с одного узкого процесса с измеримой метрикой (часы, деньги, конверсия) — и только после первых цифр масштабировать.",
    },
  ];
  const newsCitations: Citation[] = [
    {
      url: "https://example.com/demo-index-2026",
      title: "Индекс автоматизации МСП 2026 (демо-фикстура)",
      publisher: "Демо-источник",
      publishedAt: "2026-05-26",
    },
  ];

  const caseBody: ArticleBlock[] = [
    {
      type: "paragraph",
      text: "Сервисная компания из 12 человек тонула во входящих заявках: менеджеры отвечали в среднем за 4 часа, четверть лидов уходила к конкурентам. Поставили ИИ-агента на первичную обработку — квалификация, ответы на типовые вопросы, передача горячих лидов менеджеру.",
    },
    {
      type: "callout",
      kind: "big-picture",
      text: "Агент не заменяет менеджера — он снимает рутинную первичку. Человек подключается там, где решается сделка.",
    },
    {
      type: "numbers",
      items: [
        { label: "Время обработки заявки", value: "−70%" },
        { label: "Ответ клиенту", value: "4 ч → 3 мин" },
        { label: "Конверсия в разговор", value: "+9 п.п." },
      ],
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Собрали базу типовых вопросов из переписок за полгода.",
        "Настроили агента на квалификацию по 4 критериям.",
        "Интегрировали с CRM: карточка лида создаётся автоматически.",
        "Две недели работали в режиме «агент предлагает — человек утверждает».",
        "Только после этого включили автоответы на типовые сценарии.",
      ],
    },
    {
      type: "callout",
      kind: "what-next",
      text: "Если у вас похожий поток заявок — начните с аудита переписок: где теряется время и какие вопросы повторяются.",
    },
  ];
  const caseCitations: Citation[] = [
    {
      url: "https://example.com/demo-case-leads",
      title: "Кейс: ИИ-агент на входящих заявках (демо-фикстура)",
      publisher: "ProAgent AI",
      publishedAt: "2026-05-22",
    },
  ];

  await db
    .insert(articles)
    .values([
      {
        id: ID.article.newsAgents,
        slug: "ii-agenty-msp-doshli-do-tipovyh-zadach",
        section: "numbers",
        status: "published",
        category: "news",
        subcategory: "news.market",
        template: "card-news",
        tags: ["ИИ-агенты", "МСП", "автоматизация"],
        authorId: ID.author.redakciya,
        editorId: ID.user.editor,
        tease: "ИИ-агенты дошли до типовых задач МСП",
        lede: "ИИ-агенты закрывают типовые задачи малого бизнеса за недели: заявки, документы, поддержка. Демо-цифры — в разборе.",
        whyItMatters:
          "Порог входа упал: внедрение ИИ-агента — больше не проект на квартал с бюджетом корпорации. Считать выгоду можно в часах и конверсии.",
        body: newsBody,
        wordCount: 260,
        readSeconds: 28,
        citations: newsCitations,
        isFeatured: true,
        publishedAt: new Date(NOW.getTime() - 1000 * 60 * 60 * 6),
      },
      {
        id: ID.article.caseLeads,
        slug: "keys-ii-agent-na-vhodyashchih-zayavkah",
        section: "main",
        status: "published",
        category: "cases",
        subcategory: "cases.sales",
        template: "deep-dive",
        tags: ["кейс", "продажи", "ИИ-агенты"],
        authorId: ID.author.founder,
        editorId: ID.user.editor,
        tease: "Кейс: ИИ-агент на входящих заявках — −70% времени",
        lede: "Как сервисная компания из 12 человек сократила время обработки заявок на 70% и подняла конверсию. Пошаговый разбор внедрения.",
        whyItMatters:
          "Первичная обработка заявок — самый частый и самый быстрый по окупаемости сценарий ИИ-агента в МСБ.",
        body: caseBody,
        wordCount: 1820,
        readSeconds: 545,
        citations: caseCitations,
        coverImageUrl: null,
        isFeatured: false,
        publishedAt: new Date(NOW.getTime() - 1000 * 60 * 60 * 18),
      },
    ])
    .onConflictDoNothing();
  return 2;
}

async function seedDigest() {
  await db
    .insert(digests)
    .values({
      id: ID.digest.today,
      issueDate: isoDate(NOW),
      intro:
        "Утренний выпуск ProAgent AI. Новости ИИ для бизнеса и кейс автоматизации заявок. Поехали.",
      topArticleIds: [ID.article.newsAgents, ID.article.caseLeads],
      // Имя поля rybakovTake — легаси API-контракта; содержимое — «Разбор от основателя».
      rybakovTake: {
        quote: "Внедряйте ИИ там, где выгоду можно посчитать. Остальное — хайп.",
        context:
          "Один узкий процесс, одна метрика (часы, деньги или конверсия) — и только после первых цифр масштабирование.",
      },
      tomorrow: "Завтра разберём ИИ-агентов в рознице и что изменили новые тарифы API.",
    })
    .onConflictDoNothing();
  return 1;
}

async function main() {
  console.log("[seed] starting against", maskUrl(url ?? ""));
  const t0 = Date.now();

  const u = await seedUsers();
  console.log(`  users:    ${u} ensured`);
  const a = await seedAuthors();
  console.log(`  authors:  ${a} ensured`);
  const e = await seedEvents();
  console.log(`  events:   ${e} ensured`);
  const ar = await seedArticles();
  console.log(`  articles: ${ar} ensured`);
  const d = await seedDigest();
  console.log(`  digests:  ${d} ensured`);

  const elapsed = Date.now() - t0;
  console.log(`[seed] done in ${elapsed}ms`);
}

function maskUrl(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.password = "***";
    return parsed.toString();
  } catch {
    return "<invalid url>";
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[seed] failed:", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  },
);
