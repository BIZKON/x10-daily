import { sourceRefSchema } from "@x10/agents";
import { eventType } from "inngest";
import { z } from "zod";

export const sectionEnum = z.enum([
  "main",
  "numbers",
  "people",
  "playbook",
  "weekend",
  "longread",
]);
export type Section = z.infer<typeof sectionEnum>;
export const DEFAULT_SECTION: Section = "main";

/** brief §5 — user-facing категория. Обязательная таксономия для UI. */
export const categoryEnum = z.enum(["taxes", "money", "practice", "power", "tech", "rybakov"]);
export type Category = z.infer<typeof categoryEnum>;
export const DEFAULT_CATEGORY: Category = "practice";

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
  /** brief §5 — целевая категория для UI. Если не задана, persist возьмёт DEFAULT_CATEGORY. */
  category: categoryEnum.optional(),
  /** brief §1 — "taxes.news", "practice.stories", опционально. */
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
export type NewsletterAssembleRequestedData = z.infer<
  typeof newsletterAssembleRequestedDataSchema
>;

export const newsletterAssembleRequestedEvent = eventType(
  "newsletter.assemble.requested",
  { schema: newsletterAssembleRequestedDataSchema },
);
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
