import { sourceRefSchema } from "@x10/agents";
import { eventType } from "inngest";
import { z } from "zod";

export const sectionEnum = z.enum(["main", "numbers", "people", "playbook", "weekend", "longread"]);
export type Section = z.infer<typeof sectionEnum>;
export const DEFAULT_SECTION: Section = "main";

/** User-facing категория — рубрикатор ProAgent AI (Р4). Обязательная таксономия для UI. */
export const categoryEnum = z.enum(["news", "cases", "howto", "tools", "business", "founder"]);
export type Category = z.infer<typeof categoryEnum>;
export const DEFAULT_CATEGORY: Category = "news";

/** brief §3 — шаблон материала. */
export const templateEnum = z.enum(["card-news", "deep-dive", "daily-take", "guide"]);
export type Template = z.infer<typeof templateEnum>;
export const DEFAULT_TEMPLATE: Template = "card-news";

/** Schema без .default() и .transform() — Inngest v4 запрещает transforms на eventType. */
export const topicIngestedDataSchema = z.object({
  topic: z.string().min(1),
  context: z.string().min(1),
  sources: z.array(sourceRefSchema).min(1),
  section: sectionEnum.optional(),
  /** Целевая категория для UI (рубрикатор ProAgent AI). Если не задана, persist возьмёт DEFAULT_CATEGORY. */
  category: categoryEnum.optional(),
  /** Подкатегория — "news.agents", "cases.retail", опционально (открытая строка). */
  subcategory: z.string().optional(),
  /** brief §3 — шаблон для DraftAgent. Если не задан, DEFAULT_TEMPLATE. */
  template: templateEnum.optional(),
  /** brief §5 — теги. */
  tags: z.array(z.string()).optional(),
  authorName: z.string().nullable().optional(),
  /**
   * Если true → FactCheckAgent (Opus) запустится после Brevity и может остановить публикацию.
   * Ставится автоматически IngestAgent'ом для политических тем.
   */
  political: z.boolean().optional(),
});

export type TopicIngestedData = z.infer<typeof topicIngestedDataSchema>;

export const topicIngestedEvent = eventType("article/topic.ingested", {
  schema: topicIngestedDataSchema,
});

export const TOPIC_INGESTED = topicIngestedEvent.event;

/* ----------------------------------------------------------------
 * source.item.received — сырой RSS/API item, IngestAgent решит брать или нет.
 * ---------------------------------------------------------------- */
export const sourceItemReceivedDataSchema = z.object({
  rawTitle: z.string().min(1),
  rawText: z.string().min(1),
  source: sourceRefSchema,
  recentTeases: z.array(z.string()).optional(),
});
export type SourceItemReceivedData = z.infer<typeof sourceItemReceivedDataSchema>;

export const sourceItemReceivedEvent = eventType("source.item.received", {
  schema: sourceItemReceivedDataSchema,
});
export const SOURCE_ITEM_RECEIVED = sourceItemReceivedEvent.event;

/* ----------------------------------------------------------------
 * article/link.submitted — человек прислал ссылку на чужой материал.
 *
 * Второй вход конвейера. Дальше breakdown-link разбирает исходник и отдаёт
 * ОБЫЧНОЕ article/topic.ingested — то же событие, что и гейт лент. Именно
 * поэтому весь конвейер после драфта переиспользуется как есть, а не строится
 * второй трубой рядом.
 * ---------------------------------------------------------------- */
export const linkSubmittedDataSchema = z.object({
  url: z.string().min(1),
  /** Кто прислал — для аудита и чтобы вернуть результат тому же человеку. */
  submittedBy: z.string().optional(),
  /** Чем занимается клиент: адаптация должна быть под его бизнес, а не общая. */
  clientContext: z.string().optional(),
});
export type LinkSubmittedData = z.infer<typeof linkSubmittedDataSchema>;

export const linkSubmittedEvent = eventType("article/link.submitted", {
  schema: linkSubmittedDataSchema,
});
export const LINK_SUBMITTED = linkSubmittedEvent.event;

/* ----------------------------------------------------------------
 * newsletter.assemble.requested — собрать daily выпуск.
 * Триггер: cron 06:00 МСК или ручной POST из апи.
 * ---------------------------------------------------------------- */
const newsletterArticleSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  section: sectionEnum,
  tease: z.string(),
  lede: z.string(),
  whyItMatters: z.string(),
  hookLine: z.string().optional(),
  wordCount: z.number().int().nonnegative(),
});

export const newsletterAssembleRequestedDataSchema = z.object({
  issueDate: z.string().min(1),
  articles: z.array(newsletterArticleSummarySchema).min(1),
  editorialNote: z.string().optional(),
});
export type NewsletterAssembleRequestedData = z.infer<typeof newsletterAssembleRequestedDataSchema>;

export const newsletterAssembleRequestedEvent = eventType("newsletter.assemble.requested", {
  schema: newsletterAssembleRequestedDataSchema,
});
export const NEWSLETTER_ASSEMBLE_REQUESTED = newsletterAssembleRequestedEvent.event;

/* ----------------------------------------------------------------
 * score.weekly.requested — еженедельная аналитика engagement.
 * Триггер: cron Mon 09:00 МСК или ручной POST.
 * ---------------------------------------------------------------- */
const articleStatSchema = z.object({
  articleId: z.string(),
  slug: z.string(),
  section: z.string(),
  publishedAt: z.string(),
  previewScore: z.number().int().min(5).max(50).nullable(),
  hookPattern: z.string().nullable(),
  views: z.number().int().nonnegative(),
  uniqueReaders: z.number().int().nonnegative(),
  scrollDepthAvg: z.number().min(0).max(1),
  reactions: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  newsletterSignups: z.number().int().nonnegative(),
});

export const scoreWeeklyRequestedDataSchema = z.object({
  weekISO: z.string().min(1),
  articles: z.array(articleStatSchema).min(1),
  currentConfig: z.record(z.string(), z.unknown()),
});
export type ScoreWeeklyRequestedData = z.infer<typeof scoreWeeklyRequestedDataSchema>;

export const scoreWeeklyRequestedEvent = eventType("score.weekly.requested", {
  schema: scoreWeeklyRequestedDataSchema,
});
export const SCORE_WEEKLY_REQUESTED = scoreWeeklyRequestedEvent.event;

/* ----------------------------------------------------------------
 * article.ready — финальный сигнал после persistArticle. Триггер для
 * posting-функций (TG / VK / Дзен / ...). Один event → один channel,
 * `channel` поле указывает в какую очередь posting забирать row из
 * channels-таблицы.
 *
 * Walking Skeleton (ТЗ #1, N5/N6): only channel='tg'. Posting-функция
 * читает channels WHERE article_id=$1 AND channel=$2 и ветвится по
 * visual_ref.
 * ---------------------------------------------------------------- */
export const articleReadyDataSchema = z.object({
  articleId: z.string().uuid(),
  channel: z.enum(["tg", "vk", "dzen", "linkedin"]),
});
export type ArticleReadyData = z.infer<typeof articleReadyDataSchema>;

export const articleReadyEvent = eventType("article.ready", {
  schema: articleReadyDataSchema,
});
export const ARTICLE_READY = articleReadyEvent.event;

/* ----------------------------------------------------------------
 * article/cover.requested — сгенерировать ИИ-обложку статьи (Спека 2).
 * Триггеры: конвейер после persist (новые статьи) и кнопка «Перегенерировать»
 * в админке. Обложка НЕ публикуется автоматически: генерация ставит
 * visual_status='pending_review', публикует только редактор (HumanGate).
 * ---------------------------------------------------------------- */
export const articleCoverRequestedDataSchema = z.object({
  articleId: z.string().uuid(),
  /**
   * Перегенерация из админки: перезаписать уже сгенерированную/одобренную
   * обложку. Без флага повторный триггер по статье, у которой обложка уже есть,
   * скипается — защита от лишних трат на дубль-события.
   */
  force: z.boolean().optional(),
});
export type ArticleCoverRequestedData = z.infer<typeof articleCoverRequestedDataSchema>;

export const articleCoverRequestedEvent = eventType("article/cover.requested", {
  schema: articleCoverRequestedDataSchema,
});
export const ARTICLE_COVER_REQUESTED = articleCoverRequestedEvent.event;

/* ----------------------------------------------------------------
 * article/carousel.requested — разобрать материал на слайды и нарисовать их
 * (реестр §3.5, обещание КП «пост, карусель, ролик»).
 *
 * 🔴 Триггер РУЧНОЙ: кнопка в админке. Автоматически на каждую статью карусель
 * не делаем — это лишний платный прогон модели на материал, который может
 * никуда не пойти. Когда форматы станут настройкой экземпляра (§3.10), сюда
 * добавится автотриггер по флагу.
 *
 * Карусель НЕ публикуется сама: генерация ставит carousel_status =
 * 'pending_review', в канал альбом пускает редактор (HumanGate).
 * ---------------------------------------------------------------- */
export const articleCarouselRequestedDataSchema = z.object({
  articleId: z.string().uuid(),
  /** Сколько слайдов просить у модели. Пусто — шесть. */
  target: z.number().int().min(2).max(10).optional(),
  /** Перерисовать поверх уже готовой карусели. */
  force: z.boolean().optional(),
});
export type ArticleCarouselRequestedData = z.infer<typeof articleCarouselRequestedDataSchema>;

export const articleCarouselRequestedEvent = eventType("article/carousel.requested", {
  schema: articleCarouselRequestedDataSchema,
});
export const ARTICLE_CAROUSEL_REQUESTED = articleCarouselRequestedEvent.event;

/* ----------------------------------------------------------------
 * posting/drain.requested — опубликовать одну статью из очереди НЕМЕДЛЕННО,
 * не дожидаясь слота. Тот же путь, что у крона: те же гарды (пауза, тихие
 * часы, окно свежести), та же пометка posted_at — поэтому ручная публикация
 * не создаёт дублей и не ломает очередь.
 * Нужен для «опубликовать сейчас» из админки и разовых выкладок владельца.
 * ---------------------------------------------------------------- */
export const postingDrainRequestedDataSchema = z.object({
  /** Свободная пометка, зачем дёрнули (попадает в логи). Не влияет на выбор. */
  reason: z.string().optional(),
  /**
   * 🔴 Опубликовать КОНКРЕТНУЮ статью, а не голову очереди.
   *
   * Нужно для кнопки «Одобрить» в Telegram (Спека 4): редактор одобряет
   * определённую карточку, и опубликоваться должна именно она. Без этого поля
   * событие публикует oldest-fresh-first — то есть, скорее всего, чужую
   * статью, а одобренная осталась бы ждать.
   *
   * Все гарды сохраняются: пауза, тихие часы, окно свежести, «не постнуто».
   */
  articleId: z.string().uuid().optional(),
});
export type PostingDrainRequestedData = z.infer<typeof postingDrainRequestedDataSchema>;

export const postingDrainRequestedEvent = eventType("posting/drain.requested", {
  schema: postingDrainRequestedDataSchema,
});
export const POSTING_DRAIN_REQUESTED = postingDrainRequestedEvent.event;

/* ----------------------------------------------------------------
 * source/prime.requested — приминание нового источника парсинга.
 *
 * 🔴 Зачем это обязательный шаг (CLAUDE.md §4). Свежедобавленный источник ещё
 * не имеет ни одной строки в `seen_items`, поэтому первый же тик ingest-rss
 * принимает ВЕСЬ исторический фид за новости. Раньше от этого спасала только
 * инструкция человеку в `scripts/seed-sources.sql`; в админке, которой
 * пользуется клиент, инструкции не работают.
 *
 * Поэтому источник заводится ВЫКЛЮЧЕННЫМ, а включает его только эта функция —
 * и только после того, как фид реально прочитан и записан в `seen_items`.
 * Источник обязан доказать свою работоспособность прежде, чем начать вещать.
 * ---------------------------------------------------------------- */
export const sourcePrimeRequestedDataSchema = z.object({
  sourceId: z.string().uuid(),
});
export type SourcePrimeRequestedData = z.infer<typeof sourcePrimeRequestedDataSchema>;

export const sourcePrimeRequestedEvent = eventType("source/prime.requested", {
  schema: sourcePrimeRequestedDataSchema,
});
export const SOURCE_PRIME_REQUESTED = sourcePrimeRequestedEvent.event;

/* ----------------------------------------------------------------
 * review/card.requested — показать статью редактору карточкой в группе
 * «Редакция» (Спека 4). Кнопки под карточкой заменяют заход в кабинет, но НЕ
 * отменяют HumanGate: карточка ничего не публикует сама.
 * ---------------------------------------------------------------- */
export const reviewCardRequestedDataSchema = z.object({
  articleId: z.string().uuid(),
});
export type ReviewCardRequestedData = z.infer<typeof reviewCardRequestedDataSchema>;

export const reviewCardRequestedEvent = eventType("review/card.requested", {
  schema: reviewCardRequestedDataSchema,
});
export const REVIEW_CARD_REQUESTED = reviewCardRequestedEvent.event;

/* ----------------------------------------------------------------
 * article/rewrite.requested — переписать материал по правке редактора
 * (Спека 4, шаг 5). Приходит из ответа в треде карточки ревью.
 * ---------------------------------------------------------------- */
export const articleRewriteRequestedDataSchema = z.object({
  articleId: z.string().uuid(),
  /** Правка редактора своими словами. */
  instruction: z.string().min(1).max(500),
  /** Карточка, из которой пришла правка — её пометим заменённой. */
  cardId: z.string().uuid().optional(),
});
export type ArticleRewriteRequestedData = z.infer<typeof articleRewriteRequestedDataSchema>;

export const articleRewriteRequestedEvent = eventType("article/rewrite.requested", {
  schema: articleRewriteRequestedDataSchema,
});
export const ARTICLE_REWRITE_REQUESTED = articleRewriteRequestedEvent.event;

/* ----------------------------------------------------------------
 * creation/run.requested — человек попросил создать материал в разделе
 * «Создать» (ручной режим, реестр разрыва §3.2).
 *
 * В событии только id задания, а не режим с темой: строка `creations` уже
 * создана апи и хранит и то, и другое. Дублировать её содержимое в событие
 * значило бы завести второй источник правды, который разойдётся с базой при
 * первой же правке задания.
 * ---------------------------------------------------------------- */
export const creationRunRequestedDataSchema = z.object({
  creationId: z.string().uuid(),
});
export type CreationRunRequestedData = z.infer<typeof creationRunRequestedDataSchema>;

export const creationRunRequestedEvent = eventType("creation/run.requested", {
  schema: creationRunRequestedDataSchema,
});
export const CREATION_RUN_REQUESTED = creationRunRequestedEvent.event;

/* ------------------------------------------------------------------
 * База знаний по ссылке: клиент дал адрес сайта, надо его обойти.
 *
 * В событии только id задания — по той же причине, что и у «Создать»: строка
 * `kb_imports` уже создана апи и хранит адрес; дублировать его в событие значит
 * завести второй источник правды.
 * ---------------------------------------------------------------- */
export const knowledgeImportRequestedDataSchema = z.object({
  importId: z.string().uuid(),
});
export type KnowledgeImportRequestedData = z.infer<typeof knowledgeImportRequestedDataSchema>;

export const knowledgeImportRequestedEvent = eventType("knowledge/import.requested", {
  schema: knowledgeImportRequestedDataSchema,
});
export const KNOWLEDGE_IMPORT_REQUESTED = knowledgeImportRequestedEvent.event;

/* ------------------------------------------------------------------
 * Контент-план: человек нажал «собрать план на месяц».
 *
 * В событии только id сборки: строка `content_plans` уже создана апи и хранит
 * месяц. Дублировать его в событие значит завести второй источник правды.
 * ---------------------------------------------------------------- */
export const planBuildRequestedDataSchema = z.object({
  planId: z.string().uuid(),
});
export type PlanBuildRequestedData = z.infer<typeof planBuildRequestedDataSchema>;

export const planBuildRequestedEvent = eventType("plan/build.requested", {
  schema: planBuildRequestedDataSchema,
});
export const PLAN_BUILD_REQUESTED = planBuildRequestedEvent.event;
