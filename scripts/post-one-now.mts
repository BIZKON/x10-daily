/**
 * Faithful end-to-end тест постинга (session 24): берёт oldest-fresh непостнутую
 * tg-строку (та же выборка, что drain-post-slots) и постит реальными lib-функциями
 * sendToChannel/markChannelPosted. Доказывает, что DeepSeek-пост уходит в Telegram
 * после восстановления IPv6. Помечает posted_at → cron-слот эту строку не переберёт.
 *
 *   docker cp scripts/post-one-now.mts x10-daily-pipeline-1:/app/apps/workers/pipeline/_post1.mts
 *   docker exec -w /app/apps/workers/pipeline x10-daily-pipeline-1 node --import tsx _post1.mts
 */
import { and, articles, asc, channels, createDb, eq, gte, isNull } from "@x10/db";
import { readBindingsFromEnv } from "./src/bindings";
import { loadPipelineEnv } from "./src/env";
import { markChannelPosted, sendToChannel } from "./src/lib/post-channel";

const STALE_HOURS = 24;

async function main() {
  const env = loadPipelineEnv(readBindingsFromEnv());
  const db = createDb(env.DATABASE_URL);

  const staleBefore = new Date(Date.now() - STALE_HOURS * 3_600_000);
  const [row] = await db
    .select({
      articleId: channels.articleId,
      text: channels.text,
      visualRef: channels.visualRef,
    })
    .from(channels)
    .where(
      and(
        eq(channels.channel, "tg"),
        isNull(channels.postedAt),
        gte(channels.createdAt, staleBefore),
      ),
    )
    .orderBy(asc(channels.createdAt))
    .limit(1);

  if (!row) {
    console.log("Очередь пуста (нет свежих непостнутых tg-строк).");
    return;
  }

  console.log("=== ВЫБРАНА статья ===", row.articleId);
  console.log("=== ТЕКСТ (что уйдёт) ===\n" + row.text + "\n=== /ТЕКСТ ===");

  const outcome = await sendToChannel(env, {
    channel: "tg",
    articleId: row.articleId,
    text: row.text,
    visualRef: row.visualRef,
  });
  console.log("=== send outcome ===", JSON.stringify(outcome));

  if (!outcome.ok) {
    console.log("НЕ ОТПРАВЛЕНО (skipped):", outcome.reason);
    return;
  }

  await markChannelPosted(db, {
    articleId: row.articleId,
    channel: "tg",
    postRef: outcome.postRef,
    at: new Date(),
  });
  await db
    .update(articles)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(articles.id, row.articleId));

  console.log(
    `✅ ОПУБЛИКОВАНО в Telegram, message_id=${outcome.postRef}, posted_at + status=published проставлены.`,
  );
}

main().catch((e) => {
  console.error("ОШИБКА:", e);
  process.exit(1);
});
