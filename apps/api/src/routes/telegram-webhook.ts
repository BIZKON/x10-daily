import { can, teamRoleFromDbRole } from "@x10/config";
import { and, articles, eq, reviewCards, sql, users } from "@x10/db";
import { Hono } from "hono";
import { Inngest } from "inngest";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";
import { type ReviewAction, decisionNote, parseCallbackData } from "../lib/review-actions";
import { answerCallback, editReplyMarkup, sendMessage } from "../lib/telegram-call";

/**
 * Единственная входящая дверь от Telegram (Спека 4).
 *
 * До неё бот только ШЛЁТ: `callback_query` никто не принимал, вебхук не был
 * настроен. Это новая подсистема, а не правка существующей.
 *
 * 🔴 Три правила, без которых её нельзя выпускать:
 *
 * 1. **Секрет.** `setWebhook(secret_token=…)` заставляет Telegram слать
 *    заголовок `X-Telegram-Bot-Api-Secret-Token`. Несовпадение → 401 без
 *    обработки. Иначе кто угодно, узнав адрес, опубликует что угодно.
 * 2. **Членство в группе правом не является.** Нажавшего сверяем с `users` по
 *    Telegram-id и проверяем право. Группу расширяют, ботов добавляют не туда,
 *    сообщения пересылают.
 * 3. **Отвечать всегда.** Каждое нажатие получает `answerCallbackQuery` — даже
 *    отказ. Кнопка без отклика читается как сломанная (урок формы автора).
 *
 * Отвечаем 200 быстро: тяжёлое (перегенерация, публикация) уходит событием в
 * Inngest, иначе Telegram решит, что мы не ответили, и повторит апдейт.
 */

const POSTING_DRAIN_REQUESTED = "posting/drain.requested" as const;
const ARTICLE_COVER_REQUESTED = "article/cover.requested" as const;

let cachedClient: Inngest | undefined;
function getInngest(env: ReturnType<typeof getEnv>): Inngest {
  if (cachedClient) return cachedClient;
  cachedClient = new Inngest({
    id: "x10-api",
    eventKey: env.INNGEST_EVENT_KEY,
    isDev: env.NODE_ENV !== "production",
  });
  return cachedClient;
}

/** Право, нужное для действия. Рерайт — правка, остальное — выпуск наружу. */
const PERMISSION_BY_ACTION = {
  approve: "content.publish",
  reject: "content.publish",
  regenerate: "content.publish",
  rewrite: "content.edit",
} as const satisfies Record<ReviewAction, "content.publish" | "content.edit">;

export const telegramWebhookRoute = new Hono<AppEnv>().post("/webhook", async (c) => {
  const env = getEnv(c.env);
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    // Не настроен — дверь закрыта. Открытый вебхук хуже отсутствующего.
    return c.json({ error: "webhook_disabled" }, 503);
  }
  if (c.req.header("x-telegram-bot-api-secret-token") !== secret) {
    return c.json({ error: "forbidden" }, 401);
  }

  const update = (await c.req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return c.json({ ok: true });

  const cq = update.callback_query;
  if (!cq) {
    // Прочие апдейты (в том числе ответы на «пришли правку») пока не
    // обрабатываем — рерайт идёт отдельным шагом Спеки 4.
    return c.json({ ok: true });
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  const tg = { token: token ?? "" };
  const parsed = parseCallbackData(cq.data);

  if (!token) return c.json({ ok: true });
  if (!parsed) {
    await answerCallback(tg, cq.id, "Не понимаю эту кнопку.");
    return c.json({ ok: true });
  }

  const db = getDb(env.DATABASE_URL);

  // Кто нажал. Роль берём из БД, а не из факта присутствия в группе.
  const [actor] = await db
    .select({ id: users.id, role: users.role, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.platform, "telegram"), eq(users.platformUserId, String(cq.from?.id ?? ""))))
    .limit(1);

  const teamRole = teamRoleFromDbRole(actor?.role);
  if (!actor || !teamRole || !can(teamRole, PERMISSION_BY_ACTION[parsed.action])) {
    await answerCallback(tg, cq.id, "У вас нет прав на это действие.");
    return c.json({ ok: true });
  }

  // 🔴 Занять карточку условным UPDATE: только та, что ещё ждёт решения.
  // Гонку «двое нажали одновременно» и повторное нажатие на старое сообщение
  // разрешает база, а не порядок запросов.
  const [card] = await db
    .update(reviewCards)
    .set({
      // 🔴 `awaiting` сохраняется для рерайта И перерисовки: статья всё ещё
      // ждёт решения, просто с другим текстом или картинкой. Перевод в
      // `decided` снял бы ворота на время работы конвейера, и слот успел бы
      // опубликовать ровно то, что редактор отправил переделывать.
      state: parsed.action === "rewrite" || parsed.action === "regenerate" ? "awaiting" : "decided",
      decision: parsed.action,
      decidedBy: actor.id,
      decidedAt: new Date(),
    })
    .where(and(eq(reviewCards.id, parsed.cardId), eq(reviewCards.state, "awaiting")))
    .returning({
      id: reviewCards.id,
      articleId: reviewCards.articleId,
      chatId: reviewCards.chatId,
      messageId: reviewCards.messageId,
    });

  if (!card) {
    await answerCallback(tg, cq.id, "Эта карточка уже обработана.");
    return c.json({ ok: true });
  }

  const who = actor.displayName || `@${cq.from?.username ?? "редактор"}`;
  const inngest = getInngest(env);

  if (parsed.action === "approve") {
    // Обложку одобряем, только если она реально ждала ревью: у статьи без
    // картинки visual_status='none', и трогать его нельзя.
    await db
      .update(articles)
      .set({ visualStatus: "approved" })
      .where(and(eq(articles.id, card.articleId), eq(articles.visualStatus, "pending_review")));

    await db
      .update(articles)
      .set({ status: "published", publishedAt: sql`now()` })
      .where(and(eq(articles.id, card.articleId), eq(articles.status, "ready")));

    // 🔴 Публикуем ИМЕННО эту статью. Без articleId ушла бы голова очереди —
    // то есть чужая статья, а одобренная осталась бы ждать.
    await inngest.send({
      name: POSTING_DRAIN_REQUESTED,
      data: { reason: "review-card-approve", articleId: card.articleId },
    });
    await answerCallback(tg, cq.id, "Одобрено — публикую.");
  } else if (parsed.action === "reject") {
    await db
      .update(articles)
      .set({ visualStatus: "rejected" })
      .where(eq(articles.id, card.articleId));
    await db
      .update(articles)
      .set({ status: "published", publishedAt: sql`now()` })
      .where(and(eq(articles.id, card.articleId), eq(articles.status, "ready")));
    await inngest.send({
      name: POSTING_DRAIN_REQUESTED,
      data: { reason: "review-card-reject-cover", articleId: card.articleId },
    });
    await answerCallback(tg, cq.id, "Публикую без картинки.");
  } else if (parsed.action === "regenerate") {
    await db
      .update(articles)
      .set({ visualStatus: "generating" })
      .where(eq(articles.id, card.articleId));
    await inngest.send({
      name: ARTICLE_COVER_REQUESTED,
      data: { articleId: card.articleId, force: true },
    });
    await answerCallback(tg, cq.id, "Рисую новую картинку — пришлю карточку заново.");
  } else {
    // rewrite — просим правку ответом. Сам рерайт пока не реализован
    // (следующий шаг Спеки 4), поэтому честно говорим об этом, а не молчим.
    const prompt = await sendMessage(
      tg,
      card.chatId,
      "Пришлите правку ответом на это сообщение — например «короче» или «добавь цифру про выручку».",
      card.messageId,
    );
    if (prompt.messageId != null) {
      await db
        .update(reviewCards)
        .set({ promptMessageId: prompt.messageId })
        .where(eq(reviewCards.id, card.id));
    }
    await answerCallback(tg, cq.id, "Жду вашу правку ответом.");
  }

  // Кнопки снимаем в любом случае, кроме рерайта: решение принято, повторное
  // нажатие смысла не имеет. Если Telegram откажет — не страшно, состояние
  // карточки в БД уже не `awaiting`, и второе нажатие ничего не сделает.
  if (parsed.action !== "rewrite") {
    // Кнопки со СТАРОЙ карточки убираем и при перерисовке: она уже неактуальна,
    // решение примут на новой. Ворота при этом держит её состояние в БД.
    await editReplyMarkup(tg, card.chatId, card.messageId, null).catch(() => undefined);
    await sendMessage(tg, card.chatId, decisionNote(parsed.action, who), card.messageId).catch(
      () => undefined,
    );
  }

  return c.json({ ok: true });
});

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number | string; username?: string };
    message?: { message_id?: number; chat?: { id?: number } };
  };
};
