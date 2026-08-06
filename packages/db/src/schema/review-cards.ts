import { bigint, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { articles } from "./articles";
import { users } from "./users";

/**
 * Карточка ревью в Telegram (Спека 4) — связь «статья ↔ сообщение с кнопками».
 *
 * Нужна, чтобы снимать кнопки после решения, дописывать итог и находить статью
 * по ответу в треде. Отдельная таблица, а не колонки в `articles`: карточек у
 * статьи бывает несколько (после рерайта приходит новая), а история решений —
 * это аудит HumanGate.
 *
 * ⚠️ `chatId`/`messageId` — bigint: id супергрупп отрицательные и выходят за
 * int4. Драйвер отдаёт bigint строкой, отсюда `mode: "number"` только там, где
 * значение заведомо в безопасном диапазоне (message_id), и строка для chat_id.
 */
export const reviewCards = pgTable(
  "review_cards",
  {
    id: id(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    messageId: bigint("message_id", { mode: "number" }).notNull(),
    /** `awaiting` · `decided` · `superseded`. */
    state: varchar("state", { length: 16 }).notNull().default("awaiting"),
    /** `approve` · `reject` · `regenerate` · `rewrite`. NULL пока ждём решения. */
    decision: varchar("decision", { length: 16 }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** id сообщения «пришли правку ответом» — по ответу на него ищем статью. */
    promptMessageId: bigint("prompt_message_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("review_cards_chat_message_uidx").on(t.chatId, t.messageId),
    index("review_cards_article_idx").on(t.articleId),
  ],
);

export type ReviewCard = typeof reviewCards.$inferSelect;
export type NewReviewCard = typeof reviewCards.$inferInsert;
