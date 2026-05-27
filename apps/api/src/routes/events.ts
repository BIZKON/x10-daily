import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, events, gte, sql } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Events endpoints — brief §2.2 type Event.
 *
 * /v1/events                — upcoming (city/type/isOnline/limit фильтры). По умолчанию startDate >= now.
 * /v1/events/:slug          — конкретное событие. Возвращает остаток мест если capacity задан.
 */

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  city: z.string().optional(),
  type: z
    .enum(["kod-x10", "meet-up", "breakfast", "festival", "webinar"])
    .optional(),
  online: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  /** "all" → включить прошедшие. По умолчанию только upcoming. */
  scope: z.enum(["upcoming", "all"]).default("upcoming"),
});

const slugParamSchema = z.object({
  slug: z.string().min(1).max(120),
});

export const eventsRoute = new Hono<AppEnv>()
  /**
   * GET /v1/events?scope=upcoming&city=&type=&online=&limit=
   */
  .get("/", zValidator("query", listQuerySchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const q = c.req.valid("query");
    const now = new Date();

    const rows = await db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        type: events.type,
        startDate: events.startDate,
        endDate: events.endDate,
        timezone: events.timezone,
        city: events.city,
        venue: events.venue,
        isOnline: events.isOnline,
        organizer: events.organizer,
        ticketPriceFrom: events.ticketPriceFrom,
        ticketUrl: events.ticketUrl,
        coverImageUrl: events.coverImageUrl,
        registeredCount: events.registeredCount,
        capacity: events.capacity,
      })
      .from(events)
      .where(
        and(
          q.scope === "upcoming" ? gte(events.startDate, now) : undefined,
          q.city ? eq(events.city, q.city) : undefined,
          q.type ? eq(events.type, q.type) : undefined,
          q.online !== undefined ? eq(events.isOnline, q.online) : undefined,
        ),
      )
      // Ближайшие сверху.
      .orderBy(asc(events.startDate))
      .limit(q.limit);

    // Добавляем seatsLeft для UI «осталось N мест».
    const items = rows.map((r) => ({
      ...r,
      seatsLeft:
        r.capacity !== null && r.capacity !== undefined
          ? Math.max(0, r.capacity - r.registeredCount)
          : null,
    }));

    return c.json({ items, count: items.length });
  })

  /**
   * GET /v1/events/:slug — полное событие с description и speakerIds.
   */
  .get("/:slug", zValidator("param", slugParamSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { slug } = c.req.valid("param");

    const [row] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
    if (!row) return c.json({ error: "not_found", slug }, 404);

    const seatsLeft =
      row.capacity !== null && row.capacity !== undefined
        ? Math.max(0, row.capacity - row.registeredCount)
        : null;

    return c.json({ ...row, seatsLeft });
  });
