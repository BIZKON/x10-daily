import { zValidator } from "@hono/zod-validator";
import {
  authors,
  digests,
  eq,
  events,
  klamps,
  pipelineConfig,
  sql,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { EDITOR_ROLES, requireRole } from "../auth";
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
 * Pipeline config — packages/db schema.pipeline.pipelineConfig
 * Один effective row на agent (приложение enforces до миграции unique-индекса).
 * ---------------------------------------------------------------- */

const agentEnum = z.enum([
  "ingest",
  "draft",
  "numbers",
  "factcheck",
  "tov",
  "brevity",
  "audio",
  "hookgen",
  "social",
  "visual",
  "score",
  "newsletter",
]);

const PIPELINE_AGENTS = agentEnum.options;

const pipelineAgentParam = z.object({ agent: agentEnum });

const pipelineConfigUpsertSchema = z.object({
  enabled: z.boolean(),
  /** null → использовать model из кода агента (без override). */
  modelOverride: z.string().max(64).nullable(),
  /** 0..1, drizzle сохранит как numeric(4,3). */
  confidenceThreshold: z.number().min(0).max(1),
});

/** Дефолты для отсутствующего row (соответствуют schema defaults). */
const DEFAULT_CONFIG = {
  enabled: true,
  modelOverride: null as string | null,
  confidenceThreshold: "0.700",
};

type PipelineConfigView = {
  agent: (typeof PIPELINE_AGENTS)[number];
  enabled: boolean;
  modelOverride: string | null;
  confidenceThreshold: string;
};

function toView(
  agent: (typeof PIPELINE_AGENTS)[number],
  row?: {
    enabled: boolean;
    modelOverride: string | null;
    confidenceThreshold: string;
  },
): PipelineConfigView {
  return {
    agent,
    enabled: row?.enabled ?? DEFAULT_CONFIG.enabled,
    modelOverride: row?.modelOverride ?? DEFAULT_CONFIG.modelOverride,
    confidenceThreshold:
      row?.confidenceThreshold ?? DEFAULT_CONFIG.confidenceThreshold,
  };
}

/* ----------------------------------------------------------------
 * Route definition
 * ---------------------------------------------------------------- */

export const adminContentRoute = new Hono<AppEnv>()
  /* ===== AUTHORS ===== */
  .post("/authors", zValidator("json", authorCreateSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const data = c.req.valid("json");
    const [row] = await db.insert(authors).values(data).returning();
    return c.json(row, 201);
  })
  .patch(
    "/authors/:id",
    zValidator("param", idParam),
    zValidator("json", authorUpdateSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requireRole(c, db, EDITOR_ROLES);
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
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");
    const [row] = await db.delete(authors).where(eq(authors.id, id)).returning({ id: authors.id });
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json({ deleted: row.id });
  })

  /* ===== KLAMPS ===== */
  .post("/klamps", zValidator("json", klampCreateSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const data = c.req.valid("json");
    const [row] = await db.insert(klamps).values(data).returning();
    return c.json(row, 201);
  })
  .patch(
    "/klamps/:id",
    zValidator("param", idParam),
    zValidator("json", klampUpdateSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requireRole(c, db, EDITOR_ROLES);
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
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");
    const [row] = await db.delete(klamps).where(eq(klamps.id, id)).returning({ id: klamps.id });
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json({ deleted: row.id });
  })

  /* ===== EVENTS ===== */
  .post("/events", zValidator("json", eventCreateSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
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
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requireRole(c, db, EDITOR_ROLES);
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
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");
    const [row] = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json({ deleted: row.id });
  })

  /* ===== DIGESTS ===== */
  .post("/digests", zValidator("json", digestCreateSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const data = c.req.valid("json");
    const [row] = await db.insert(digests).values(data).returning();
    return c.json(row, 201);
  })
  .patch(
    "/digests/:id",
    zValidator("param", idParam),
    zValidator("json", digestUpdateSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requireRole(c, db, EDITOR_ROLES);
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
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
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
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");
    const [row] = await db
      .update(digests)
      .set({ sentAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(digests.id, id))
      .returning();
    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json(row);
  })

  /* ===== PIPELINE CONFIG ===== */
  /**
   * GET /v1/admin/pipeline-config
   * Все 12 агентов с эффективными значениями (stored row или defaults).
   */
  .get("/pipeline-config", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const rows = await db
      .select({
        agent: pipelineConfig.agent,
        enabled: pipelineConfig.enabled,
        modelOverride: pipelineConfig.modelOverride,
        confidenceThreshold: pipelineConfig.confidenceThreshold,
      })
      .from(pipelineConfig);
    const byAgent = new Map(rows.map((r) => [r.agent, r]));
    const items: PipelineConfigView[] = PIPELINE_AGENTS.map((a) =>
      toView(a, byAgent.get(a)),
    );
    return c.json({ items });
  })

  /**
   * GET /v1/admin/pipeline-config/:agent
   * Effective config для одного агента — для edit-form. 200 всегда (дефолты если не сохранён).
   */
  .get(
    "/pipeline-config/:agent",
    zValidator("param", pipelineAgentParam),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requireRole(c, db, EDITOR_ROLES);
      const { agent } = c.req.valid("param");
      const [row] = await db
        .select({
          enabled: pipelineConfig.enabled,
          modelOverride: pipelineConfig.modelOverride,
          confidenceThreshold: pipelineConfig.confidenceThreshold,
        })
        .from(pipelineConfig)
        .where(eq(pipelineConfig.agent, agent))
        .limit(1);
      return c.json(toView(agent, row));
    },
  )

  /**
   * PUT /v1/admin/pipeline-config/:agent
   * Upsert через SELECT+UPDATE/INSERT (нет unique-индекса на agent — приложение enforces).
   * confidenceThreshold (number) → numeric(4,3) string в БД.
   */
  .put(
    "/pipeline-config/:agent",
    zValidator("param", pipelineAgentParam),
    zValidator("json", pipelineConfigUpsertSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requireRole(c, db, EDITOR_ROLES);
      const { agent } = c.req.valid("param");
      const data = c.req.valid("json");
      const thresholdStr = data.confidenceThreshold.toFixed(3);

      // MEDIUM-7 closed: migration 0004 добавила unique index на agent.
      // Один atomic UPSERT вместо SELECT+UPDATE/INSERT — race-safe и проще.
      const [row] = await db
        .insert(pipelineConfig)
        .values({
          agent,
          enabled: data.enabled,
          modelOverride: data.modelOverride,
          confidenceThreshold: thresholdStr,
        })
        .onConflictDoUpdate({
          target: pipelineConfig.agent,
          set: {
            enabled: data.enabled,
            modelOverride: data.modelOverride,
            confidenceThreshold: thresholdStr,
            updatedAt: sql`now()`,
          },
        })
        .returning({
          enabled: pipelineConfig.enabled,
          modelOverride: pipelineConfig.modelOverride,
          confidenceThreshold: pipelineConfig.confidenceThreshold,
        });
      return c.json(toView(agent, row));
    },
  );
