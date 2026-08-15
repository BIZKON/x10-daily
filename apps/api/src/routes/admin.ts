import { zValidator } from "@hono/zod-validator";
import { CLIENT_PRICE_MULTIPLIER, can, usdToRub } from "@x10/config";
import {
  and,
  articles,
  balanceEntries,
  clientBalance,
  costAlerts,
  desc,
  eq,
  getPostingControl,
  isPostingPaused,
  mskHour,
  payments,
  pipelineRuns,
  setPostingControl,
  sql,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { EDITOR_ROLES, requirePermission, requireRole } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";
import { markPaymentCanceled, settleProviderPayment } from "../lib/payment-settle";
import { checkTopupAmount } from "../lib/topup";
import { YooKassaError, createPayment, getPayment } from "../lib/yookassa";
import { applyRateLimit } from "../rate-limit";
import { readCreds, storeConfigured } from "./billing";
import { getInngest } from "./pipeline";

/**
 * Admin endpoints для HumanGate.
 *
 * Все endpoints закрыты `requireRole(["editor","admin"])` (см. auth.ts).
 * Закрывает CRITICAL-1 из docs/SECURITY-AUDIT.md — `/publish` ранее был без auth.
 * HIGH-2: auth basis — Telegram-issued JWT в Authorization Bearer (Login Widget
 * для admin или Mini App initData для редакторов).
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Фильтр по user-facing категории (рубрикатор ProAgent AI). Используется на странице /rubrics. */
  category: z.enum(["news", "cases", "howto", "tools", "business", "founder"]).optional(),
  /** Подкатегория второго уровня — "news.agents" и т.д. (открытая строка). */
  subcategory: z.string().max(64).optional(),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const postingControlSchema = z
  .object({
    paused: z.boolean().optional(),
    quietEnabled: z.boolean().optional(),
    quietStartHour: z.coerce.number().int().min(0).max(23).optional(),
    quietEndHour: z.coerce.number().int().min(0).max(23).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Пустой patch" });

export const adminRoute = new Hono<AppEnv>()
  /**
   * GET /v1/admin/queue
   * Список статей со status='ready' (pipeline закончил, ждёт ревью).
   * Возвращает компактный list-view; полная metadata — на детальной странице.
   */
  .get("/queue", zValidator("query", querySchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const q = c.req.valid("query");

    const rows = await db
      .select({
        id: articles.id,
        slug: articles.slug,
        section: articles.section,
        category: articles.category,
        subcategory: articles.subcategory,
        template: articles.template,
        tags: articles.tags,
        tease: articles.tease,
        lede: articles.lede,
        wordCount: articles.wordCount,
        readSeconds: articles.readSeconds,
        createdAt: articles.createdAt,
        metadata: articles.metadata,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, "ready"),
          q.category ? eq(articles.category, q.category) : undefined,
          q.subcategory ? eq(articles.subcategory, q.subcategory) : undefined,
        ),
      )
      .orderBy(desc(articles.createdAt))
      .limit(q.limit);

    // Достаём score.total из metadata в отдельное поле для list-view.
    const items = rows.map((r) => {
      const meta = (r.metadata ?? {}) as {
        score?: { total: number; verdict: string };
        factcheck?: { status: string } | null;
      };
      return {
        id: r.id,
        slug: r.slug,
        section: r.section,
        category: r.category,
        subcategory: r.subcategory,
        template: r.template,
        tags: r.tags,
        tease: r.tease,
        lede: r.lede,
        wordCount: r.wordCount,
        readSeconds: r.readSeconds,
        createdAt: r.createdAt,
        scoreTotal: meta.score?.total ?? null,
        scoreVerdict: meta.score?.verdict ?? null,
        factcheckStatus: meta.factcheck?.status ?? null,
      };
    });

    return c.json({ items, count: items.length });
  })

  /**
   * POST /v1/admin/breakdown
   *
   * Второй вход конвейера: человек присылает ссылку на чужой удачный материал,
   * система разбирает его и ставит в очередь СВОЙ — в рубрике и голосе клиента.
   *
   * Здесь только проверка формы и постановка события: загрузка страницы, защита
   * от обращений во внутреннюю сеть и сам разбор живут в воркере, у которого
   * для этого есть и денежный гейт, и учёт расхода.
   */
  .post(
    "/breakdown",
    zValidator("json", z.object({ url: z.string().min(1).max(2000) })),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      // Разбор создаёт материал, поэтому право на правку контента, а не на просмотр.
      const me = await requirePermission(c, db, "content.edit");

      const { url } = c.req.valid("json");
      let parsed: URL;
      try {
        parsed = new URL(url.trim());
      } catch {
        return c.json(
          { error: "Это не похоже на ссылку. Скопируйте адрес целиком, вместе с https://" },
          400,
        );
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return c.json({ error: "Поддерживаются только ссылки http и https" }, 400);
      }

      // Разбор платный, поэтому лимит на человека — как у ручного запуска
      // конвейера. Скомпрометированный аккаунт не зальёт нам счёт.
      await applyRateLimit(c, c.env.PIPELINE_LIMITER, "breakdown", me.userId);

      const { ids } = await getInngest(env).send({
        name: "article/link.submitted",
        data: { url: parsed.toString(), submittedBy: me.userId },
      });

      return c.json(
        {
          accepted: true,
          eventIds: ids,
          hint: "Разбор занимает около минуты. Материал появится в очереди на одобрение.",
        },
        202,
      );
    },
  )

  /**
   * GET /v1/admin/billing/balance
   *
   * Состояние денег для плашки в кабинете (Спека 6, шаг 2). Отвечает на вопрос
   * «почему конвейер молчит», поэтому доступно ВСЕЙ команде: автор, увидевший
   * пустую очередь, должен понимать причину, а не идти выяснять её к владельцу.
   *
   * 🔴 Суммы отдаём только тем, кому дано `cost.view`. Остальные видят факт
   * («деньги закончились»), но не цифры — как и на экране расходов.
   */
  .get("/billing/balance", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "content.view");
    const showMoney = can(me.teamRole, "cost.view");

    const [row] = await db
      .select({
        balanceRub: clientBalance.balanceRub,
        lowThresholdRub: clientBalance.lowThresholdRub,
        billingEnforced: clientBalance.billingEnforced,
      })
      .from(clientBalance)
      .limit(1);

    // Строки нет — денежный контур в этой копии не заведён. Молчим: плашка о
    // деньгах там, где денег не считают, только пугает.
    if (!row || !row.billingEnforced) {
      return c.json({ state: "off" as const, balanceRub: null, lowThresholdRub: null });
    }

    const balanceRub = Number(row.balanceRub);
    const lowThresholdRub = Number(row.lowThresholdRub);
    const state =
      balanceRub <= 0
        ? ("empty" as const)
        : balanceRub < lowThresholdRub
          ? ("low" as const)
          : ("ok" as const);

    return c.json({
      state,
      balanceRub: showMoney ? balanceRub : null,
      lowThresholdRub: showMoney ? lowThresholdRub : null,
    });
  })

  /**
   * POST /v1/admin/billing/topup
   * Пополнение баланса (Спека 6, шаг 3 — построен 15.08 вместе с магазином).
   *
   * Право `cost.view`: кто видит суммы, тот и платит. Труба та же, что у продажи
   * завода, — различает назначение `purpose='topup'`.
   *
   * ⚠️ Строка `payments` создаётся ДО вызова шлюза: её id уходит в
   * `Idempotence-Key`, поэтому повтор запроса не создаст второй платёж.
   */
  .post(
    "/billing/topup",
    zValidator("json", z.object({ amountRub: z.number(), payerEmail: z.string().email() })),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      const me = await requirePermission(c, db, "cost.view");

      const creds = readCreds(env);
      if (!creds) {
        return c.json(
          {
            error: "store_not_configured",
            message: "Ключи ЮKassa не заданы — оплата в этой копии выключена.",
          },
          503,
        );
      }

      const body = c.req.valid("json");
      const checked = checkTopupAmount(body.amountRub);
      if (!checked.ok) return c.json({ error: "bad_amount", message: checked.error }, 400);

      const description = `Пополнение баланса ProAgent AI на ${checked.amountRub} ₽`;

      const [row] = await db
        .insert(payments)
        .values({
          purpose: "topup",
          amountRub: String(checked.amountRub),
          status: "pending",
          createdBy: me.userId,
          payerEmail: body.payerEmail,
          description,
        })
        .returning({ id: payments.id });
      if (!row) return c.json({ error: "internal" }, 500);

      const domain = env.X10_BASE_DOMAIN ?? "pro-agent-ai.ru";

      try {
        const created = await createPayment(creds, {
          paymentId: row.id,
          amountRub: checked.amountRub,
          description,
          returnUrl: `https://admin.${domain}/cost?payment=${row.id}`,
          payerEmail: body.payerEmail,
        });

        await db
          .update(payments)
          .set({ providerPaymentId: created.providerPaymentId })
          .where(eq(payments.id, row.id));

        return c.json({ paymentId: row.id, confirmationUrl: created.confirmationUrl }, 201);
      } catch (err) {
        // Платёж у шлюза не создался — наша строка остаётся `pending` и никого
        // не смущает: зачисление идёт только по `credited_at`.
        console.error("[billing] не удалось создать платёж:", err);
        return c.json(
          {
            error: "provider_error",
            message:
              err instanceof YooKassaError && err.status === 401
                ? "ЮKassa не приняла ключи магазина: проверь, что shopId и секретный ключ взяты с одной страницы ЛК."
                : "ЮKassa не приняла платёж. Подробности в логах api.",
          },
          502,
        );
      }
    },
  )

  /**
   * POST /v1/admin/billing/payments/:id/refresh
   * Перепроверяет платёж у шлюза и зачисляет, если он оплачен.
   *
   * Нужен на возврате с оплаты: вебхук приходит за секунды, но иногда позже —
   * а человек уже смотрит на свой баланс и не видит денег. Зачисляет та же
   * функция, что и вебхук, поэтому дважды деньги не встанут.
   */
  .post("/billing/payments/:id/refresh", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "cost.view");

    const creds = readCreds(env);
    if (!creds) return c.json({ error: "store_not_configured" }, 503);

    const id = c.req.param("id");
    const [row] = await db
      .select({ providerPaymentId: payments.providerPaymentId, creditedAt: payments.creditedAt })
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);

    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.creditedAt) return c.json({ state: "credited" as const });
    if (!row.providerPaymentId) return c.json({ state: "pending" as const });

    const remote = await getPayment(creds, row.providerPaymentId);
    if (remote.status === "canceled") {
      await markPaymentCanceled(db, row.providerPaymentId);
      return c.json({ state: "canceled" as const });
    }
    if (remote.status !== "succeeded" || !remote.paid) {
      return c.json({ state: "pending" as const });
    }

    const result = await settleProviderPayment(db, row.providerPaymentId);
    return c.json({ state: result.ok ? ("credited" as const) : ("pending" as const) });
  })

  /**
   * GET /v1/admin/billing/entries
   * Остаток и движения — ответ на вопрос «почему остаток именно такой».
   *
   * ⚠️ Отдельно от `/billing/balance`: тот отвечает на вопрос «почему конвейер
   * молчит» и при выключенном денежном контуре молчит сам. Здесь цифра нужна
   * всегда — в НАШЕЙ копии контур выключен намеренно, и отрицательный остаток
   * показывает накопленную стоимость контента в клиентских ценах.
   */
  .get("/billing/entries", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "cost.view");

    const [balance] = await db
      .select({
        balanceRub: clientBalance.balanceRub,
        lowThresholdRub: clientBalance.lowThresholdRub,
        billingEnforced: clientBalance.billingEnforced,
      })
      .from(clientBalance)
      .limit(1);

    const rows = await db
      .select({
        id: balanceEntries.id,
        kind: balanceEntries.kind,
        amountRub: balanceEntries.amountRub,
        balanceAfterRub: balanceEntries.balanceAfterRub,
        note: balanceEntries.note,
        createdAt: balanceEntries.createdAt,
      })
      .from(balanceEntries)
      .orderBy(desc(balanceEntries.createdAt))
      .limit(30);

    return c.json({
      storeConfigured: storeConfigured(env),
      balanceRub: balance ? Number(balance.balanceRub) : null,
      lowThresholdRub: balance ? Number(balance.lowThresholdRub) : null,
      billingEnforced: balance ? balance.billingEnforced : null,
      entries: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amountRub: Number(r.amountRub),
        balanceAfterRub: Number(r.balanceAfterRub),
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  })

  /**
   * GET /v1/admin/pipeline-runs/stats
   * $-дашборд автономного конвейера (session 20). Агрегаты по pipeline_runs:
   * расход за день МСК vs потолок, разбивка по агентам, 7-дневный ряд, accept-rate
   * гейта, последние раны, алерты дня. Day-boundary — Europe/Moscow (UTC+3), как
   * в budget-gate (cost-ledger.ts mskDayStartUtc).
   */
  .get("/pipeline-runs/stats", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    // Смотреть результат работы конвейера может вся команда; СУММЫ — только те,
    // кому дано `cost.view`. Наблюдателю (заказчик, агентство) себестоимость не
    // показываем: см. карту прав в @x10/config.
    const me = await requirePermission(c, db, "content.view");
    const showMoney = can(me.teamRole, "cost.view");

    const mskToday = sql`date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'`;
    const msk7dStart = sql`(date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') - interval '6 days') AT TIME ZONE 'Europe/Moscow'`;
    const dayExpr = sql<string>`to_char(date_trunc('day', ${pipelineRuns.createdAt} AT TIME ZONE 'Europe/Moscow'), 'YYYY-MM-DD')`;

    // Границы месяца по МСК — тот же принцип, что у дня: клиент живёт в МСК, и
    // «за месяц» обязано совпадать с тем, что он видит в календаре.
    const mskMonth = sql`date_trunc('month', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'`;

    const [
      todayAgg,
      byAgentRows,
      seriesRows,
      gateRows,
      recentRows,
      alertRows,
      monthAgg,
      publishedAgg,
    ] = await Promise.all([
      db
        .select({
          spend: sql<string>`coalesce(sum(${pipelineRuns.costUsd}), 0)`,
          runs: sql<number>`count(*)::int`,
        })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.createdAt} >= ${mskToday}`),
      db
        .select({
          agent: pipelineRuns.agent,
          runs: sql<number>`count(*)::int`,
          spend: sql<string>`coalesce(sum(${pipelineRuns.costUsd}), 0)`,
        })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.createdAt} >= ${mskToday}`)
        .groupBy(pipelineRuns.agent),
      db
        .select({
          day: dayExpr,
          spend: sql<string>`coalesce(sum(${pipelineRuns.costUsd}), 0)`,
          runs: sql<number>`count(*)::int`,
        })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.createdAt} >= ${msk7dStart}`)
        .groupBy(dayExpr)
        .orderBy(dayExpr),
      db
        .select({
          status: pipelineRuns.status,
          runs: sql<number>`count(*)::int`,
        })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.agent} = 'ingest' AND ${pipelineRuns.createdAt} >= ${mskToday}`)
        .groupBy(pipelineRuns.status),
      db
        .select({
          agent: pipelineRuns.agent,
          status: pipelineRuns.status,
          costUsd: pipelineRuns.costUsd,
          modelUsed: pipelineRuns.modelUsed,
          articleId: pipelineRuns.articleId,
          createdAt: pipelineRuns.createdAt,
        })
        .from(pipelineRuns)
        .orderBy(desc(pipelineRuns.createdAt))
        .limit(20),
      db
        .select({
          kind: costAlerts.thresholdKind,
          spendUsd: costAlerts.spendUsd,
          createdAt: costAlerts.createdAt,
        })
        .from(costAlerts)
        .where(
          // 🔴 `alert_date` — колонка типа `date`, а `to_char` возвращает text.
          // PostgreSQL не сравнивает date с text: запрос падал, эндпоинт отдавал
          // 500, и раздел «Расходы» показывал «Данные недоступны». Приводим
          // текущий момент к дате в МСК — тем же поясом, что и остальные
          // границы дня в этом эндпоинте.
          sql`${costAlerts.alertDate} = (now() AT TIME ZONE 'Europe/Moscow')::date`,
        )
        .orderBy(desc(costAlerts.createdAt)),
      // Расход за календарный месяц — вторая цифра, без которой дневная сумма
      // ни о чём не говорит: клиент платит по месяцу, а не по дню.
      db
        .select({ spend: sql<string>`coalesce(sum(${pipelineRuns.costUsd}), 0)` })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.createdAt} >= ${mskMonth}`),
      // 🔴 Результат рядом с тратой. Сумма без числа публикаций непонятна: «$4
      // за сутки» — это дорого или дёшево? Ответ даёт только цена одного поста.
      db
        .select({
          today: sql<number>`count(*) filter (where ${articles.publishedAt} >= ${mskToday})::int`,
          month: sql<number>`count(*) filter (where ${articles.publishedAt} >= ${mskMonth})::int`,
        })
        .from(articles)
        .where(sql`${articles.publishedAt} is not null`),
    ]);

    const capUsd = env.DAILY_BUDGET_USD;
    const warnUsd = env.DAILY_BUDGET_WARN_USD;
    const todaySpendUsd = Number(todayAgg[0]?.spend ?? 0);
    const monthSpendUsd = Number(monthAgg[0]?.spend ?? 0);
    const publishedToday = publishedAgg[0]?.today ?? 0;
    const publishedMonth = publishedAgg[0]?.month ?? 0;
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

    // 🔴 Суммы вырезаются НА СЕРВЕРЕ, а не прячутся в вёрстке: спрятанное поле
    // всё равно уходит по сети и видно в ответе api.
    if (!showMoney) {
      return c.json({
        money: false as const,
        result: {
          publishedToday,
          publishedMonth,
          costPerPublishedUsd: null,
        },
      });
    }

    // 🔴 Считаем в рублях: тариф шлюза рублёвый, и клиент платит рублями.
    // Доллары остаются внутри — на них работает дневной потолок бюджета.
    //
    // Цена клиенту = себестоимость × наценка (решение владельца 06.08.2026:
    // «платим мы, клиент платит нам по нашему тарифу»).
    const rub = (usd: number) => Math.round(usdToRub(usd) * 100) / 100;

    return c.json({
      money: true as const,
      currency: "RUB" as const,
      multiplier: CLIENT_PRICE_MULTIPLIER,
      budget: {
        capUsd,
        warnUsd,
        todaySpendUsd,
        todayRuns: todayAgg[0]?.runs ?? 0,
        pct: capUsd > 0 ? Math.min(100, Math.round((todaySpendUsd / capUsd) * 100)) : 0,
        remainingUsd: Math.max(0, capUsd - todaySpendUsd),
        monthSpendUsd,
        // Рублёвые эквиваленты того же самого — считать в уме курс не должен
        // никто, а счёт клиенту выставляется именно в рублях.
        capRub: rub(capUsd),
        todaySpendRub: rub(todaySpendUsd),
        remainingRub: rub(Math.max(0, capUsd - todaySpendUsd)),
        monthSpendRub: rub(monthSpendUsd),
        todayPriceRub: rub(todaySpendUsd) * CLIENT_PRICE_MULTIPLIER,
        monthPriceRub: rub(monthSpendUsd) * CLIENT_PRICE_MULTIPLIER,
      },
      /**
       * Что получено за деньги. Цена поста считается ПО МЕСЯЦУ, а не по дню:
       * дневная выборка слишком мала — один день без публикаций дал бы
       * «бесконечно дорого», а день с одной статьёй — случайное число.
       */
      result: {
        publishedToday,
        publishedMonth,
        costPerPublishedUsd: publishedMonth > 0 ? monthSpendUsd / publishedMonth : null,
        costPerPublishedRub: publishedMonth > 0 ? rub(monthSpendUsd / publishedMonth) : null,
        pricePerPublishedRub:
          publishedMonth > 0 ? rub(monthSpendUsd / publishedMonth) * CLIENT_PRICE_MULTIPLIER : null,
      },
      byAgent: byAgentRows.map((r) => ({
        agent: r.agent,
        runs: r.runs,
        spendUsd: Number(r.spend),
      })),
      series7d: seriesRows.map((r) => ({ day: r.day, spendUsd: Number(r.spend), runs: r.runs })),
      gateToday: {
        accepted: gateRows.find((g) => g.status === "succeeded")?.runs ?? 0,
        skipped: gateRows.find((g) => g.status === "skipped")?.runs ?? 0,
      },
      recent: recentRows.map((r) => ({
        agent: r.agent,
        status: r.status,
        costUsd: Number(r.costUsd),
        modelUsed: r.modelUsed,
        articleId: r.articleId,
        createdAt: iso(r.createdAt),
      })),
      alertsToday: alertRows.map((r) => ({
        kind: r.kind,
        spendUsd: Number(r.spendUsd),
        createdAt: iso(r.createdAt),
      })),
    });
  })

  /**
   * GET /v1/admin/posting-control
   * Текущий стоп-кран автопостинга + вычисленное «сейчас на паузе?» (session 20).
   */
  .get("/posting-control", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const ctrl = await getPostingControl(db);
    const now = new Date();
    const state = isPostingPaused(ctrl, now);
    return c.json({
      paused: ctrl.paused,
      quietEnabled: ctrl.quietEnabled,
      quietStartHour: ctrl.quietStartHour,
      quietEndHour: ctrl.quietEndHour,
      updatedAt:
        ctrl.updatedAt instanceof Date ? ctrl.updatedAt.toISOString() : String(ctrl.updatedAt),
      currentlyPaused: state.paused,
      pauseReason: state.reason,
      mskHour: mskHour(now),
    });
  })

  /**
   * PUT /v1/admin/posting-control
   * Обновляет стоп-кран (ручная пауза / тихие часы). Конвейер читает это на лету.
   */
  .put("/posting-control", zValidator("json", postingControlSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const patch = c.req.valid("json");
    const ctrl = await setPostingControl(db, patch);
    return c.json({
      paused: ctrl.paused,
      quietEnabled: ctrl.quietEnabled,
      quietStartHour: ctrl.quietStartHour,
      quietEndHour: ctrl.quietEndHour,
      updatedAt:
        ctrl.updatedAt instanceof Date ? ctrl.updatedAt.toISOString() : String(ctrl.updatedAt),
    });
  })

  /**
   * GET /v1/admin/article/:id
   * Полная статья с pipeline metadata для UI ревью.
   * В отличие от /v1/articles/:slug — доступна на любом status (не только published).
   */
  .get("/article/:id", zValidator("param", paramsSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");

    const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);

    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json(row);
  })

  /**
   * POST /v1/admin/publish/:id
   * Переводит статью из ready → published, ставит publishedAt = now().
   * Идемпотентно: если уже published — возвращает текущее состояние без изменений.
   */
  .post("/publish/:id", zValidator("param", paramsSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");

    const [existing] = await db
      .select({ id: articles.id, status: articles.status, slug: articles.slug })
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);

    if (!existing) return c.json({ error: "not_found", id }, 404);
    if (existing.status === "published") {
      return c.json({ id: existing.id, slug: existing.slug, status: "published", changed: false });
    }
    if (existing.status !== "ready") {
      return c.json(
        {
          error: "invalid_state",
          status: existing.status,
          message: `Publish allowed only from status="ready"; current="${existing.status}"`,
        },
        409,
      );
    }

    const [updated] = await db
      .update(articles)
      .set({
        status: "published",
        publishedAt: sql`now()`,
      })
      .where(eq(articles.id, id))
      .returning({ id: articles.id, slug: articles.slug, status: articles.status });

    if (!updated) return c.json({ error: "update_failed", id }, 500);
    return c.json({ ...updated, changed: true });
  });
