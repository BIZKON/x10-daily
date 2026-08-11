import { zValidator } from "@hono/zod-validator";
import { articles, channels, creationModes, creations, desc, eq } from "@x10/db";
import { Hono } from "hono";
import { Inngest } from "inngest";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requirePermission } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";
import { toArticleDraft } from "../lib/creation-to-article";

/**
 * Раздел «Создать» — ручной режим (реестр разрыва §3.2).
 *
 * Человек выбирает режим, коротко говорит тему и получает материал. Разница с
 * чатом держится на поле `creation_modes.guidance`: «как делается правильно»
 * уже прописано внутри режима, поэтому от человека нужна только тема.
 *
 * Права: смотреть — `content.view`, создавать — `content.edit`. Создание
 * тратит деньги клиента, поэтому оно на праве правки, а не просмотра.
 */

/**
 * 🔴 Потолок темы обязан совпадать с `creationInputSchema.topic` в
 * `@x10/agents`. Разъедутся — api примет задание, а конвейер отвергнет его на
 * валидации входа, и человек увидит «не удалось создать» без объяснения.
 * Договор закреплён тестом `apps/api/test/admin-create.test.ts`.
 */
export const MAX_PROMPT = 2000;

const createSchema = z.object({
  modeSlug: z.string().trim().min(1).max(48),
  prompt: z.string().trim().min(1).max(MAX_PROMPT),
});

const idParam = z.object({ id: z.string().uuid() });

const CREATION_RUN_REQUESTED = "creation/run.requested" as const;
const ARTICLE_COVER_REQUESTED = "article/cover.requested" as const;

let cachedClient: Inngest | undefined;
function getInngest(env: ReturnType<typeof getEnv>): Inngest {
  if (cachedClient) return cachedClient;
  cachedClient = new Inngest({
    id: "x10-api",
    eventKey: env.INNGEST_EVENT_KEY,
    isDev: env.NODE_ENV !== "production",
  });
  return cachedClient;
}

type ModeRow = { title: string; available: boolean; enabled: boolean };
export type ModeGate = { ok: true } | { ok: false; error: string; message: string };

/**
 * Можно ли работать этим режимом.
 *
 * Выключенный отвечает «нет такого»: он скрыт из списка, и признаться, что он
 * существует, значит показать человеку дверь, которую он не открывал и открыть
 * не может. А вот «готовится» — видимое состояние, и молчать о нём нельзя:
 * из шести режимов сегодня работает один, человек видит остальные и вправе
 * получить причину, а не общий отказ.
 */
export function checkMode(mode: ModeRow | undefined): ModeGate {
  if (!mode || !mode.enabled) {
    return { ok: false, error: "not_found", message: "Такого режима нет." };
  }
  if (!mode.available) {
    return {
      ok: false,
      error: "mode_unavailable",
      message: `Режим «${mode.title}» ещё готовится — материал по нему пока не создаётся.`,
    };
  }
  return { ok: true };
}

type QueueableRow = {
  status: string;
  articleId: string | null;
  result: { title?: string; body?: string } | null;
};

/**
 * Можно ли отправить задание в очередь публикации.
 *
 * Повторную отправку отклоняем по `article_id`, а не по статусу: без этого
 * второе нажатие завело бы вторую статью с тем же текстом, в канал ушёл бы
 * дубль, а автор решил бы, что первая кнопка не сработала.
 */
export function checkQueueable(row: QueueableRow): ModeGate {
  if (row.articleId) {
    return {
      ok: false,
      error: "already_queued",
      message: "Этот материал уже отправлен в очередь.",
    };
  }
  if (row.status !== "ready") {
    return {
      ok: false,
      error: "not_ready",
      message: "Материал ещё не готов. Дождитесь, пока задание выполнится.",
    };
  }
  if (!row.result?.title?.trim() || !row.result?.body?.trim()) {
    return {
      ok: false,
      error: "empty_result",
      message: "У задания нет готового текста — отправлять нечего.",
    };
  }
  return { ok: true };
}

export const adminCreateRoute = new Hono<AppEnv>()
  /**
   * Режимы для экрана. Отдаём и недоступные: честная пометка «готовится»
   * объясняет, что будет дальше, а пустой экран из одной кнопки читается как
   * недоделка. Порядок задан позицией — он же порядок важности.
   */
  .get("/create/modes", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");

    const items = await db
      .select({
        slug: creationModes.slug,
        title: creationModes.title,
        subtitle: creationModes.subtitle,
        purpose: creationModes.purpose,
        available: creationModes.available,
        /**
         * Экран показывает человеку, какие полки базы знаний уйдут в работу.
         * Это не украшение: клиент должен видеть, что прайс не попадёт в
         * публичный пост, — иначе он либо не доверит системе цены вовсе, либо
         * узнает об утечке из готового материала.
         */
        shelfSlugs: creationModes.shelfSlugs,
      })
      .from(creationModes)
      .where(eq(creationModes.enabled, true))
      .orderBy(creationModes.position);

    return c.json({ items });
  })

  /** Последние задания — лента раздела. Результат целиком здесь не нужен. */
  .get("/create", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");

    const items = await db
      .select({
        id: creations.id,
        prompt: creations.prompt,
        status: creations.status,
        statusReason: creations.statusReason,
        articleId: creations.articleId,
        createdAt: creations.createdAt,
        modeSlug: creationModes.slug,
        modeTitle: creationModes.title,
      })
      .from(creations)
      .innerJoin(creationModes, eq(creations.modeId, creationModes.id))
      .orderBy(desc(creations.createdAt))
      .limit(50);

    return c.json({ items });
  })

  /**
   * Одно задание целиком — этим экран опрашивает готовность.
   *
   * `knowledgeUsed` отдаём: на вопрос «почему получилось так» отвечает именно
   * снимок знаний, ушедших в модель, а не пересказ по памяти.
   */
  .get("/create/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");
    const { id } = c.req.valid("param");

    const [row] = await db
      .select({
        id: creations.id,
        prompt: creations.prompt,
        status: creations.status,
        statusReason: creations.statusReason,
        result: creations.result,
        knowledgeUsed: creations.knowledgeUsed,
        articleId: creations.articleId,
        createdAt: creations.createdAt,
        updatedAt: creations.updatedAt,
        modeSlug: creationModes.slug,
        modeTitle: creationModes.title,
      })
      .from(creations)
      .innerJoin(creationModes, eq(creations.modeId, creationModes.id))
      .where(eq(creations.id, id))
      .limit(1);

    if (!row) return c.json({ error: "not_found", message: "Задание не найдено." }, 404);
    return c.json(row);
  })

  /**
   * Создать задание и поставить его в очередь.
   *
   * Строку заводим ДО события: она и есть то, что человек видит на экране, а
   * событие несёт только её id. Иначе пришлось бы дублировать тему и режим в
   * событии и получить второй источник правды, который разойдётся с базой.
   */
  .post("/create", zValidator("json", createSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "content.edit");
    const body = c.req.valid("json");

    const [mode] = await db
      .select({
        id: creationModes.id,
        title: creationModes.title,
        available: creationModes.available,
        enabled: creationModes.enabled,
      })
      .from(creationModes)
      .where(eq(creationModes.slug, body.modeSlug))
      .limit(1);

    const gate = checkMode(mode);
    if (!gate.ok) {
      return c.json(
        { error: gate.error, message: gate.message },
        gate.error === "not_found" ? 404 : 409,
      );
    }
    // checkMode уже отверг пустой режим; условие для компилятора.
    if (!mode) return c.json({ error: "not_found", message: "Такого режима нет." }, 404);

    const [row] = await db
      .insert(creations)
      .values({
        modeId: mode.id,
        prompt: body.prompt,
        status: "queued",
        createdBy: me.userId,
      })
      .returning({ id: creations.id });

    if (!row) {
      return c.json({ error: "not_created", message: "Не удалось создать задание." }, 500);
    }

    try {
      await getInngest(env).send({
        name: CREATION_RUN_REQUESTED,
        data: { creationId: row.id },
      });
    } catch (e) {
      /**
       * 🔴 Событие и есть работа. Провалилось — задание навсегда осталось бы
       * «в очереди», и экран честно показывал бы ожидание того, что уже
       * никогда не начнётся. Помечаем сбой сразу, чтобы человек мог повторить.
       */
      await db
        .update(creations)
        .set({
          status: "failed",
          statusReason: "Не удалось поставить задание в очередь. Попробуйте ещё раз.",
          updatedAt: new Date(),
        })
        .where(eq(creations.id, row.id));

      console.error(
        `admin-create: событие ${CREATION_RUN_REQUESTED} не ушло для ${row.id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
      return c.json(
        { error: "queue_failed", message: "Не удалось поставить задание в очередь.", id: row.id },
        502,
      );
    }

    return c.json({ id: row.id, status: "queued" }, 201);
  })

  /**
   * Отправить готовый материал в очередь публикации.
   *
   * Повторяет путь конвейера ШАГ В ШАГ, а не строит второй рядом: статья →
   * строка очереди канала → событие обложки. Дальше работает уже готовая
   * машинерия: обложка, карточка ревью в «Редакцию», ворота HumanGate и слоты.
   * Ручной материал в канале ничем не отличается от автоматического — этого и
   * добивались.
   *
   * Право `content.publish`, а не `content.edit`: статья сразу попадает в ленту
   * мини-аппа (так же, как у конвейера), то есть это выпуск наружу. Автор
   * материал создаёт, редактор выпускает — как и задумано ролями.
   */
  .post("/create/:id/queue", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.publish");
    const { id } = c.req.valid("param");

    const [row] = await db
      .select({
        id: creations.id,
        status: creations.status,
        articleId: creations.articleId,
        result: creations.result,
      })
      .from(creations)
      .where(eq(creations.id, id))
      .limit(1);

    if (!row) return c.json({ error: "not_found", message: "Задание не найдено." }, 404);

    const gate = checkQueueable(row);
    if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, 409);

    const draft = toArticleDraft({
      title: String(row.result?.title ?? ""),
      body: String(row.result?.body ?? ""),
    });

    // Адрес обязан быть уникальным: колонка под уникальным индексом, и
    // столкновение заголовков уронило бы отправку на ровном месте.
    const [taken] = await db
      .select({ slug: articles.slug })
      .from(articles)
      .where(eq(articles.slug, draft.slug))
      .limit(1);
    const slug = taken ? `${draft.slug}-${Date.now().toString(36)}` : draft.slug;

    const [article] = await db
      .insert(articles)
      .values({
        slug,
        section: "main",
        category: "news",
        template: "card-news",
        // Как у конвейера: в ленте мини-аппа материал виден сразу, а канал
        // остаётся курируемым — его держат ворота ревью.
        status: "published",
        publishedAt: new Date(),
        tease: draft.tease,
        lede: draft.lede,
        whyItMatters: null,
        body: draft.body,
        wordCount: draft.wordCount,
        readSeconds: draft.readSeconds,
        metadata: { source: "creation", creationId: row.id },
      })
      .returning({ id: articles.id, slug: articles.slug });

    if (!article) {
      return c.json({ error: "not_created", message: "Не удалось создать материал." }, 500);
    }

    // Очередь канала. Текст кладём как есть: ссылку, превью и обложку
    // `drain-post-slots` соберёт сам в момент отправки.
    await db
      .insert(channels)
      .values({ articleId: article.id, channel: "tg", text: String(row.result?.body ?? "") })
      .onConflictDoNothing();

    await db
      .update(creations)
      .set({ articleId: article.id, updatedAt: new Date() })
      .where(eq(creations.id, row.id));

    /**
     * Обложка отдельным событием — и вместе с ней приезжает карточка ревью:
     * её шлёт `generate-cover` после генерации. Сбой отправки события не
     * должен отменять уже созданную статью, поэтому ошибку глотаем с записью
     * в лог.
     *
     * ⚠️ Пока карточки нет, ворота ревью статью не держат — она может уйти в
     * ближайший слот без одобрения. Окно длится до конца генерации обложки.
     * Это поведение КОНВЕЙЕРА, не новое: он создаёт строку очереди ровно так
     * же, до обложки. Сужать окно — отдельная задача для обоих путей сразу.
     */
    try {
      await getInngest(env).send({
        name: ARTICLE_COVER_REQUESTED,
        data: { articleId: article.id },
      });
    } catch (e) {
      console.error(
        `admin-create: обложка для ${article.id} не заказана: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }

    return c.json({ articleId: article.id, slug: article.slug }, 201);
  });
