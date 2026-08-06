import {
  DB_ROLE_BY_TEAM_ROLE,
  type DbUserRole,
  type TeamRole,
  teamRoleFromDbRole,
} from "@x10/config";
import { type Database, and, eq, gt, isNull, lt, sql, teamInvites, users } from "@x10/db";
import { hashInviteToken } from "./invite-token";

/**
 * Погашение пригласительной ссылки (Спека 5).
 *
 * Вызывается из входа по Telegram-виджету: подпись Telegram доказывает, КТО
 * человек, приглашение — что его позвали.
 *
 * 🔴 Гонку «двое открыли одну ссылку» разрешает БАЗА, а не порядок запросов:
 * счётчик использований поднимается условным UPDATE с проверкой всех условий
 * в самом WHERE. Читать-проверять-писать здесь нельзя — между чтением и
 * записью успевает второй запрос, и одноразовая ссылка сработает дважды.
 */

export type RedeemResult =
  | { ok: true; user: MemberRow }
  | { ok: false; status: 403 | 404 | 409; message: string };

export type MemberRow = {
  id: string;
  role: DbUserRole;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  locale: string;
};

export async function redeemInvite(
  db: Database,
  args: {
    token: string;
    platformUserId: string;
    /** id уже существующего пользователя с этим Telegram-id, если он есть. */
    existingUserId: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  },
): Promise<RedeemResult> {
  const tokenHash = await hashInviteToken(args.token);

  // Шаг 1 — занять использование. Все условия в WHERE: не отозвано, не
  // просрочено, счётчик не исчерпан. Ни одна проверка не живёт в коде.
  const [claimed] = await db
    .update(teamInvites)
    .set({
      usedCount: sql`${teamInvites.usedCount} + 1`,
      acceptedAt: new Date(),
    })
    .where(
      and(
        eq(teamInvites.tokenHash, tokenHash),
        isNull(teamInvites.revokedAt),
        gt(teamInvites.expiresAt, new Date()),
        lt(teamInvites.usedCount, teamInvites.maxUses),
      ),
    )
    .returning({ id: teamInvites.id, role: teamInvites.role });

  if (!claimed) {
    // Различаем «нет такой ссылки» и «ссылка больше не действует»: человеку
    // важно понимать, ошибся он адресом или опоздал.
    const [exists] = await db
      .select({ id: teamInvites.id })
      .from(teamInvites)
      .where(eq(teamInvites.tokenHash, tokenHash))
      .limit(1);
    return exists
      ? {
          ok: false,
          status: 409,
          message: "Приглашение больше не действует — истекло, отозвано или уже использовано.",
        }
      : { ok: false, status: 404, message: "Приглашение не найдено. Проверьте ссылку." };
  }

  const teamRole = claimed.role as TeamRole;
  const dbRole = DB_ROLE_BY_TEAM_ROLE[teamRole];
  if (!dbRole) {
    return { ok: false, status: 409, message: "Приглашение выдано на неизвестную роль." };
  }

  // Шаг 2 — выдать роль. Пользователь мог уже существовать как читатель
  // мини-аппа: тогда мы его повышаем, а не заводим второго с тем же
  // Telegram-id (уникальный индекс platform+platform_user_id этого и не даст).
  const columns = {
    id: users.id,
    role: users.role,
    displayName: users.displayName,
    username: users.username,
    avatarUrl: users.avatarUrl,
    locale: users.locale,
  };

  if (args.existingUserId) {
    const [row] = await db
      .update(users)
      .set({
        role: dbRole as (typeof users.role.enumValues)[number],
        // Профиль обновляем только тем, что пришло: пустой ник из Telegram не
        // должен затирать уже известное имя.
        ...(args.username ? { username: args.username } : {}),
        ...(args.displayName ? { displayName: args.displayName } : {}),
        ...(args.avatarUrl ? { avatarUrl: args.avatarUrl } : {}),
      })
      .where(eq(users.id, args.existingUserId))
      .returning(columns);
    if (!row) return { ok: false, status: 404, message: "Пользователь не найден." };
    await markAccepted(db, claimed.id, row.id);
    return { ok: true, user: normalize(row) };
  }

  const [created] = await db
    .insert(users)
    .values({
      platform: "telegram",
      platformUserId: args.platformUserId,
      role: dbRole as (typeof users.role.enumValues)[number],
      username: args.username,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl,
    })
    .returning(columns);

  if (!created) return { ok: false, status: 409, message: "Не удалось создать пользователя." };
  await markAccepted(db, claimed.id, created.id);
  return { ok: true, user: normalize(created) };
}

/** Кто именно вошёл по ссылке — аудит. Отдельным UPDATE: id известен только тут. */
async function markAccepted(db: Database, inviteId: string, userId: string): Promise<void> {
  await db.update(teamInvites).set({ acceptedBy: userId }).where(eq(teamInvites.id, inviteId));
}

function normalize(row: {
  id: string;
  role: DbUserRole;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  locale: string;
}): MemberRow {
  return row;
}

/** Роль в команде по значению из БД — реэкспорт для удобства маршрутов. */
export { teamRoleFromDbRole };
