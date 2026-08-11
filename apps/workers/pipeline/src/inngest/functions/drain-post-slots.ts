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
import { POSTING_DRAIN_REQUESTED } from "../../events";
import { buildPhotoCaption } from "../../lib/caption";
import { buildMiniAppDeepLink } from "../../lib/miniapp-link";
import {
  type PostMode,
  type PostableChannel,
  markChannelPosted,
  recordChannelFailure,
  sendToChannel,
} from "../../lib/post-channel";
import { pickPostable } from "../../lib/review-gate";
import { articleToTelegramHtml } from "../../lib/telegram-html";
import type { PipelineInngest } from "../client";

/**
 * Окно свежести: статью старше этого не постим (новость протухла — лучше
 * пропустить слот, чем выдать вчерашнее). Считается от channels.created_at.
 */
const STALE_HOURS = 24;

/**
 * Сколько голов очереди осматриваем за слот.
 *
 * Ворота теперь решают в коде, поэтому кандидатов надо принести. Потолок нужен,
 * чтобы запрос не разрастался вместе с очередью: за сутки в неё попадает
 * десятки строк, полсотни покрывают их с запасом. Если все осмотренные
 * заблокированы, слот пропускается — это честнее, чем тянуть всю очередь.
 */
const QUEUE_SCAN_LIMIT = 50;

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
/**
 * Статья, названная в событии (Спека 4), либо null.
 *
 * ⚠️ Приведение типа осознанное: у функции ДВА триггера, и `event.data` —
 * объединение крона (`CronEventData`, без полей) и нашего события. Сузить его
 * штатно нельзя, поэтому проверяем поле руками и приводим только после
 * проверки типа значения. Мусор в событии даёт null, а не падение.
 */
function targetArticleId(event: unknown): string | null {
  const data = (event as { data?: unknown } | undefined)?.data;
  if (!data || typeof data !== "object") return null;
  const id = (data as { articleId?: unknown }).articleId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

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
      // Крон — штатный ритм 4/день. Событие — ручная публикация «сейчас»
      // (админка / разовая выкладка). Путь ОДИН и тот же: те же гарды паузы,
      // тихих часов и окна свежести, та же пометка posted_at — ручной запуск
      // не плодит дубли и не нарушает очередь.
      triggers: [{ cron: "30 6,9,12,15 * * *" }, { event: POSTING_DRAIN_REQUESTED }],
      retries: 1,
      // Один слот за раз — корректность выбора/маркировки (нет гонок на channels).
      concurrency: { limit: 1 },
    },
    async ({ event, step }) => {
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
      // Прицельная публикация (Спека 4): событие может назвать статью. Кнопка
      // «Одобрить» в Telegram одобряет КОНКРЕТНУЮ карточку, и опубликоваться
      // должна именно она — иначе ушла бы голова FIFO, то есть чужая статья, а
      // одобренная осталась бы ждать. Гарды при этом те же.
      const wantedArticleId = targetArticleId(event);

      const selected = await step.run("select", async () => {
        const db = createDb(env.DATABASE_URL);
        const staleBefore = new Date(gate.nowMs - STALE_HOURS * 3_600_000);

        /**
         * 🔴 Ворота ревью (Спека 4). Решение принимает `pickPostable`, а не
         * условие запроса — и вот почему.
         *
         * Раньше ворота были условием `not exists (карточка awaiting)`. Оно
         * выглядело строгим, но по смыслу разрешало всё, у чего карточки нет
         * вовсе, — а карточка рождается лишь побочным эффектом успешной
         * генерации обложки. Замер на проде 10.08.2026: за три дня 6 постов из
         * 20 ушли в канал, не побывав ни у кого перед глазами.
         *
         * Поэтому запрос теперь только ПРИНОСИТ факты о карточках, а правило
         * живёт отдельной чистой функцией и покрыто тестами.
         *
         * ⚠️ Прицельная публикация ворота НЕ проверяет: она приходит ровно из
         * нажатия «Одобрить», то есть решение уже принято.
         */
        const rows = await db
          .select({
            articleId: channels.articleId,
            queuedAt: channels.createdAt,
            awaitingSince: sql<string | null>`(
              select min(rc.created_at) from review_cards rc
              where rc.article_id = ${channels.articleId} and rc.state = 'awaiting'
            )`,
            cards: sql<number>`(
              select count(*) from review_cards rc where rc.article_id = ${channels.articleId}
            )`,
          })
          .from(channels)
          .where(
            and(
              eq(channels.channel, "tg"),
              isNull(channels.postedAt),
              gte(channels.createdAt, staleBefore),
              // Окно свежести намеренно сохраняется и для прицельного случая:
              // одобрить статью суточной давности — это опубликовать вчерашнее.
              ...(wantedArticleId ? [eq(channels.articleId, wantedArticleId)] : []),
            ),
          )
          .orderBy(asc(channels.createdAt))
          .limit(QUEUE_SCAN_LIMIT);

        if (wantedArticleId) {
          const [r] = rows;
          return r ? { articleId: r.articleId } : null;
        }

        const id = pickPostable(
          rows.map((r) => ({
            articleId: r.articleId,
            queuedAt: new Date(r.queuedAt),
            awaitingSince: r.awaitingSince ? new Date(r.awaitingSince) : null,
            hasAnyCard: Number(r.cards) > 0,
          })),
          {
            reviewConfigured: Boolean(env.TG_REVIEW_CHAT_ID),
            gateHours: env.REVIEW_GATE_HOURS,
            now: new Date(gate.nowMs),
          },
        );
        return id ? { articleId: id } : null;
      });

      if (!selected) {
        return {
          posted: 0 as const,
          reason: wantedArticleId ? ("target-not-postable" as const) : ("queue-empty" as const),
        };
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

      const results: Array<{
        channel: PostableChannel;
        status: string;
        postRef?: string | null;
        /** Чем пост ушёл: photo / photo_plain / text_html / text_plain / vk. */
        mode?: PostMode;
      }> = [];

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
          // session 27: для TG строим rich-HTML из структуры статьи (заголовок/
          // подзаг/выноска/ключ-блоки + ссылка «Подробнее читай в блоге…»). baseUrl
          // из X10_BASE_DOMAIN; нет домена/статьи/visualRef → html=null → плоский
          // sendMessage (+ фолбэк на 400 в sendToChannel).
          // Спека 1 (+правка владельца): ссылка В ТЕКСТЕ ведёт в Mini App
          // (t.me/<bot>?startapp=<slug>) — единственная точка входа, inline-кнопку
          // убрали. Карточка ПРЕВЬЮ строится по web-URL (previewUrl) через
          // link_preview_options, иначе Telegram нарисовал бы превью бота.
          let html: string | null = null;
          let deepLinkUrl: string | null = null;
          let previewUrl: string | null = null;
          let visualRef: string | null = r.visualRef;
          let captionHtml: string | null = null;
          let captionPlain: string | null = null;

          // Для TG статью тянем ВСЕГДА: без неё не узнать, одобрена ли обложка
          // (Спека 2). Это PK-лукап — дешевле прежней хитрой ветки needArticle.
          if (channel === "tg") {
            const [a] = await db
              .select({
                tease: articles.tease,
                lede: articles.lede,
                whyItMatters: articles.whyItMatters,
                body: articles.body,
                slug: articles.slug,
                coverImageUrl: articles.coverImageUrl,
                visualStatus: articles.visualStatus,
              })
              .from(articles)
              .where(eq(articles.id, articleId))
              .limit(1);
            if (a) {
              deepLinkUrl = env.TELEGRAM_BOT_USERNAME
                ? buildMiniAppDeepLink(env.TELEGRAM_BOT_USERNAME, a.slug)
                : null;
              const webUrl = env.X10_BASE_DOMAIN
                ? `https://app.${env.X10_BASE_DOMAIN}/article/${a.slug}`
                : null;

              // 🔴 HumanGate (Спека 2): фото уходит в канал ТОЛЬКО с обложкой,
              // одобренной редактором. pending_review / rejected / none →
              // остаёмся на текстовом посте, как раньше.
              if (a.visualStatus === "approved" && a.coverImageUrl) {
                visualRef = a.coverImageUrl;
              }

              if (visualRef) {
                // Фото-пост: короткая подпись ≤1024, богатый формат — в Mini App.
                const caption = buildPhotoCaption(a, { linkUrl: deepLinkUrl ?? webUrl });
                captionHtml = caption.html;
                captionPlain = caption.plain;
              }

              // Текстовый пост готовим ВСЕГДА, даже когда есть обложка: это то,
              // во что деградирует фото-ветка, если Telegram отобьёт картинку
              // (400 «failed to get HTTP URL content»). Без этого слот терялся
              // бы целиком, а голова FIFO-очереди залипала до STALE_HOURS.
              // Лишним он не будет: при успешном sendPhoto просто не используется
              // (в post-channel.ts текстовая ветка идёт ПОСЛЕ фото-веток).
              if (webUrl) {
                // Превью по web-URL (там og-картинка), ссылка в тексте —
                // deep-link в Mini App.
                previewUrl = webUrl;
                html = articleToTelegramHtml(a, `https://app.${env.X10_BASE_DOMAIN}`, deepLinkUrl);
              }
            }
          }
          return { text: r.text, visualRef, html, previewUrl, captionHtml, captionPlain };
        });

        // Send — отдельный step. Бросок (сеть/5xx) → Inngest ретраит функцию,
        // мемоизированный send НЕ переотправит уже ушедший пост.
        const outcome = await step.run(`send-${channel}`, () =>
          sendToChannel(
            env,
            {
              channel,
              articleId,
              text: row.text,
              visualRef: row.visualRef,
              html: row.html,
              previewUrl: row.previewUrl,
              captionHtml: row.captionHtml,
              captionPlain: row.captionPlain,
            },
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
        const mode = outcome.mode;
        await step.run(`mark-${channel}`, async () => {
          const db = createDb(env.DATABASE_URL);
          await markChannelPosted(db, { articleId, channel, postRef, at: new Date(), mode });
          return { posted: true };
        });
        results.push({ channel, status: "posted", postRef, mode });
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
