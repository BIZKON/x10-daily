import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { articles } from "./articles";

/**
 * channels — Content Objects на канал. Один row на (article_id, channel).
 *
 * Walking Skeleton (ТЗ #1, N6): только канал 'tg'. Posting-функция читает
 * row по article_id и ветвится по visual_ref:
 *  - visual_ref != null → sendPhoto(photo=visual_ref, caption=text)
 *  - visual_ref == null → sendMessage(text=text)
 *
 * Будущие каналы (vk, dzen, linkedin) добавятся новыми row'ами без изменений
 * схемы. Per-channel voice.md/template-логика лежит на стороне SocialAmplifyAgent.
 */
export const channelKind = pgEnum("channel_kind", ["tg", "vk", "dzen", "linkedin"]);

export const channels = pgTable(
  "channels",
  {
    id: id(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    channel: channelKind("channel").notNull(),
    text: text("text").notNull(),
    /** Опциональная ссылка/идентификатор медиа (URL/S3-key/...). Posting ветвится по null. */
    visualRef: text("visual_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("channels_article_channel_uidx").on(t.articleId, t.channel)],
);

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
