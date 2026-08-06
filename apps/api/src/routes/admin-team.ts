import { zValidator } from "@hono/zod-validator";
import {
  DB_ROLE_BY_TEAM_ROLE,
  TEAM_ROLES,
  TEAM_ROLE_LABEL,
  type TeamRole,
  teamRoleFromDbRole,
} from "@x10/config";
import { and, desc, eq, isNull, ne, sql, teamInvites, users } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requirePermission } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";
import { hashInviteToken, newInviteToken } from "../lib/invite-token";

/**
 * Команда клиента: кто в ней, с какой ролью, и приглашения (Спека 5).
 *
 * Всё под правом `team.manage` — им обладает только Владелец. Управление
 * доступом не должно быть доступно тому, кому доступ выдали.
 */

const OWNER_DB_ROLE = DB_ROLE_BY_TEAM_ROLE.owner;

/** Срок жизни приглашения по умолчанию — неделя. */
const DEFAULT_TTL_DAYS = 7;

const roleSchema = z.enum(TEAM_ROLES);
const idParam = z.object({ id: z.string().uuid() });

const createInviteSchema = z.object({
  role: roleSchema,
  /** Больше одного использования — осознанный выбор («позвать сразу отдел»). */
  maxUses: z.coerce.number().int().min(1).max(50).default(1),
  ttlDays: z.coerce.number().int().min(1).max(30).default(DEFAULT_TTL_DAYS),
});

const setRoleSchema = z.object({ role: roleSchema });

/** Сколько владельцев в команде — нужно, чтобы не остаться без единого. */
async function countOwners(db: ReturnType<typeof getDb>): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, OWNER_DB_ROLE));
  return row?.n ?? 0;
}

export const adminTeamRoute = new Hono<AppEnv>()
  .get("/team", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "team.manage");

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      // Читатели мини-аппа — не команда. В кабинете показываем только тех, кому
      // выдана роль; иначе список утонет в тысячах подписчиков ленты.
      .where(ne(users.role, "reader"))
      .orderBy(desc(users.createdAt));

    return c.json({
      me: { id: me.userId, role: me.teamRole },
      items: rows.map((r) => ({
        id: r.id,
        username: r.username,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        role: teamRoleFromDbRole(r.role),
        createdAt: r.createdAt,
        isMe: r.id === me.userId,
      })),
    });
  })

  /**
   * Сменить роль участника.
   *
   * 🔴 Последнего владельца понизить нельзя: система без владельца
   * необслуживаема — некому вернуть права даже себе.
   */
  .patch(
    "/team/:id",
    zValidator("param", idParam),
    zValidator("json", setRoleSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "team.manage");
      const { id } = c.req.valid("param");
      const { role } = c.req.valid("json");

      const [target] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!target) return c.json({ error: "not_found", id }, 404);

      if (target.role === OWNER_DB_ROLE && role !== "owner" && (await countOwners(db)) <= 1) {
        return c.json(
          {
            error: "last_owner",
            message: "Это единственный владелец. Сначала назначьте второго.",
          },
          409,
        );
      }

      const [row] = await db
        .update(users)
        .set({ role: DB_ROLE_BY_TEAM_ROLE[role] as (typeof users.role.enumValues)[number] })
        .where(eq(users.id, id))
        .returning({ id: users.id, role: users.role });

      return c.json({ id: row?.id, role: teamRoleFromDbRole(row?.role) });
    },
  )

  /**
   * Убрать из команды. Пользователь не удаляется — он становится обычным
   * читателем: у него могут быть закладки и реакции, а удаление записи снесло
   * бы их каскадом.
   */
  .delete("/team/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "team.manage");
    const { id } = c.req.valid("param");

    if (id === me.userId) {
      return c.json(
        { error: "self_removal", message: "Нельзя убрать из команды самого себя." },
        409,
      );
    }

    const [target] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!target) return c.json({ error: "not_found", id }, 404);

    if (target.role === OWNER_DB_ROLE && (await countOwners(db)) <= 1) {
      return c.json(
        { error: "last_owner", message: "Это единственный владелец — его нельзя убрать." },
        409,
      );
    }

    await db.update(users).set({ role: "reader" }).where(eq(users.id, id));
    return c.json({ removed: true, id });
  })

  .get("/team/invites", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "team.manage");

    const rows = await db
      .select({
        id: teamInvites.id,
        role: teamInvites.role,
        createdAt: teamInvites.createdAt,
        expiresAt: teamInvites.expiresAt,
        maxUses: teamInvites.maxUses,
        usedCount: teamInvites.usedCount,
        acceptedAt: teamInvites.acceptedAt,
      })
      .from(teamInvites)
      .where(isNull(teamInvites.revokedAt))
      .orderBy(desc(teamInvites.createdAt))
      .limit(50);

    // Секрет ссылки не хранится и восстановлению не подлежит — отдаём только
    // метаданные. Саму ссылку владелец видит РОВНО ОДИН РАЗ, при создании.
    return c.json({ items: rows });
  })

  /**
   * Создать приглашение. Ссылка возвращается ОДИН раз: в базе лежит только
   * её хеш, поэтому показать её повторно физически невозможно.
   */
  .post("/team/invites", zValidator("json", createInviteSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "team.manage");
    const { role, maxUses, ttlDays } = c.req.valid("json");

    const token = newInviteToken();
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    const [row] = await db
      .insert(teamInvites)
      .values({
        tokenHash: await hashInviteToken(token),
        role,
        createdBy: me.userId,
        expiresAt,
        maxUses,
      })
      .returning({ id: teamInvites.id });

    return c.json({ id: row?.id, token, role, expiresAt, maxUses }, 201);
  })

  .delete("/team/invites/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "team.manage");
    const { id } = c.req.valid("param");

    const [row] = await db
      .update(teamInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(teamInvites.id, id), isNull(teamInvites.revokedAt)))
      .returning({ id: teamInvites.id });

    if (!row) return c.json({ error: "not_found_or_revoked", id }, 404);
    return c.json({ revoked: true, id });
  });

/** Человекочитаемое имя роли — для сообщений. */
export function roleLabel(role: TeamRole): string {
  return TEAM_ROLE_LABEL[role];
}
