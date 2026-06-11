import {
  and,
  articles,
  asc,
  channels,
  createDb,
  eq,
  getPostingControl,
  gte,
  isNull,
  isPostingPaused,
  sql,
} from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import {
  type PostableChannel,
  markChannelPosted,
  recordChannelFailure,
  sendToChannel,
} from "../../lib/post-channel";
import type { PipelineInngest } from "../client";

/**
 * Окно свежести: статью старше этого не постим (новость протухла — лучше
 * пропустить слот, чем выдать вчерашнее). Считается от channels.created_at.
 */
const STALE_HOURS = 24;

/**
 * Слот-постинг (session 23). Раньше post-to-tg/post-to-vk постили КАЖДУЮ
 * принятую статью немедленно по article.ready (поток 24/7). Теперь channels —
 * очередь, а этот cron выдаёт по ОДНОЙ статье в каждый слот (4/день МСК:
 * 09:30/12:30/15:30/18:30 = `30 6,9,12,15` UTC, МСК=UTC+3).
 *
 * Выбор: FIFO среди свежих (oldest-fresh-first) по непостнутым tg-строкам —
 * сохраняет хронологию новостей; старше STALE_HOURS пропускаем. Одна статья за
 * слот публикуется во ВСЕ свои каналы (tg всегда; vk если сконфигурирован и есть
 * непостнутая vk-строка).
 *
 * Идемпотентность: send и mark — РАЗНЫЕ step'ы (мемоизация Inngest → при падении
 * ПОСЛЕДУЮЩЕГО шага отправленный пост не переотправляется). Узкая граница
 * at-least-once для TG (бросок самого send ПОСЛЕ сетевой записи → редкий дубль; у
 * VK guid-дедуп) — принятый риск, детали в lib/post-channel.ts. posting-control
 * (пауза/тихие часы) проверяется один раз на слот.
 */
export function createDrainPostSlotsFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: {
    /** Инъекция fetch для тестов (mock TG/VK без сети). Prod — globalThis.fetch. */
    fetchImpl?: typeof fetch;
  } = {},
) {
  return inngest.createFunction(
    {
      id: "drain-post-slots",
      name: "Publish one queued article per posting slot",
      triggers: [{ cron: "30 6,9,12,15 * * *" }],
      retries: 1,
      // Один слот за раз — корректность выбора/маркировки (нет гонок на channels).
      concurrency: { limit: 1 },
    },
    async ({ step }) => {
      const env = loadPipelineEnv(bindings);

      // Стоп-кран (session 20): ручная пауза или тихие часы (МСК) → пропускаем
      // слот целиком. Мемоизированный nowMs — детерминизм окна свежести при ретрае.
      const gate = await step.run("posting-control", async () => {
        const db = createDb(env.DATABASE_URL);
        const ctrl = await getPostingControl(db);
        return { ctrl, nowMs: Date.now() };
      });
      const pause = isPostingPaused(gate.ctrl, new Date(gate.nowMs));
      if (pause.paused) {
        console.warn(`drain-post-slots: слот пропущен — постинг на паузе (${pause.reason}).`);
        return { skipped: true as const, reason: `posting-paused:${pause.reason}` };
      }

      // Выбираем одну следующую непостнутую tg-статью: FIFO среди свежих.
      const selected = await step.run("select", async () => {
        const db = createDb(env.DATABASE_URL);
        const staleBefore = new Date(gate.nowMs - STALE_HOURS * 3_600_000);
        const [r] = await db
          .select({ articleId: channels.articleId })
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
        return r ?? null;
      });

      if (!selected) {
        return { posted: 0 as const, reason: "queue-empty" as const };
      }
      const articleId = selected.articleId;

      // Каналы статьи: tg всегда; vk — если VK сконфигурирован и есть
      // непостнутая vk-строка (draft-article создаёт vk-row только при конфиге).
      const targets = await step.run("targets", async () => {
        const list: PostableChannel[] = ["tg"];
        if (env.VK_ACCESS_TOKEN && env.VK_OWNER_ID) {
          const db = createDb(env.DATABASE_URL);
          const [vkRow] = await db
            .select({ id: channels.id })
            .from(channels)
            .where(
              and(
                eq(channels.articleId, articleId),
                eq(channels.channel, "vk"),
                isNull(channels.postedAt),
              ),
            )
            .limit(1);
          if (vkRow) list.push("vk");
        }
        return list;
      });

      const results: Array<{ channel: PostableChannel; status: string; postRef?: string | null }> =
        [];

      for (const channel of targets) {
        const row = await step.run(`load-${channel}`, async () => {
          const db = createDb(env.DATABASE_URL);
          const [r] = await db
            .select({ text: channels.text, visualRef: channels.visualRef })
            .from(channels)
            .where(and(eq(channels.articleId, articleId), eq(channels.channel, channel)))
            .limit(1);
          if (!r) {
            throw new Error(
              `drain-post-slots: channels row не найден article=${articleId} channel=${channel}`,
            );
          }
          return r;
        });

        // Send — отдельный step. Бросок (сеть/5xx) → Inngest ретраит функцию,
        // мемоизированный send НЕ переотправит уже ушедший пост.
        const outcome = await step.run(`send-${channel}`, () =>
          sendToChannel(
            env,
            { channel, articleId, text: row.text, visualRef: row.visualRef },
            { fetchImpl: opts.fetchImpl },
          ),
        );

        if (!outcome.ok) {
          // Невосстановимо (vk captcha/flood/access) — НЕ помечаем posted, копим
          // last_error. Не ретраим (sendToChannel уже решил, что ретрай вреден).
          await step.run(`skip-${channel}`, async () => {
            const db = createDb(env.DATABASE_URL);
            await recordChannelFailure(db, { articleId, channel, error: outcome.reason });
            return { recorded: true };
          });
          results.push({ channel, status: `skipped:${outcome.reason}` });
          continue;
        }

        const postRef = outcome.postRef;
        await step.run(`mark-${channel}`, async () => {
          const db = createDb(env.DATABASE_URL);
          await markChannelPosted(db, { articleId, channel, postRef, at: new Date() });
          return { posted: true };
        });
        results.push({ channel, status: "posted", postRef });
      }

      // Статья опубликована (постнулась хотя бы в tg) → articles.status='published'.
      const tgPosted = results.some((r) => r.channel === "tg" && r.status === "posted");
      if (tgPosted) {
        await step.run("mark-published", async () => {
          const db = createDb(env.DATABASE_URL);
          // status='published' статья уже получает при persist (session 24); здесь
          // НЕ перезатираем publishedAt (coalesce) — сохраняем время первой
          // публикации в ленте, иначе TG-постинг сдвигал бы её в топ фида.
          await db
            .update(articles)
            .set({
              status: "published",
              publishedAt: sql`coalesce(${articles.publishedAt}, now())`,
            })
            .where(eq(articles.id, articleId));
          return { published: true };
        });
      }

      const posted = results.filter((r) => r.status === "posted").length;
      console.warn(`drain-post-slots: статья ${articleId} — постнуто каналов ${posted}.`);
      return { articleId, posted, results };
    },
  );
}
