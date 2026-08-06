import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { users } from "./users";

/**
 * Приглашения в команду клиента (Спека 5).
 *
 * 🔴 `tokenHash` — sha256 от секрета ссылки, а не сам секрет. Ссылку знает
 * только тот, кому её отправили; из базы её не восстановить, поэтому утечка
 * дампа не даёт войти в чужой кабинет.
 *
 * 🔴 `tenantId` нет намеренно: каждый клиент получает отдельную копию системы
 * (решение владельца 06.08.2026). Команда — это команда данного экземпляра.
 */
export const teamInvites = pgTable(
  "team_invites",
  {
    id: id(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    /** Роль в терминах интерфейса: owner/editor/author/viewer. */
    role: varchar("role", { length: 16 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** По умолчанию одноразовая. Многоразовая — осознанный выбор владельца. */
    maxUses: integer("max_uses").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Аудит: кто вошёл по ссылке. Для одноразовой — единственный. */
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("team_invites_token_hash_uidx").on(t.tokenHash),
    index("team_invites_active_idx").on(t.expiresAt),
  ],
);

export type TeamInvite = typeof teamInvites.$inferSelect;
export type NewTeamInvite = typeof teamInvites.$inferInsert;
