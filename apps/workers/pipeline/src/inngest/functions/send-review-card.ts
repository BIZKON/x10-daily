import { articles, createDb, eq, reviewCards } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { REVIEW_CARD_REQUESTED } from "../../events";
import { buildPhotoCaption } from "../../lib/caption";
import { buildMiniAppDeepLink } from "../../lib/miniapp-link";
import { reviewFooter, reviewKeyboard } from "../../lib/review-card";
import { callTelegram } from "../../lib/telegram";
import type { PipelineInngest } from "../client";

/**
 * Отправка карточки ревью в группу «Редакция» (Спека 4).
 *
 * Карточка — ДУБЛЬ будущего поста: то же фото, та же подпись. Смысл ревью в
 * том, что редактор видит ровно то, что увидит читатель, поэтому отдельной
 * «админской» вёрстки здесь нет.
 *
 * 🔴 Карточка НИЧЕГО не публикует. Она лишь показывает и предлагает решение —
 * HumanGate (CLAUDE.md §4) остаётся на месте, меняется только поверхность.
 *
 * Не настроена группа (`TG_REVIEW_CHAT_ID` пуст) → функция тихо выходит, и
 * ревью продолжает жить в кабинете. Это дефолт для копии клиента, у которой
 * группы ещё нет.
 */
export function createSendReviewCardFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: { fetchImpl?: typeof fetch } = {},
) {
  return inngest.createFunction(
    {
      id: "send-review-card",
      name: "Send review card with buttons to the editorial group",
      triggers: [{ event: REVIEW_CARD_REQUESTED }],
      retries: 1,
      concurrency: { limit: 2 },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const articleId = event.data.articleId;

      const chatId = env.TG_REVIEW_CHAT_ID;
      const token = env.TELEGRAM_BOT_TOKEN;
      if (!chatId || !token) {
        return { skipped: true as const, reason: "review-chat-not-configured" as const };
      }

      const article = await step.run("load-article", async () => {
        const db = createDb(env.DATABASE_URL);
        const [a] = await db
          .select({
            tease: articles.tease,
            lede: articles.lede,
            slug: articles.slug,
            coverImageUrl: articles.coverImageUrl,
            visualStatus: articles.visualStatus,
            status: articles.status,
          })
          .from(articles)
          .where(eq(articles.id, articleId))
          .limit(1);
        return a ?? null;
      });

      if (!article) {
        return { skipped: true as const, reason: "article-not-found" as const };
      }
      // Уже опубликована — карточка бессмысленна и опасна: кнопка «Одобрить»
      // предложила бы опубликовать второй раз.
      if (article.status === "published") {
        return { skipped: true as const, reason: "already-published" as const };
      }

      const tgOpts = { token, proxyUrl: env.TELEGRAM_PROXY_URL || undefined, ...opts };
      const deepLink = env.TELEGRAM_BOT_USERNAME
        ? buildMiniAppDeepLink(env.TELEGRAM_BOT_USERNAME, article.slug)
        : null;
      const webUrl = env.X10_BASE_DOMAIN
        ? `https://app.${env.X10_BASE_DOMAIN}/article/${article.slug}`
        : null;
      const caption = buildPhotoCaption(article, { linkUrl: deepLink ?? webUrl });

      // Картинку показываем ДАЖЕ неодобренную: ревью ровно про то, годится ли
      // она. В канал она уйдёт только после кнопки «Одобрить».
      const cover = article.coverImageUrl;

      // 🔴 Сначала строка в БД, потом отправка? Нет: id сообщения известен
      // только ПОСЛЕ отправки. Поэтому шлём, затем пишем. Если запись упадёт,
      // Inngest повторит шаг отправки и в группе появится вторая карточка —
      // неприятно, но безопасно: обе ведут на одну статью, а первая без строки
      // в БД просто не сработает (кнопка ответит «карточка не найдена»).
      const sent = await step.run("send-card", async () => {
        if (cover) {
          const res = await callTelegram(
            "sendPhoto",
            {
              chat_id: chatId,
              photo: cover,
              caption: caption.html,
              parse_mode: "HTML",
              reply_markup: reviewKeyboard(PLACEHOLDER_CARD_ID),
            },
            tgOpts,
          );
          return { messageId: res.messageId, mode: "photo" as const };
        }
        const res = await callTelegram(
          "sendMessage",
          {
            chat_id: chatId,
            text: caption.html + reviewFooter(false),
            parse_mode: "HTML",
            reply_markup: reviewKeyboard(PLACEHOLDER_CARD_ID),
          },
          tgOpts,
        );
        return { messageId: res.messageId, mode: "text" as const };
      });

      if (sent.messageId == null) {
        return { skipped: true as const, reason: "no-message-id" as const };
      }

      const card = await step.run("save-card", async () => {
        const db = createDb(env.DATABASE_URL);
        const [row] = await db
          .insert(reviewCards)
          .values({
            articleId,
            chatId: Number(chatId),
            messageId: sent.messageId as number,
          })
          .returning({ id: reviewCards.id });
        return row ?? null;
      });

      if (!card) {
        return { skipped: true as const, reason: "card-insert-failed" as const };
      }

      // Кнопки знают id карточки, который появляется только после INSERT —
      // поэтому клавиатуру проставляем вторым вызовом. До этого момента у
      // кнопок стоит заглушка, и нажатие на неё честно ответит «не найдено».
      await step.run("attach-keyboard", async () => {
        await callTelegram(
          "editMessageReplyMarkup",
          {
            chat_id: chatId,
            message_id: sent.messageId,
            reply_markup: reviewKeyboard(card.id),
          },
          tgOpts,
        );
        return { attached: true };
      });

      return { sent: true as const, cardId: card.id, mode: sent.mode };
    },
  );
}

/**
 * Заглушка в первой отправке: настоящий id карточки существует только после
 * INSERT. Нажатие по заглушке безопасно — обработчик не найдёт карточку и
 * ответит «не найдено», ничего не сделав.
 */
const PLACEHOLDER_CARD_ID = "00000000-0000-0000-0000-000000000000";
