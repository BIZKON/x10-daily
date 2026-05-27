/**
 * scripts/seed.ts — идемпотентные фикстуры для X10 Daily.
 *
 * Запуск:
 *   export DATABASE_URL='postgresql://...neon.tech/...'
 *   pnpm db:seed
 *
 * Предусловие: миграции применены (0000_core → 0003_engagement_triggers).
 *   pnpm --filter @x10/db db:migrate
 *
 * Безопасно гонять много раз: все insert через onConflictDoNothing()
 * по уникальным ключам (slug / issueDate / (platform, platformUserId)).
 * UUID-ы стабильные и совпадают с apps/admin/src/lib/mocks.ts, чтобы
 * demo mode и реальная БД давали один и тот же набор id.
 *
 * Объём (по handoff-session-9 §«Что дальше» B):
 *   4 users · 5 authors · 10 klamps · 3 events · 2 articles · 1 digest.
 */
import "dotenv/config";
import {
  articles,
  authors,
  createDb,
  digests,
  events,
  klamps,
  users,
  type ArticleBlock,
  type Citation,
} from "@x10/db";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "[seed] DATABASE_URL (или DIRECT_DATABASE_URL) не задана.\n" +
      "Установите переменную окружения или положите её в корневой .env:\n" +
      "  export DATABASE_URL='postgresql://...neon.tech/...'",
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
    rybakov: "10000000-0000-0000-0000-000000000001",
    slobodyanik: "10000000-0000-0000-0000-000000000002",
    boisov: "10000000-0000-0000-0000-000000000003",
    kostalgin: "10000000-0000-0000-0000-000000000004",
    vyatkina: "10000000-0000-0000-0000-000000000005",
  },
  klamp: {
    krd: "20000000-0000-0000-0000-000000000001",
    msk: "20000000-0000-0000-0000-000000000002",
    spb: "20000000-0000-0000-0000-000000000003",
    almaty: "20000000-0000-0000-0000-000000000004",
    dubai: "20000000-0000-0000-0000-000000000005",
    kazan: "20000000-0000-0000-0000-000000000006",
    novosib: "20000000-0000-0000-0000-000000000007",
    ufa: "20000000-0000-0000-0000-000000000008",
    cyprus: "20000000-0000-0000-0000-000000000009",
    yerevan: "20000000-0000-0000-0000-00000000000a",
  },
  event: {
    meetUpMsk: "30000000-0000-0000-0000-000000000001",
    kod: "30000000-0000-0000-0000-000000000002",
    aiWebinar: "30000000-0000-0000-0000-000000000005",
  },
  article: {
    cbRate: "00000000-0000-0000-0000-000000000001",
    wbDeep: "00000000-0000-0000-0000-000000000002",
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
        username: "olga",
        displayName: "Ольга Слободяник",
        email: "olga@x10daily.com",
        role: "editor",
        locale: "ru",
      },
      {
        id: ID.user.admin,
        platform: "web",
        platformUserId: "seed_admin",
        username: "admin",
        displayName: "Admin",
        email: "admin@x10daily.com",
        role: "admin",
        locale: "ru",
      },
      {
        id: ID.user.reader,
        platform: "telegram",
        platformUserId: "seed_tg_reader",
        username: "reader",
        displayName: "Пилотный клампер",
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
        id: ID.author.rybakov,
        slug: "igor-rybakov",
        name: "Игорь Рыбаков",
        role: "Сооснователь Технониколь · грандмастер Х10",
        bio: "Сооснователь Технониколь, основатель Х10. Главный авторский голос медиа: ежедневные реакции, авторские эссе, разборы. Без регалий в шапке, без инфобиза.",
        bylineColor: "#E63946",
        isStaff: true,
        isFlagship: true,
        subscriberCount: 24180,
      },
      {
        id: ID.author.slobodyanik,
        slug: "olga-slobodyanik",
        name: "Ольга Слободяник",
        role: "Главный редактор",
        bio: "Управляет редполитикой Х10 Daily. 12 лет в деловой журналистике (Forbes, Frank Media).",
        bylineColor: "#1F2937",
        isStaff: true,
        isFlagship: false,
        subscriberCount: 2840,
        userId: ID.user.editor,
      },
      {
        id: ID.author.boisov,
        slug: "ruslan-boisov",
        name: "Руслан Боисов",
        role: "Идеолог · рубрики и стратегия",
        bio: "Концепция рубрик, бенчмаркинг с международными деловыми медиа.",
        bylineColor: "#D4A24C",
        isStaff: true,
        isFlagship: false,
        subscriberCount: 1120,
      },
      {
        id: ID.author.kostalgin,
        slug: "dmitry-kostalgin",
        name: "Дмитрий Костальгин",
        role: "Налоговый адвокат · гостевой автор",
        bio: "Партнёр Taxadvisor. Разборы для рубрики taxes.guides — переход с УСН на ОСН, налоговые споры.",
        bylineColor: "#3FB950",
        isStaff: false,
        isFlagship: false,
        subscriberCount: 480,
      },
      {
        id: ID.author.vyatkina,
        slug: "anna-vyatkina",
        name: "Анна Вяткина",
        role: "Журналист · маркетплейсы и e-commerce",
        bio: "Разборы Wildberries, Ozon, Yandex.Market. 6 лет в деловой журналистике.",
        bylineColor: "#2563EB",
        isStaff: true,
        isFlagship: false,
        subscriberCount: 720,
      },
    ])
    .onConflictDoNothing();
  return 5;
}

async function seedKlamps() {
  await db
    .insert(klamps)
    .values([
      {
        id: ID.klamp.krd,
        slug: "digital-breakthrough-krd",
        name: "Кламп «Цифровой прорыв»",
        city: "Краснодар",
        country: "РФ",
        leadName: "Алексей Петров",
        leadContact: "@alexey_petrov",
        memberCount: 8,
        isOpen: true,
        meetingSchedule: "каждый второй четверг 19:00",
        description: "Малая группа предпринимателей в IT и e-commerce. Совместная цель на 90 дней.",
        goal: "Запустить совместный AI-сервис за 90 дней",
      },
      {
        id: ID.klamp.msk,
        slug: "msk-traders",
        name: "Кламп «Трейдеры Москвы»",
        city: "Москва",
        country: "РФ",
        leadName: "Мария Иванова",
        memberCount: 10,
        isOpen: false,
        meetingSchedule: "каждую среду 20:00",
        description: "Торговля на маркетплейсах. Закрытая группа, набор по рекомендации.",
      },
      {
        id: ID.klamp.spb,
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
        id: ID.klamp.almaty,
        slug: "kz-almaty",
        name: "Кламп «Алматы»",
        city: "Алматы",
        country: "KZ",
        leadName: "Айдар Жанибеков",
        memberCount: 12,
        isOpen: true,
        meetingSchedule: "каждый второй вторник 18:00",
        description: "Русскоязычные предприниматели в Казахстане. Релокация и ВЭД.",
      },
      {
        id: ID.klamp.dubai,
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
      {
        id: ID.klamp.kazan,
        slug: "kazan-it",
        name: "Кламп «Казань IT»",
        city: "Казань",
        country: "РФ",
        leadName: "Рустам Хайруллин",
        memberCount: 11,
        isOpen: true,
        meetingSchedule: "каждый второй понедельник 19:30",
        description: "IT-предприниматели Поволжья. Импортозамещение, no-code, B2B SaaS.",
      },
      {
        id: ID.klamp.novosib,
        slug: "novosib-prod",
        name: "Кламп «Новосиб Производство»",
        city: "Новосибирск",
        country: "РФ",
        leadName: "Сергей Захаров",
        memberCount: 8,
        isOpen: true,
        meetingSchedule: "первый четверг месяца 18:00",
        description: "Производственные компании Сибири. Локализация, маркировка, экспорт.",
      },
      {
        id: ID.klamp.ufa,
        slug: "ufa-services",
        name: "Кламп «Уфа Сервис»",
        city: "Уфа",
        country: "РФ",
        leadName: "Айгуль Гарифуллина",
        memberCount: 9,
        isOpen: true,
        meetingSchedule: "второй вторник месяца 19:00",
        description: "Услуги для бизнеса: бухгалтерия, юристы, маркетинг.",
      },
      {
        id: ID.klamp.cyprus,
        slug: "cyprus-rus",
        name: "Кламп «Кипр»",
        city: "Лимасол",
        country: "CY",
        leadName: "Кирилл Никитин",
        memberCount: 6,
        isOpen: true,
        meetingSchedule: "ежемесячно по согласованию",
        description: "Русскоязычные основатели на Кипре. Холдинги, IP, банки.",
      },
      {
        id: ID.klamp.yerevan,
        slug: "yerevan-rus",
        name: "Кламп «Ереван»",
        city: "Ереван",
        country: "AM",
        leadName: "Армен Хачатрян",
        memberCount: 7,
        isOpen: true,
        meetingSchedule: "каждые две недели четверг 19:00",
        description: "Релоцированные основатели в Армении. Платежи, банки, ВНЖ.",
      },
    ])
    .onConflictDoNothing();
  return 10;
}

async function seedEvents() {
  await db
    .insert(events)
    .values([
      {
        id: ID.event.meetUpMsk,
        slug: "x10-meet-up-moscow-jun",
        title: "X10 Business Meet Up by Rybakov",
        type: "meet-up",
        startDate: dayOffset(8),
        timezone: "Europe/Moscow",
        city: "Москва",
        venue: {
          name: "Loft Hall",
          address: "Москва, Большой Овчинниковский пер., 16",
          lat: 55.7355,
          lng: 37.6275,
        },
        isOnline: false,
        organizer: "Х10 Москва",
        ticketPriceFrom: 5000,
        ticketUrl: "https://x10daily.com/events/meet-up-moscow-jun",
        speakerIds: [ID.author.rybakov, ID.author.boisov],
        description:
          "Открытый business meet up для предпринимателей Москвы. 3 кейса от практикующих основателей, кофе-брейк, нетворкинг.",
        registeredCount: 420,
        capacity: 500,
      },
      {
        id: ID.event.kod,
        slug: "kod-x10-2026",
        title: "КОД Х10 2026 · главное событие года",
        type: "kod-x10",
        startDate: dayOffset(45),
        endDate: dayOffset(46),
        timezone: "Europe/Moscow",
        city: "Москва",
        venue: {
          name: "Крокус Экспо",
          address: "Москва, 65-66 км МКАД",
          lat: 55.8254,
          lng: 37.3925,
        },
        isOnline: false,
        organizer: "Х10",
        ticketPriceFrom: 25000,
        ticketUrl: "https://x10daily.com/events/kod-2026",
        speakerIds: [ID.author.rybakov, ID.author.slobodyanik, ID.author.boisov],
        description:
          "Двухдневный КОД Х10: главное ежегодное событие сообщества. 2000 кламперов, 30 спикеров, 6 потоков по рубрикам Х10 Daily.",
        registeredCount: 1240,
        capacity: 2000,
      },
      {
        id: ID.event.aiWebinar,
        slug: "ai-for-business-webinar-apr",
        title: "AI-агенты для малого бизнеса · вебинар",
        type: "webinar",
        startDate: dayOffset(-30),
        timezone: "Europe/Moscow",
        city: null,
        isOnline: true,
        organizer: "Х10 Daily",
        ticketPriceFrom: null,
        speakerIds: [ID.author.vyatkina],
        description:
          "Запись прошедшего вебинара. Разбор 5 конкретных кейсов внедрения AI-агентов в МСП.",
        registeredCount: 840,
        capacity: null,
      },
    ])
    .onConflictDoNothing();
  return 3;
}

async function seedArticles() {
  const cbRateBody: ArticleBlock[] = [
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
        { label: "Кредитов МСП за квартал", value: "−14%", source: "https://www.cbr.ru/statistics/" },
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
  ];
  const cbCitations: Citation[] = [
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
  ];

  const wbBody: ArticleBlock[] = [
    {
      type: "paragraph",
      text: "За последний квартал Wildberries приобрёл три такси-сервиса в Москве, Краснодаре и Екатеринбурге. Сделки шли через ООО «WB-Мобильность», бюджет — около 8.4 млрд рублей.",
    },
    {
      type: "callout",
      kind: "big-picture",
      text: "Wildberries не покупает такси — он покупает водителей и автопарки. Логистическая инфраструктура «последней мили» становится принадлежностью маркетплейса, а не подрядчиком.",
    },
    {
      type: "numbers",
      items: [
        { label: "Сумма сделок", value: "8.4 млрд ₽", source: "https://www.kommersant.ru/" },
        { label: "Автопарк", value: "12 400 машин" },
        { label: "Городов покрытия", value: "23" },
      ],
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Контроль last-mile сокращает SLA доставки до 30 минут в крупных городах.",
        "Маржа курьерской доставки уходит к WB, а не партнёрам.",
        "Селлеры теряют рычаг переговоров — нет альтернативы внутри экосистемы.",
        "Появляется новый формат рекламы «доставка по подписке».",
        "ФАС в зоне внимания — на горизонте возможное расследование.",
      ],
    },
    {
      type: "callout",
      kind: "what-next",
      text: "Если вы селлер маркетплейса — пересчитать unit-экономику без преференций. Если конкурент — готовить ответ или нишу.",
    },
  ];
  const wbCitations: Citation[] = [
    {
      url: "https://www.kommersant.ru/doc/wb-taxi-2026",
      title: "Wildberries скупает региональных таксистов",
      publisher: "Коммерсантъ",
      publishedAt: "2026-05-22",
    },
  ];

  await db
    .insert(articles)
    .values([
      {
        id: ID.article.cbRate,
        slug: "tsb-derzhit-stavku-17",
        section: "numbers",
        status: "published",
        category: "money",
        subcategory: "money.cbr",
        template: "card-news",
        tags: ["ЦБ", "ставка", "малый-бизнес"],
        authorId: ID.author.slobodyanik,
        editorId: ID.user.editor,
        tease: "ЦБ держит 17% — четвёртое заседание подряд",
        lede:
          "Совет директоров ЦБ сохранил ключевую ставку на уровне 17%. Кредитное окно для МСП остаётся закрытым минимум до сентября.",
        whyItMatters:
          "При ставке 17% IRR проектов МСП в среднем ниже стоимости долга. Время оборотки собственным капиталом, а не банковским.",
        body: cbRateBody,
        wordCount: 270,
        readSeconds: 30,
        citations: cbCitations,
        isFeatured: true,
        publishedAt: new Date(NOW.getTime() - 1000 * 60 * 60 * 6),
      },
      {
        id: ID.article.wbDeep,
        slug: "wildberries-kupil-tri-taksi",
        section: "main",
        status: "published",
        category: "practice",
        subcategory: "practice.teardowns",
        template: "deep-dive",
        tags: ["маркетплейсы", "wildberries", "логистика"],
        authorId: ID.author.vyatkina,
        editorId: ID.user.editor,
        tease: "Wildberries собирает логистическую империю",
        lede:
          "Маркетплейс купил три такси-сервиса за квартал. Что это даёт WB, что теряют продавцы, и какие 5 уроков для российского ритейла.",
        whyItMatters:
          "Маркетплейсы переходят от агрегации к вертикальной интеграции. Селлерам это сужает рычаг переговоров и меняет unit-экономику.",
        body: wbBody,
        wordCount: 1820,
        readSeconds: 545,
        citations: wbCitations,
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
        "Утренний разбор. Главное за вчера: ЦБ держит ставку 17%, Wildberries собирает логистику. Поехали.",
      topArticleIds: [ID.article.cbRate, ID.article.wbDeep],
      rybakovTake: {
        quote: "Когда деньги дорогие — оборотка из прибыли. Не из долга.",
        context:
          "Ставка 17% означает, что банковский кредит перестаёт быть инструментом масштабирования для МСП. Это надолго.",
      },
      tomorrow: "Завтра разберём УСН 350 млн и реакцию рынка на ставку.",
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
  const k = await seedKlamps();
  console.log(`  klamps:   ${k} ensured`);
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
