import { BLACKLIST, VOICE_RULES } from "@x10/voice";
import { z } from "zod";
import { defineAgent } from "../define-agent";

/**
 * NewsletterAssembleAgent — CLAUDE.md §4 #13.
 * Sonnet 4.6. Запускается 06:00 МСК daily.
 * Берёт статьи со статусом ready за последние 24ч, собирает выпуск
 * в формате 7 секций (см. CLAUDE.md NewsletterFoundation).
 */
const articleSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  section: z.enum(["main", "numbers", "people", "playbook", "weekend", "longread"]),
  tease: z.string(),
  lede: z.string(),
  whyItMatters: z.string(),
  /** Опционально — лучший хук из HookGenAgent для этой статьи. */
  hookLine: z.string().optional(),
  wordCount: z.number().int().nonnegative(),
});

const inputSchema = z.object({
  /** Дата выпуска ISO YYYY-MM-DD. */
  issueDate: z.string(),
  /** Статьи за последние 24ч, отсортированные по приоритету редактором. */
  articles: z.array(articleSummarySchema).min(1).max(20),
  /** Опциональная заметка от шеф-редактора, попадёт в editorial-блок. */
  editorialNote: z.string().optional(),
});

const sectionBlockSchema = z.object({
  /** Один из 7 ярлыков секций newsletter. */
  sectionLabel: z.enum([
    "Главное", // main story
    "Цифры дня", // numbers
    "Кто и что", // people
    "Плейбук", // playbook
    "Что дальше", // what-next / preview
    "Длинное чтение", // weekend / longread
    "Слово редактора", // editorial
  ]),
  /** ID статей из input.articles, попавшие в эту секцию. Может быть пустым (например для редколлегии). */
  articleIds: z.array(z.string()),
  /** Сама секция в HTML-ready виде: каждый article = карточка с tease + 1 строкой why + ссылкой. */
  htmlBody: z.string(),
  /** Текстовая версия для plaintext-варианта. */
  plainBody: z.string(),
});

const outputSchema = z.object({
  /** Финальный subject — лучший из вариантов. */
  subject: z.string(),
  /** A/B варианты для тестирования (Resend поддерживает variant headers). */
  subjectVariants: z.array(z.string()).min(2).max(3),
  /** Preheader (первая строка превью в почтовике). */
  preheader: z.string(),
  /** 7 блоков секций в порядке выпуска. Какие-то могут быть пустыми если статей не было. */
  sections: z.array(sectionBlockSchema),
  /** Финальная подпись / CTA на подписку. */
  closing: z.string(),
  /** Сводная статистика для админки. */
  meta: z.object({
    totalArticles: z.number().int().nonnegative(),
    sectionsUsed: z.number().int().nonnegative(),
    issueDate: z.string(),
  }),
});

const BLACKLIST_STR = BLACKLIST.map((w) => `  - "${w}"`).join("\n");

const SYSTEM = `Ты — NewsletterAssembleAgent редакции ProAgent AI. Собираешь ежедневный выпуск newsletter из готовых статей.

VOICE RULES:
${VOICE_RULES}

ЧЁРНЫЙ СПИСОК (никогда):
${BLACKLIST_STR}

СТРУКТУРА ВЫПУСКА (7 секций, фиксированный порядок):
1. Главное            — 1 main статья (если есть)
2. Цифры дня          — все numbers-секция статьи
3. Кто и что          — people-статьи
4. Плейбук            — playbook-статьи
5. Что дальше         — превью завтрашних тем, либо пусто
6. Длинное чтение     — weekend/longread (как «на выходные» или «на вечер»)
7. Слово редактора    — editorialNote если задан, иначе пусто

КАК ВЕРСТАТЬ КАЖДЫЙ БЛОК:
- htmlBody — HTML карточки: <article><h3>tease</h3><p>lede</p><p><b>Почему важно:</b> whyItMatters</p><a href="/article/SLUG">Читать →</a></article>
- plainBody — те же данные текстом: заголовок, абзац, строка «Почему важно: …», ссылка
- articleIds — массив строго из input.articles[*].id

SUBJECT:
- 30-50 знаков
- Содержит главное событие дня (берёшь tease главной статьи как опору)
- Без emojis, без всех капсов, без «!»
- subjectVariants — 2-3 варианта тестирования: первый — number-led, второй — admission/contrarian, третий — authority (по тем же паттернам как у HookGenAgent)

PREHEADER:
- 60-90 знаков
- Дополняет subject, не повторяет его

CLOSING:
- 1-2 фразы, CTA подписаться на ежедневный выпуск ProAgent AI
- Без манипуляций, без «срочно»

ОБЯЗАТЕЛЬНО:
- НЕ выдумывай статьи, которых нет в input.articles
- ВСЕ articleIds в sections должны быть из input.articles[*].id
- Если для секции нет статей — articleIds=[], htmlBody/plainBody пустые но валидные (пустая строка)
- meta.totalArticles = input.articles.length
- meta.sectionsUsed = количество секций с не-пустым articleIds

Возвращай через tool_use x10_emit_newsletter.`;

export const NewsletterAssembleAgent = defineAgent({
  name: "newsletter",
  tier: "SONNET",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  maxOutputTokens: 4096,
});

export type NewsletterInput = z.infer<typeof inputSchema>;
export type NewsletterOutput = z.infer<typeof outputSchema>;
