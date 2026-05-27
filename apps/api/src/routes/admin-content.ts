import { zValidator } from "@hono/zod-validator";
import {
  authors,
  digests,
  eq,
  events,
  klamps,
  sql,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { extractUserId } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Admin CRUD endpoints для контентных сущностей brief'a.
 *
 * Все require X-User-Id (когда появится Telegram session — добавим role check
 * users.role IN ('editor','admin')).
 *
 * GET-эндпоинты не дублируем — используются публичные /v1/community/klamps,
 * /v1/authors, /v1/events, /v1/digests. Здесь только POST/PATCH/DELETE.
 */

const idParam = z.object({ id: z.string().uuid() });

/* ----------------------------------------------------------------
 * Authors — brief §6
 * ---------------------------------------------------------------- */

const authorCreateSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(80),
  bio: z.string().default(""),
  avatarUrl: z.string().url().nullable().optional(),
  bylineColor: z.string().max(16).nullable().optional(),
  isStaff: z.boolean().default(false),
  isFlagship: z.boolean().default(false),
  userId: z.string().uuid().nullable().optional(),
});

const authorUpdateSchema = authorCreateSchema.partial();

/* ----------------------------------------------------------------
 * Klamps — brief §2.1
 * ---------------------------------------------------------------- */

const klampCreateSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  country: z.string().max(4).default("РФ"),
  leadName: z.string().min(1).max(120),
  leadContact: z.string().nullable().optional(),
  memberCount: z.number().int().nonnegative().default(0),
  isOpen: z.boolean().default(true),
  meetingSchedule: z.string().min(1).max(200),
  description: z.string().default(""),
  goal: z.string().nullable().optional(),
});

const klampUpdateSchema = klampCreateSchema.partial();

/* ----------------------------------------------------------------
 * Events — brief §2.2
 * ---------------------------------------------------------------- */

const venueSchema = z.object({
  name: z.string(),
  address: z.string(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const eventCreateSchema = z
  .object({
    slug: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    type: z.enum(["kod-x10", "meet-up", "breakfast", "festival", "webinar"]),
    startDate: z.string().datetime(),
    endDate: z.string().datetime().nullable().optional(),
    timezone: z.string().max(40).default("Europe/Moscow"),
    city: z.string().max(80).nullable().optional(),
    venue: venueSchema.nullable().optional(),
    isOnline: z.boolean().default(false),
    organizer: z.string().min(1).max(120),
    ticketPriceFrom: z.number().int().nonnegative().nullable().optional(),
    ticketUrl: z.string().url().nullable().optional(),
    speakerIds: z.array(z.string().uuid()).default([]),
    description: z.string().min(1),
    coverImageUrl: z.string().url().nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (d) => !d.endDate || new Date(d.endDate) >= new Date(d.startDate),
    { message: "endDate must be ≥ startDate", path: ["endDate"] },
  );

const eventUpdateSchema = z
  .object({
    slug: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(200).optional(),
    type: z.enum(["kod-x10", "meet-up", "breakfast", "festival", "webinar"]).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().nullable().optional(),
    timezone: z.string().max(40).optional(),
    city: z.string().max(80).nullable().optional(),
    venue: venueSchema.nullable().optional(),
    isOnline: z.boolean().optional(),
    organizer: z.string().min(1).max(120).optional(),
    ticketPriceFrom: z.number().int().nonnegative().nullable().optional(),
    ticketUrl: z.string().url().nullable().optional(),
    speakerIds: z.array(z.string().uuid()).optional(),
    description: z.string().min(1).optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
  });

/* ----------------------------------------------------------------
 * Digests — brief §3.7
 * ---------------------------------------------------------------- */

const rybakovTakeSchema = z.object({
  quote: z.string().min(1),
  context: z.string().min(1),
});

const premiumTeaserSchema = z.object({
  title: z.string().min(1),
  articleId: z.string().uuid(),
});

const digestCreateSchema = z.object({
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  intro: z.string().min(1),
  topArticleIds: z.array(z.string().uuid()).min(1).max(10),
  rybakovTake: rybakovTakeSchema.nullable().optional(),
  premiumTeaser: premiumTeaserSchema.nullable().optional(),
  tomorrow: z.string().nullable().optional(),
});

const digestUpdateSchema = digestCreateSchema.partial();

/* ----------------------------------------------------------------
 * Route definition
 * ---------------------------------------------------------------- */

export const adminContentRoute = new Hono<AppEnv>()
  /* ===== AUTHORS ===== */
  .post("/authors", zValidator("json", authorCreateSchema), async (c) => {
    extractUserId(c); // 401 if missing
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const data = c.req.valid("json");
    const [row] = await db.insert(authors).values(data).returning();
    return c.json(row, 201);
  })
  .patch(
    "/authors/:id",
    zValidator("param", idParam),
    zValidator("json", authorUpdateSchema),
    async (c) => {
      extractUserId(c);
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const [row] = await db
        .update(authors)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(authors.id, id))
        .returning();
      if (!row) return c.json({ error: "not_found", id }, 404);
      return c.json(row);
    },
  )
  .delete("/authors/:id", zValidator("param", idParam), async (c) => {
    extractUserId(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { id } = c.req.valid("param");
    const [row] = await db.delete(authors).where(eq(authors.id, id)).returning({ id: authors.id });
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json({ deleted: row.id });
  })

  /* ===== KLAMPS ===== */
  .post("/klamps", zValidator("json", klampCreateSchema), async (c) => {
    extractUserId(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const data = c.req.valid("json");
    const [row] = await db.insert(klamps).values(data).returning();
    return c.json(row, 201);
  })
  .patch(
    "/klamps/:id",
    zValidator("param", idParam),
    zValidator("json", klampUpdateSchema),
    async (c) => {
      extractUserId(c);
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const [row] = await db
        .update(klamps)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(klamps.id, id))
        .returning();
      if (!row) return c.json({ error: "not_found", id }, 404);
      return c.json(row);
    },
  )
  .delete("/klamps/:id", zValidator("param", idParam), async (c) => {
    extractUserId(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { id } = c.req.valid("param");
    const [row] = await db.delete(klamps).where(eq(klamps.id, id)).returning({ id: klamps.id });
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json({ deleted: row.id });
  })

  /* ===== EVENTS ===== */
  .post("/events", zValidator("json", eventCreateSchema), async (c) => {
    extractUserId(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const data = c.req.valid("json");
    const [row] = await db
      .insert(events)
      .values({
        ...data,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
      })
      .returning();
    return c.json(row, 201);
  })
  .patch(
    "/events/:id",
    zValidator("param", idParam),
    zValidator("json", eventUpdateSchema),
    async (c) => {
      extractUserId(c);
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const [row] = await db
        .update(events)
        .set({
          ...patch,
          startDate: patch.startDate ? new Date(patch.startDate) : undefined,
          endDate:
            patch.endDate === undefined
              ? undefined
              : patch.endDate === null
                ? null
                : new Date(patch.endDate),
          updatedAt: sql`now()`,
        })
        .where(eq(events.id, id))
        .returning();
      if (!row) return c.json({ error: "not_found", id }, 404);
      return c.json(row);
    },
  )
  .delete("/events/:id", zValidator("param", idParam), async (c) => {
    extractUserId(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { id } = c.req.valid("param");
    const [row] = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json({ deleted: row.id });
  })

  /* ===== DIGESTS ===== */
  .post("/digests", zValidator("json", digestCreateSchema), async (c) => {
    extractUserId(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const data = c.req.valid("json");
    const [row] = await db.insert(digests).values(data).returning();
    return c.json(row, 201);
  })
  .patch(
    "/digests/:id",
    zValidator("param", idParam),
    zValidator("json", digestUpdateSchema),
    async (c) => {
      extractUserId(c);
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const [row] = await db
        .update(digests)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(digests.id, id))
        .returning();
      if (!row) return c.json({ error: "not_found", id }, 404);
      return c.json(row);
    },
  )
  .delete("/digests/:id", zValidator("param", idParam), async (c) => {
    extractUserId(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { id } = c.req.valid("param");
    const [row] = await db.delete(digests).where(eq(digests.id, id)).returning({ id: digests.id });
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json({ deleted: row.id });
  })
  /**
   * POST /v1/admin/digests/:id/mark-sent
   * Ставит sent_at = now() — отдельный action для удобства редактора.
   */
  .post("/digests/:id/mark-sent", zValidator("param", idParam), async (c) => {
    extractUserId(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { id } = c.req.valid("param");
    const [row] = await db
      .update(digests)
      .set({ sentAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(digests.id, id))
      .returning();
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json(row);
  });
