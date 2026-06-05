import { and, channels, createDb, eq, getPostingControl, isPostingPaused } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { articleReadyEvent } from "../../events";
import { cleanPostText } from "../../lib/text";
import { NON_RETRYABLE_VK_CODES, VkApiError, vkWallPost } from "../../lib/vk";
import type { PipelineInngest } from "../client";

/**
 * VK-ветка автопостинга (session 21). Зеркало post-to-tg для VK-стены.
 *
 * Триггер: article.ready с channel='vk' (draft-article шлёт его ТОЛЬКО когда VK
 * сконфигурирован). Функция читает channels-row (channel='vk'), чистит текст и
 * делает реальный wall.post на api.vk.com.
 *
 * Конфиг через env (оба опциональны — VK-ветка отключается, если хоть один пуст):
 *  - VK_ACCESS_TOKEN — community/user token с правом `wall`
 *  - VK_OWNER_ID — owner_id стены ("-123456" сообщество, "123456" юзер)
 *
 * В отличие от post-to-tg, отсутствие токена НЕ бросает (иначе article.ready(vk)
 * гонял бы ретраи Inngest): функция скипает → конвейер чист, пока VK не настроен.
 * VK API РФ-доступен по обычному HTTPS — ни IPv6, ни прокси (см. lib/vk.ts).
 */
export function createPostToVkFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: {
    /** Инъекция fetch для тестов. Prod — globalThis.fetch. */
    fetchImpl?: typeof fetch;
  } = {},
) {
  return inngest.createFunction(
    {
      id: "post-to-vk",
      name: "Post ready article to VK wall",
      triggers: [{ event: articleReadyEvent }],
      retries: 2,
      concurrency: { limit: 3 },
    },
    async ({ event, step }) => {
      if (event.data.channel !== "vk") {
        return { skipped: true, reason: "channel-mismatch", channel: event.data.channel };
      }

      const env = loadPipelineEnv(bindings);
      const accessToken = env.VK_ACCESS_TOKEN;
      const ownerId = env.VK_OWNER_ID;
      // VK опционален: без токена/owner НЕ бросаем (иначе article.ready(vk) гонял
      // бы ретраи и копил failed-раны). Просто скипаем — пока VK не настроен.
      if (!accessToken || !ownerId) {
        console.warn(
          `post-to-vk: VK_ACCESS_TOKEN/VK_OWNER_ID не заданы — публикация ${event.data.articleId} пропущена.`,
        );
        return {
          skipped: true as const,
          reason: "vk-not-configured",
          articleId: event.data.articleId,
          channel: "vk" as const,
        };
      }

      const db = createDb(env.DATABASE_URL);

      // Стоп-кран (session 20): не публикуем при ручной паузе / в тихие часы.
      const gate = await step.run("posting-control", async () => {
        const ctrl = await getPostingControl(db);
        return { ctrl, nowMs: Date.now() };
      });
      const pause = isPostingPaused(gate.ctrl, new Date(gate.nowMs));
      if (pause.paused) {
        console.warn(
          `post-to-vk: публикация ${event.data.articleId} пропущена — постинг на паузе (${pause.reason}).`,
        );
        return {
          skipped: true as const,
          reason: `posting-paused:${pause.reason}`,
          articleId: event.data.articleId,
          channel: "vk" as const,
        };
      }

      const row = await step.run("load-channel", async () => {
        const [r] = await db
          .select({ text: channels.text })
          .from(channels)
          .where(and(eq(channels.articleId, event.data.articleId), eq(channels.channel, "vk")))
          .limit(1);
        if (!r) {
          throw new Error(
            `post-to-vk: channels row не найден для article_id=${event.data.articleId} channel=vk`,
          );
        }
        return r;
      });

      // Идемпотентная чистка текста (переносы + английские лейблы) — как в post-to-tg.
      const text = cleanPostText(row.text);

      const result = await step.run("send-vk", async () => {
        try {
          // guid (review [2]): VK дедуплицирует по нему в окне ~1ч → ретрай шага
          // после коммита поста не создаёт дубль на стене. uuid без дефисов ≤36.
          return await vkWallPost(text, {
            accessToken,
            ownerId,
            guid: event.data.articleId.replace(/-/g, ""),
            fetchImpl: opts.fetchImpl,
          });
        } catch (e) {
          // review [3]: на captcha(14)/flood(9)/access-denied(15/200/214) ретрай
          // вреден — НЕ бросаем (Inngest не ретраит), возвращаем failed. Прочие
          // (транзиентные сеть/5xx, code=0) — бросаем → Inngest ретраит.
          if (e instanceof VkApiError && NON_RETRYABLE_VK_CODES.has(e.code)) {
            console.error(
              `post-to-vk: невосстановимая VK-ошибка [${e.code}] для ${event.data.articleId} — НЕ ретраим: ${e.message}`,
            );
            return { ok: false as const, skipped: true as const, reason: `vk-error-${e.code}` };
          }
          throw e;
        }
      });

      return {
        articleId: event.data.articleId,
        channel: "vk" as const,
        ...result,
      };
    },
  );
}
