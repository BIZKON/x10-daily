import { zValidator } from "@hono/zod-validator";
import { asc, eq, sources } from "@x10/db";
import { Hono } from "hono";
import { Inngest } from "inngest";
import { z } from "zod";
import type { AppEnv } from "../app";
import { EDITOR_ROLES, requireRole } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Источники парсинга — раздел, из которого клиент заводит ленты для постов.
 *
 * 🔴 Главное правило этого маршрута: источник создаётся ВЫКЛЮЧЕННЫМ.
 * Свежий источник не имеет ни одной строки в `seen_items`, поэтому первый тик
 * `ingest-rss` принял бы весь исторический фид за новости и выстрелил в канал
 * бэклогом за месяцы (CLAUDE.md §4). Включает источник только функция
 * `prime-source` — после того, как фид реально прочитан и записан.
 *
 * Раньше это было инструкцией человеку в `scripts/seed-sources.sql`. В
 * интерфейсе, которым пользуется клиент, инструкции не работают: он не обязан
 * знать слово «приминание» и не должен зависеть от того, вспомнил ли кто-то
 * про него.
 */

const SOURCE_PRIME_REQUESTED = "source/prime.requested" as const;

/**
 * Тип получения фида. Фетчер универсален (rss-parser парсит и RSS, и Atom),
 * поле несёт семантику и спец-хендлинг: `reddit` идёт через OAuth, потому что
 * анонимный .rss упирается в 429 по IP.
 */
const ADAPTER_TYPES = ["rss", "youtube", "github", "reddit"] as const;

/** Насколько источнику верить: влияет на приоритет в конвейере. */
const TIERS = ["primary", "secondary", "fringe"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(128),
  url: z.string().trim().url().max(2000),
  adapterType: z.enum(ADAPTER_TYPES).default("rss"),
  tier: z.enum(TIERS).default("secondary"),
  locale: z.string().trim().min(2).max(8).default("ru"),
  /** Как часто ходить за фидом, сек. Минимум 5 минут — бережём чужие лимиты. */
  pollIntervalSec: z.coerce.number().int().min(300).max(86_400).default(900),
  notes: z.string().trim().max(500).optional(),
});

/** Правка: адрес и тип менять нельзя — они определяют уже приминенный фид. */
const patchSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  tier: z.enum(TIERS).optional(),
  pollIntervalSec: z.coerce.number().int().min(300).max(86_400).optional(),
  enabled: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
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

export const adminSourcesRoute = new Hono<AppEnv>()
  .get("/sources", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);

    const rows = await db
      .select({
        id: sources.id,
        name: sources.name,
        url: sources.url,
        adapterType: sources.adapterType,
        tier: sources.tier,
        locale: sources.locale,
        enabled: sources.enabled,
        status: sources.status,
        pollIntervalSec: sources.pollIntervalSec,
        lastPolledAt: sources.lastPolledAt,
        notes: sources.notes,
        createdAt: sources.createdAt,
      })
      .from(sources)
      .orderBy(asc(sources.name));

    return c.json({ items: rows });
  })

  /**
   * Завести источник. Отвечаем 202, а не 201: работа не закончена — фид ещё
   * предстоит прочитать. Клиент увидит в списке «проверяется», а через минуту
   * либо «работает», либо причину отказа.
   */
  .post("/sources", zValidator("json", createSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const body = c.req.valid("json");

    const dup = await db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.url, body.url))
      .limit(1);
    if (dup[0]) {
      return c.json({ error: "duplicate_url", message: "Такой адрес уже добавлен." }, 409);
    }

    const [row] = await db
      .insert(sources)
      .values({
        name: body.name,
        url: body.url,
        kind: "rss",
        adapterType: body.adapterType,
        tier: body.tier,
        locale: body.locale,
        pollIntervalSec: body.pollIntervalSec,
        notes: body.notes ?? null,
        // 🔴 Выключен и `pending` до успешного приминания — см. докблок файла.
        enabled: false,
        status: "pending",
      })
      .returning({ id: sources.id });

    if (!row) return c.json({ error: "insert_failed" }, 500);

    await getInngest(env).send({
      name: SOURCE_PRIME_REQUESTED,
      data: { sourceId: row.id },
    });

    return c.json({ id: row.id, status: "pending", checking: true }, 202);
  })

  .patch(
    "/sources/:id",
    zValidator("param", idParam),
    zValidator("json", patchSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requireRole(c, db, EDITOR_ROLES);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const [current] = await db
        .select({ status: sources.status })
        .from(sources)
        .where(eq(sources.id, id))
        .limit(1);
      if (!current) return c.json({ error: "not_found", id }, 404);

      // Непроверенный источник включать нельзя: приминания не было, и включение
      // вернуло бы ровно ту проблему, ради которой всё это сделано.
      if (body.enabled === true && current.status === "pending") {
        return c.json(
          {
            error: "not_primed",
            message: "Источник ещё не проверен. Дождись проверки или удали и заведи заново.",
          },
          409,
        );
      }

      const [row] = await db
        .update(sources)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.tier !== undefined ? { tier: body.tier } : {}),
          ...(body.pollIntervalSec !== undefined ? { pollIntervalSec: body.pollIntervalSec } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.enabled !== undefined
            ? { enabled: body.enabled, status: body.enabled ? "active" : "inactive" }
            : {}),
        })
        .where(eq(sources.id, id))
        .returning({ id: sources.id, enabled: sources.enabled, status: sources.status });

      return c.json(row);
    },
  )

  /**
   * Удалить источник. `seen_items` уходят каскадом (FK onDelete: cascade) —
   * это осознанно: реестр «уже виденного» без источника бессмыслен.
   * ⚠️ Заведённый заново тот же адрес будет приминаться с нуля, и это правильно.
   */
  .delete("/sources/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");

    const [row] = await db.delete(sources).where(eq(sources.id, id)).returning({ id: sources.id });
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json({ deleted: true, id });
  });
