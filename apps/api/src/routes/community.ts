import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, klamps } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Community endpoints — brief §2.1 type Klamp.
 *
 * /v1/community/klamps             — список с фильтрами (city/country/isOpen/limit)
 * /v1/community/klamps/:slug       — конкретный кламп
 * /v1/community/stats              — агрегированная статистика (для CommunityStats компонента)
 */

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  city: z.string().optional(),
  country: z.string().optional(),
  /** "true" → только клампы принимающие новых. */
  open: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

const slugParamSchema = z.object({
  slug: z.string().min(1).max(80),
});

export const communityRoute = new Hono<AppEnv>()
  /**
   * GET /v1/community/klamps?city=&country=&open=&limit=
   * Returns: { items: Klamp[], count }
   */
  .get("/klamps", zValidator("query", listQuerySchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const q = c.req.valid("query");

    const rows = await db
      .select({
        id: klamps.id,
        slug: klamps.slug,
        name: klamps.name,
        city: klamps.city,
        country: klamps.country,
        leadName: klamps.leadName,
        memberCount: klamps.memberCount,
        isOpen: klamps.isOpen,
        meetingSchedule: klamps.meetingSchedule,
        description: klamps.description,
        goal: klamps.goal,
      })
      .from(klamps)
      .where(
        and(
          q.city ? eq(klamps.city, q.city) : undefined,
          q.country ? eq(klamps.country, q.country) : undefined,
          q.open !== undefined ? eq(klamps.isOpen, q.open) : undefined,
        ),
      )
      // Активные/открытые — выше, дальше по убыванию members.
      .orderBy(desc(klamps.isOpen), desc(klamps.memberCount), asc(klamps.name))
      .limit(q.limit);

    return c.json({ items: rows, count: rows.length });
  })

  /**
   * GET /v1/community/klamps/:slug
   * Returns: Klamp | 404
   */
  .get("/klamps/:slug", zValidator("param", slugParamSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { slug } = c.req.valid("param");

    const [row] = await db
      .select()
      .from(klamps)
      .where(eq(klamps.slug, slug))
      .limit(1);

    if (!row) return c.json({ error: "not_found", slug }, 404);
    return c.json(row);
  })

  /**
   * GET /v1/community/stats
   * Returns: { totalKlamps, totalMembers, openKlamps, cities, countries }
   * Для CommunityStats компонента — заменяет mock COMMUNITY_STATS.
   */
  .get("/stats", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);

    const allKlamps = await db
      .select({
        memberCount: klamps.memberCount,
        isOpen: klamps.isOpen,
        city: klamps.city,
        country: klamps.country,
      })
      .from(klamps);

    const totalKlamps = allKlamps.length;
    const totalMembers = allKlamps.reduce((acc, k) => acc + k.memberCount, 0);
    const openKlamps = allKlamps.filter((k) => k.isOpen).length;
    const cities = new Set(allKlamps.map((k) => k.city)).size;
    const countries = new Set(allKlamps.map((k) => k.country)).size;

    return c.json({ totalKlamps, totalMembers, openKlamps, cities, countries });
  });
