import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { articles } from "./articles";

/**
 * channels — Content Objects на канал. Один row на (article_id, channel).
 *
 * Слот-постинг (session 23): channels — это ОЧЕРЕДЬ публикации. draft-article
 * вставляет row (posted_at NULL = готово, но ещё не опубликовано); cron
 * drain-post-slots забирает непостнутые строки по слотам (4/день МСК) и постит
 * по одной. Раньше post-to-tg/post-to-vk постили КАЖДУЮ статью немедленно по
 * article.ready — теперь постинг расцеплён от готовности.
 *
 * Posting-функция ветвится по visual_ref:
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
    /** Момент подтверждённой публикации в канал. NULL = ещё в очереди (drain-post-slots заберёт). */
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** Число НЕУДАЧНЫХ попыток постинга — диагностика + кап ретраев. */
    attempts: integer("attempts").notNull().default(0),
    /** Текст последней ошибки постинга (диагностика). */
    lastError: text("last_error"),
    /** Идентификатор опубликованного поста (TG message_id / VK post id) — аудит. */
    postRef: text("post_ref"),
    /**
     * Чем пост УШЁЛ на самом деле: `photo` | `photo_plain` | `text_html` |
     * `text_plain` | `vk`. Деградация фото→текст не считается ошибкой (пост
     * уходит, `lastError` пуст), поэтому без этого поля факт «картинка не
     * взлетела» не сохранялся нигде. NULL — строки старше миграции 0015.
     */
    postMode: varchar("post_mode", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("channels_article_channel_uidx").on(t.articleId, t.channel),
    // Частичный индекс: drain-post-slots сканит только непостнутые строки.
    index("channels_pending_idx")
      .on(t.createdAt)
      .where(sql`posted_at is null`),
  ],
);

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
