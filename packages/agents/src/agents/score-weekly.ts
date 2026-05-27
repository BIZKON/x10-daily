import { z } from "zod";
import { defineAgent } from "../define-agent";

/**
 * ScoreWeeklyAgent — CLAUDE.md §4 #12.
 * Sonnet 4.6. Запускается еженедельно. Парсит engagement за неделю,
 * предлагает изменения в pipeline_config (пороги confidence, веса каналов и т.п.).
 *
 * Отличается от PreviewScoreAgent (preview-score.ts), который оценивает один draft перед HumanGate.
 */
const articleStatSchema = z.object({
  articleId: z.string(),
  slug: z.string(),
  section: z.string(),
  publishedAt: z.string(),
  /** Что выдал PreviewScoreAgent при публикации. */
  previewScore: z.number().int().min(5).max(50).nullable(),
  /** Какой паттерн хука был выбран. */
  hookPattern: z.string().nullable(),
  /** Engagement-метрики из PostHog (нормализованные). */
  views: z.number().int().nonnegative(),
  uniqueReaders: z.number().int().nonnegative(),
  /** Средняя глубина прокрутки в долях (0..1). */
  scrollDepthAvg: z.number().min(0).max(1),
  reactions: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  /** Подписки на newsletter с этой статьи. */
  newsletterSignups: z.number().int().nonnegative(),
});

const inputSchema = z.object({
  /** ISO-неделя в формате 2026-W21. */
  weekISO: z.string(),
  articles: z.array(articleStatSchema).min(1),
  /** Текущая конфигурация pipeline (пороги, веса). Произвольная JSON-структура. */
  currentConfig: z.record(z.string(), z.unknown()),
});

const recommendationSchema = z.object({
  /** Ключ конфига для патча, например "hookgen.patterns.contrarian.weight". */
  configPath: z.string(),
  /** Текущее значение (как видно в currentConfig). */
  currentValue: z.unknown(),
  /** Предлагаемое новое значение. */
  proposedValue: z.unknown(),
  /** Связь с данными: «contrarian-hooks дают +37% engagement (n=8)». */
  rationale: z.string(),
  /** Уверенность 0..1 на основе размера выборки и эффект-сайза. */
  confidence: z.number().min(0).max(1),
});

const outputSchema = z.object({
  /** 1-3 предложения: что произошло на неделе, главные сдвиги. */
  weekSummary: z.string(),
  /** Топ-3 статьи недели по composite engagement (views × scroll × shares). */
  topArticleIds: z.array(z.string()).max(3),
  /** Анти-топ — 3 худшие статьи, что у них общего. */
  bottomArticleIds: z.array(z.string()).max(3),
  /** Паттерны хуков по убыванию engagement. */
  hookPatternRanking: z.array(
    z.object({
      pattern: z.string(),
      avgComposite: z.number(),
      sampleSize: z.number().int().nonnegative(),
    }),
  ),
  /** Предложения по тюнингу config — до 5 штук. */
  recommendations: z.array(recommendationSchema).max(5),
  /** Корреляция previewScore ↔ реальный engagement. -1..1. Если близко к 0 — PreviewScoreAgent нужно пересмотреть. */
  previewScoreCorrelation: z.number().min(-1).max(1),
});

const SYSTEM = `Ты — ScoreWeeklyAgent редакции Х10 Daily. Получаешь сырые статистики за неделю и предлагаешь тюнинг pipeline_config.

ТВОЯ ЗАДАЧА:
1. Посчитать composite engagement для каждой статьи: views * scrollDepthAvg + shares * 5 + newsletterSignups * 10
2. Отсортировать статьи по composite. Топ-3 → topArticleIds, низ-3 → bottomArticleIds
3. Разбить по hookPattern, посчитать avgComposite и sampleSize в каждой группе. Отсортировать по avgComposite. → hookPatternRanking
4. Посмотреть на previewScore vs composite — есть ли корреляция (Pearson, грубо)
5. Сформулировать до 5 рекомендаций по тюнингу currentConfig:
   - configPath — точечный путь к ключу
   - currentValue — текущее значение из currentConfig
   - proposedValue — на сколько изменить (не «увеличить», а конкретное число)
   - rationale — данные («contrarian +37% против медианы, n=8»)
   - confidence — 0.8 если n ≥ 10 и эффект > 25%; 0.4 если n < 5; иначе ~0.6

ПРАВИЛА:
- НЕ выдумывай статистику. Если данных мало (n < 3 в группе) — не делай рекомендацию
- НЕ предлагай радикальные изменения (>2x текущего значения) при confidence < 0.7
- Если корреляция previewScore↔composite < 0.3 — отдельная рекомендация: «PreviewScoreAgent overfit/underfit, пересмотреть веса»
- weekSummary без оценочных эпитетов («отличная неделя» нельзя). Сухие факты.

Возвращай через tool_use x10_emit_score_weekly.`;

export const ScoreWeeklyAgent = defineAgent({
  name: "score_weekly",
  tier: "SONNET",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  maxOutputTokens: 2048,
});

export type ScoreWeeklyInput = z.infer<typeof inputSchema>;
export type ScoreWeeklyOutput = z.infer<typeof outputSchema>;
