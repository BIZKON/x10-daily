/**
 * Права команды клиента (Спека 5).
 *
 * 🔴 Одна карта решений вместо проверок вразнобой. До этого доступ гейтился
 * единственной константой `EDITOR_ROLES = ["editor","admin"]`, а роли `author`
 * и `subscriber` не проверялись НИГДЕ: они существовали в базе и не значили
 * ничего. Проверки «если роль editor или admin», разбросанные по экранам,
 * неизбежно разъезжаются с реальностью — поэтому решение принимается в одном
 * месте, а сервер и интерфейс лишь спрашивают его.
 *
 * Модуль общий (`@x10/config`): им пользуются и api (источник истины), и
 * админка (что показать, что спрятать). Спрятанная кнопка — не защита; каждый
 * маршрут проверяет право сам.
 */

/** Роли так, как их понимает клиент. */
export const TEAM_ROLES = ["owner", "editor", "author", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Владелец",
  editor: "Редактор",
  author: "Автор",
  viewer: "Наблюдатель",
};

/** Что человек сможет — словами, для подписи прямо в интерфейсе. */
export const TEAM_ROLE_SUMMARY: Record<TeamRole, string> = {
  owner: "Всё, включая команду и настройки завода",
  editor: "Одобряет и публикует, ведёт авторов, события и источники",
  author: "Пишет и правит материалы, публиковать не может",
  viewer: "Только смотрит — ничего не меняет и не видит сумм",
};

/**
 * Отображение на существующие значения PG-enum `user_role`.
 *
 * ⚠️ Новых значений в enum НЕ добавляем: `ADD VALUE` требует отдельной миграции
 * и не даёт использовать новое значение в той же транзакции (CLAUDE.md §8).
 * Четыре роли ложатся на уже имеющиеся значения без единой миграции.
 *
 * `reader` — не член команды: это читатель мини-аппа.
 */
export const DB_ROLE_BY_TEAM_ROLE = {
  owner: "admin",
  editor: "editor",
  author: "author",
  viewer: "subscriber",
} as const satisfies Record<TeamRole, string>;

/** Значение колонки `users.role` — литеральный тип, а не просто string. */
export type DbUserRole = (typeof DB_ROLE_BY_TEAM_ROLE)[TeamRole] | "reader";

const TEAM_ROLE_BY_DB_ROLE: Record<string, TeamRole> = {
  admin: "owner",
  editor: "editor",
  author: "author",
  subscriber: "viewer",
};

/** Роль в команде по значению из БД. `reader`/неизвестное → null (не в команде). */
export function teamRoleFromDbRole(dbRole: string | null | undefined): TeamRole | null {
  if (!dbRole) return null;
  return TEAM_ROLE_BY_DB_ROLE[dbRole] ?? null;
}

/**
 * Карта прав: действие → роли, которым оно разрешено.
 *
 * Решения по спорным местам (Спека 5 §10), принятые при реализации:
 *
 * - **Наблюдатель не видит сумм.** Роль заведена под заказчика и агентство на
 *   стороне клиента; себестоимость им знать не нужно, а показать её случайно —
 *   необратимо. Результат работы (сколько публикаций вышло) он видит: без него
 *   роль бессмысленна.
 * - **Автор видит ВСЮ очередь, а не только свои материалы.** Подавляющую часть
 *   потока пишет конвейер, у таких материалов автора нет вовсе — ограничение
 *   «только свои» оставило бы автора с пустым экраном.
 */
export const PERMISSIONS = {
  /** Видеть очередь, статьи, результат работы конвейера. */
  "content.view": ["owner", "editor", "author", "viewer"],
  /** Править материал. */
  "content.edit": ["owner", "editor", "author"],
  /** Публиковать статью и одобрять обложку — выпуск наружу. */
  "content.publish": ["owner", "editor"],
  /** Авторы, события, выпуски, рубрики, источники парсинга. */
  "catalog.manage": ["owner", "editor"],
  /** Настройки конвейера и постинга. */
  "settings.manage": ["owner", "editor"],
  /** Суммы расходов: потрачено, остаток, цена публикации. */
  "cost.view": ["owner", "editor"],
  /** Команда: роли и приглашения. */
  "team.manage": ["owner"],
  /**
   * Партнёрская программа: сделки, платежи клиентов, выплаты.
   *
   * Только владелец: это чужие деньги и обязательства наружу. Редактор ведёт
   * выпуск, а не расчёты с партнёрами.
   */
  "partners.manage": ["owner"],
} as const satisfies Record<string, readonly TeamRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Разрешено ли действие этой роли. `null` (не в команде) — всегда нет. */
export function can(role: TeamRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly TeamRole[]).includes(role);
}

/** То же, но по «сырому» значению из БД — для маршрутов api. */
export function dbRoleCan(dbRole: string | null | undefined, permission: Permission): boolean {
  return can(teamRoleFromDbRole(dbRole), permission);
}

/** Роли, которым разрешено хоть что-то — то есть члены команды. */
export const TEAM_DB_ROLES: readonly DbUserRole[] = TEAM_ROLES.map((r) => DB_ROLE_BY_TEAM_ROLE[r]);
