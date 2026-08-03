import { zValidator } from "@hono/zod-validator";
import { and, articles, desc, eq, isNotNull } from "@x10/db";
import { Hono } from "hono";
import { Inngest } from "inngest";
import { z } from "zod";
import type { AppEnv } from "../app";
import { EDITOR_ROLES, requireRole } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Ревью ИИ-обложек (Спека 2) — HumanGate на картинку.
 *
 * 🔴 Ключевое правило CLAUDE.md §4: AI не публикует автономно. Конвейер
 * (generate-cover) доводит обложку только до `pending_review`; в канал её
 * пускает ТОЛЬКО редактор кнопкой «Одобрить» здесь.
 *
 * Все эндпоинты требуют роль editor|admin (паттерн admin-content.ts).
 */

const ARTICLE_COVER_REQUESTED = "article/cover.requested" as const;

/** Состояния, которые редактор может видеть в очереди. */
const listQuerySchema = z.object({
  status: z
    .enum(["pending_review", "approved", "rejected", "none", "generating"])
    .default("pending_review"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const idParam = z.object({ id: z.string().uuid() });

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

export const adminVisualRoute = new Hono<AppEnv>()
  /**
   * Очередь ревью. По умолчанию — обложки, ждущие решения редактора.
   * Отдаём только то, что нужно карточке ревью (картинка + о чём статья + промпт).
   */
  .get("/visuals", zValidator("query", listQuerySchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { status, limit } = c.req.valid("query");

    const rows = await db
      .select({
        id: articles.id,
        slug: articles.slug,
        tease: articles.tease,
        lede: articles.lede,
        category: articles.category,
        coverImageUrl: articles.coverImageUrl,
        visualPrompt: articles.visualPrompt,
        visualStatus: articles.visualStatus,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .where(and(eq(articles.visualStatus, status), isNotNull(articles.coverImageUrl)))
      .orderBy(desc(articles.createdAt))
      .limit(limit);

    return c.json({ items: rows, status });
  })

  /**
   * Одобрить — единственный путь, которым картинка попадает в канал.
   * Гард по `pending_review`: одобрять можно только то, что реально ждёт ревью,
   * иначе гонка «редактор нажал дважды / статья уже отклонена» тихо меняла бы
   * решение.
   */
  .post("/visuals/:id/approve", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");

    const [row] = await db
      .update(articles)
      .set({ visualStatus: "approved" })
      .where(
        and(
          eq(articles.id, id),
          eq(articles.visualStatus, "pending_review"),
          isNotNull(articles.coverImageUrl),
        ),
      )
      .returning({ id: articles.id, visualStatus: articles.visualStatus });

    if (!row) return c.json({ error: "not_pending_review", id }, 409);
    return c.json(row);
  })

  /** «Без картинки» — пост уйдёт текстом, лента покажет брендовую обложку. */
  .post("/visuals/:id/reject", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");

    const [row] = await db
      .update(articles)
      .set({ visualStatus: "rejected" })
      .where(eq(articles.id, id))
      .returning({ id: articles.id, visualStatus: articles.visualStatus });

    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json(row);
  })

  /**
   * Перегенерировать. Событие уходит с `force: true` — иначе generate-cover
   * увидит уже существующую обложку и скипнется (гард от дубль-событий).
   * Статус НЕ трогаем: пока новая картинка не готова, в канал по-прежнему
   * годится старая (если была одобрена) либо текст.
   */
  .post("/visuals/:id/regenerate", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");

    // 🔴 Снимаем одобрение ДО генерации. Файл обложки перезаписывается по тому
    // же пути, поэтому после saveCover одобренных редактором байтов физически
    // больше не существует — а статус в БД ещё говорил бы `approved`, и слот
    // постинга отправил бы в канал непросмотренную картинку.
    // `generating` гасит её и в ленте, и в канале до нового одобрения.
    const [row] = await db
      .update(articles)
      .set({ visualStatus: "generating" })
      .where(eq(articles.id, id))
      .returning({ id: articles.id });
    if (!row) return c.json({ error: "not_found", id }, 404);

    const { ids } = await getInngest(env).send({
      name: ARTICLE_COVER_REQUESTED,
      data: { articleId: id, force: true },
    });

    return c.json({ accepted: true, eventIds: ids, articleId: id }, 202);
  });
